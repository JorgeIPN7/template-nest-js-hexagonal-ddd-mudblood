import { OrderNotFoundError, OrderVersionConflictError } from '../../../domain/errors/order.errors';

const ORDER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

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
