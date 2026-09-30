import { Order } from '../../domain/entities/order.entity';
import { OrderAmount } from '../../domain/value-objects/order-amount.vo';
import { OrderConcept } from '../../domain/value-objects/order-concept.vo';
import { OrderId } from '../../domain/value-objects/order-id.vo';
import type { OrderStatus } from '../../domain/value-objects/order-status';

import { OrderOrmEntity } from './order.orm-entity';

/**
 * Única frontera entre la fila y el agregado. Al reconstituir usa `rehydrate`, no `place`:
 * los datos persistidos ya eran válidos al guardarse y reconstruir no re-emite eventos.
 */
export const OrderMapper = {
  toDomain(row: OrderOrmEntity): Order {
    return Order.rehydrate({
      id: OrderId.from(row.id),
      customerId: row.customerId,
      concept: OrderConcept.from(row.concept),
      amount: OrderAmount.from(row.amountCents),
      placedAt: row.placedAt,
      // Se confía en la columna en esta frontera, igual que `UserMapper` con `role`: solo
      // este mapper la escribe, y el DEFAULT de la migración es un estado válido.
      status: row.status as OrderStatus,
      cancelledAt: row.cancelledAt,
      version: row.version,
    });
  },

  toPersistence(order: Order): OrderOrmEntity {
    const snapshot = order.toSnapshot();
    const row = new OrderOrmEntity();
    row.id = snapshot.id;
    row.customerId = snapshot.customerId;
    row.concept = snapshot.concept;
    row.amountCents = snapshot.amountCents;
    row.placedAt = snapshot.placedAt;
    row.status = snapshot.status;
    row.cancelledAt = snapshot.cancelledAt;
    row.version = snapshot.version;
    return row;
  },
};
