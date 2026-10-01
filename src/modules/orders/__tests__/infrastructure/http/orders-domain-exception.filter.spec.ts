import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { captureError } from '@test/helpers/capture-error';

import {
  CustomerGoneError,
  InvalidOrderAmountError,
  InvalidOrderConceptError,
  InvalidOrderIdError,
  OrderNotFoundError,
  OrderVersionConflictError,
} from '../../../domain/errors/order.errors';
import { OrdersDomainExceptionFilter } from '../../../infrastructure/http/orders-domain-exception.filter';

const ORDER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('OrdersDomainExceptionFilter', () => {
  describe('catch()', () => {
    it('debería traducir CustomerGoneError a 403', () => {
      // Arrange
      const filter = new OrdersDomainExceptionFilter();

      // Act + Assert
      expect(() =>
        filter.catch(new CustomerGoneError('9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012')),
      ).toThrow(ForbiddenException);
    });

    it('debería publicar el mensaje canónico Forbidden, no el del dominio', () => {
      // Arrange
      const filter = new OrdersDomainExceptionFilter();
      const error = new CustomerGoneError('9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012');

      // Act
      const thrown = captureError(() => filter.catch(error));

      // Assert: el motivo (usuario borrado vs inactivo) es información interna.
      expect(thrown.message).toBe('Forbidden');
      expect(thrown.message).not.toContain('9d2a1c7e');
    });

    it.each([
      ['InvalidOrderConceptError', new InvalidOrderConceptError('   ')],
      ['InvalidOrderAmountError', new InvalidOrderAmountError(-1)],
    ])('debería traducir %s a 400', (_caso, error) => {
      // Arrange
      const filter = new OrdersDomainExceptionFilter();

      // Act + Assert
      expect(() => filter.catch(error)).toThrow(BadRequestException);
    });

    it('debería traducir InvalidOrderIdError a 400 con el mensaje del dominio', () => {
      // Arrange
      const filter = new OrdersDomainExceptionFilter();

      // Act
      const thrown = captureError(() => filter.catch(new InvalidOrderIdError('no-es-uuid')));

      // Assert: es el 400 que publica `POST /orders/:id/cancel` para un id mal formado.
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(thrown.message).toBe('"no-es-uuid" is not a valid order id');
    });

    it('debería traducir OrderNotFoundError a 404 con el mensaje del dominio', () => {
      // Arrange
      const filter = new OrdersDomainExceptionFilter();

      // Act
      const thrown = captureError(() => filter.catch(new OrderNotFoundError(ORDER_ID)));

      // Assert: el mensaje es el mismo para un pedido ajeno y uno inexistente.
      expect(thrown).toBeInstanceOf(NotFoundException);
      expect(thrown.message).toBe(`Order ${ORDER_ID} was not found`);
    });

    it('debería traducir OrderVersionConflictError a 409 con el mensaje del dominio', () => {
      // Arrange
      const filter = new OrdersDomainExceptionFilter();

      // Act
      const thrown = captureError(() => filter.catch(new OrderVersionConflictError(ORDER_ID)));

      // Assert
      expect(thrown).toBeInstanceOf(ConflictException);
      expect(thrown.message).toBe(`Order ${ORDER_ID} was modified concurrently, retry the request`);
    });
  });
});
