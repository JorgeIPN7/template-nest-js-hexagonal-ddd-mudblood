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
 * instancias, así que cada `findById` devuelve una copia nueva —como dos lecturas de la
 * base— y `save` rechaza con `OrderVersionConflictError`, sin guardar nada, la copia cuya
 * versión ya no es la de la fila.
 */
export class InMemoryOrderRepository implements OrderRepository {
  readonly saveCalls: { order: Order; events: readonly OrderEvent[] }[] = [];

  private readonly store = new Map<string, OrderSnapshot>();

  save(order: Order, events: readonly OrderEvent[]): Promise<void> {
    const storedVersion = this.store.get(order.id.value)?.version ?? 0;
    if (order.version !== storedVersion) {
      return Promise.reject(new OrderVersionConflictError(order.id.value));
    }
    this.saveCalls.push({ order, events });
    this.store.set(order.id.value, { ...order.toSnapshot(), version: storedVersion + 1 });
    return Promise.resolve();
  }

  findById(id: OrderId): Promise<Order | null> {
    const snapshot = this.store.get(id.value);
    return Promise.resolve(snapshot ? rehydrate(snapshot) : null);
  }
}

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
