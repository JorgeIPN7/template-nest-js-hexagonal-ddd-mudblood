import { format, stripVTControlCharacters } from 'node:util';

import type { LoggerOptions } from 'typeorm';

import { ParameterFreeLogger } from '../parameter-free-logger';

/** Forma de un hash argon2id real; el valor en sí es irrelevante, basta con que lo parezca. */
const ARGON2_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo';
const INSERT_CREDENTIAL =
  'INSERT INTO auth_credentials (id, user_id, password_hash) VALUES ($1, $2, $3)';
const PARAMETERS = [
  '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  'a1b2c3d4-0000-4000-8000-000000000000',
  ARGON2_HASH,
];

/**
 * Backlog #40: con `DB_LOGGING=true`, el logger por defecto de TypeORM añade
 * `-- PARAMETERS: [...]` a cada consulta, y el INSERT de una credencial lleva el hash. Ese log va
 * directo a la consola, sin pasar por la redacción de pino.
 *
 * La salida se lee de `console.log`, por donde escribe `PlatformTools` en los tres casos, y sin
 * los códigos ANSI del resaltado de SQL, que podrían partir el hash y dejar en verde un
 * `not.toContain` sin el arreglo.
 */
describe('ParameterFreeLogger', () => {
  let consoleLog: jest.SpyInstance;

  beforeEach(() => {
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('debería imprimir la consulta sin sus parámetros', () => {
    // Arrange
    const logger = new ParameterFreeLogger({ logging: true });

    // Act
    logger.logQuery(INSERT_CREDENTIAL, PARAMETERS);

    // Assert
    const output = printed();
    expect(output).toContain('INSERT INTO auth_credentials');
    expect(output).not.toContain('$argon2id$');
    expect(output).not.toContain('PARAMETERS');
  });

  it('debería imprimir la consulta fallida y su error sin los parámetros', () => {
    // Arrange
    const logger = new ParameterFreeLogger({ logging: true });
    // Como un `QueryFailedError`: el hash en `detail` (la fila que viola la constraint) y en
    // `parameters`. Solo deben salir el nombre y el mensaje.
    const error = Object.assign(new Error('new row violates check constraint'), {
      detail: `Failing row contains (${ARGON2_HASH}).`,
      parameters: PARAMETERS,
    });

    // Act
    logger.logQueryError(error, INSERT_CREDENTIAL, PARAMETERS);

    // Assert
    const output = printed();
    expect(output).toContain('INSERT INTO auth_credentials');
    expect(output).toContain('new row violates check constraint');
    expect(output).not.toContain('$argon2id$');
  });

  it('debería imprimir la consulta lenta sin sus parámetros', () => {
    // Arrange
    const logger = new ParameterFreeLogger({ logging: true });

    // Act
    logger.logQuerySlow(1500, INSERT_CREDENTIAL, PARAMETERS);

    // Assert
    const output = printed();
    expect(output).toContain('INSERT INTO auth_credentials');
    expect(output).not.toContain('$argon2id$');
  });

  it('debería no imprimir nada con el registro de consultas apagado', () => {
    // Arrange
    const logger = new ParameterFreeLogger({ logging: false });

    // Act
    logger.logQuery(INSERT_CREDENTIAL, PARAMETERS);
    logger.logQueryError(new Error('fallo'), INSERT_CREDENTIAL, PARAMETERS);

    // Assert
    expect(consoleLog).not.toHaveBeenCalled();
  });

  // `DataSource.setOptions` cambia `logging` con `Object.assign` sobre el mismo objeto de opciones,
  // y cada comando de la CLI de TypeORM lo hace al arrancar (`migration:show` pide `['schema']`).
  it('debería seguir el logging de sus opciones aunque cambie después de construirlo', () => {
    // Arrange
    const options: { logging: LoggerOptions } = { logging: false };
    const logger = new ParameterFreeLogger(options);
    Object.assign(options, { logging: ['schema'] });

    // Act
    logger.logSchemaBuild('[X] 1 CreateUsers1700000000000');

    // Assert
    expect(printed()).toContain('[X] 1 CreateUsers1700000000000');
  });

  // `setOptions` solo recrea el logger cuando el `logging` nuevo es verdadero: con el `false` que
  // piden `migration:generate` y `schema:log`, TypeORM conserva el de `DB_LOGGING`, y estos
  // comandos imprimían sus consultas con `DB_LOGGING=true`.
  it('debería conservar su logging cuando las opciones lo cambian a false, como hace TypeORM', () => {
    // Arrange
    const options: { logging: LoggerOptions } = { logging: true };
    const logger = new ParameterFreeLogger(options);
    Object.assign(options, { logging: false });

    // Act
    logger.logQuery('SELECT * FROM "migrations"');

    // Assert
    expect(printed()).toContain('SELECT * FROM "migrations"');
  });

  // Helpers

  /** Lo que habría escrito `console.log`: `format` inspecciona un `Error` y volcaría su `detail`. */
  function printed(): string {
    return consoleLog.mock.calls
      .map((call: unknown[]) => stripVTControlCharacters(format(...call)))
      .join('\n');
  }
});
