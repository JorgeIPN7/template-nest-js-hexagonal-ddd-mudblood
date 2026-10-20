import { fc, test as fcTest } from '@fast-check/jest';
import { BadRequestException, Catch, ConflictException, NotFoundException } from '@nestjs/common';

import { captureError } from '@test/helpers/capture-error';

import {
  DomainExceptionFilter,
  type DomainErrorMapping,
} from '../../filters/domain-exception.filter';
import { FILTER_CATCH_EXCEPTIONS } from '../../nest-metadata.constants';

describe('DomainExceptionFilter', () => {
  describe('catch()', () => {
    it('debería traducir con la primera entrada que casa aunque una posterior sea más específica', () => {
      // Arrange
      const filter = filterWith([
        { error: WidgetNotFoundError, toHttp: (error) => new NotFoundException(error.message) },
        { error: WidgetDeletedError, toHttp: (error) => new ConflictException(error.message) },
      ]);
      // Act
      const thrown = captureError(() => filter.catch(new WidgetDeletedError('w-1')));
      // Assert
      expect(thrown).toBeInstanceOf(NotFoundException);
      expect(thrown.message).toBe('Widget w-1 was not found');
    });

    it('debería casar por instanceof una subclase del error de una entrada', () => {
      // Arrange
      const filter = filterWith([
        { error: WidgetNotFoundError, toHttp: (error) => new NotFoundException(error.message) },
      ]);
      // Act
      const thrown = captureError(() => filter.catch(new WidgetDeletedError('w-1')));
      // Assert
      expect(thrown).toBeInstanceOf(NotFoundException);
    });

    it('debería lanzar BadRequestException con el mensaje del dominio cuando ninguna entrada casa', () => {
      // Arrange
      const filter = filterWith([
        { error: WidgetNotFoundError, toHttp: (error) => new NotFoundException(error.message) },
      ]);
      // Act
      const thrown = captureError(() => filter.catch(new WidgetRuleError('Regla nueva sin mapeo')));
      // Assert: la clase primero; sin ella, `getResponse` no existiría y la fila fallaría por
      // excepción en vez de por aserción.
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect((thrown as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        message: 'Regla nueva sin mapeo',
        error: 'Bad Request',
      });
    });

    // `minLength: 1` porque con un mensaje vacío Nest sustituye el mensaje por la descripción y
    // omite `error`; ningún error de dominio tiene el mensaje vacío.
    fcTest.prop([fc.string({ minLength: 1 })])(
      'debería lanzar siempre, y nunca devolver, un 400 con el mensaje exacto del dominio cuando ninguna entrada casa',
      (message) => {
        // Arrange
        const filter = filterWith([]);
        const domainError = new WidgetRuleError(message);
        // Act
        const thrown = captureError(() => filter.catch(domainError));
        // Assert
        expect(thrown).toBeInstanceOf(BadRequestException);
        expect(thrown.message).toBe(message);
      },
    );
  });

  describe('metadatos de @Catch', () => {
    it('debería no llevar metadatos de @Catch en la clase base', () => {
      // Arrange
      const base = DomainExceptionFilter;
      // Act
      const exceptions: unknown = Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, base);
      // Assert
      expect(exceptions).toBeUndefined();
    });

    // Control positivo de la fila anterior: con una clave equivocada, aquella pasaría igual,
    // porque una clave que nadie escribe también devuelve `undefined`.
    it('debería exponer a Nest exactamente la raíz que declara @Catch en la subclase', () => {
      // Arrange
      const subclass = WidgetDomainExceptionFilter;
      // Act
      const exceptions: unknown = Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, subclass);
      // Assert
      expect(exceptions).toEqual([WidgetDomainError]);
    });
  });
});

// Helpers
//
// Errores y filtros reales, locales al spec y sin mocks. `WidgetDomainError` tiene la forma de las
// raíces de los contextos: abstracta y con constructor protegido. `WidgetDeletedError` es una
// subclase de `WidgetNotFoundError` para ver qué entrada gana cuando las dos casan.

abstract class WidgetDomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

class WidgetNotFoundError extends WidgetDomainError {
  constructor(readonly widgetId: string) {
    super(`Widget ${widgetId} was not found`);
  }
}

class WidgetDeletedError extends WidgetNotFoundError {}

class WidgetRuleError extends WidgetDomainError {
  constructor(message: string) {
    super(message);
  }
}

@Catch(WidgetDomainError)
class WidgetDomainExceptionFilter extends DomainExceptionFilter<WidgetDomainError> {
  protected readonly mappings: readonly DomainErrorMapping<WidgetDomainError>[] = [];
}

/** Una subclase anónima sin constructor por tabla, como la escribiría un contexto. */
function filterWith(
  mappings: readonly DomainErrorMapping<WidgetDomainError>[],
): DomainExceptionFilter<WidgetDomainError> {
  return new (class extends DomainExceptionFilter<WidgetDomainError> {
    protected readonly mappings = mappings;
  })();
}
