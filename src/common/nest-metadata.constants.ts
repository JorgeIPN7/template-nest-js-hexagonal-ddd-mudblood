/**
 * Claves de metadatos internas de Nest que este repo necesita leer, copiadas aquí en vez de
 * importadas de `@nestjs/common/constants`.
 *
 * ⚠️ Ese import era profundo y a un entrypoint **no declarado**: medido sobre
 * `@nestjs/common@11.2.1`, el paquete no publicaba `exports`, ni `main`, ni `types`, así que
 * `@nestjs/common/constants` resolvía únicamente por el algoritmo legacy de Node. La predicción
 * era que el día que Nest publicara un mapa de `exports` la aplicación moriría al arrancar con
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` mientras `pnpm typecheck` seguía verde. Esa segunda mitad era
 * errónea. Con `moduleResolution: nodenext`, el de este repo desde que existe `tsconfig.json`
 * (d89bda0, el único commit que lo toca), TypeScript lee el mismo mapa que Node, así que el
 * import habría dado TS2307 en `typecheck`, fuera de valor o de tipo. Se midió el 2026-09-28 con
 * el mapa de `@nestjs/swagger` 12.0.2.
 *
 * NestJS 12 publicó ese mapa y la predicción se cumplió solo a medias. Medido sobre
 * `@nestjs/common@12.1.0`: el mapa es `{".", "./internal", "./*.js", "./*": "./*.js"}`, y el
 * comodín mantiene resoluble `@nestjs/common/constants`, con las mismas dos claves. Pero sigue
 * sin ser API: lo interno declarado vive ahora en `./internal`, y las subrutas se pueden cerrar
 * en cualquier versión: `@nestjs/swagger` lo hizo en 11.4.3, un PATCH, al publicar un mapa sin
 * comodín (`ERR_PACKAGE_PATH_NOT_EXPORTED` al pedir `@nestjs/swagger/dist/constants.js`). La
 * copia sigue siendo la opción segura.
 *
 * Y en runtime la variante blanda es PEOR que la dura: si la constante se renombra en vez de
 * desaparecer, `reflector.get(undefined, …)` no lanza, devuelve `undefined`. `isSse` se queda
 * en `false` y el primer endpoint `@Sse()` que alguien añada recibe en silencio el sobre de
 * respuesta y un `timeout()` sobre un stream infinito. La única señal es el TS2305 de
 * `typecheck` («has no exported member»), medido con un paquete de prueba. Hoy no hay ninguna
 * ruta `@Sse()`, así que el daño presente es nulo — y por eso hay que cerrarlo ahora, no cuando
 * lo haya.
 *
 * El literal no se queda huérfano: `__tests__/nest-metadata.constants.spec.ts` lo ancla al
 * decorador PÚBLICO que lo escribe, así que un renombrado en Nest se ve como un rojo de
 * `pnpm test` en vez de como una función que deja de hacer nada. Para que el import profundo no
 * vuelva por la puerta de atrás, `eslint.config.mjs` prohíbe TODA subruta de un paquete
 * `@nestjs/*`, `import type` incluido: vetar solo el nombre `@nestjs/common/constants` dejaba
 * pasar `@nestjs/common/constants.js` (la clave `./*.js`) y `@nestjs/common/internal`, que
 * reexporta este mismo `constants.js`.
 */

/** Escrita por `@Sse()` sobre el método del handler. */
export const SSE_METADATA = '__sse__';

/** Escrita por los decoradores de parámetro (`@Req()`, `@Body()`, …) sobre la clase. */
export const ROUTE_ARGS_METADATA = '__routeArguments__';
