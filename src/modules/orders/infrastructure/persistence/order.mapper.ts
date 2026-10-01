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
 * podría cancelar, y la API publicaría un `status` fuera del enum que documenta.
 *
 * Los mensajes van en español porque son para el operador, y llevan datos de la fila. En
 * production y staging el filtro global los cambia por un 500 genérico; en development y test
 * llegan tal cual al cuerpo de la respuesta. Por eso una fila ajena nunca pasa por aquí: el
 * repositorio filtra por cliente en la propia consulta, y lo único que puede ver un cliente es
 * el detalle de su propio pedido corrupto.
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
 * La columna tiene `DEFAULT 1` pero ningún `CHECK`. Una fila con versión 0 —que solo puede venir
 * de fuera del código: un arreglo a mano, un backfill— haría que el adaptador tomara el pedido
 * por uno sin guardar: su `save` iría por el INSERT, chocaría con su propio id y respondería un
 * 409 en cada intento, sin forma de cancelarlo nunca.
 */
const readVersion = (row: OrderOrmEntity): number => {
  if (row.version < 1) {
    throw new Error(
      `El pedido ${row.id} tiene una versión imposible para una fila guardada: ${row.version}`,
    );
  }
  return row.version;
};

/**
 * Única frontera entre la fila y el agregado. Al reconstituir usa `rehydrate`, no `place`:
 * los datos persistidos ya eran válidos al guardarse y reconstruir no re-emite eventos.
 */
export const OrderMapper = {
  toDomain(row: OrderOrmEntity): Order {
    const status = readStatus(row);
    const version = readVersion(row);
    try {
      return Order.rehydrate({
        id: OrderId.from(row.id),
        customerId: row.customerId,
        concept: OrderConcept.from(row.concept),
        amount: OrderAmount.from(row.amountCents),
        placedAt: row.placedAt,
        status,
        cancelledAt: row.cancelledAt,
        version,
      });
    } catch (error) {
      // Una fila que los VOs de hoy rechazan (un importe que admitía una versión futura, por
      // ejemplo) es un dato corrupto para este código, no una entrada inválida: como error de
      // dominio, el filter la publicaría como 400 con el valor en el mensaje. Falla cerrado, 500.
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
