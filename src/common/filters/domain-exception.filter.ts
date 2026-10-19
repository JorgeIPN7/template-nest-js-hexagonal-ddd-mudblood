import { BadRequestException, type ExceptionFilter, type HttpException } from '@nestjs/common';

/**
 * Una entrada de la tabla de un filtro de dominio: la clase de error que casa y la excepción HTTP
 * que la traduce. `toHttp` es una propiedad de tipo función, no un método, porque las subclases
 * escriben funciones flecha (`unbound-method` es error fuera de los tests).
 */
export type DomainErrorMapping<E extends Error> = {
  readonly error: abstract new (...args: never[]) => E;
  readonly toHttp: (error: E) => HttpException;
};

/**
 * Base de los filtros de dominio de cada contexto: el esqueleto que repetían los tres, una cadena
 * de `instanceof` con un 400 al final. Cada contexto declara solo su tabla.
 *
 * **Gana la primera coincidencia**, por `instanceof` y en el orden de la tabla: ni la más
 * específica ni la última. Es lo que hacían las cadenas de `if`, y deja el orden a la vista en la
 * subclase, que pone lo específico antes que lo general. Sin coincidencia, el 400 se construye con
 * un string, como los de antes: así Nest rellena `error` con el nombre canónico `Bad Request`,
 * que es lo que `buildErrorExample(400, …)` deriva del status.
 *
 * **Siempre lanza, nunca responde.** La excepción sale del filtro de controller y llega al
 * manejador de errores que Nest registra con los filtros globales, así que `AllExceptionsFilter`
 * le da forma al sobre, con `requestId` y log.
 *
 * **La base no lleva `@Catch`**, porque las subclases heredarían sus metadatos: Nest los lee con
 * `Reflect.getMetadata`, que recorre la cadena de prototipos. Ningún valor sirve a todas: `@Catch()`
 * lo atrapa todo y `@Catch(Error)` atrapa también las `HttpException`. Cada subclase lleva
 * `@Catch(<raíz del contexto>)`, con un solo argumento. Una que lo olvide también lo atrapa todo, y
 * en las rutas de su controller convertiría en 400 el 401 del guard JWT, el 403 de roles, el 408
 * del timeout y el 429 del throttler: de ese olvido protege la clave `filter` del test de contrato
 * de módulo. Es genérica sobre `Error` y no sobre `DomainError` porque `common` no puede importar
 * el kernel.
 *
 * **Forma de una subclase:**
 *
 * ```ts
 * @Catch(UserDomainError)
 * export class UsersDomainExceptionFilter extends DomainExceptionFilter<UserDomainError> {
 *   protected readonly mappings: readonly DomainErrorMapping<UserDomainError>[] = [
 *     { error: UserNotFoundError, toHttp: (error) => new NotFoundException(error.message) },
 *   ];
 * }
 * ```
 *
 * - La anotación de `mappings` es obligatoria: TypeScript no tipa el inicializador con la
 *   declaración abstracta de la base, y sin ella cada flecha da TS7006.
 * - Sin constructor: Nest crea el filtro de `@UseFilters(Clase)` como injectable del módulo, y sin
 *   constructor no hay nada que inyectar.
 * - La raíz no puede ser una entrada (su constructor protegido da TS2322): ya la cubre el 400.
 * - La base lee `this.mappings` dentro de `catch()` y nunca en un constructor propio, porque el
 *   campo de la subclase se asigna después de `super()`.
 */
export abstract class DomainExceptionFilter<E extends Error> implements ExceptionFilter<E> {
  protected abstract readonly mappings: readonly DomainErrorMapping<E>[];

  catch(exception: E): never {
    const mapping = this.mappings.find((candidate) => exception instanceof candidate.error);
    if (mapping) {
      throw mapping.toHttp(exception);
    }
    throw new BadRequestException(exception.message);
  }
}
