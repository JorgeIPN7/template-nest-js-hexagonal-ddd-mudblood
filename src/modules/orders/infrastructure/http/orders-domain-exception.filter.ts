import { Catch, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import {
  DomainExceptionFilter,
  type DomainErrorMapping,
} from '@common/filters/domain-exception.filter';

import {
  CustomerGoneError,
  OrderDomainError,
  OrderNotFoundError,
  OrderVersionConflictError,
} from '../../domain/errors/order.errors';

/**
 * Traduce los errores del dominio de `orders` al protocolo HTTP, con la misma base que el filtro
 * de `users`. Las excepciones se construyen con un STRING: así Nest rellena `body.error` con el
 * nombre canónico del status, que es lo que `buildErrorExample` deriva.
 *
 * El 403 lleva además el mensaje canónico fijo (lección del ciclo auth): `CustomerGoneError` no
 * filtra si el usuario fue borrado o desactivado. Para el caller es lo mismo, «este token ya no
 * compra».
 *
 * El catch es la raíz (`OrderDomainError`) y no solo `CustomerGoneError` a propósito:
 * `@Length(1, 140)` del DTO NO recorta espacios, así que un concepto de solo espacios pasa el
 * transporte y muere en `OrderConcept.from()`: entrada inválida, el 400 por defecto de la base, no
 * un 500. Lo mismo vale para el `:id` de la cancelación, que valida `OrderId.from()` y no un pipe.
 *
 * El 404 publica el mensaje del dominio: es idéntico para un pedido ajeno y uno inexistente, y
 * solo repite el id que mandó el propio cliente.
 *
 * El 409 es una defensa, hoy inalcanzable desde HTTP: el reintento de `CancelOrderUseCase` absorbe
 * el conflicto. No se publica en el contrato mientras no haya una petición que lo produzca.
 */
@Catch(OrderDomainError)
export class OrdersDomainExceptionFilter extends DomainExceptionFilter<OrderDomainError> {
  protected readonly mappings: readonly DomainErrorMapping<OrderDomainError>[] = [
    { error: CustomerGoneError, toHttp: () => new ForbiddenException('Forbidden') },
    { error: OrderNotFoundError, toHttp: (error) => new NotFoundException(error.message) },
    {
      error: OrderVersionConflictError,
      toHttp: (error) => new ConflictException(error.message),
    },
  ];
}
