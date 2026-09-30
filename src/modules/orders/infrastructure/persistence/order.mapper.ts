import { Order } from '../../domain/entities/order.entity';
import { OrderDomainError } from '../../domain/errors/order.errors';
import { OrderAmount } from '../../domain/value-objects/order-amount.vo';
import { OrderConcept } from '../../domain/value-objects/order-concept.vo';
import { OrderId } from '../../domain/value-objects/order-id.vo';
import { ORDER_STATUSES, type OrderStatus } from '../../domain/value-objects/order-status';

import { OrderOrmEntity } from './order.orm-entity';

const isOrderStatus = (value: string): value is OrderStatus =>
  (ORDER_STATUSES as readonly string[]).includes(value);

/**
 * La columna es un `varchar` sin `CHECK`, así que el mapper **falla cerrado**. Un estado que este
 * código no conoce (el que escribiría una versión futura antes de volver atrás) o una fila
 * incoherente (cancelada sin fecha, colocada con ella) revienta al leer, con un 500. La
 * alternativa era peor: `cancel()` solo mira `=== 'cancelled'`, así que un pedido enviado se
 * podría cancelar, y la API publicaría un `status` fuera del enum que documenta. Los mensajes van
 * en español porque son para el operador: acaban en el log, nunca en la respuesta.
 *
 * `UserMapper` confía en su columna `role` y puede hacerlo porque falla al revés: un rol
 * desconocido no casa con ningún `roles.includes()` del guard y no concede nada.
 */
const readStatus = (row: OrderOrmEntity): OrderStatus => {
  if (!isOrderStatus(row.status)) {
    throw new Error(`El pedido ${row.id} tiene un estado desconocido: "${row.status}"`);
  }
  const isCancelled = row.status === 'cancelled';
  const hasCancelledAt = row.cancelledAt !== null;
  if (isCancelled !== hasCancelledAt) {
    throw new Error(
      `El pedido ${row.id} está en "${row.status}" y ${hasCancelledAt ? 'tiene' : 'no tiene'} cancelled_at`,
    );
  }
  return row.status;
};

/**
 * Única frontera entre la fila y el agregado. Al reconstituir usa `rehydrate`, no `place`:
 * los datos persistidos ya eran válidos al guardarse y reconstruir no re-emite eventos.
 */
export const OrderMapper = {
  toDomain(row: OrderOrmEntity): Order {
    const status = readStatus(row);
    try {
      return Order.rehydrate({
        id: OrderId.from(row.id),
        customerId: row.customerId,
        concept: OrderConcept.from(row.concept),
        amount: OrderAmount.from(row.amountCents),
        placedAt: row.placedAt,
        status,
        cancelledAt: row.cancelledAt,
        version: row.version,
      });
    } catch (error) {
      // Una fila que los VOs de hoy rechazan (un importe que admitía una versión futura, por
      // ejemplo) es un dato corrupto para este código, no una entrada inválida: como error de
      // dominio, el filter la publicaría como 400 con el valor en el mensaje, también para un
      // pedido ajeno, porque este mapeo ocurre antes de comprobar el dueño. Falla cerrado, 500.
      if (error instanceof OrderDomainError) {
        throw new Error(
          `El pedido ${row.id} tiene datos que el dominio rechaza: ${error.message}`,
          {
            cause: error,
          },
        );
      }
      throw error;
    }
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
