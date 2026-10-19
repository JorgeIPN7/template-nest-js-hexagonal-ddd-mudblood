import { captureError } from '@test/helpers/capture-error';

import { failClosed } from '../../persistence/fail-closed';

describe('failClosed', () => {
  it('debería devolver lo que devuelve rebuild cuando reconstruye sin error', () => {
    // Arrange
    const gadget = { code: 'g-1' };
    // Act
    const result = failClosed(() => gadget, isGadgetDomainError, describeCorruptGadget);
    // Assert
    expect(result).toBe(gadget);
  });

  it('debería envolver un error de dominio en un Error con el mensaje de describeCorruptGadget y el original como cause', () => {
    // Arrange
    const original = new InvalidGadgetCodeError('zz-9');
    const rebuild = (): never => {
      throw original;
    };
    // Act
    const thrown = captureError(() =>
      failClosed(rebuild, isGadgetDomainError, describeCorruptGadget),
    );
    // Assert
    expect(thrown.constructor).toBe(Error);
    expect(thrown.message).toBe(
      'El gadget g-1 tiene datos que el dominio rechaza: "zz-9" is not a valid gadget code',
    );
    expect(thrown.cause).toBe(original);
  });

  it('debería relanzar intacto, sin envolverlo, un error que no es de dominio', () => {
    // Arrange
    const original = new TypeError('row.code is undefined');
    const rebuild = (): never => {
      throw original;
    };
    // Act
    const thrown = captureError(() =>
      failClosed(rebuild, isGadgetDomainError, describeCorruptGadget),
    );
    // Assert
    expect(thrown).toBe(original);
  });
});

// Helpers
//
// Un error de dominio local con la forma de los de los contextos, para no depender de ninguno.
// El `describe` del mapper se llama `describeCorruptGadget` y no `describe`, que taparía el global
// de Jest.

abstract class GadgetDomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

class InvalidGadgetCodeError extends GadgetDomainError {
  constructor(readonly value: string) {
    super(`"${value}" is not a valid gadget code`);
  }
}

const isGadgetDomainError = (error: unknown): error is GadgetDomainError =>
  error instanceof GadgetDomainError;

const describeCorruptGadget = (error: GadgetDomainError): string =>
  `El gadget g-1 tiene datos que el dominio rechaza: ${error.message}`;
