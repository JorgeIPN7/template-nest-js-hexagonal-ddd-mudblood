import { randomUUID } from 'node:crypto';

import { ValueObject } from './value-object.base';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Base de las identidades uuid v4 de cada contexto: la regex y el `randomUUID()` que antes
 * copiaban `UserId` y `OrderId`, más una marca nominal.
 *
 * La marca existe porque TypeScript compara por estructura: dos ids que solo envuelven un
 * `string` son intercambiables, y un `OrderId` entraba sin error donde se espera un `UserId`.
 * Un miembro privado vuelve nominal la comparación, así que dos ids de marca distinta
 * (`class UserId extends UuidIdentifier<'UserId'>`) ya no se pueden asignar entre sí. La marca
 * es el nombre de la clase: un id copiado de otro que conservara la marca ajena volvería a ser
 * intercambiable, y por eso lo comprueba el test de contrato de módulo.
 *
 * `declare private readonly brand` en ese orden exacto: sin `declare` hay que inicializarla y
 * `noUnusedLocals` la rechaza (TS6133), y Prettier reescribe `private declare` como
 * `declare private`. Ni tsc ni SWC la emiten: una instancia sigue teniendo una sola clave propia,
 * `value`.
 *
 * El constructor guarda el valor en minúsculas, como hace el tipo `uuid` de PostgreSQL, e
 * `isUuidV4` es un predicado puro que no normaliza ni recorta: el `from()` de cada id valida el
 * valor tal como llegó y guarda su forma canónica.
 *
 * Helpers `protected static` y no una factoría estática polimórfica en la base: esa factoría
 * chocaría con los constructores protegidos (TS2345, TS2684). Cada id escribe su `from()`, que
 * lanza el error de SU contexto, y su `generate()`. Los ids que vienen de otro contexto siguen
 * siendo `string`, porque ningún módulo puede importar el id de otro.
 */
export abstract class UuidIdentifier<TBrand extends string> extends ValueObject<string> {
  declare private readonly brand: TBrand;

  protected constructor(value: string) {
    super(value.toLowerCase());
  }

  protected static isUuidV4(value: string): boolean {
    return UUID_V4.test(value);
  }

  protected static newUuid(): string {
    return randomUUID();
  }
}
