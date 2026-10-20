import { OrderPlaced } from '../../../domain/events/order-placed.event';

describe('OrderPlaced', () => {
  it('debería llevar el pedido, el cliente, el importe y el instante de la colocación', () => {
    // Arrange
    const occurredAt = new Date('2026-09-30T12:00:00.000Z');

    // Act
    const event = new OrderPlaced(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012',
      149_900,
      occurredAt,
    );

    // Assert
    expect({ ...event }).toEqual({
      orderId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      customerId: '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012',
      amountCents: 149_900,
      occurredAt,
    });
  });

  // El adaptador escribe `event.constructor.name` como `event_type` de la fila del outbox, y es lo
  // que lee quien la consume: renombrar la clase cambiaría el contrato del outbox sin tocar el
  // payload.
  it('debería llamarse OrderPlaced, que es el event_type que escribe el outbox', () => {
    // Arrange
    const occurredAt = new Date('2026-09-30T12:00:00.000Z');

    // Act
    const event = new OrderPlaced(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012',
      149_900,
      occurredAt,
    );

    // Assert
    expect(event.constructor.name).toBe('OrderPlaced');
  });
});
