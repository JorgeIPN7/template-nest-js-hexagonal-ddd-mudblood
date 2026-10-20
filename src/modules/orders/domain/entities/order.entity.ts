import { AggregateRoot } from '@shared/domain/aggregate-root';
import type { BaseEntityProps } from '@shared/domain/entity.base';

import { OrderCancelled } from '../events/order-cancelled.event';
import { OrderPlaced } from '../events/order-placed.event';
import type { OrderAmount } from '../value-objects/order-amount.vo';
import type { OrderConcept } from '../value-objects/order-concept.vo';
import type { OrderId } from '../value-objects/order-id.vo';
import type { OrderStatus } from '../value-objects/order-status';

export type OrderEvent = OrderPlaced | OrderCancelled;

export type OrderSnapshot = {
  id: string;
  customerId: string;
  concept: string;
  amountCents: number;
  createdAt: Date;
  updatedAt: Date;
  status: OrderStatus;
  cancelledAt: Date | null;
  version: number;
};

/**
 * Raíz del agregado. El agregado RECOLECTA sus eventos y `pullEvents()` los drena; quien
 * publica es la aplicación (patrón del skill clean-ddd-hexagonal). La recolección y el
 * drenaje ya no se escriben aquí: los pone `AggregateRoot`, y este agregado solo decide
 * QUÉ emite y cuándo. `customerId` es un string y no un VO propio: llega del `sub` de un
 * token ya verificado y el directorio de clientes lo re-valida ANTES de construir la orden
 * (Tabla E, caso E5).
 *
 * `version` es la versión con la que se LEYÓ el pedido (0 = aún no guardado), no un contador
 * de cambios: `cancel()` no la toca. Es la versión esperada que el adaptador compara en el
 * `UPDATE … WHERE version = …` de la concurrencia optimista.
 *
 * `id`, `createdAt` y `updatedAt` vienen de `Entity`: colocar un pedido es crearlo, así que
 * `place()` sella las dos fechas con `now`, y `cancel()` llama a `touch(now)` después de su
 * guarda de idempotencia, de modo que el segundo cancel no mueve nada. No se corrige el reloj con
 * un `max(now, createdAt)`: una cancelación anterior a la colocación se guarda tal cual
 * (backlog #31).
 */
export class Order extends AggregateRoot<OrderId, OrderEvent> {
  private constructor(
    base: BaseEntityProps<OrderId>,
    readonly customerId: string,
    readonly concept: OrderConcept,
    readonly amount: OrderAmount,
    private _status: OrderStatus,
    private _cancelledAt: Date | null,
    readonly version: number,
  ) {
    super(base);
  }

  static place(params: {
    id: OrderId;
    customerId: string;
    concept: OrderConcept;
    amount: OrderAmount;
    now: Date;
  }): Order {
    const order = new Order(
      { id: params.id, createdAt: params.now, updatedAt: params.now },
      params.customerId,
      params.concept,
      params.amount,
      'placed',
      null,
      0,
    );
    order.record(
      new OrderPlaced(params.id.value, params.customerId, params.amount.value, params.now),
    );
    return order;
  }

  /** Reconstituye desde persistencia sin re-emitir eventos: ya se publicaron en su día. */
  static rehydrate(params: {
    id: OrderId;
    customerId: string;
    concept: OrderConcept;
    amount: OrderAmount;
    createdAt: Date;
    updatedAt: Date;
    status: OrderStatus;
    cancelledAt: Date | null;
    version: number;
  }): Order {
    return new Order(
      { id: params.id, createdAt: params.createdAt, updatedAt: params.updatedAt },
      params.customerId,
      params.concept,
      params.amount,
      params.status,
      params.cancelledAt,
      params.version,
    );
  }

  get status(): OrderStatus {
    return this._status;
  }

  get cancelledAt(): Date | null {
    return this._cancelledAt;
  }

  /**
   * Idempotente: cancelar un pedido ya cancelado no cambia su fecha ni emite un segundo
   * evento. Que no haya evento es lo que le dice al caso de uso que no hay nada que guardar.
   */
  cancel(now: Date): void {
    if (this._status === 'cancelled') {
      return;
    }
    this._status = 'cancelled';
    this._cancelledAt = now;
    this.touch(now);
    this.record(new OrderCancelled(this.id.value, this.customerId, now));
  }

  toSnapshot(): OrderSnapshot {
    return {
      id: this.id.value,
      customerId: this.customerId,
      concept: this.concept.value,
      amountCents: this.amount.value,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      status: this._status,
      cancelledAt: this._cancelledAt,
      version: this.version,
    };
  }
}
