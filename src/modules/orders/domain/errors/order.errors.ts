import { DomainError } from '@shared/domain/domain-error';

/**
 * Raíz de los errores de dominio de `orders`: la que atrapa el `@Catch` de su filtro. Sin
 * constructor propio: el protegido y el `name` de la clase concreta los pone `DomainError`, la
 * base del kernel. Son errores de negocio, no de transporte: traducirlos a una respuesta es tarea
 * de `infrastructure/http/orders-domain-exception.filter.ts`.
 */
export abstract class OrderDomainError extends DomainError {}

export class InvalidOrderIdError extends OrderDomainError {
  constructor(readonly value: string) {
    super(`"${value}" is not a valid order id`);
  }
}

export class InvalidOrderConceptError extends OrderDomainError {
  constructor(readonly value: string) {
    super(`"${value}" is not a valid order concept`);
  }
}

export class InvalidOrderAmountError extends OrderDomainError {
  constructor(readonly value: number) {
    super(`${value} is not a valid order amount in cents`);
  }
}

export class CustomerGoneError extends OrderDomainError {
  constructor(readonly customerId: string) {
    // El mensaje es interno: el filter publica el 403 canónico, nunca esta cadena.
    super(`Customer ${customerId} no longer exists or is inactive`);
  }
}

/**
 * También para el pedido de OTRO cliente: para quien pregunta no existe. El mensaje es el
 * mismo en los dos casos a propósito, porque el filter lo publica tal cual en el 404.
 */
export class OrderNotFoundError extends OrderDomainError {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} was not found`);
  }
}

/**
 * Lo lanza el adaptador de persistencia, y es parte del contrato del puerto, cuando la versión
 * con la que se leyó el pedido ya no es la de la fila: otro proceso lo guardó entre medias.
 */
export class OrderVersionConflictError extends OrderDomainError {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} was modified concurrently, retry the request`);
  }
}
