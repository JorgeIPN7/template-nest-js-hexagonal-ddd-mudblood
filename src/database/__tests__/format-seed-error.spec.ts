import fc from 'fast-check';

import { formatSeedError } from '../seeds/format-seed-error';

/** Forma de un hash argon2id real; el valor en sí es irrelevante, basta con que lo parezca. */
const ARGON2_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo';

/** Lo que un `QueryFailedError` añade al `Error`, con valores que a veces son el hash. */
const extraProperties = fc.dictionary(
  fc.constantFrom('detail', 'parameters', 'query', 'hint', 'where'),
  fc.oneof(fc.string(), fc.constant(ARGON2_HASH)),
);

describe('formatSeedError', () => {
  it('debería devolver solo el mensaje y el código de un error de la base', () => {
    // Arrange
    const error = driverError('new row violates check constraint', '23514');

    // Act
    const output = formatSeedError(error);

    // Assert
    expect(output).toBe('new row violates check constraint (código 23514)');
  });

  // Backlog #40: el CLI imprimía el error con `util.inspect`, que vuelca `detail` (PostgreSQL pone
  // ahí la fila entera en una violación de constraint) y `parameters` (TypeORM guarda los del
  // INSERT). Los dos llevan el hash.
  it('debería no dejar el hash argon2id en la salida aunque el error lo lleve en detail y en parameters', () => {
    // Arrange
    const error = driverError('new row violates check constraint', '23514');

    // Act
    const output = formatSeedError(error);

    // Assert
    expect(output).not.toContain('$argon2id$');
  });

  it('debería devolver solo el mensaje cuando el error no trae código', () => {
    // Arrange
    const error = new Error('sin conexión');

    // Act
    const output = formatSeedError(error);

    // Assert
    expect(output).toBe('sin conexión');
  });

  it('debería convertir a texto un valor lanzado que no es un Error, sin volcar sus propiedades', () => {
    // Arrange
    const thrown = { detail: `Failing row contains (${ARGON2_HASH}).` };

    // Act
    const output = formatSeedError(thrown);

    // Assert
    expect(output).toBe('[object Object]');
  });

  it('debería devolver siempre exactamente el mensaje y el código, sea cual sea el resto del error', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string({ minLength: 1 }),
        extraProperties,
        (message, code, extra) => {
          // Arrange
          const error = Object.assign(new Error(message), extra, { code });

          // Act
          const output = formatSeedError(error);

          // Assert
          expect(output).toBe(`${message} (código ${code})`);
        },
      ),
    );
  });

  // Helpers

  function driverError(message: string, code: string): Error {
    return Object.assign(new Error(message), {
      code,
      detail: `Failing row contains (${ARGON2_HASH}).`,
      parameters: ['3f2504e0-4f89-41d3-9a0c-0305e82c3301', ARGON2_HASH],
    });
  }
});
