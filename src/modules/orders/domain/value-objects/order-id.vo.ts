import { UuidIdentifier } from '@shared/domain/uuid-identifier.base';

import { InvalidOrderIdError } from '../errors/order.errors';

/**
 * Identidad del agregado, patrón de `user-id.vo.ts`. La regex del uuid v4, el `randomUUID()`, la
 * normalización a minúsculas y la marca nominal, que impide pasar un id de otra clase donde va
 * este, los pone `UuidIdentifier`. `from()` sigue siendo la única validación del `:id` de
 * `POST /orders/:id/cancel`: una entrada que no sea uuid v4 es un `InvalidOrderIdError` (400) y
 * nunca llega a PostgreSQL, que rechazaría el cast con un 500.
 */
export class OrderId extends UuidIdentifier<'OrderId'> {
  static generate(): OrderId {
    return new OrderId(UuidIdentifier.newUuid());
  }

  static from(value: string): OrderId {
    if (!UuidIdentifier.isUuidV4(value)) {
      throw new InvalidOrderIdError(value);
    }
    return new OrderId(value);
  }
}
