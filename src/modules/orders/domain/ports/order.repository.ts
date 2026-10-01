import type { Order, OrderEvent } from '../entities/order.entity';
import type { OrderId } from '../value-objects/order-id.vo';

/**
 * Puerto de salida (driven). La firma de `save` lleva los eventos A PROPÓSITO: el outbox
 * es atómico con el agregado o no es outbox (spec §4) — un `save(order)` + `publish(events)`
 * separados no podrían prometer la transacción.
 *
 * Concurrencia optimista: `save` de un pedido ya guardado (`version > 0`) solo escribe si la
 * fila sigue en la versión con la que se leyó, y si no, rechaza con
 * `OrderVersionConflictError` sin escribir nada, ni la fila ni el outbox. Una instancia no se
 * guarda dos veces: conserva la versión con la que se leyó, así que para volver a escribir
 * hay que releerla.
 *
 * La lectura lleva el cliente: `findByIdAndCustomer` devuelve el pedido solo si es suyo, y
 * `null` tanto si no existe como si es de otro. El dueño se filtra en la consulta y no después
 * a propósito: una fila ajena nunca llega al mapper, que falla cerrado con un 500 ante datos
 * corruptos y delataría así que el pedido existe.
 *
 * `abstract class` —tipo y token en la misma referencia— por el mismo motivo que
 * `users/domain/ports/user.repository.ts`, donde vive el razonamiento completo.
 */
export abstract class OrderRepository {
  abstract save(order: Order, events: readonly OrderEvent[]): Promise<void>;
  abstract findByIdAndCustomer(id: OrderId, customerId: string): Promise<Order | null>;
}
