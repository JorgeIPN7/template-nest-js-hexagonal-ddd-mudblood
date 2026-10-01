import { test as fcTest, fc } from '@fast-check/jest';

import { captureError } from '@test/helpers/capture-error';

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
import {
  DEFAULT_AMOUNT_CENTS,
  DEFAULT_CONCEPT,
  DEFAULT_CUSTOMER_ID,
  DEFAULT_PLACED_AT,
  rehydrateOrder,
} from '../../helpers/order.factory';

const CANCELLED_AT = new Date('2026-08-06T11:00:00.000Z');

describe('OrderMapper', () => {
  describe('toPersistence()', () => {
    it('debería volcar el agregado a columnas primitivas', () => {
      // Arrange
      const order = rehydrateOrder();

      // Act
      const row = OrderMapper.toPersistence(order);

      // Assert
      expect(row).toBeInstanceOf(OrderOrmEntity);
      expect(row.id).toBe(order.id.value);
      expect(row.customerId).toBe(DEFAULT_CUSTOMER_ID);
      expect(row.concept).toBe(DEFAULT_CONCEPT);
      expect(row.amountCents).toBe(DEFAULT_AMOUNT_CENTS);
      expect(row.placedAt).toEqual(DEFAULT_PLACED_AT);
    });

    it('debería volcar el estado, la fecha de cancelación y la versión de un pedido cancelado', () => {
      // Arrange
      const order = rehydrateOrder({ status: 'cancelled', cancelledAt: CANCELLED_AT, version: 4 });

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
      const row = buildRow({ status: 'cancelled', cancelledAt: CANCELLED_AT, version: 4 });

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
      const row = buildRow({ status: 'shipped', cancelledAt: null });

      // Act
      const act = () => OrderMapper.toDomain(row);

      // Assert
      expect(act).toThrow(`El pedido ${row.id} tiene un estado desconocido: "shipped"`);
    });

    it('debería rechazar una fila cancelada sin fecha de cancelación', () => {
      // Arrange: publicaría un pedido cancelado sin `cancelledAt`, contra lo que dice el DTO.
      const row = buildRow({ status: 'cancelled', cancelledAt: null });

      // Act
      const act = () => OrderMapper.toDomain(row);

      // Assert
      expect(act).toThrow(`El pedido ${row.id} está en "cancelled" y no tiene cancelled_at`);
    });

    it('debería rechazar una fila colocada con fecha de cancelación', () => {
      // Arrange
      const row = buildRow({ status: 'placed', cancelledAt: CANCELLED_AT });

      // Act
      const act = () => OrderMapper.toDomain(row);

      // Assert
      expect(act).toThrow(`El pedido ${row.id} está en "placed" y tiene cancelled_at`);
    });

    it('debería rechazar una fila guardada con versión 0, la que el adaptador reserva para lo nunca guardado', () => {
      // Arrange: solo puede venir de fuera del código (un arreglo a mano, un backfill). Si se
      // aceptara, el adaptador tomaría el pedido por nuevo y su cancelación chocaría para siempre.
      const row = buildRow({ status: 'placed', cancelledAt: null, version: 0 });

      // Act
      const act = () => OrderMapper.toDomain(row);

      // Assert
      expect(act).toThrow(
        `El pedido ${row.id} tiene una versión imposible para una fila guardada: 0`,
      );
    });

    it('debería aceptar la versión 1, la que deja el primer guardado', () => {
      // Arrange
      const row = buildRow({ status: 'placed', cancelledAt: null, version: 1 });

      // Act
      const order = OrderMapper.toDomain(row);

      // Assert
      expect(order.version).toBe(1);
    });

    it('debería fallar cerrado ante una fila que las reglas actuales del dominio rechazan', () => {
      // Arrange: un importe que una versión futura admitiera y esta no. Como error de dominio,
      // el filter lo publicaría como 400 con el importe en el mensaje.
      const row = buildRow({ amountCents: 0 });

      // Act
      const act = () => OrderMapper.toDomain(row);

      // Assert
      expect(act).toThrow(
        `El pedido ${row.id} tiene datos que el dominio rechaza: 0 is not a valid order amount in cents`,
      );
      expect(captureError(act)).not.toBeInstanceOf(OrderDomainError);
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
          customerId: DEFAULT_CUSTOMER_ID,
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

type RowOverrides = Partial<
  Pick<OrderOrmEntity, 'status' | 'cancelledAt' | 'version' | 'amountCents'>
>;

/**
 * Fila tal como la devolvería la base. Cada test de `readStatus` pasa el estado Y la fecha que
 * prueba: depender de los valores por defecto escondería cuál de los dos campos rompe la fila.
 */
const buildRow = ({
  status = 'cancelled',
  cancelledAt = CANCELLED_AT,
  version = 4,
  amountCents = 5_000,
}: RowOverrides = {}): OrderOrmEntity => {
  const row = new OrderOrmEntity();
  row.id = OrderId.generate().value;
  row.customerId = DEFAULT_CUSTOMER_ID;
  row.concept = 'Fila persistida';
  row.amountCents = amountCents;
  row.placedAt = DEFAULT_PLACED_AT;
  row.status = status;
  row.cancelledAt = cancelledAt;
  row.version = version;
  return row;
};
