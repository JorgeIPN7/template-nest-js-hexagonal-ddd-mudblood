import { Order } from '../../domain/entities/order.entity';
import { OrderAmount } from '../../domain/value-objects/order-amount.vo';
import { OrderConcept } from '../../domain/value-objects/order-concept.vo';
import { OrderId } from '../../domain/value-objects/order-id.vo';
import type { OrderStatus } from '../../domain/value-objects/order-status';

/**
 * Factory único del agregado para los tests del módulo, como `user.factory.ts` en `users`. Vive
 * aquí y no en `test/helpers/` para que mover el módulo se lleve sus tests enteros.
 *
 * Antes cuatro specs construían el mismo pedido cada uno con su copia de `Order.place(...)` u
 * `Order.rehydrate(...)`, y ensanchar `rehydrate` con el estado y la versión obligó a tocarlas una
 * por una.
 */
export const DEFAULT_CUSTOMER_ID = '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012';
export const DEFAULT_CONCEPT = 'Suscripción anual plan Pro';
export const DEFAULT_AMOUNT_CENTS = 149_900;
export const DEFAULT_PLACED_AT = new Date('2026-08-06T09:30:00.000Z');

type PlaceOrderOverrides = {
  id?: OrderId;
  customerId?: string;
  concept?: string;
  now?: Date;
};

/** Pedido recién colocado: versión 0 y su `OrderPlaced` pendiente de drenar. */
export const buildPlacedOrder = ({
  id = OrderId.generate(),
  customerId = DEFAULT_CUSTOMER_ID,
  concept = DEFAULT_CONCEPT,
  now = DEFAULT_PLACED_AT,
}: PlaceOrderOverrides = {}): Order =>
  Order.place({
    id,
    customerId,
    concept: OrderConcept.from(concept),
    amount: OrderAmount.from(DEFAULT_AMOUNT_CENTS),
    now,
  });

type RehydrateOrderOverrides = {
  id?: OrderId;
  customerId?: string;
  status?: OrderStatus;
  cancelledAt?: Date | null;
  version?: number;
};

/** Pedido leído de persistencia, sin eventos. Por defecto, colocado y en la versión 1. */
export const rehydrateOrder = ({
  id = OrderId.generate(),
  customerId = DEFAULT_CUSTOMER_ID,
  status = 'placed',
  cancelledAt = null,
  version = 1,
}: RehydrateOrderOverrides = {}): Order =>
  Order.rehydrate({
    id,
    customerId,
    concept: OrderConcept.from(DEFAULT_CONCEPT),
    amount: OrderAmount.from(DEFAULT_AMOUNT_CENTS),
    placedAt: DEFAULT_PLACED_AT,
    status,
    cancelledAt,
    version,
  });
