import {
  BadRequestException,
  Catch,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  type ExceptionFilter,
} from '@nestjs/common';

import {
  CustomerGoneError,
  OrderDomainError,
  OrderNotFoundError,
  OrderVersionConflictError,
} from '../../domain/errors/order.errors';

/**
 * Traduce los errores del dominio de orders al protocolo HTTP, patrón del filter de users.
 *
 * El 403 se construye con STRING y con el mensaje canónico fijo (lección del ciclo auth):
 * `new ForbiddenException('Forbidden')` hace que Nest rellene `body.error` con el nombre
 * canónico —lo que `buildErrorExample` deriva del status— y no filtra si el usuario fue
 * borrado o desactivado: para el caller es lo mismo, «este token ya no compra».
 *
 * El catch es ancho (`OrderDomainError`) y no solo `CustomerGoneError` a propósito:
 * `@Length(1, 140)` del DTO NO recorta espacios, así que un concepto de solo espacios pasa
 * el transporte y muere en `OrderConcept.from()` — entrada inválida, 400, no un 500. Lo
 * mismo vale para el `:id` de la cancelación, que valida `OrderId.from()` y no un pipe.
 *
 * El 404 publica el mensaje del dominio: es idéntico para un pedido ajeno y uno inexistente,
 * y solo repite el id que mandó el propio cliente.
 */
@Catch(OrderDomainError)
export class OrdersDomainExceptionFilter implements ExceptionFilter {
  catch(exception: OrderDomainError): never {
    if (exception instanceof CustomerGoneError) {
      throw new ForbiddenException('Forbidden');
    }
    if (exception instanceof OrderNotFoundError) {
      throw new NotFoundException(exception.message);
    }
    // Defensa, hoy inalcanzable desde HTTP: el reintento de `CancelOrderUseCase` absorbe el
    // conflicto. No se publica en el contrato mientras no haya una petición que lo produzca.
    if (exception instanceof OrderVersionConflictError) {
      throw new ConflictException(exception.message);
    }

    throw new BadRequestException(exception.message);
  }
}
