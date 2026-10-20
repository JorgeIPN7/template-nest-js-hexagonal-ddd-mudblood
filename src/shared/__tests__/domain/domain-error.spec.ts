import { DomainError } from '../../domain/domain-error';

describe('DomainError', () => {
  it('debería tomar como name el nombre de la clase concreta que la extiende directamente', () => {
    // Arrange
    const error = new DirectError('m');
    // Act
    const name = error.name;
    // Assert
    expect(name).toBe('DirectError');
  });

  it('debería tomar como name el nombre de la clase concreta aunque herede de una raíz abstracta intermedia', () => {
    // Arrange
    const error = new SampleNotFoundError('s-1');
    // Act
    const name = error.name;
    // Assert
    expect(name).toBe('SampleNotFoundError');
  });

  it('debería conservar el mensaje que compone la clase concreta', () => {
    // Arrange
    const error = new SampleNotFoundError('s-1');
    // Act
    const message = error.message;
    // Assert
    expect(message).toBe('Sample s-1 was not found');
  });

  it('debería ser instancia de Error, de DomainError y de su raíz intermedia', () => {
    // Arrange
    const error = new SampleNotFoundError('s-1');
    // Act
    const instances = [
      error instanceof Error,
      error instanceof DomainError,
      error instanceof SampleDomainError,
    ];
    // Assert
    expect(instances).toEqual([true, true, true]);
  });
});

// Helpers
//
// Dobles con la forma de los contextos y no errores reales de un módulo: el kernel tiene que
// poder probarse solo, porque quitar un módulo de ejemplo es borrar su carpeta entera.
// `SampleDomainError` es la raíz abstracta sin constructor, como la de cada contexto, y
// `DirectError` extiende la base sin raíz en medio: necesita un constructor público, porque el
// protegido heredado no se puede invocar desde el test (TS2674).

abstract class SampleDomainError extends DomainError {}

class SampleNotFoundError extends SampleDomainError {
  constructor(readonly sampleId: string) {
    super(`Sample ${sampleId} was not found`);
  }
}

class DirectError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
