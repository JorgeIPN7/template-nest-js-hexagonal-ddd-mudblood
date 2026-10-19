import { DomainError } from '@shared/domain/domain-error';

import {
  CustomerGoneError,
  InvalidOrderConceptError,
  OrderDomainError,
  OrderNotFoundError,
  OrderVersionConflictError,
} from '../../../domain/errors/order.errors';

const ORDER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CUSTOMER_ID = '9d2a1c7e-5b3f-4a8e-9c1d-2e4f6a8b0c3d';

describe('OrderDomainError', () => {
  it('debería hacer de todo error de orders un DomainError del kernel', () => {
    // Arrange

    // Act
    const error = new OrderNotFoundError(ORDER_ID);

    // Assert
    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error).toBeInstanceOf(DomainError);
  });
});

describe('InvalidOrderConceptError', () => {
  it('debería identificar en su mensaje el concepto rechazado', () => {
    // Arrange

    // Act
    const error = new InvalidOrderConceptError('   ');

    // Assert
    expect(error.message).toBe('"   " is not a valid order concept');
    expect(error.value).toBe('   ');
    expect(error.name).toBe('InvalidOrderConceptError');
  });
});

describe('CustomerGoneError', () => {
  it('debería identificar en su mensaje el cliente que ya no está', () => {
    // Arrange

    // Act
    const error = new CustomerGoneError(CUSTOMER_ID);

    // Assert
    expect(error.message).toBe(`Customer ${CUSTOMER_ID} no longer exists or is inactive`);
    expect(error.customerId).toBe(CUSTOMER_ID);
    expect(error.name).toBe('CustomerGoneError');
  });
});

describe('OrderNotFoundError', () => {
  it('debería identificar en su mensaje el pedido que no se encontró', () => {
    // Arrange

    // Act
    const error = new OrderNotFoundError(ORDER_ID);

    // Assert
    expect(error.message).toBe(`Order ${ORDER_ID} was not found`);
    expect(error.orderId).toBe(ORDER_ID);
    expect(error.name).toBe('OrderNotFoundError');
  });
});

describe('OrderVersionConflictError', () => {
  it('debería identificar en su mensaje el pedido que cambió a la vez', () => {
    // Arrange

    // Act
    const error = new OrderVersionConflictError(ORDER_ID);

    // Assert
    expect(error.message).toBe(`Order ${ORDER_ID} was modified concurrently, retry the request`);
    expect(error.orderId).toBe(ORDER_ID);
    expect(error.name).toBe('OrderVersionConflictError');
  });
});
