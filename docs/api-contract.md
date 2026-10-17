# Contrato OpenAPI

Este documento guarda el porqué, las mediciones y la historia de las reglas de
[CLAUDE.md](../CLAUDE.md) sobre la documentación de endpoints («Endpoint documentation»), y el
procedimiento completo para mantener el bundle de Scalar. Cada sección nombra su regla en una
línea; la regla vigente está en CLAUDE.md y, si este documento y CLAUDE.md discrepan, gana
CLAUDE.md.

> **Regla (CLAUDE.md, «Endpoint documentation»):** todo endpoint nuevo se documenta entero.

No es una preferencia de estilo:
[`src/bootstrap/__tests__/openapi-contract.e2e-spec.ts`](../src/bootstrap/__tests__/openapi-contract.e2e-spec.ts),
el guardián del contrato, recorre todas las operaciones del documento OpenAPI generado y **rompe
el build** si falta cualquier cosa. Vive en la suite E2E porque construir el documento compila
`AppModule`, que necesita PostgreSQL; así que corre bajo `pnpm test:e2e` en local y bajo
`pnpm test:e2e:ci`, que la CI exige en cada PR.
[`UsersController`](../src/modules/users/infrastructure/http/users.controller.ts) es la
implementación de referencia.

Cada operación declara:

| Elemento              | Requisito                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `@ApiOperation`       | `operationId` único; `summary` **y** `description` no vacíos                                      |
| Respuestas de éxito   | `@ApiEnvelope` / `@ApiPaginatedEnvelope` con un `example` del cuerpo completo, sobre incluido     |
| Errores estándar      | `@ApiStandardErrors({ throttled, timeout })` — declara 408, 429 y 500                             |
| Errores del endpoint  | `@ApiConflictResponse`, `@ApiNotFoundResponse`, `@ApiBadRequestResponse`… tipados y con `example` |
| Parámetros            | `@ApiParam` / `@ApiQuery` con `description` **y** `example`                                       |
| Cuerpo de la petición | `@ApiBody` con al menos un ejemplo con nombre; dos cuando hay casos límite interesantes           |

## Lo que el endpoint hace de verdad

> **Regla (CLAUDE.md, «Endpoint documentation»):** se documenta lo que el endpoint hace de
> verdad, no lo que sería simétrico.

El guardián es bidireccional a propósito porque, en palabras de CLAUDE.md,
«a declared-but-impossible response is the same defect as an undeclared one»: _el contrato
publicado describe algo que el servidor no hace._

- **400 solo si la operación recibe parámetros `path`, `query` o `cookie`, o un cuerpo.** Sin
  entrada no hay nada que rechazar. Las cabeceras documentadas no cuentan.
- **`throttled: false` en los controladores con `@SkipThrottle()`.**
  [`HealthController`](../src/modules/health/health.controller.ts) nunca devuelve 429.
- **`timeout: false` en los controladores con `@SkipTimeout()`.**
  [`TimeoutInterceptor`](../src/common/interceptors/timeout.interceptor.ts) es global, así que
  cualquier handler más lento que `REQUEST_TIMEOUT_MS` responde 408 —y la operación aún puede
  confirmarse después de cortada la respuesta, que es por lo que la descripción del 408 lo dice—.
  `HealthController` está exento: cada comprobación tiene su propio límite (el ping a la base de
  datos, 1 s) y falla con un 503 mucho antes. El 408 faltó en la cancelación hasta el 2026-10-01:
  su lista de códigos de estado decía estar completa sin él.
- **Cualquier otro código de estado es cosa tuya: nombra el camino que lo produce.** El guardián
  comprueba 400, 408 y 429 en los dos sentidos y exige 401/403 donde `@Auth` los añade; que un
  404, un 409 o un 403 fuera de los roles sea alcanzable depende del código. La tabla de contrato
  de la spec da a cada código declarado la entrada o el estado y la rama que lo devuelve —sin
  camino no hay declaración; una defensa para un estado futuro es un comentario en el código—.
  Medido el 2026-09-30: un 409 que ninguna petición podía producir pasó el guardián del contrato
  y solo lo cazó la revisión adversarial.
- **Las respuestas sin cuerpo** (204, 304) no necesitan ejemplo.
- **Los ejemplos de error salen de
  [`buildErrorExample()`](../src/common/dto/error-example.factory.ts)**, nunca se escriben a mano.
  Deriva `error` del código de estado, que es donde apareció cada divergencia durante la
  migración: los ejemplos publicados decían `UserNotFoundError` mientras el servidor envía
  `Not Found`.
- **`errorCode` es la única clave opcional del sobre de error.**
  [`AllExceptionsFilter`](../src/common/filters/all-exceptions.filter.ts) la emite solo cuando la
  `HttpException` lleva una (`options.errorCode` de Nest 12), y ningún error de esta API la lleva
  todavía, así que `buildErrorExample()` la deja fuera. El primer endpoint que emita una la
  documenta en su propio ejemplo, y la descripción de
  [`ErrorResponseDto.errorCode`](../src/common/dto/error-response.dto.ts) deja de decir
  «Los errores de esta API no lo usan todavía»; ningún guardián impone ni lo uno ni lo otro.

## Tres comprobaciones

> **Regla (CLAUDE.md, «Endpoint documentation»):** son tres comprobaciones y ninguna sustituye a
> otra.

Verificado midiendo: borrar una porque «otra la cubre» deja un hueco.

1. **ejemplo ↔ factoría** (`openapi-contract.e2e-spec.ts`) caza los ejemplos escritos a mano que
   se desvían de la factoría. Para la propia factoría es _tautológica_.
2. **factoría ↔ filtro**
   ([`error-example.factory.spec.ts`](../src/common/__tests__/dto/error-example.factory.spec.ts))
   pasa excepciones reales por `AllExceptionsFilter`. Es la que cazaría una factoría equivocada.
3. **ejemplo ↔ esquema** (Ajv, en el guardián del contrato) es la única que habría cazado el
   `array of arrays` que hacía insatisfacible `GET /users`.

## Mantener el bundle de Scalar

> **Regla (CLAUDE.md, «Endpoint documentation»):** revisa `@scalar/api-reference` cada trimestre
> y, tras cada bump o edición de `scripts/scalar-bundle.mjs`, pasa la lista de comprobación de
> abajo.

La UI se sirve desde nuestro propio origen
([`scripts/copy-scalar-asset.mjs`](../scripts/copy-scalar-asset.mjs) → `public/`), lo que cambia
las actualizaciones continuas del CDN por saber exactamente qué JavaScript se ejecuta: el bundle
del paquete más **una línea nuestra** delante (ver más abajo). **Revisa `@scalar/api-reference`
cada trimestre.** Subir la versión regenera el hash de contenido automáticamente; no se edita
nada a mano. El otro porqué de no usar el CDN —el paquete no admite un hash `integrity`— está en
[toolchain.md](./toolchain.md#por-qué-el-bundle-no-sale-del-cdn).

**Una violación nueva de la CSP solo puede aparecer cuando cambia el JavaScript servido**: con un
bump o con una edición de [`scripts/scalar-bundle.mjs`](../scripts/scalar-bundle.mjs). Tras
cualquiera de los dos, pasa esta lista contra `DOCS_ENABLED=true pnpm start:dev` con recarga
forzada y la caché desactivada —`immutable` más un año de `max-age` hace que la segunda visita no
toque nunca la red—:

| #   | Interacción                                        | Qué ejercita                                                                                  |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Carga inicial, tanto `/api/docs` como `/api/docs/` | El orden de montaje; la forma sin barra es la que la gente escribe                            |
| 2   | Alternar entre claro y oscuro                      | `style-src`: lo que lo delata es una maquetación rota sin errores de JS                       |
| 3   | Descargar el documento                             | Con `documentDownloadType: 'direct'` tiene que enlazar a `/json`, nunca a `blob:`             |
| 4   | Expandir un endpoint y ver los ejemplos de código  | El resaltador de sintaxis: highlight.js en 1.72.1, sin `WebAssembly`; un bump podría añadirlo |
| 5   | Abrir el cliente de la API y enviar una petición   | `connect-src`, y que `proxyUrl` esté vacío de verdad                                          |

**Lee el resultado en la pestaña Issues, no en la consola, y espera cero.** Usa un perfil limpio
(una ventana de invitado): extensiones como Dark Reader repintan la página e imitan el síntoma del
paso 2. El criterio de aprobado es **cero** entradas tituladas `Content Security Policy…` en la
pestaña **Issues** de DevTools (o en el contador `N issues` de la barra de herramientas de la
consola). Issues es la comprobación principal porque es el único sitio donde aparece una violación
que la página _captura_: un `Function('')` o una compilación de `WebAssembly` dentro de un
try/catch no deja nada en la consola (medido en Chrome 154 headless con diez violaciones
provocadas en una página de prueba). La consola es secundaria: fíltrala por
`Content Security Policy`, **no** por `Refused to`. Desde Chromium main@{#1509550} (septiembre de
2025; ≈ Chrome 142 por posición de rama, sin confirmar en las notas de versión) los mensajes dicen
`<Action> violates the following Content Security Policy directive … The action has been blocked.`,
y `Refused to` solo casa con la línea secundaria `Fetch API cannot load …`. En la pestaña Network,
filtra por todo lo que **no** sea el origen propio de la página.

**Cualquier entrada es un hallazgo, aunque no rompa nada.** Relaja la CSP solo para un paso que se
rompa funcionalmente: nunca `'unsafe-eval'` ([`docs-csp.ts`](../src/bootstrap/docs-csp.ts) explica
por qué), y `'wasm-unsafe-eval'` solo si el paso 4 falla de verdad. Una violación capturada que no
rompe nada se neutraliza en su fuente, como hace `ZOD_JITLESS_PRELUDE`, o se registra en
[`docs/backlog.md`](./backlog.md); nunca se deja como una entrada «esperada», porque Issues agrupa
las entradas por tipo y la siguiente se escondería detrás.

**El cero solo es alcanzable gracias a esa línea nuestra.** El Zod 4 que Scalar empaqueta (4.4.3
en 1.72.1) sondea `Function('')` en cada carga para decidir si compila el camino rápido de
`z.object`. La CSP lo bloquea —sin daño: Zod vuelve al parseo interpretado—, pero Chrome lo
listaba en Issues en cada carga («Content Security Policy of your site blocks the use of `eval` in
JavaScript»). [`scripts/scalar-bundle.mjs`](../scripts/scalar-bundle.mjs) antepone
`ZOD_JITLESS_PRELUDE` —`(globalThis.__zod_globalConfig ??= {}).jitless = true;`— para que la sonda
no llegue a ejecutarse: `jitless` es el interruptor que Zod documenta para entornos que no
permiten `eval`, y rellenar de antemano ese global, antes de que Zod cargue, es como el propio
código fuente de Zod dice que se fija desde fuera. Dos tests lo mantienen honesto:
[`src/__tests__/scalar-bundle.spec.ts`](../src/__tests__/scalar-bundle.spec.ts) hace de gate sobre
el bundle **instalado** —toda sonda de eval tiene que estar detrás de la guarda de `jitless`, así
que un bump que la rompa pone en rojo el PR de Renovate en lugar de que la violación vuelva en
silencio— y [`openapi.e2e-spec.ts`](../src/bootstrap/__tests__/openapi.e2e-spec.ts) comprueba que
el bundle que de verdad se sirve empieza por el preludio.
