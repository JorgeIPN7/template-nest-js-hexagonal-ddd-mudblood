import { Order, type OrderEvent, type OrderSnapshot } from '../../domain/entities/order.entity';
import { OrderVersionConflictError } from '../../domain/errors/order.errors';
import { OrderAmount } from '../../domain/value-objects/order-amount.vo';
import { OrderConcept } from '../../domain/value-objects/order-concept.vo';
import { OrderId } from '../../domain/value-objects/order-id.vo';
import type { OrderRepository } from '../../domain/ports/order.repository';

/**
 * Fake escrito a mano del puerto, no un mock generado. Registra cada `save` ACEPTADO con
 * sus eventos para que la suite pueda afirmar el contrato «una sola llamada, eventos
 * dentro» (Tabla E, casos E1 y E3).
 *
 * Modela también la concurrencia optimista que el puerto promete: guarda snapshots y no
 * instancias, así que cada lectura devuelve una copia nueva —como dos lecturas de la
 * base— y `save` rechaza con `OrderVersionConflictError`, sin guardar nada, la copia cuya
 * versión ya no es la de la fila.
 *
 * Y se comporta como el adaptador donde los dos podrían separarse sin que nada lo notara:
 * - Los ids se comparan sin distinguir mayúsculas, como las columnas `uuid` de PostgreSQL, y
 *   vuelven en minúsculas, que es como los devuelve la base.
 * - El primer `save` guarda la fila entera; los siguientes, solo lo que el UPDATE del adaptador
 *   escribe (estado, fecha de cancelación y versión).
 */
export class InMemoryOrderRepository implements OrderRepository {
  readonly saveCalls: { order: Order; events: readonly OrderEvent[] }[] = [];

  private readonly store = new Map<string, OrderSnapshot>();

  save(order: Order, events: readonly OrderEvent[]): Promise<void> {
    const key = canonical(order.id.value);
    const stored = this.store.get(key);
    const storedVersion = stored?.version ?? 0;
    if (order.version !== storedVersion) {
      return Promise.reject(new OrderVersionConflictError(order.id.value));
    }
    this.saveCalls.push({ order, events });
    const snapshot = order.toSnapshot();
    this.store.set(
      key,
      stored
        ? {
            ...stored,
            status: snapshot.status,
            cancelledAt: snapshot.cancelledAt,
            version: storedVersion + 1,
          }
        : { ...snapshot, id: key, customerId: canonical(snapshot.customerId), version: 1 },
    );
    return Promise.resolve();
  }

  findByIdAndCustomer(id: OrderId, customerId: string): Promise<Order | null> {
    const snapshot = this.store.get(canonical(id.value));
    const isOwner = snapshot?.customerId === canonical(customerId);
    return Promise.resolve(snapshot && isOwner ? rehydrate(snapshot) : null);
  }
}

const canonical = (uuid: string): string => uuid.toLowerCase();

const rehydrate = (snapshot: OrderSnapshot): Order =>
  Order.rehydrate({
    id: OrderId.from(snapshot.id),
    customerId: snapshot.customerId,
    concept: OrderConcept.from(snapshot.concept),
    amount: OrderAmount.from(snapshot.amountCents),
    placedAt: snapshot.placedAt,
    status: snapshot.status,
    cancelledAt: snapshot.cancelledAt,
    version: snapshot.version,
  });
