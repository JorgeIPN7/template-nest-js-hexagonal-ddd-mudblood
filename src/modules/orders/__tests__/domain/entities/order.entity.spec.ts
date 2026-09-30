import { fc, test as fcTest } from '@fast-check/jest';

import { OrderCancelled } from '../../../domain/events/order-cancelled.event';
import { OrderPlaced } from '../../../domain/events/order-placed.event';
import { Order } from '../../../domain/entities/order.entity';
import { OrderAmount } from '../../../domain/value-objects/order-amount.vo';
import { OrderConcept } from '../../../domain/value-objects/order-concept.vo';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { timestampArb } from '../../helpers/arbitraries';

const CUSTOMER_ID = '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012';
const NOW = new Date('2026-08-06T09:30:00.000Z');
const CANCELLED_AT = new Date('2026-08-06T10:45:00.000Z');
const LATER = new Date('2026-08-07T08:00:00.000Z');

describe('Order', () => {
  describe('place()', () => {
    it('debería emitir OrderPlaced al colocar una orden', () => {
      // Arrange
      const id = OrderId.generate();

      // Act
      const order = placeOrder(id);
      const events = order.pullEvents();

      // Assert: el payload lleva los datos primitivos que irán tal cual al outbox.
      expect(events).toEqual([new OrderPlaced(id.value, CUSTOMER_ID, 149_900, NOW)]);
    });

    it('debería drenar los eventos al hacer pull', () => {
      // Arrange
      const order = placeOrder(OrderId.generate());
      order.pullEvents();

      // Act
      const second = order.pullEvents();

      // Assert
      expect(second).toEqual([]);
    });

    it('debería colocar el pedido en estado placed, sin fecha de cancelación y sin versión guardada', () => {
      // Arrange
      const id = OrderId.generate();

      // Act
      const order = placeOrder(id);

      // Assert
      expect(order.status).toBe('placed');
      expect(order.cancelledAt).toBeNull();
      expect(order.version).toBe(0);
    });
  });

  describe('cancel()', () => {
    it('debería cancelar un pedido colocado con el instante de la cancelación', () => {
      // Arrange
      const order = placeOrder(OrderId.generate());

      // Act
      order.cancel(CANCELLED_AT);

      // Assert
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).toEqual(CANCELLED_AT);
    });

    it('debería emitir OrderCancelled con el pedido, el cliente y el instante al cancelar', () => {
      // Arrange
      const id = OrderId.generate();
      const order = placeOrder(id);
      order.pullEvents();

      // Act
      order.cancel(CANCELLED_AT);

      // Assert
      expect(order.pullEvents()).toEqual([new OrderCancelled(id.value, CUSTOMER_ID, CANCELLED_AT)]);
    });

    it('debería dejar intacto un pedido ya cancelado, con su fecha de cancelación original y sin emitir evento', () => {
      // Arrange
      const order = rehydrateCancelled(CANCELLED_AT);

      // Act
      order.cancel(LATER);

      // Assert
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).toEqual(CANCELLED_AT);
      expect(order.pullEvents()).toEqual([]);
    });

    fcTest.prop([fc.array(timestampArb, { minLength: 1, maxLength: 10 })])(
      'debería emitir un único OrderCancelled y conservar la primera fecha por muchas veces que se cancele',
      (instants) => {
        // Arrange
        const order = placeOrder(OrderId.generate());
        order.pullEvents();

        // Act
        for (const instant of instants) {
          order.cancel(instant);
        }

        // Assert
        const events = order.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toBeInstanceOf(OrderCancelled);
        expect(events[0]?.occurredAt).toEqual(instants[0]);
        expect(order.cancelledAt).toEqual(instants[0]);
      },
    );
  });

  describe('rehydrate()', () => {
    it('debería reconstruir sin emitir eventos', () => {
      // Act
      const order = Order.rehydrate({
        id: OrderId.generate(),
        customerId: CUSTOMER_ID,
        concept: OrderConcept.from('Suscripción anual plan Pro'),
        amount: OrderAmount.from(149_900),
        placedAt: NOW,
        status: 'placed',
        cancelledAt: null,
        version: 1,
      });

      // Assert
      expect(order.pullEvents()).toEqual([]);
    });

    it('debería reconstruir un pedido cancelado con su estado, su fecha de cancelación y su versión, sin emitir eventos', () => {
      // Arrange
      const id = OrderId.generate();

      // Act
      const order = rehydrateCancelled(CANCELLED_AT, id);

      // Assert
      expect(order.toSnapshot()).toEqual({
        id: id.value,
        customerId: CUSTOMER_ID,
        concept: 'Suscripción anual plan Pro',
        amountCents: 149_900,
        placedAt: NOW,
        status: 'cancelled',
        cancelledAt: CANCELLED_AT,
        version: 3,
      });
      expect(order.pullEvents()).toEqual([]);
    });
  });
});

// Helpers

const placeOrder = (id: OrderId): Order =>
  Order.place({
    id,
    customerId: CUSTOMER_ID,
    concept: OrderConcept.from('Suscripción anual plan Pro'),
    amount: OrderAmount.from(149_900),
    now: NOW,
  });

const rehydrateCancelled = (cancelledAt: Date, id: OrderId = OrderId.generate()): Order =>
  Order.rehydrate({
    id,
    customerId: CUSTOMER_ID,
    concept: OrderConcept.from('Suscripción anual plan Pro'),
    amount: OrderAmount.from(149_900),
    placedAt: NOW,
    status: 'cancelled',
    cancelledAt,
    version: 3,
  });
