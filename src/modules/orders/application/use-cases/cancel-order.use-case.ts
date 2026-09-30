import { Injectable } from '@nestjs/common';

import type { Order } from '../../domain/entities/order.entity';
import {
  CustomerGoneError,
  OrderNotFoundError,
  OrderVersionConflictError,
} from '../../domain/errors/order.errors';
import { OrderId } from '../../domain/value-objects/order-id.vo';
import { CustomerDirectory } from '../../domain/ports/customer.directory';
import { OrderRepository } from '../../domain/ports/order.repository';

export type CancelOrderInput = {
  customerId: string;
  orderId: string;
};

/**
 * Cancela un pedido del cliente del token. El directorio se consulta ANTES que nada, igual
 * que en `PlaceOrderUseCase`: un token firmado puede sobrevivir a su usuario.
 *
 * El pedido de otro cliente se rechaza con el MISMO `OrderNotFoundError` que uno
 * inexistente, y cuesta lo mismo (una lectura): para quien pregunta no existe.
 *
 * Un solo reintento ante `OrderVersionConflictError`, y solo ante ese error. Quien pierde
 * la carrera de dos cancelaciones simultáneas relee el pedido, lo encuentra ya cancelado y,
 * como `cancel()` es idempotente, lo devuelve sin guardar ni emitir un segundo evento. Si
 * el reintento vuelve a chocar, el conflicto se propaga: reintentar sin límite escondería un
 * pedido que no deja de cambiar.
 */
@Injectable()
export class CancelOrderUseCase {
  constructor(
    private readonly customers: CustomerDirectory,
    private readonly orders: OrderRepository,
  ) {}

  async execute(input: CancelOrderInput): Promise<Order> {
    const exists = await this.customers.exists(input.customerId);
    if (!exists) {
      throw new CustomerGoneError(input.customerId);
    }

    const orderId = OrderId.from(input.orderId);
    try {
      return await this.cancelOnce(orderId, input.customerId);
    } catch (error) {
      if (error instanceof OrderVersionConflictError) {
        return this.cancelOnce(orderId, input.customerId);
      }
      throw error;
    }
  }

  private async cancelOnce(orderId: OrderId, customerId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    // Sin pedido, `order?.customerId` es `undefined`: el inexistente y el ajeno caen juntos.
    if (order?.customerId !== customerId) {
      throw new OrderNotFoundError(orderId.value);
    }

    order.cancel(new Date());
    // Sin eventos no hubo cambio (ya estaba cancelado): no hay nada que guardar.
    const events = order.pullEvents();
    if (events.length > 0) {
      await this.orders.save(order, events);
    }
    return order;
  }
}
