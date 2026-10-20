import type { ValueObject } from './value-object.base';

/** Lo que tendrá toda entidad, presente o futura: identidad tipada y sus dos fechas. */
export type BaseEntityProps<TId extends ValueObject<string>> = {
  id: TId;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Base de las entidades: identidad tipada, `createdAt`, `updatedAt` e igualdad por identidad.
 * Nada de `version`, `status` ni borrado lógico: cada agregado añade lo que necesite.
 *
 * Sin props-bag: el constructor copia los tres campos de `BaseEntityProps` y nada más. El resto
 * del estado sigue en los campos privados de cada entidad, que solo cambian sus métodos de
 * intención. Un objeto de props mutable que escribieran las subclases dejaría escribir sin pasar
 * por las invariantes.
 *
 * `touch(now)` fija `updatedAt` exactamente en `now`, también hacia atrás: sin `max()` y sin
 * `new Date()` dentro. Forzar que no retroceda falsearía el instante de negocio para tapar un
 * desfase de relojes, el mismo criterio que el backlog #31 fija para la cancelación de un
 * pedido; y recibir la hora mantiene deterministas los tests. Es `protected`: solo lo llaman los
 * métodos de intención de la propia entidad, después de su guarda de no-op.
 *
 * `_updatedAt` es un `private` de TypeScript y no un campo `#`, por dos motivos medidos:
 * `toEqual` no ve los campos `#` (dos entidades que solo difieren en `#updatedAt` serían
 * iguales para él), y una subclase que conservara su propio `_updatedAt` o declarara
 * `updatedAt` como campo no compila (TS2415, TS2610), así que no puede quedar una segunda
 * fuente de verdad.
 *
 * `equals` compara la clase y después el id a través de su VO, como `ValueObject.equals`: dos
 * entidades de clases distintas con el mismo id no son la misma. `other` es nullable por el mismo
 * motivo que allí: en el borde puede llegar ausente y la respuesta es `false`, sin reventar.
 *
 * La base no declara `toSnapshot()` ni `rehydrate`: un tipo no puede exigir un miembro `static`,
 * así que los exige el test de contrato de módulo.
 */
export abstract class Entity<TId extends ValueObject<string>> {
  readonly id: TId;
  readonly createdAt: Date;
  private _updatedAt: Date;

  protected constructor(props: BaseEntityProps<TId>) {
    this.id = props.id;
    this.createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  protected touch(now: Date): void {
    this._updatedAt = now;
  }

  equals(other: Entity<TId> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (other.constructor !== this.constructor) {
      return false;
    }
    return this.id.equals(other.id);
  }
}
