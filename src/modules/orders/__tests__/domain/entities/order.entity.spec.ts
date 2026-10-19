import { fc, test as fcTest } from '@fast-check/jest';

import { OrderCancelled } from '../../../domain/events/order-cancelled.event';
import { OrderPlaced } from '../../../domain/events/order-placed.event';
import { Order } from '../../../domain/entities/order.entity';
import { OrderAmount } from '../../../domain/value-objects/order-amount.vo';
import { OrderConcept } from '../../../domain/value-objects/order-concept.vo';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { timestampArb } from '../../helpers/arbitraries';
import {
  DEFAULT_AMOUNT_CENTS,
  DEFAULT_CONCEPT,
  DEFAULT_CUSTOMER_ID as CUSTOMER_ID,
  DEFAULT_CREATED_AT,
  buildPlacedOrder,
  rehydrateOrder,
} from '../../helpers/order.factory';

const T_PLACE = new Date('2026-08-05T14:20:00.000Z');
const CANCELLED_AT = new Date('2026-08-06T10:45:00.000Z');
const LATER = new Date('2026-08-07T08:00:00.000Z');

describe('Order', () => {
  describe('place()', () => {
    it('debería emitir OrderPlaced al colocar una orden', () => {
      // Arrange
      const id = OrderId.generate();

      // Act
      const order = buildPlacedOrder({ id });
      const events = order.pullEvents();

      // Assert: el payload lleva los datos primitivos que irán tal cual al outbox.
      expect(events).toEqual([
        new OrderPlaced(id.value, CUSTOMER_ID, DEFAULT_AMOUNT_CENTS, DEFAULT_CREATED_AT),
      ]);
    });

    it('debería drenar los eventos al hacer pull', () => {
      // Arrange
      const order = buildPlacedOrder();
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
      const order = buildPlacedOrder({ id });

      // Assert
      expect(order.status).toBe('placed');
      expect(order.cancelledAt).toBeNull();
      expect(order.version).toBe(0);
    });

    it('debería sellar createdAt y updatedAt con el instante de la colocación', () => {
      // Arrange

      // Act
      const order = buildPlacedOrder({ now: T_PLACE });

      // Assert
      expect(order.createdAt).toEqual(T_PLACE);
      expect(order.updatedAt).toEqual(T_PLACE);
    });
  });

  describe('cancel()', () => {
    it('debería cancelar un pedido colocado con el instante de la cancelación', () => {
      // Arrange
      const order = buildPlacedOrder();

      // Act
      order.cancel(CANCELLED_AT);

      // Assert
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).toEqual(CANCELLED_AT);
    });

    it('debería emitir OrderCancelled con el pedido, el cliente y el instante al cancelar', () => {
      // Arrange
      const id = OrderId.generate();
      const order = buildPlacedOrder({ id });
      order.pullEvents();

      // Act
      order.cancel(CANCELLED_AT);

      // Assert
      expect(order.pullEvents()).toEqual([new OrderCancelled(id.value, CUSTOMER_ID, CANCELLED_AT)]);
    });

    it('debería mover updatedAt al instante de la cancelación sin tocar createdAt', () => {
      // Arrange
      const order = buildPlacedOrder();

      // Act
      order.cancel(CANCELLED_AT);

      // Assert
      expect(order.updatedAt).toEqual(CANCELLED_AT);
      expect(order.createdAt).toEqual(DEFAULT_CREATED_AT);
    });

    fcTest.prop([fc.tuple(timestampArb, timestampArb)])(
      'debería fijar updatedAt exactamente en el instante de la cancelación aunque sea anterior a la colocación',
      ([placement, cancellation]) => {
        // Arrange
        const order = buildPlacedOrder({ now: placement });

        // Act
        order.cancel(cancellation);

        // Assert: sin corregir el reloj, en cualquier orden entre las dos fechas (backlog #31).
        expect(order.updatedAt).toEqual(cancellation);
        expect(order.cancelledAt).toEqual(cancellation);
        expect(order.createdAt).toEqual(placement);
      },
    );

    it('debería dejar intacto un pedido ya cancelado, con su fecha de cancelación y su updatedAt originales y sin emitir evento', () => {
      // Arrange
      const order = rehydrateOrder({
        status: 'cancelled',
        cancelledAt: CANCELLED_AT,
        updatedAt: CANCELLED_AT,
        version: 3,
      });

      // Act
      order.cancel(LATER);

      // Assert
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).toEqual(CANCELLED_AT);
      expect(order.updatedAt).toEqual(CANCELLED_AT);
      expect(order.pullEvents()).toEqual([]);
    });

    fcTest.prop([fc.array(timestampArb, { minLength: 1, maxLength: 10 })])(
      'debería emitir un único OrderCancelled y conservar la primera fecha, también en updatedAt, por muchas veces que se cancele',
      (instants) => {
        // Arrange
        const order = buildPlacedOrder();
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
        expect(order.updatedAt).toEqual(instants[0]);
      },
    );
  });

  describe('rehydrate()', () => {
    it('debería reconstruir sin emitir eventos', () => {
      // Arrange

      // Act
      const order = Order.rehydrate({
        id: OrderId.generate(),
        customerId: CUSTOMER_ID,
        concept: OrderConcept.from(DEFAULT_CONCEPT),
        amount: OrderAmount.from(DEFAULT_AMOUNT_CENTS),
        createdAt: DEFAULT_CREATED_AT,
        updatedAt: DEFAULT_CREATED_AT,
        status: 'placed',
        cancelledAt: null,
        version: 1,
      });

      // Assert
      expect(order.pullEvents()).toEqual([]);
    });

    it('debería reconstruir un pedido cancelado con su estado, sus fechas y su versión, sin emitir eventos', () => {
      // Arrange
      const id = OrderId.generate();

      // Act
      const order = rehydrateOrder({
        id,
        status: 'cancelled',
        cancelledAt: CANCELLED_AT,
        updatedAt: CANCELLED_AT,
        version: 3,
      });

      // Assert
      expect(order.toSnapshot()).toEqual({
        id: id.value,
        customerId: CUSTOMER_ID,
        concept: DEFAULT_CONCEPT,
        amountCents: DEFAULT_AMOUNT_CENTS,
        createdAt: DEFAULT_CREATED_AT,
        updatedAt: CANCELLED_AT,
        status: 'cancelled',
        cancelledAt: CANCELLED_AT,
        version: 3,
      });
      expect(order.pullEvents()).toEqual([]);
    });
  });
});
