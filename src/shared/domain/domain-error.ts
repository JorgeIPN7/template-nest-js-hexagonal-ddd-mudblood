/**
 * Base de los errores de dominio: lo único que repetían, idéntico, las raíces de `users`,
 * `orders` y `auth` — el constructor protegido y el `name`. Cada contexto conserva su propia
 * raíz abstracta (`UserDomainError`…), ahora vacía sobre esta, porque es la que atrapa el
 * `@Catch` de su filtro: la base no puede serlo, ya que atraparía también los errores ajenos.
 * Los errores de dominio son de negocio, no de transporte: no heredan de `HttpException` ni
 * conocen códigos HTTP, y traducirlos a una respuesta es tarea del adaptador HTTP.
 *
 * `new.target.name` y no un literal: `new.target` es la clase concreta que se instancia,
 * aunque haya una raíz abstracta en medio, así que el `name` de `UserNotFoundError` sigue
 * siendo `'UserNotFoundError'` (el login lo comprueba). SWC conserva el nombre de las clases
 * (`keepClassNames` en `.swcrc`), así que el mecanismo sobrevive al build.
 *
 * Sin `Object.setPrototypeOf` ni `Error.captureStackTrace`: las clases son nativas (target
 * ES2023 en `tsconfig.json` y `.swcrc`), así que `instanceof` ya funciona sin parches. Ese
 * remedio solo hacía falta al transpilar `class extends Error` a ES5.
 */
export abstract class DomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
