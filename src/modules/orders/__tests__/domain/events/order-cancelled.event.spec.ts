import { OrderCancelled } from '../../../domain/events/order-cancelled.event';

describe('OrderCancelled', () => {
  it('debería llevar el pedido, el cliente y el instante de la cancelación', () => {
    // Arrange
    const occurredAt = new Date('2026-09-30T12:00:00.000Z');

    // Act
    const event = new OrderCancelled(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012',
      occurredAt,
    );

    // Assert
    expect({ ...event }).toEqual({
      orderId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      customerId: '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012',
      occurredAt,
    });
  });
});
