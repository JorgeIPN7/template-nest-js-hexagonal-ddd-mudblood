import { Entity } from './entity.base';
import type { ValueObject } from './value-object.base';

/**
 * Base de los agregados que emiten eventos de dominio: una `Entity` (identidad tipada,
 * `createdAt`, `updatedAt` y `touch`) que además recolecta y drena sus eventos. `Order` la usaba
 * escrita a mano; el segundo agregado con eventos la habría copiado. No declara constructor: el
 * protegido de `Entity` es el suyo, así que un agregado se construye con `BaseEntityProps`.
 *
 * `TEvent` queda sin acotar porque el kernel no conoce ningún evento concreto: cada
 * agregado fija su propio tipo al extender (`extends AggregateRoot<OrderId, OrderEvent>`, con
 * la unión `OrderPlaced | OrderCancelled`), y es ahí donde el compilador vuelve a ser estricto.
 *
 * `splice(0, length)` porque hace de una vez las dos mitades del drenaje: DEVUELVE un array
 * nuevo con los eventos y DEJA vacío el interno, sin que la referencia privada salga jamás
 * del agregado. Las alternativas no son incorrectas, solo peores: `return this.domainEvents`
 * entregaría al llamante la lista VIVA —que el siguiente `record()` mutaría bajo sus pies— y
 * `[...events]` + `length = 0` son dos pasos para exactamente el mismo resultado.
 */
export abstract class AggregateRoot<TId extends ValueObject<string>, TEvent> extends Entity<TId> {
  private readonly domainEvents: TEvent[] = [];

  protected record(event: TEvent): void {
    this.domainEvents.push(event);
  }

  pullEvents(): TEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }
}
