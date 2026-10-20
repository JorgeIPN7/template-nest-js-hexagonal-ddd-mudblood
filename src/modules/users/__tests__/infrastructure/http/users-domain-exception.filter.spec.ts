import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { captureError } from '@test/helpers/capture-error';

import {
  EmailAlreadyTakenError,
  InvalidEmailError,
  InvalidUserIdError,
  InvalidUserNameError,
  UserDomainError,
  UserNotFoundError,
} from '../../../domain/errors/user.errors';
import { UsersDomainExceptionFilter } from '../../../infrastructure/http/users-domain-exception.filter';

describe('UsersDomainExceptionFilter', () => {
  describe('catch()', () => {
    it('debería traducir UserNotFoundError a 404', () => {
      // Arrange
      const filter = new UsersDomainExceptionFilter();
      const error = new UserNotFoundError('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
      // Act
      const act = () => filter.catch(error);
      // Assert
      expect(act).toThrow(NotFoundException);
    });

    it('debería traducir EmailAlreadyTakenError a 409', () => {
      // Arrange
      const filter = new UsersDomainExceptionFilter();
      const error = new EmailAlreadyTakenError('taken@example.com');
      // Act
      const act = () => filter.catch(error);
      // Assert
      expect(act).toThrow(ConflictException);
    });

    it.each([
      ['InvalidEmailError', () => new InvalidEmailError('bad')],
      ['InvalidUserIdError', () => new InvalidUserIdError('bad')],
      ['InvalidUserNameError', () => new InvalidUserNameError('x')],
    ])('debería traducir %s a 400', (_name, build) => {
      // Arrange
      const filter = new UsersDomainExceptionFilter();
      const error = build();
      // Act
      const act = () => filter.catch(error);
      // Assert
      expect(act).toThrow(BadRequestException);
    });

    it('debería tratar un error de dominio sin mapeo como 400', () => {
      // Arrange
      const filter = new UsersDomainExceptionFilter();
      const error = new UnmappedDomainError();
      // Act
      const act = () => filter.catch(error);
      // Assert
      expect(act).toThrow(BadRequestException);
    });

    it('debería conservar el mensaje del error de dominio', () => {
      // Arrange
      const filter = new UsersDomainExceptionFilter();
      const error = new EmailAlreadyTakenError('taken@example.com');
      // Act
      const thrown = captureError(() => filter.catch(error));
      // Assert
      expect(thrown.message).toContain('taken@example.com');
    });

    // Es el cuerpo que documenta el 400 de `GET /users/:id` y `DELETE /users/:id`.
    it('debería publicar el 400 por defecto con el mensaje exacto del dominio y el error canónico', () => {
      // Arrange
      const filter = new UsersDomainExceptionFilter();
      const error = new InvalidUserIdError('no-es-uuid');
      // Act
      const thrown = captureError(() => filter.catch(error));
      // Assert: la clase primero; sin ella, `getResponse` no existiría y la fila fallaría por
      // excepción en vez de por aserción.
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect((thrown as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        message: '"no-es-uuid" is not a valid user id',
        error: 'Bad Request',
      });
    });
  });
});

// Helpers

class UnmappedDomainError extends UserDomainError {
  constructor() {
    super('Regla de dominio nueva sin mapeo HTTP');
  }
}
