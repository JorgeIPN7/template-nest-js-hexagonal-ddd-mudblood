import { BlockList, isIP } from 'node:net';

import { isEmail } from 'class-validator';
import express from 'express';
import { z } from 'zod';

import { PASSWORD_LENGTH, hasValidPasswordLength } from './password-policy';

// Zod 4: `.default()` takes the OUTPUT type and short-circuits parsing, so it cannot
// receive a raw string here — this schema outputs a boolean. Use `.prefault()` instead,
// which substitutes an INPUT value and still runs it through the transform below.
const booleanString = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

/**
 * Distingue "variable ausente" de "variable presente pero vacía".
 *
 * `z.coerce.number()` aplica `Number(input)`, y `Number('')` es `0`. Sin esto, un
 * `SHUTDOWN_TIMEOUT_MS=` en el `.env` —o un task definition que renderiza vacío— pasaba
 * la validación como cero, y `main.ts` acababa forzando `process.exit(1)` en el tick
 * siguiente a cada SIGTERM, cortando las peticiones en vuelo en todos los despliegues.
 * `.default()` no protege de esto: en Zod solo actúa sobre `undefined`.
 *
 * Ausente sigue tomando el default; vacía es un error de configuración y se rechaza.
 */
const rejectEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? Number.NaN : value),
    schema,
  );

/** Entero coercionado desde string, que es como llega todo en `process.env`. */
const int = () => z.coerce.number().int();

/** Los tres nombres que `proxy-addr` expande a rangos. Distingue mayúsculas, igual que él. */
const TRUST_PROXY_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** `::ffff:0:0/96`: toda IPv6 que sea una IPv4 mapeada, se escriba como se escriba. */
const IPV4_MAPPED = new BlockList();
IPV4_MAPPED.addSubnet('::ffff:0.0.0.0', 96, 'ipv6');

/**
 * Número de saltos o spec de direcciones, con la misma coerción que el resto de enteros del
 * schema (`Number()`), para no cambiar qué cuenta como número. La cadena en blanco se deja
 * pasar tal cual: `Number('')` es 0 y la validación tiene que verla vacía.
 */
const toTrustProxySetting = (raw: string | number): string | number => {
  if (typeof raw === 'number' || raw.trim() === '') {
    return raw;
  }
  const hops = Number(raw);
  return Number.isNaN(hops) ? raw : hops;
};

const trustProxyEntryProblem = (entry: string): string | undefined => {
  if (entry === '') {
    return 'has an empty entry in its comma-separated list';
  }
  if (TRUST_PROXY_PRESETS.has(entry)) {
    return undefined;
  }
  const slash = entry.lastIndexOf('/');
  const address = slash === -1 ? entry : entry.slice(0, slash);
  // Más estricto que Express a propósito: `ipaddr.js` lee `192.168.001.010` como 192.168.1.8
  // (octal) y `0x7f.0.0.1` en hexadecimal, así que confiaría en otra red. `isIP` solo admite la
  // notación estándar.
  if (isIP(address) === 0) {
    return (
      `has an unknown entry "${entry}": expected loopback, linklocal, uniquelocal or an IP ` +
      'address in standard notation, optionally with a /prefix'
    );
  }
  // GHSA-jqcg-44mw-7w3h: antes de proxy-addr 2.0.8 esta forma confiaba en todo IPv4; desde
  // entonces no confía en nadie. Ninguna de las dos cosas es lo que el operador escribió.
  const prefix = slash === -1 ? undefined : Number(entry.slice(slash + 1));
  if (prefix !== undefined && IPV4_MAPPED.check(address, 'ipv6') && prefix < 96) {
    // Sumar 96 solo da un prefijo válido (≤ /128) si el original era de /0 a /32.
    const addHint = prefix <= 32 ? ' or add 96 to the prefix' : '';
    return (
      `has "${entry}", an IPv4-mapped IPv6 subnet with a prefix shorter than /96, which matches ` +
      'no IPv4 client: write the IPv4 subnet itself (e.g. 10.0.0.0/8 instead of ' +
      `::ffff:10.0.0.0/8)${addHint}`
    );
  }
  return undefined;
};

/**
 * Valida contra la semántica real de Express 5 y no contra una copia: la última palabra la
 * tiene el mismo `app.set('trust proxy', …)` que ejecuta `main.ts`. Reimplementar la gramática
 * de `ipaddr.js` no cierra el hueco —`node:net` acepta `::1.2.3.4` y Express no—, y
 * `proxy-addr` no es importable desde `src/`: es transitiva y pnpm no la hoistea.
 */
const trustProxyProblem = (value: string | number): string | undefined => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0
      ? undefined
      : `hop count must be a non-negative integer, got ${value}`;
  }
  if (value.trim() === '') {
    return 'is set but empty: remove it to get the default (0)';
  }
  // En este repo '1' y 'true' son sinónimos en los flags, pero aquí '1' es un salto. Y `true`
  // en Express confía en todos los saltos, que es tanto como dejar que el cliente elija req.ip.
  // Hoy 'true' ya tumbaba el arranque; rechazarlo aquí da un mensaje legible. OJO: no es una
  // barrera contra confiar en todo — `::ffff:0:0/96`, `0.0.0.0/1,128.0.0.0/1` o un número de
  // saltos enorme siguen siendo specs válidas y equivalen a lo mismo para IPv4.
  if (/^(true|false)$/i.test(value.trim())) {
    return (
      'does not accept true/false: true trusts every X-Forwarded-For hop, so any client can ' +
      'spoof req.ip and dodge the rate limiters. Use the number of proxies in front of the ' +
      'app (0 = none) or their addresses'
    );
  }
  for (const entry of value.split(',').map((item) => item.trim())) {
    const problem = trustProxyEntryProblem(entry);
    if (problem !== undefined) {
      return problem;
    }
  }
  try {
    express().set('trust proxy', value);
    return undefined;
  } catch (error) {
    return `is not a valid Express trust proxy value: ${(error as Error).message}`;
  }
};

/**
 * Un único pipeline, no `z.union` de ramas refinadas: con Zod 4 una unión cuyas dos ramas fallan
 * por algo que no es el tipo colapsa en `Invalid input` y se pierde el mensaje propio (medido con
 * '-1'). `.prefault('0')` y no `.default(0)`, porque el schema termina en `.transform()` (ver el
 * «Zod 4 gotcha» de CLAUDE.md). Emite `number | string`: sigue siendo escalar.
 */
const trustProxyValue = z
  .union([z.string(), z.number()])
  .transform(toTrustProxySetting)
  .superRefine((value, ctx) => {
    const problem = trustProxyProblem(value);
    if (problem !== undefined) {
      ctx.addIssue({ code: 'custom', message: problem });
    }
  })
  .prefault('0');

/**
 * Trocea una lista separada por comas. Vive aquí y no dentro del schema a propósito:
 * `@nestjs/config` solo copia de vuelta a `process.env` los valores validados que son
 * `string | number | boolean` (ver `assignVariablesToProcess`), y descarta el resto en
 * silencio. Como los factories de `registerAs` vuelven a parsear `process.env`, un
 * `.transform()` que produjera un array haría que el valor del fichero `.env` se
 * perdiera y el factory acabara aplicando el default — sin ningún error visible.
 *
 * Por eso este schema emite **solo escalares** y el troceo lo hacen los factories.
 * El test `debería emitir solo valores escalares` de `env.schema.spec.ts` lo vigila.
 */
export const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * `when` de un `refine` de campo: solo se evalúa si las reglas anteriores del MISMO campo pasaron.
 * El `payload` que recibe es el del campo, no el del objeto.
 */
const onlyIfValidSoFar = (payload: { issues: readonly unknown[] }): boolean =>
  payload.issues.length === 0;

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  PORT: rejectEmpty(int().positive()).default(8888),
  HOST: z.string().default('0.0.0.0'),
  GLOBAL_PREFIX: z.string().default('api'),
  API_VERSION: z.string().default('1'),

  TRUST_PROXY: trustProxyValue,

  CORS_ENABLED: booleanString.prefault('true'),
  CORS_CREDENTIALS: booleanString.prefault('false'),
  // Lista separada por comas. Se trocea en `cors.config.ts` con `splitList`, no aquí.
  CORS_ORIGINS: z.string().default('*'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: booleanString.prefault('false'),
  // Lista separada por comas. Se trocea en `log.config.ts` con `splitList`, no aquí.
  LOG_REDACT_FIELDS: z
    .string()
    .default('req.headers.authorization,req.headers.cookie,password,token'),

  THROTTLER_TTL_MS: rejectEmpty(int().positive()).default(60_000),
  THROTTLER_LIMIT: rejectEmpty(int().positive()).default(100),

  // Apagado por defecto: `setupOpenApi` solo mira este flag, y las rutas de la documentación
  // se registran fuera del pipeline de Nest, así que el ThrottlerGuard global no las cubre.
  // Un despliegue que olvide la variable no debe acabar publicando el inventario de
  // endpoints y esquemas. En local se enciende desde `.env.example`, que ya trae `true`.
  DOCS_ENABLED: booleanString.prefault('false'),
  DOCS_PATH: z.string().default('docs'),

  // Basic Auth opcional sobre la documentación. Ausentes las dos, queda abierta; definidas las
  // dos, exige credenciales. Una sola definida es un error de arranque — ver el `.refine` del
  // final del archivo. No sustituye al feature flag: `DOCS_ENABLED=false` sigue siendo la
  // protección primaria en producción, y esto es lo que permite publicarla en staging.
  DOCS_USERNAME: z.string().min(1).optional(),
  DOCS_PASSWORD: z.string().min(1).optional(),

  // --- Auth -----------------------------------------------------------------
  // Sin default aquí a propósito: el default depende de NODE_ENV (igual que
  // DB_SYNCHRONIZE) y lo resuelve `resolveJwtSecret()` en auth.config.ts. El
  // refine del final del archivo hace que staging/production sin secret NI
  // ARRANQUEN — un JWT firmado con un default publicado es una puerta abierta.
  JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN_S: rejectEmpty(int().positive()).default(3600),

  // Credenciales del PRIMER admin. Las usa solo `pnpm seed:admin`, pero las valida todo proceso
  // que carga la configuración —la app, las migraciones y `outbox:relay`—: un valor inválido
  // impide arrancar. Par ambas-o-ninguna, como DOCS_USERNAME/DOCS_PASSWORD.
  //
  // Aceptan solo lo que acepta `POST /auth/login`, con las mismas funciones de class-validator
  // que `LoginDto`: si no, el seed crearía un admin que el login rechaza con 400 (backlog #34).
  // - `z.email()` se queda delante de `isEmail`: la intersección de los dos es lo que acepta
  //   también `Email.from` de `users`, con el que el login busca al usuario (`isEmail` solo
  //   acepta, por ejemplo, una parte local entre comillas con un espacio dentro).
  // - `.min()` se queda por su mensaje, que citan el README y `.env.example`.
  // - El `when` de cada `refine` lo salta si la regla anterior del mismo campo ya falló: una
  //   dirección mal escrita o una contraseña corta no culpan además a otra regla. No es `abort`
  //   a propósito: `abort` corta también los `refine` del objeto, y el arranque dejaría de avisar
  //   de la falta de JWT_SECRET o de la pareja incompleta en el mismo intento (medido con Zod
  //   4.6.5).
  // `z.email()` y no `z.string().email()`: la forma encadenada está deprecada en Zod 4.
  ADMIN_EMAIL: z
    .email()
    .refine((value) => isEmail(value), {
      when: onlyIfValidSoFar,
      message:
        'ADMIN_EMAIL must also be an address that POST /auth/login accepts (at most 64 ' +
        'characters before the @, at most 63 per domain label, 254 in total, no label ending ' +
        'in a hyphen): otherwise the seed would create an admin who can never log in.',
    })
    .optional(),
  ADMIN_PASSWORD: z
    .string()
    .min(PASSWORD_LENGTH.min)
    .refine(hasValidPasswordLength, {
      when: onlyIfValidSoFar,
      message:
        `ADMIN_PASSWORD must be between ${PASSWORD_LENGTH.min} and ${PASSWORD_LENGTH.max} ` +
        'characters as POST /auth/login counts them (one per code point, except that a ' +
        'variation selector U+FE0E/U+FE0F right after another character does not count): ' +
        'otherwise the seed would create an admin who can never log in.',
    })
    .optional(),

  // `positive`, no `nonnegative`: con 0 el temporizador de gracia vence antes de que
  // `app.close()` resuelva y el proceso muere a mitad del cierre ordenado.
  SHUTDOWN_TIMEOUT_MS: rejectEmpty(int().positive()).default(10_000),
  REQUEST_TIMEOUT_MS: rejectEmpty(int().positive()).default(15_000),
  // Aquí 0 sí es significativo: desactiva el timeout de keep-alive en Node.
  KEEP_ALIVE_TIMEOUT_MS: rejectEmpty(int().nonnegative()).default(5_000),
  BODY_LIMIT: z.string().default('1mb'),

  HEALTH_HEAP_LIMIT_MB: rejectEmpty(int().positive()).default(300),
  HEALTH_RSS_LIMIT_MB: rejectEmpty(int().positive()).default(600),

  // --- PostgreSQL -----------------------------------------------------------
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: rejectEmpty(int().positive().max(65_535)).default(5432),
  DB_USERNAME: z.string().min(1).default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_DATABASE: z.string().min(1).default('nest_base_template'),
  DB_SCHEMA: z.string().min(1).default('public'),

  // TLS. En local Postgres corre sin cifrado; contra RDS se activa DB_SSL=true.
  // `DB_SSL_REJECT_UNAUTHORIZED=false` cifra pero NO verifica la identidad del
  // servidor: úsalo solo si no puedes montar el bundle de CA de AWS.
  DB_SSL: booleanString.prefault('false'),
  DB_SSL_REJECT_UNAUTHORIZED: booleanString.prefault('true'),
  DB_SSL_CA: z.string().optional(),

  // `DB_SYNCHRONIZE` solo surte efecto en development — ver `database.config.ts`.
  // Fuera de ahí el esquema evoluciona únicamente con migraciones.
  DB_SYNCHRONIZE: booleanString.prefault('false'),
  DB_MIGRATIONS_RUN: booleanString.prefault('false'),
  DB_LOGGING: booleanString.prefault('false'),

  DB_POOL_MAX: rejectEmpty(int().positive()).default(10),
  DB_POOL_IDLE_TIMEOUT_MS: rejectEmpty(int().nonnegative()).default(30_000),
  DB_CONNECTION_TIMEOUT_MS: rejectEmpty(int().positive()).default(10_000),
});

/**
 * La validación cruzada de credenciales vive aquí y no en `docs.config.ts` porque `registerAs`
 * es perezoso: en el factory, el fallo aparecería en la primera petición a la documentación en
 * vez de al arrancar, que es justo cuando alguien puede reaccionar.
 *
 * La detección de las variables **retiradas** (`SWAGGER_*`) no puede vivir aquí: `z.object()`
 * hace *strip* de las claves desconocidas antes de ejecutar los refines, así que dentro del
 * refine ya no existen. Y relajar el objeto a `passthrough` para verlas dejaría pasar todo
 * `process.env`, rompiendo el test que garantiza que el schema solo emite escalares. Está en
 * `validate-env.ts`, donde el objeto crudo todavía llega entero.
 */
export const envSchema = baseEnvSchema
  .refine((env) => (env.DOCS_USERNAME === undefined) === (env.DOCS_PASSWORD === undefined), {
    message:
      'DOCS_USERNAME and DOCS_PASSWORD must both be set or both be omitted: with only one, ' +
      'the Basic Auth middleware never mounts and the docs are published without asking for ' +
      'credentials.',
    path: ['DOCS_PASSWORD'],
  })
  .refine(
    (env) =>
      !(env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') ||
      env.JWT_SECRET !== undefined,
    {
      message:
        'JWT_SECRET is required in staging/production: without it the guard would sign with ' +
        'the development default, which is public in the repository.',
      path: ['JWT_SECRET'],
    },
  )
  .refine((env) => (env.ADMIN_EMAIL === undefined) === (env.ADMIN_PASSWORD === undefined), {
    message:
      'ADMIN_EMAIL and ADMIN_PASSWORD must both be set or both be omitted: the first-admin ' +
      'seed needs them together.',
    path: ['ADMIN_PASSWORD'],
  });

export type Env = z.infer<typeof envSchema>;
