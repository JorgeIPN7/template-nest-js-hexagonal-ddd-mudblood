import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import express from 'express';
import fc from 'fast-check';

import { LoginDto } from '@modules/auth/infrastructure/http/dto/login.dto';
import { RegisterAccountDto } from '@modules/auth/infrastructure/http/dto/register-account.dto';
import { Email } from '@modules/users/domain/value-objects/email.vo';

import { envSchema, splitList } from '../env.schema';
import { PASSWORD_LENGTH } from '../password-policy';

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

  // `pnpm seed:admin` escribe lo que este esquema acepte, y luego el admin entra por
  // `POST /auth/login`, que valida con `LoginDto`. Si el esquema aceptara algo que el DTO
  // rechaza, el seed terminaría con éxito y dejaría un admin que nunca puede entrar (backlog
  // #34). Los tests importan los DTO de `auth` y el VO de `users`: es legal porque los tests
  // están exentos de la matriz de fronteras.
  describe('credenciales del primer admin', () => {
    it('debería rechazar un ADMIN_PASSWORD de 11 caracteres con un único error «Too small»', () => {
      // Arrange
      const raw = { ADMIN_EMAIL: VALID_ADMIN_EMAIL, ADMIN_PASSWORD: 'a'.repeat(11) };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      // El README y `.env.example` citan este mensaje: un segundo error para la misma causa
      // sería ruido en el arranque.
      expect(issueMessages(result, 'ADMIN_PASSWORD')).toEqual([
        'Too small: expected string to have >=12 characters',
      ]);
    });

    it('debería aceptar un ADMIN_PASSWORD de exactamente 12 caracteres y otro de exactamente 128', () => {
      // Arrange
      const passwords = ['a'.repeat(12), 'a'.repeat(128)];

      // Act
      const accepted = passwords.map(
        (password) =>
          envSchema.safeParse({ ADMIN_EMAIL: VALID_ADMIN_EMAIL, ADMIN_PASSWORD: password }).success,
      );

      // Assert
      expect(accepted).toEqual([true, true]);
    });

    it('debería rechazar un ADMIN_PASSWORD de 129 caracteres', () => {
      // Arrange
      const raw = { ADMIN_EMAIL: VALID_ADMIN_EMAIL, ADMIN_PASSWORD: 'a'.repeat(129) };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(issuePaths(result)).toEqual(['ADMIN_PASSWORD']);
      expect(issueMessages(result, 'ADMIN_PASSWORD')).toEqual([
        expect.stringContaining('POST /auth/login'),
      ]);
    });

    // Zod cuenta puntos de código y ve doce; class-validator no cuenta el selector U+FE0F y ve
    // seis, así que el login respondería 400.
    it('debería rechazar un ADMIN_PASSWORD de seis emojis con selector de variación', () => {
      // Arrange
      const raw = { ADMIN_EMAIL: VALID_ADMIN_EMAIL, ADMIN_PASSWORD: '\u2764\uFE0F'.repeat(6) };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toEqual(['ADMIN_PASSWORD']);
    });

    it('debería rechazar un ADMIN_EMAIL con más de 64 caracteres antes de la arroba', () => {
      // Arrange
      const raw = {
        ADMIN_EMAIL: `${'a'.repeat(65)}@example.com`,
        ADMIN_PASSWORD: VALID_ADMIN_PASSWORD,
      };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(issuePaths(result)).toEqual(['ADMIN_EMAIL']);
      expect(issueMessages(result, 'ADMIN_EMAIL')).toEqual([
        expect.stringContaining('POST /auth/login'),
      ]);
    });

    it('debería rechazar un ADMIN_EMAIL con una etiqueta de dominio de 64 caracteres', () => {
      // Arrange
      const raw = {
        ADMIN_EMAIL: `admin@${'a'.repeat(64)}.com`,
        ADMIN_PASSWORD: VALID_ADMIN_PASSWORD,
      };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toEqual(['ADMIN_EMAIL']);
    });

    // 257 caracteres con cada parte dentro de su límite: solo lo rechaza el total de 254.
    it('debería rechazar un ADMIN_EMAIL de más de 254 caracteres aunque ninguna de sus partes pase de su límite', () => {
      // Arrange
      const labels = ['b'.repeat(63), 'c'.repeat(63), 'd'.repeat(60), 'com'];
      const raw = {
        ADMIN_EMAIL: `${'a'.repeat(64)}@${labels.join('.')}`,
        ADMIN_PASSWORD: VALID_ADMIN_PASSWORD,
      };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(raw.ADMIN_EMAIL).toHaveLength(257);
      expect(issuePaths(result)).toEqual(['ADMIN_EMAIL']);
    });

    it('debería rechazar un ADMIN_EMAIL con una etiqueta de dominio que acaba en guion', () => {
      // Arrange
      const raw = { ADMIN_EMAIL: 'admin@empresa-.com', ADMIN_PASSWORD: VALID_ADMIN_PASSWORD };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(issuePaths(result)).toEqual(['ADMIN_EMAIL']);
    });

    // `isEmail` acepta una parte local entre comillas con un espacio dentro, y `Email.from` no
    // admite espacios: sin `z.email()` delante, el seed crearía un admin que el login no encuentra
    // nunca (401 para siempre).
    it('debería rechazar un ADMIN_EMAIL con un espacio en la parte local entre comillas, que isEmail acepta y Email.from no', () => {
      // Arrange
      const raw = {
        ADMIN_EMAIL: '"primer admin"@example.com',
        ADMIN_PASSWORD: VALID_ADMIN_PASSWORD,
      };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(issuePaths(result)).toEqual(['ADMIN_EMAIL']);
    });

    // Mismo criterio que con «Too small» en la contraseña: un segundo error que culpa a límites de
    // longitud confundiría a quien solo escribió mal la dirección.
    it('debería rechazar un ADMIN_EMAIL mal formado con un único error «Invalid email address»', () => {
      // Arrange
      const raw = { ADMIN_EMAIL: 'admin.example.com', ADMIN_PASSWORD: VALID_ADMIN_PASSWORD };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(issueMessages(result, 'ADMIN_EMAIL')).toEqual(['Invalid email address']);
    });

    it('debería aceptar un ADMIN_EMAIL con una etiqueta de 63 caracteres y otro de exactamente 254', () => {
      // Arrange
      const longestLabel = `admin@${'a'.repeat(63)}.com`;
      const longestTotal = `${'a'.repeat(64)}@${['b'.repeat(63), 'c'.repeat(63), 'd'.repeat(57), 'com'].join('.')}`;

      // Act
      const accepted = [longestLabel, longestTotal].map(
        (email) =>
          envSchema.safeParse({ ADMIN_EMAIL: email, ADMIN_PASSWORD: VALID_ADMIN_PASSWORD }).success,
      );

      // Assert
      expect(longestTotal).toHaveLength(254);
      expect(accepted).toEqual([true, true]);
    });

    it('debería aceptar un ADMIN_EMAIL con 64 caracteres antes de la arroba', () => {
      // Arrange
      const raw = {
        ADMIN_EMAIL: `${'a'.repeat(64)}@example.com`,
        ADMIN_PASSWORD: VALID_ADMIN_PASSWORD,
      };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(result.success).toBe(true);
    });

    // Un error de ADMIN_* no puede tapar los de las reglas entre variables, que viven en los
    // `refine` del objeto: quien despliega tiene que verlos todos en el mismo arranque, no uno por
    // intento.
    it('debería informar a la vez de un ADMIN_PASSWORD corto y de la falta de JWT_SECRET en production', () => {
      // Arrange
      const raw = {
        NODE_ENV: 'production',
        ADMIN_EMAIL: VALID_ADMIN_EMAIL,
        ADMIN_PASSWORD: 'a'.repeat(11),
      };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(issuePaths(result)).toEqual(['ADMIN_PASSWORD', 'JWT_SECRET']);
    });

    it('debería informar a la vez de un ADMIN_EMAIL mal formado y de la falta de ADMIN_PASSWORD', () => {
      // Arrange
      const raw = { ADMIN_EMAIL: 'admin.example.com' };

      // Act
      const result = envSchema.safeParse(raw);

      // Assert
      expect(issuePaths(result)).toEqual(['ADMIN_EMAIL', 'ADMIN_PASSWORD']);
    });

    it('debería aceptar como ADMIN_PASSWORD exactamente las contraseñas que aceptan LoginDto y RegisterAccountDto', () => {
      fc.assert(
        fc.property(adminPasswordArb, (password) => {
          // Arrange
          const raw = { ADMIN_EMAIL: VALID_ADMIN_EMAIL, ADMIN_PASSWORD: password };

          // Act
          const schemaAccepts = envSchema.safeParse(raw).success;
          const dtosAccept = {
            login: acceptsField(LoginDto, { email: VALID_ADMIN_EMAIL, password }, 'password'),
            register: acceptsField(
              RegisterAccountDto,
              { email: VALID_ADMIN_EMAIL, name: 'Administrador', password },
              'password',
            ),
          };

          // Assert
          expect(dtosAccept).toEqual({ login: schemaAccepts, register: schemaAccepts });
        }),
      );
    });

    it('debería aceptar como ADMIN_EMAIL solo emails que aceptan LoginDto y Email.from', () => {
      fc.assert(
        fc.property(adminEmailArb, (email) => {
          // Arrange
          const raw = { ADMIN_EMAIL: email, ADMIN_PASSWORD: VALID_ADMIN_PASSWORD };

          // Act
          const schemaAccepts = envSchema.safeParse(raw).success;

          // Assert
          if (schemaAccepts) {
            expect(acceptsField(LoginDto, { email, password: VALID_ADMIN_PASSWORD }, 'email')).toBe(
              true,
            );
            expect(() => Email.from(email)).not.toThrow();
          }
        }),
      );
    });
  });
});

// Helpers

const parseOrThrow = (raw: Record<string, unknown>) => envSchema.parse(raw);

type ParseResult = ReturnType<typeof envSchema.safeParse>;

/** Las claves del entorno en las que el esquema dejó algún error, sin repetir y ordenadas. */
const issuePaths = (result: ParseResult): string[] =>
  [...new Set(result.error?.issues.map((issue) => String(issue.path[0])) ?? [])].sort();

const issueMessages = (result: ParseResult, key: string): string[] =>
  result.error?.issues.filter((issue) => issue.path[0] === key).map((issue) => issue.message) ?? [];

const VALID_ADMIN_EMAIL = 'primer.admin@example.com';
const VALID_ADMIN_PASSWORD = 'una-frase-larga-y-dificil-de-adivinar';

/**
 * Si el DTO acepta ESE campo del cuerpo, con la validación real que corre el `ValidationPipe`.
 * Solo cuentan los errores de `field`: el resto del cuerpo va válido, pero así un fallo ajeno no
 * puede hacerse pasar por un rechazo del campo que se compara.
 */
const acceptsField = (
  dto: ClassConstructor<object>,
  body: Record<string, unknown>,
  field: string,
): boolean => validateSync(plainToInstance(dto, body)).every((error) => error.property !== field);

/**
 * Trozos de contraseña, con lo que cuenta cada uno para Zod (puntos de código) y para
 * class-validator: ASCII (1 y 1), un emoji fuera del BMP (1 y 1), un sustituto huérfano (1 y 1),
 * un emoji con selector de variación (2 y 1) y el selector suelto (1 y, casi siempre, 0). Los tres
 * primeros son de control; los dos últimos son donde las dos formas de contar se separan.
 */
const passwordChunkArb = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.integer({ min: 0x20, max: 0x7e }).map((code) => String.fromCharCode(code)),
  },
  fc.constant('\u{1F600}'),
  fc.constant('\u2764\uFE0F'),
  fc.constant('\uFE0F'),
  fc.constant('\uD83D'),
);

/**
 * Contraseñas de 0 a `max + 12` trozos, para recorrer TODO el rango, más dos bandas junto a las
 * fronteras; la de arriba llega a `max + 24` trozos porque los selectores sueltos no cuentan. La
 * longitud se elige ANTES y el array se pide con ella exacta: con solo `maxLength`, fast-check 4
 * genera arrays de tamaño «small» y ninguna de 5 000 muestras pasaba de 10 trozos (medido).
 *
 * Las bandas casi nunca caen en la frontera EXACTA, así que se suman las cuatro (`min - 1`, `min`,
 * `max`, `max + 1`) en las dos unidades que discrepan: ASCII y `'❤️'`. Medido el 2026-10-01 con
 * Zod y class-validator reales, 100 casos por corrida: nueve mutantes —sin el `refine`, sin su
 * mínimo o su máximo, `.max()` de Zod en su lugar, `@MaxLength(100)` y cuatro errores de uno en los
 * decoradores de los DTO— no se escaparon en ninguna de 2 000 semillas; no es una garantía, y por
 * eso cada frontera tiene además su fila fija. Sin la rama de fronteras, los errores de uno se
 * escapaban en una de cada tres.
 */
const adminPasswordArb = fc.oneof(
  fc
    .oneof(
      fc.integer({ min: 0, max: PASSWORD_LENGTH.max + 12 }),
      fc.integer({ min: 0, max: 2 * PASSWORD_LENGTH.min }),
      fc.integer({ min: PASSWORD_LENGTH.max - 12, max: PASSWORD_LENGTH.max + 24 }),
    )
    .chain((length) => fc.array(passwordChunkArb, { minLength: length, maxLength: length }))
    .map((chunks) => chunks.join('')),
  fc
    .tuple(
      fc.constantFrom(
        PASSWORD_LENGTH.min - 1,
        PASSWORD_LENGTH.min,
        PASSWORD_LENGTH.max,
        PASSWORD_LENGTH.max + 1,
      ),
      fc.constantFrom('a', '\u2764\uFE0F'),
    )
    .map(([length, unit]) => unit.repeat(length)),
);

const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyz0123456789';

const alphanumericArb = (length: number) =>
  fc.string({ unit: fc.constantFrom(...ALPHANUMERIC), minLength: length, maxLength: length });

/** Uno de cada diez caracteres es un guion: salen etiquetas que acaban en guion (`a@b-.com`). */
const domainLabelArb = (length: number) =>
  fc.string({
    unit: fc.oneof({ weight: 9, arbitrary: fc.constantFrom(...ALPHANUMERIC) }, fc.constant('-')),
    minLength: length,
    maxLength: length,
  });

/** Una longitud corta, o pegada a `limit` por dentro o por fuera. */
const partLengthArb = (limit: number) =>
  fc.oneof(
    fc.integer({ min: 1, max: 20 }),
    fc.integer({ min: limit - 4, max: limit }),
    fc.integer({ min: limit + 1, max: limit + 4 }),
  );

/** Parte local de 60 a 64 y cuatro etiquetas de 59 a 63: 304-324 caracteres sin que se pase ninguna parte. */
const longTotalEmailArb = fc
  .tuple(
    fc.integer({ min: 60, max: 64 }).chain(alphanumericArb),
    fc.array(fc.integer({ min: 59, max: 63 }).chain(alphanumericArb), {
      minLength: 4,
      maxLength: 4,
    }),
  )
  .map(([local, labels]) => `${local}@${labels.join('.')}.com`);

const trailingHyphenEmailArb = fc
  .tuple(
    fc.integer({ min: 1, max: 20 }).chain(alphanumericArb),
    fc.integer({ min: 1, max: 20 }).chain(alphanumericArb),
  )
  .map(([local, label]) => `${local}@${label}-.com`);

/**
 * `fc.emailAddress()` no se acerca a ninguno de los límites en los que Zod e `isEmail` discrepan
 * —64 caracteres antes de la arroba, 63 por etiqueta, 254 en total y la etiqueta que acaba en
 * guion—, así que se le suman emails construidos junto a ellos: parte local y de una a cuatro
 * etiquetas, cada una corta o pegada a su límite, más una banda de total largo y otra de guion
 * final. Esas dos hacen falta porque la mezcla general casi nunca da con un total de más de 254
 * con todas las partes dentro de su límite.
 *
 * Medido el 2026-10-01 con Zod e `isEmail` reales, 100 casos por corrida: seis `refine` que
 * olvidan una regla (sin él, solo la parte local, solo el dominio, sin el total, sin el guion
 * final, `isEmail` con `ignore_max_length`) no se escaparon en ninguna de 2 000 semillas. Sin las
 * dos bandas, el que olvida el total solo caía en 161 de 1 000. Cada límite tiene además su fila
 * fija arriba.
 */
const adminEmailArb = fc.oneof(
  fc.emailAddress(),
  {
    weight: 3,
    arbitrary: fc
      .tuple(
        partLengthArb(64).chain(alphanumericArb),
        fc.integer({ min: 1, max: 4 }).chain((count) =>
          fc.array(partLengthArb(63).chain(domainLabelArb), {
            minLength: count,
            maxLength: count,
          }),
        ),
      )
      .map(([local, labels]) => `${local}@${labels.join('.')}.com`),
  },
  longTotalEmailArb,
  trailingHyphenEmailArb,
);

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
