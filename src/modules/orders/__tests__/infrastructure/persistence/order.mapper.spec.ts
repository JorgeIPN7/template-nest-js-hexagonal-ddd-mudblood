import { test as fcTest, fc } from '@fast-check/jest';

import { Order } from '../../../domain/entities/order.entity';
import { OrderDomainError } from '../../../domain/errors/order.errors';
import { OrderAmount } from '../../../domain/value-objects/order-amount.vo';
import { OrderConcept } from '../../../domain/value-objects/order-concept.vo';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { OrderMapper } from '../../../infrastructure/persistence/order.mapper';
import { OrderOrmEntity } from '../../../infrastructure/persistence/order.orm-entity';
import {
  orderAmountCentsArb,
  orderConceptArb,
  orderLifecycleArb,
  persistedVersionArb,
  timestampArb,
} from '../../helpers/arbitraries';

const CUSTOMER_ID = '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012';
const PLACED_AT = new Date('2026-08-06T09:30:00.000Z');
const CANCELLED_AT = new Date('2026-08-06T11:00:00.000Z');

describe('OrderMapper', () => {
  describe('toPersistence()', () => {
    it('debería volcar el agregado a columnas primitivas', () => {
      // Arrange
      const order = buildOrder();

      // Act
      const row = OrderMapper.toPersistence(order);

      // Assert
      expect(row).toBeInstanceOf(OrderOrmEntity);
      expect(row.id).toBe(order.id.value);
      expect(row.customerId).toBe(CUSTOMER_ID);
      expect(row.concept).toBe('Suscripción anual plan Pro');
      expect(row.amountCents).toBe(149_900);
      expect(row.placedAt).toEqual(PLACED_AT);
    });

    it('debería volcar el estado, la fecha de cancelación y la versión de un pedido cancelado', () => {
      // Arrange
      const order = buildOrder({ status: 'cancelled', cancelledAt: CANCELLED_AT, version: 4 });

      // Act
      const row = OrderMapper.toPersistence(order);

      // Assert
      expect(row.status).toBe('cancelled');
      expect(row.cancelledAt).toEqual(CANCELLED_AT);
      expect(row.version).toBe(4);
    });
  });

  describe('toDomain()', () => {
    it('debería reconstruir el agregado desde la fila sin emitir eventos', () => {
      // Arrange
      const row = buildRow();

      // Act
      const order = OrderMapper.toDomain(row);

      // Assert: rehydrate, no place — reconstruir no re-publica.
      expect(order.toSnapshot()).toEqual({
        id: row.id,
        customerId: row.customerId,
        concept: row.concept,
        amountCents: row.amountCents,
        placedAt: row.placedAt,
        status: 'cancelled',
        cancelledAt: CANCELLED_AT,
        version: 4,
      });
      expect(order.pullEvents()).toEqual([]);
    });

    it('debería rechazar una fila con un estado que este código no conoce', () => {
      // Arrange: lo que dejaría una versión futura con un tercer estado tras volver atrás. Si
      // pasara, `cancel()` —que solo mira `=== 'cancelled'`— cancelaría un pedido enviado.
      const row = buildRow();
      row.status = 'shipped';

      // Act
      const act = () => OrderMapper.toDomain(row);

      // Assert
      expect(act).toThrow(`El pedido ${row.id} tiene un estado desconocido: "shipped"`);
    });

    it('debería rechazar una fila cancelada sin fecha de cancelación', () => {
      // Arrange: publicaría un pedido cancelado sin `cancelledAt`, contra lo que dice el DTO.
      const row = buildRow();
      row.cancelledAt = null;

      // Act
      const act = () => OrderMapper.toDomain(row);

      // Assert
      expect(act).toThrow(`El pedido ${row.id} está en "cancelled" y no tiene cancelled_at`);
    });

    it('debería rechazar una fila colocada con fecha de cancelación', () => {
      // Arrange
      const row = buildRow();
      row.status = 'placed';

      // Act
      const act = () => OrderMapper.toDomain(row);

      // Assert
      expect(act).toThrow(`El pedido ${row.id} está en "placed" y tiene cancelled_at`);
    });

    it('debería fallar cerrado ante una fila que las reglas actuales del dominio rechazan', () => {
      // Arrange: un importe que una versión futura admitiera y esta no. Como error de dominio,
      // el filter lo publicaría como 400 con el importe en el mensaje, también para un pedido
      // ajeno, porque el mapper corre antes de comprobar el dueño.
      const row = buildRow();
      row.amountCents = 0;

      // Act
      const act = () => OrderMapper.toDomain(row);

      // Assert
      expect(act).toThrow(
        `El pedido ${row.id} tiene datos que el dominio rechaza: 0 is not a valid order amount in cents`,
      );
      expect(thrownBy(act)).not.toBeInstanceOf(OrderDomainError);
    });
  });

  describe('toDomain() ∘ toPersistence() (property-based)', () => {
    fcTest.prop([
      fc.record({
        concept: orderConceptArb,
        amountCents: orderAmountCentsArb,
        placedAt: timestampArb,
        lifecycle: orderLifecycleArb,
        version: persistedVersionArb,
      }),
    ])(
      'debería preservar el snapshot para cualquier orden del dominio',
      ({ concept, amountCents, placedAt, lifecycle, version }) => {
        // Arrange
        const original = Order.rehydrate({
          id: OrderId.generate(),
          customerId: CUSTOMER_ID,
          concept: OrderConcept.from(concept),
          amount: OrderAmount.from(amountCents),
          placedAt,
          status: lifecycle.status,
          cancelledAt: lifecycle.cancelledAt,
          version,
        });

        // Act
        const restored = OrderMapper.toDomain(OrderMapper.toPersistence(original));

        // Assert
        expect(restored.toSnapshot()).toEqual(original.toSnapshot());
      },
    );
  });
});

// Helpers

const thrownBy = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba que la función lanzara y no lo hizo');
};

const buildOrder = (
  overrides: Partial<
    Pick<Parameters<typeof Order.rehydrate>[0], 'status' | 'cancelledAt' | 'version'>
  > = {},
): Order =>
  Order.rehydrate({
    id: OrderId.generate(),
    customerId: CUSTOMER_ID,
    concept: OrderConcept.from('Suscripción anual plan Pro'),
    amount: OrderAmount.from(149_900),
    placedAt: PLACED_AT,
    status: 'placed',
    cancelledAt: null,
    version: 1,
    ...overrides,
  });

const buildRow = (): OrderOrmEntity => {
  const row = new OrderOrmEntity();
  row.id = OrderId.generate().value;
  row.customerId = CUSTOMER_ID;
  row.concept = 'Fila persistida';
  row.amountCents = 5_000;
  row.placedAt = PLACED_AT;
  row.status = 'cancelled';
  row.cancelledAt = CANCELLED_AT;
  row.version = 4;
  return row;
};
