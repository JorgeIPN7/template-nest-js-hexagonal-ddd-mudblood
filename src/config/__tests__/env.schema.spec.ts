import express from 'express';
import fc from 'fast-check';

import { envSchema, splitList } from '../env.schema';

describe('envSchema', () => {
  // `@nestjs/config` solo copia de vuelta a `process.env` los valores validados que son
  // `string | number | boolean`, y descarta el resto sin avisar. Como los factories de
  // `registerAs` vuelven a parsear `process.env`, un `.transform()` que produjera un
  // array haría que el valor del fichero `.env` se perdiera y se aplicara el default en
  // su lugar — en silencio. Ya pasó con `CORS_ORIGINS`: la allowlist se ignoraba y el
  // servidor aceptaba cualquier origen. Este test es el guardarraíl de esa invariante.
  it('debería emitir solo valores escalares, porque @nestjs/config descarta el resto', () => {
    // Arrange
    const raw = {
      CORS_ORIGINS: 'https://a.com,https://b.com',
      LOG_REDACT_FIELDS: 'password,token',
      TRUST_PROXY: 'loopback',
      DB_SSL_CA: '/etc/ssl/certs/rds.pem',
    };

    // Act
    const env = parseOrThrow(raw);

    // Assert
    const nonScalar = Object.entries(env).filter(
      ([, value]) => value !== undefined && !['string', 'number', 'boolean'].includes(typeof value),
    );
    expect(nonScalar).toEqual([]);
  });

  describe('valores por defecto', () => {
    it('debería aplicar todos los defaults cuando el entorno está vacío', () => {
      // Arrange
      const raw = {};

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.NODE_ENV).toBe('development');
      expect(env.PORT).toBe(8888);
      expect(env.HOST).toBe('0.0.0.0');
      expect(env.GLOBAL_PREFIX).toBe('api');
      expect(env.API_VERSION).toBe('1');
      expect(env.TRUST_PROXY).toBe(0);
      expect(env.BODY_LIMIT).toBe('1mb');
    });
  });

  describe('flags booleanos', () => {
    // `.prefault()` en Zod 4 sustituye un valor de INPUT y lo pasa por el transform,
    // a diferencia de `.default()`, que corta el pipeline y espera el tipo de OUTPUT.
    it('debería resolver los flags a boolean real cuando no se define ninguna variable', () => {
      // Arrange
      const raw = {};

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.CORS_ENABLED).toBe(true);
      expect(env.CORS_CREDENTIALS).toBe(false);
      expect(env.LOG_PRETTY).toBe(false);
      // La documentación arranca apagada: encenderla es una decisión explícita, no un descuido.
      expect(env.DOCS_ENABLED).toBe(false);
      expect(typeof env.CORS_ENABLED).toBe('boolean');
    });

    it.each([
      ['true', true],
      ['false', false],
      ['1', true],
      ['0', false],
    ])('debería interpretar CORS_ENABLED="%s" como %s', (input, expected) => {
      // Arrange
      const raw = { CORS_ENABLED: input };

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.CORS_ENABLED).toBe(expected);
    });

    it('debería aceptar un boolean nativo además del string', () => {
      // Arrange
      const raw = { DOCS_ENABLED: false };

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.DOCS_ENABLED).toBe(false);
    });

    it('debería rechazar un valor que no represente un booleano', () => {
      // Arrange
      const raw = { CORS_ENABLED: 'yes' };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('listas separadas por coma', () => {
    it('debería conservar CORS_ORIGINS como string, sin trocearlo', () => {
      // Arrange
      const raw = { CORS_ORIGINS: 'https://a.com,https://b.com' };

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.CORS_ORIGINS).toBe('https://a.com,https://b.com');
    });

    it('debería usar "*" como valor por defecto de CORS_ORIGINS', () => {
      // Arrange
      const raw = {};

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.CORS_ORIGINS).toBe('*');
    });
  });

  describe('splitList', () => {
    it('debería partir la lista recortando los espacios de cada elemento', () => {
      // Arrange
      const raw = 'https://a.com, https://b.com ,https://c.com';

      // Act
      const result = splitList(raw);

      // Assert
      expect(result).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
    });

    it('debería descartar los segmentos vacíos de la lista', () => {
      // Arrange
      const raw = 'https://a.com,,  ,https://b.com';

      // Act
      const result = splitList(raw);

      // Assert
      expect(result).toEqual(['https://a.com', 'https://b.com']);
    });

    it('debería devolver una lista vacía cuando el valor solo tiene separadores', () => {
      // Arrange
      const raw = ' , , ';

      // Act
      const result = splitList(raw);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('coerción numérica', () => {
    it('debería convertir a número los puertos y timeouts que llegan como string', () => {
      // Arrange
      const raw = { PORT: '3000', REQUEST_TIMEOUT_MS: '5000', HEALTH_HEAP_LIMIT_MB: '512' };

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.PORT).toBe(3000);
      expect(env.REQUEST_TIMEOUT_MS).toBe(5000);
      expect(env.HEALTH_HEAP_LIMIT_MB).toBe(512);
    });

    it('debería rechazar un PORT que no sea positivo', () => {
      // Arrange
      const raw = { PORT: '0' };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(result.success).toBe(false);
    });

    // Con 0 el temporizador de gracia vence en el tick siguiente al SIGTERM, antes de que
    // `app.close()` resuelva, y el proceso muere a mitad del cierre ordenado.
    it('debería rechazar SHUTDOWN_TIMEOUT_MS en cero, que rompe el cierre ordenado', () => {
      // Arrange
      const raw = { SHUTDOWN_TIMEOUT_MS: '0' };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(result.success).toBe(false);
    });

    it('debería aceptar KEEP_ALIVE_TIMEOUT_MS en cero, donde sí es significativo', () => {
      // Arrange
      const raw = { KEEP_ALIVE_TIMEOUT_MS: '0' };

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.KEEP_ALIVE_TIMEOUT_MS).toBe(0);
    });

    // `Number('')` es 0, así que sin la guarda una variable vacía pasaría como cero. Es
    // un caso realista: un `.env` con `PORT=` o un task definition renderizado sin valor.
    it.each(['PORT', 'SHUTDOWN_TIMEOUT_MS', 'KEEP_ALIVE_TIMEOUT_MS', 'DB_PORT'])(
      'debería rechazar %s presente pero vacía, en vez de coercionarla a 0',
      (key) => {
        // Arrange
        const raw = { [key]: '' };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
      },
    );

    it('debería aplicar el default cuando la variable está ausente, no vacía', () => {
      // Arrange
      const raw = {};

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.SHUTDOWN_TIMEOUT_MS).toBe(10_000);
    });
  });

  describe('TRUST_PROXY', () => {
    it('debería aceptar un número de saltos', () => {
      // Arrange
      const raw = { TRUST_PROXY: '2' };

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.TRUST_PROXY).toBe(2);
    });

    // Antes degradaba a 0 en silencio porque `Number('')` es 0 —y `Number('  ')` también—.
    // Aunque 0 sea el valor seguro, una variable vacía es un error de configuración y conviene
    // que se vea. Los espacios llegan de verdad: dotenv recorta los valores sin comillas, pero no
    // un `"  "` entre comillas ni el entorno que inyecta un orquestador.
    it.each(['', '  ', '\t'])(
      'debería rechazar TRUST_PROXY=%j, vacío o solo espacios, en vez de degradarlo a 0',
      (value) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toContain('empty');
      },
    );

    it('debería aceptar un nombre de proxy como cadena no numérica', () => {
      // Arrange
      const raw = { TRUST_PROXY: 'loopback' };

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.TRUST_PROXY).toBe('loopback');
    });

    // `openapi.ts` compara con `=== 0` para avisar de un proxy sin configurar: el '0' explícito
    // tiene que salir como el NÚMERO 0, igual que el default.
    it('debería emitir TRUST_PROXY="0" como el número 0', () => {
      // Arrange
      const raw = { TRUST_PROXY: '0' };

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.TRUST_PROXY).toBe(0);
    });

    // En Express `true` confía en todos los saltos: `req.ip` pasa a ser lo que el cliente ponga
    // en X-Forwarded-For. Además, en este repo '1' y 'true' son sinónimos en los flags
    // booleanos, pero aquí '1' es un salto: aceptar 'true' haría que significaran cosas distintas.
    it.each(['true', 'false', 'TRUE'])(
      'debería rechazar TRUST_PROXY="%s" explicando que confiar en todos los saltos falsifica req.ip',
      (value) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.path).toEqual(['TRUST_PROXY']);
        expect(result.error?.issues[0]?.message).toContain('X-Forwarded-For');
      },
    );

    it.each(['-1', '1.5', 'Infinity'])(
      'debería rechazar TRUST_PROXY="%s" porque el número de saltos debe ser un entero no negativo',
      (value) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toContain('non-negative integer');
      },
    );

    // Antes de validarlas aquí, estas cadenas pasaban el schema y tumbaban el arranque en
    // `main.ts` con `TypeError: invalid IP address`, fuera del canal de errores de configuración. El nombre va
    // entre comillas en la aserción para que no se cumpla por casualidad como subcadena.
    it.each([
      ['loopbak', 'loopbak'],
      ['Loopback', 'Loopback'],
      ['loopback/8', 'loopback/8'],
      ['10.0.0.1,loopbak', 'loopbak'],
    ])(
      'debería rechazar "%s" nombrando la entrada desconocida "%s", en vez de dejar que Express tumbe el arranque',
      (value, badEntry) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toContain(`"${badEntry}"`);
      },
    );

    // Las reglas propias (notación canónica, subred mapeada) se aplican a CADA entrada: un
    // validador que solo mirase la primera dejaría pasar justo estas dos listas.
    it.each([
      ['10.0.0.1,192.168.001.010', '192.168.001.010'],
      ['10.0.0.0/8,::ffff:10.0.0.0/8', '::ffff:10.0.0.0/8'],
    ])(
      'debería rechazar "%s" aunque la entrada problemática "%s" no sea la primera de la lista',
      (value, badEntry) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toContain(`"${badEntry}"`);
      },
    );

    it.each(['loopback,', 'loopback, ,10.0.0.1', ','])(
      'debería rechazar la lista "%s" con un elemento vacío, que Express no acepta',
      (value) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
      },
    );

    it.each(['10.0.0.0/0', '10.0.0.0/33', '::1/129', '10.0.0.0/255.0.255.0'])(
      'debería rechazar el rango inválido de "%s"',
      (value) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
      },
    );

    // `node:net` las da por buenas; el `ipaddr.js` de proxy-addr, no. Es la prueba de que
    // validar con otro parser deja huecos: el árbitro final tiene que ser Express.
    it.each(['::1.2.3.4', '64:ff9b::1.2.3.4'])(
      'debería rechazar "%s", una IPv6 con IPv4 incrustada que Node acepta pero Express no',
      (value) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
      },
    );

    // Express las acepta, pero las lee en octal o hexadecimal. El caso realista es el relleno con
    // ceros: `192.168.001.010` confía en 192.168.1.8, no en la .10 que el operador escribió; y
    // `010.0.0.0/8` confía en 8.0.0.0/8, direcciones públicas.
    it.each(['192.168.001.010', '010.0.0.0/8', '0x7f.0.0.1'])(
      'debería rechazar la notación IPv4 no canónica "%s", que Express lee en octal o hexadecimal',
      (value) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toContain(`"${value}"`);
      },
    );

    // GHSA-jqcg-44mw-7w3h: antes de proxy-addr 2.0.8 esta forma confiaba en TODO IPv4; desde
    // 2.0.8 no confía en nadie. En ninguna de las dos hace lo que el operador escribió.
    it.each(['::ffff:10.0.0.0/8', '::ffff:a00:0/95'])(
      'debería rechazar la subred IPv4-mapeada "%s" con prefijo menor que /96',
      (value) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const result = envSchema.safeParse(raw);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.issues[0]?.message).toContain('/96');
      },
    );

    // «Súmale 96» solo sirve si el resultado cabe en /128, es decir, con prefijos de 0 a 32.
    it.each([
      ['::ffff:10.0.0.0/8', true],
      ['::ffff:a00:0/95', false],
    ])(
      'debería sugerir sumar 96 al prefijo de "%s" solo cuando el resultado es válido (%s)',
      (value, suggestsAdding96) => {
        // Arrange
        const raw = { TRUST_PROXY: value };

        // Act
        const message = envSchema.safeParse(raw).error?.issues[0]?.message ?? '';

        // Assert
        expect(message.includes('add 96')).toBe(suggestsAdding96);
      },
    );

    it.each([
      '10.0.0.0/8',
      '10.0.0.0/255.0.0.0',
      ' loopback , 10.0.0.0/8 ',
      '::1/128',
      'fe80::/10',
      '::ffff:10.0.0.0/104',
      // Límite exacto: desde /96 el prefijo cubre la marca de IPv4 mapeada y sí casa con clientes
      // IPv4 (con este host, con TODOS: ver el ⚠️ de TRUST_PROXY en .env.example).
      '::ffff:10.0.0.0/96',
      '10.0.0.1,loopback,uniquelocal',
      'linklocal',
    ])('debería aceptar la spec válida "%s" y emitirla tal cual, sin trocearla', (value) => {
      // Arrange
      const raw = { TRUST_PROXY: value };

      // Act
      const env = parseOrThrow(raw);

      // Assert
      expect(env.TRUST_PROXY).toBe(value);
    });

    it('debería emitir solo valores que Express acepta en trust proxy (propiedad)', () => {
      fc.assert(
        fc.property(trustProxyInputArb, (value) => {
          // Arrange
          const raw = { TRUST_PROXY: value };

          // Act
          const result = envSchema.safeParse(raw);

          // Assert
          if (result.success) {
            expect(() => express().set('trust proxy', result.data.TRUST_PROXY)).not.toThrow();
          }
        }),
      );
    });

    it('debería aceptar toda lista construida de presets, IPv4 e IPv6 con prefijo válido (propiedad)', () => {
      fc.assert(
        fc.property(validTrustProxySpecArb, (value) => {
          // Arrange
          const raw = { TRUST_PROXY: value };

          // Act
          const env = parseOrThrow(raw);

          // Assert
          expect(env.TRUST_PROXY).toBe(value);
          expect(() => express().set('trust proxy', value)).not.toThrow();
        }),
      );
    });
  });

  describe('enums', () => {
    it('debería rechazar un NODE_ENV fuera de la lista permitida', () => {
      // Arrange
      const raw = { NODE_ENV: 'staging-2' };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(result.success).toBe(false);
    });

    it('debería rechazar un LOG_LEVEL desconocido', () => {
      // Arrange
      const raw = { LOG_LEVEL: 'verbose' };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(result.success).toBe(false);
    });

    it.each(['development', 'test', 'staging', 'production'])(
      'debería aceptar NODE_ENV="%s"',
      (value) => {
        // Arrange
        // JWT_SECRET solo hace falta en staging/production — ver el refine de auth en
        // env.schema.ts. Aquí lo que se comprueba es el enum de NODE_ENV, no eso.
        const needsJwtSecret = value === 'staging' || value === 'production';
        const raw = { NODE_ENV: value, ...(needsJwtSecret ? { JWT_SECRET: 'x'.repeat(32) } : {}) };

        // Act
        const env = parseOrThrow(raw);

        // Assert
        expect(env.NODE_ENV).toBe(value);
      },
    );
  });

  describe('credenciales de la documentación', () => {
    it('debería aceptar ambas credenciales definidas', () => {
      // Arrange
      const raw = { DOCS_USERNAME: 'equipo', DOCS_PASSWORD: 'secreto' };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(result.success).toBe(true);
    });

    it('debería aceptar ambas credenciales ausentes', () => {
      // Arrange
      const raw = {};

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      // Sin credenciales la documentación queda abierta, que es el comportamiento actual: la
      // protección primaria en producción sigue siendo `DOCS_ENABLED=false`.
      expect(result.success).toBe(true);
    });

    it('debería rechazar una sola credencial definida', () => {
      // Arrange
      const raw = { DOCS_USERNAME: 'equipo' };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      // Una credencial a medias es un despliegue que se cree protegido y no lo está: el
      // middleware nunca se monta y la documentación sale publicada sin pedir nada.
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain('DOCS_PASSWORD');
    });
  });
});

// Helpers

const parseOrThrow = (raw: Record<string, unknown>) => envSchema.parse(raw);

const presetArb = fc.constantFrom('loopback', 'linklocal', 'uniquelocal');

/**
 * IPv6 global unicast en forma completa, construida grupo a grupo. No sale de `fc.ipV6()` a
 * propósito: ese arbitrario genera formas con IPv4 incrustada que `ipaddr.js` 1.9.1 rechaza, y
 * el primer grupo en 2000-3fff garantiza que nunca es IPv4-mapeada.
 */
const globalIpv6Arb = fc
  .tuple(
    fc.integer({ min: 0x2000, max: 0x3fff }),
    fc.array(fc.integer({ min: 0, max: 0xffff }), { minLength: 7, maxLength: 7 }),
  )
  .map(([head, tail]) => [head, ...tail].map((group) => group.toString(16)).join(':'));

const withPrefix = (address: fc.Arbitrary<string>, max: number) =>
  fc.tuple(address, fc.integer({ min: 1, max })).map(([ip, prefix]) => `${ip}/${prefix}`);

const validTrustProxySpecArb = fc
  .tuple(
    fc.array(
      fc.oneof(
        presetArb,
        fc.ipV4(),
        withPrefix(fc.ipV4(), 32),
        globalIpv6Arb,
        withPrefix(globalIpv6Arb, 128),
      ),
      { minLength: 1, maxLength: 4 },
    ),
    fc.constantFrom(',', ', ', ' , '),
  )
  .map(([entries, separator]) => entries.join(separator));

/** Mezcla deliberada de entradas válidas y basura: la propiedad solo mira lo que el schema acepta. */
const trustProxyInputArb = fc.oneof(
  validTrustProxySpecArb,
  fc
    .array(
      fc.oneof(
        presetArb,
        fc.constantFrom('true', 'false', 'loopbak', 'Loopback', '', ' '),
        fc.ipV4(),
        fc.ipV4Extended(),
        fc.ipV6(),
        withPrefix(fc.oneof(fc.ipV4(), fc.ipV6()), 130),
        fc.string(),
      ),
      { minLength: 1, maxLength: 4 },
    )
    .map((entries) => entries.join(',')),
  fc.integer({ min: -5, max: 5 }).map(String),
  fc.double().map(String),
);
