import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import { captureError } from '@test/helpers/capture-error';

import {
  AuthDomainError,
  EmailAlreadyRegisteredError,
  InvalidCredentialIdError,
  InvalidCredentialsError,
  InvalidPasswordHashError,
  InvalidProfileError,
} from '../../../domain/errors/auth.errors';
import { AuthDomainExceptionFilter } from '../../../infrastructure/http/auth-domain-exception.filter';

const V1_CREDENTIAL_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('AuthDomainExceptionFilter', () => {
  describe('catch()', () => {
    it('debería traducir InvalidCredentialsError a 401', () => {
      // Arrange
      const filter = new AuthDomainExceptionFilter();

      // Act
      const act = () => filter.catch(new InvalidCredentialsError());

      // Assert
      expect(act).toThrow(UnauthorizedException);
    });

    it('debería traducir EmailAlreadyRegisteredError a 409', () => {
      // Arrange
      const filter = new AuthDomainExceptionFilter();

      // Act
      const act = () => filter.catch(new EmailAlreadyRegisteredError('taken@example.com'));

      // Assert
      expect(act).toThrow(ConflictException);
    });

    // `InvalidPasswordHashError` SALIÓ de esta tabla en la revisión adversarial: no es entrada
    // del usuario sino una fila corrupta, y ahora es un 500 (ver los dos casos de más abajo).
    // La forma `it.each` se conserva porque el fallback de 400 sigue siendo el destino por
    // defecto de todo error de dominio nuevo.
    //
    // La tabla lleva factorías, no errores: construido al recolectar, un error de dominio que
    // lanza (un mutante de su constructor) tumba la carga del archivo, y Stryker lo cuenta como
    // error en vez de como muerto.
    it.each([
      ['InvalidProfileError', () => new InvalidProfileError('"x" is not a valid email address')],
    ])('debería traducir %s a 400', (_caso, buildError) => {
      // Arrange
      const filter = new AuthDomainExceptionFilter();
      const error = buildError();

      // Act
      const act = () => filter.catch(error);

      // Assert
      expect(act).toThrow(BadRequestException);
    });

    it('debería traducir InvalidPasswordHashError a 500', () => {
      // Arrange
      const filter = new AuthDomainExceptionFilter();

      // Act
      const act = () => filter.catch(new InvalidPasswordHashError());

      // Assert
      expect(act).toThrow(InternalServerErrorException);
    });

    /**
     * El caso que motivó el cambio: el hash corrupto salía como `400 Value is not a valid
     * argon2id hash`, o sea un detalle del almacenamiento publicado en el cuerpo, y antes de
     * ejecutar un solo argon2. El 500 debe ser INDISTINGUIBLE de cualquier otro fallo del
     * servidor —el mismo cuerpo que produce `buildErrorExample(500, …)`— y el mensaje del
     * dominio solo puede viajar como `cause`, que nunca se serializa a la respuesta.
     */
    it('debería publicar el 500 sin el detalle del almacenamiento y con el cause intacto', () => {
      // Arrange
      const filter = new AuthDomainExceptionFilter();
      const domainError = new InvalidPasswordHashError();

      // Act
      const thrown = captureError(() => filter.catch(domainError)) as InternalServerErrorException;

      // Assert
      const published = thrown.getResponse();
      expect(published).toEqual({
        statusCode: 500,
        message: 'Internal server error',
        // `expectedErrorName(500)` de `error-example.factory.ts`, no el canónico HTTP
        // `Internal Server Error`: el 500 del contrato es el de la rama saneada del filtro
        // global, y este tiene que salir igual.
        error: 'InternalServerError',
      });
      expect(JSON.stringify(published)).not.toContain('argon2');
      expect(thrown.cause).toBe(domainError);
    });

    // Otra fila corrupta, no una entrada del usuario: con el 400 por defecto, el id de la
    // credencial saldría en el cuerpo. Solo puede viajar como `cause`, que ve el logger.
    it('debería traducir InvalidCredentialIdError al 500 saneado, sin el id y con el cause intacto', () => {
      // Arrange
      const filter = new AuthDomainExceptionFilter();
      const domainError = new InvalidCredentialIdError(V1_CREDENTIAL_ID);

      // Act
      const thrown = captureError(() => filter.catch(domainError));

      // Assert
      expect(thrown).toBeInstanceOf(InternalServerErrorException);
      const published = (thrown as InternalServerErrorException).getResponse();
      expect(published).toEqual({
        statusCode: 500,
        message: 'Internal server error',
        error: 'InternalServerError',
      });
      expect(JSON.stringify(published)).not.toContain(V1_CREDENTIAL_ID);
      expect((thrown as InternalServerErrorException).cause).toBe(domainError);
    });

    it('debería tratar un error de dominio sin mapeo como 400', () => {
      // Arrange
      const filter = new AuthDomainExceptionFilter();

      // Act
      const act = () => filter.catch(new UnmappedDomainError());

      // Assert
      expect(act).toThrow(BadRequestException);
    });

    /**
     * El pin de construcción-por-string. El contrato publicado promete `error: 'Unauthorized'`
     * / `'Conflict'` canónicos, y eso solo se sostiene si el filtro construye la excepción con
     * un string: `new UnauthorizedException({...})` dejaría `body.error` con lo que se le
     * pase, y `buildErrorExample` —que lo deriva del status— empezaría a mentir.
     */
    it('debería publicar el body canónico exacto del 401 y del 409', () => {
      // Arrange
      const filter = new AuthDomainExceptionFilter();

      // Act
      const unauthorized = captureError(() => filter.catch(new InvalidCredentialsError()));
      const conflict = captureError(() =>
        filter.catch(new EmailAlreadyRegisteredError('taken@example.com')),
      );

      // Assert
      expect((unauthorized as UnauthorizedException).getResponse()).toEqual({
        statusCode: 401,
        // El mensaje del dominio se conserva: es el que el contrato ya publicaba para
        // `POST /auth/login` antes de que el endpoint cambiara de contexto.
        message: 'Invalid credentials',
        error: 'Unauthorized',
      });
      expect((conflict as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        message: 'Email taken@example.com is already registered',
        error: 'Conflict',
      });
    });
  });
});

// Helpers

class UnmappedDomainError extends AuthDomainError {
  constructor() {
    super('Regla de dominio nueva sin mapeo HTTP');
  }
}
