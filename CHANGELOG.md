# Changelog

Todo lo notable de este proyecto se registra aquí. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el versionado, cuando exista,
seguirá [Semantic Versioning](https://semver.org/lang/es/).

> **No hay ninguna versión publicada, y por eso todo vive bajo `[Unreleased]`.**
> `package.json` declara `"version": "0.0.1"`, el repositorio no tiene ni un solo tag de git y
> nunca se ha hecho un release. Inventar aquí una `1.0.0` retroactiva sería documentar algo que
> no ocurrió. La primera versión se cortará cuando el mantenedor decida que el contrato publicado
> —endpoints, sobre de respuesta, variables de entorno, superficie de los módulos— es estable
> como para prometer compatibilidad.
>
> Este historial se reconstruyó el 2026-08-08 a partir de los 52 commits que existían en `main`
> hasta `fcaebc0`, agrupados por los ciclos de trabajo reales. Los commits anteriores a esa fecha
> no llevaban changelog: las entradas de abajo son una lectura posterior del historial, no un
> registro escrito en su momento.

---

## [Unreleased]

### Added

- **Base NestJS 11 con arquitectura hexagonal** (2026-07-27/28). Tres capas por bounded context
  bajo `src/modules/<contexto>/`, TypeORM sobre PostgreSQL 18, SWC como compilador, Pino con
  request-id vía `nestjs-cls`, configuración validada con Zod, health checks de Terminus y rate
  limiting con `@nestjs/throttler`. `users` quedó como implementación de referencia.
- **Documentación OpenAPI servida con Scalar desde el propio origen** (2026-08-01). El bundle se
  copia a `public/` con un hash de contenido (`scripts/copy-scalar-asset.mjs`) en vez de cargarse
  del CDN de Scalar, porque el paquete no admite un hash `integrity`. Se apagan uno a uno los
  defaults que llamaban a terceros: `proxyUrl`, fuentes externas, telemetría y el agente IA.
- **Basic Auth opcional sobre la documentación** (2026-08-01), con limitador de intentos propio.
  Cubre también el documento crudo, no solo la interfaz.
- **Guardián del contrato OpenAPI** (2026-08-01). `openapi-contract.e2e-spec.ts` recorre cada
  operación del documento generado y rompe el build si falta un `operationId`, una `description`,
  un ejemplo o un código de error — y también al revés: declarar un 400 en un endpoint que no
  acepta entrada falla igual.
- **Fronteras de módulo y de capa como gate de lint** (2026-08-04/05, backlog #4). Cinco reglas en
  `eslint.boundaries.js` sobre `eslint-plugin-boundaries`, más la prohibición de barrels en
  `src/`, con su propia suite de 23 casos + 1 propiedad en `src/__tests__/eslint-boundaries.spec.ts`.
- **Autenticación con roles `admin`/`user`** (2026-08-06, backlog #5). JWT HS256, argon2id con
  parámetros OWASP explícitos, guard global `JwtAuthGuard` como `APP_GUARD` (seguro por defecto),
  `@Public()`, `@Auth(...roles)`, login anti-enumeración con hash dummy, `JWT_SECRET` sin default
  fuera de `development`/`test` y primer admin idempotente con `pnpm seed:admin`.
- **Decorador `@CurrentUser()` y tipo `AuthenticatedUser`** (2026-08-06). Viven en `common/` para
  que los puedan ver todos los contextos sin crear un ciclo entre módulos.
- **Gates de cadena de suministro** (2026-08-06, backlog #6). secretlint sobre todo archivo staged
  en `pre-commit`, `pnpm audit --prod --audit-level=high` y trivy sobre la imagen en CI. Con esto
  se cerró el Tier 1 del roadmap.
- **CI lista para el remoto** (2026-08-06, backlog #6). Actions pineadas por SHA de commit en vez
  de por tag, workflow `security.yml` con gitleaks (push, PR y cron semanal) y `renovate.json`.
  Se escribió como config-ready, sin haberse ejecutado nunca; el remoto llegó después y el primer
  disparo real fue el 2026-08-14 — ver más abajo, porque salió rojo y enseñó cosas.
- **Segundo bounded context: `orders`** (2026-08-07). Un solo caso de uso (`POST /orders`) que
  ejercita las tres costuras que un contexto único no puede: paso cross-módulo por la puerta
  pública, eventos de dominio (`OrderPlaced`) y outbox transaccional con relay por CLI
  (`pnpm outbox:relay`).
- **Cancelar un pedido: `POST /orders/:id/cancel`** (2026-09-30). Segundo caso de uso de
  `orders`, y la primera feature hecha con el flujo exprés (`docs/development-workflows.md`); spec
  en `docs/specs/2026-09-30-cancel-order-express.md`.
  - **Qué hace.** Pasa un pedido colocado a `cancelled`, sella `cancelledAt` y escribe
    `OrderCancelled` en el outbox en la misma transacción. Es idempotente: sobre un pedido ya
    cancelado responde 200 con la fecha original y sin segundo evento. Solo el dueño: el pedido
    de otro cliente responde el mismo 404, con el mismo cuerpo, que uno inexistente.
  - **Concurrencia optimista.** El agregado lleva la versión con la que se leyó y el adaptador
    escribe con `UPDATE … WHERE version = v`; un solo reintento convierte el doble clic en un 200.
    Con dos estados el segundo conflicto es imposible, así que **el contrato no publica un 409**.
    Un E2E determinista (bloqueo de fila desde otra conexión y espera observada en
    `pg_blocking_pids`) falla si se quita la versión del `WHERE` o se sube el aislamiento a
    REPEATABLE READ.
  - **⚠️ Cambio en una respuesta existente.** `OrderResponseDto` gana `status` (siempre) y
    `cancelledAt` (solo si está cancelado), así que el 201 de `POST /orders` trae ahora
    `status: 'placed'`. Es aditivo.
  - **Migración aditiva** `1790796856575-add-cancellation-to-orders` (`status`, `cancelled_at`,
    `version`, con `DEFAULT` para que las réplicas viejas sigan insertando durante el despliegue).
  - **Revisión adversarial, dos veces.** La primera encontró un 409 imposible y un E2E de
    concurrencia que no discriminaba; se corrigieron junto con seis menores. La segunda no
    encontró críticos ni importantes. Sus menores se corrigieron salvo uno, anotado con su
    decisión en el backlog (#31): el orden de publicación de los eventos con relojes desfasados.
- **Shared kernel de dominio** (2026-08-07). `src/shared/domain/` con `value-object.base.ts` y
  `aggregate-root.ts`, y su propio element type en la matriz de fronteras.
- **Regla de migraciones destructivas: expand/contract** (2026-08-08, backlog #12). Documentada en
  `CLAUDE.md` con el ejemplo trabajado, y con el dato medido que la justifica: TypeORM enumera
  cada columna en cada `SELECT`, así que un `DROP COLUMN` rompe **toda** lectura de la tabla en el
  código viejo, no solo la que usaba la columna.
- **Guardián de los pines del toolchain** (2026-08-19). `src/__tests__/toolchain-pins.spec.ts`
  afirma que `.nvmrc`, `.node-version`, el `FROM` del `Dockerfile` y el suelo de `engines.node`
  dicen la misma versión, que `README.md` y la plantilla de incidencias la citan, y que en el árbol
  resuelve **una sola** copia de `typescript` y es la que declara `package.json`. Nace de dos bumps
  que quedaron a medias y en verde: `bdfe609` movió Node en tres de los cuatro sitios y `2723d87`
  movió pnpm sin tocar los documentos. **Añádelo a la lista de la entrada de Node, más abajo: son
  cinco archivos los que se mueven juntos, no cuatro.**
- **Claves de metadatos de Nest copiadas y ancladas** (2026-08-19).
  `src/common/nest-metadata.constants.ts` sustituye al import profundo
  `@nestjs/common/constants`, que era un entrypoint **no declarado** —`@nestjs/common@11.2.1` no
  publica `exports`— y por tanto una rotura de arranque a un minor de distancia, con typecheck en
  verde. Su spec deriva las dos claves de los decoradores públicos (`@Sse()`, `@Req()`), así que un
  renombrado se ve como un test rojo en vez de como un interceptor que deja de detectar SSE en
  silencio. `eslint.config.mjs` prohíbe el import profundo.
- **El orden de los dos `APP_GUARD` globales está fijado por un test** (2026-08-19).
  `ThrottlerGuard` se registra en `app.module.ts` y `JwtAuthGuard` en `auth.module.ts`, y su orden
  relativo era emergente del orden en que Nest refleja los módulos. Si se invirtiera, el 401
  llegaría antes que el contador del throttler y los endpoints protegidos perderían el límite de
  peticiones para tráfico no autenticado, en silencio. Lo afirma `app.module.e2e-spec.ts`.
- **Gobernanza del repositorio** (2026-08-08). `LICENSE` (MIT), `SECURITY.md`, `CHANGELOG.md`,
  `.github/CODEOWNERS` y plantillas de issue en formato de formulario, de cara a la creación del
  primer remoto.

### Changed

- **Tres niveles de flujo de trabajo con IA, elegidos con mediciones** (2026-09-30). La guía
  completa está en `docs/development-workflows.md`, y `CLAUDE.md` («Skills and development flows»)
  lleva la tabla de niveles.
  - **Qué se midió.** La misma feature, cancelar un pedido, se implementó cinco veces desde el
    mismo commit, y cada rama pasó una revisión adversarial a ciegas.
    - La cadena completa con subagentes costó ~3 h 30 min y 52,54 USD. El mismo plan ejecutado
      inline, 23,19 USD. Solo la spec, sin skills, ≈8,3 USD, pero perdió dos casos y la
      documentación.
    - Un flujo exprés nuevo tardó 41 min y costó 11,82 USD, con TDD real (5 de 5 specs con rojo
      por aserción) y mutación del código nuevo al 100 %.
    - Los 16 revisores por tarea encontraron 0 defectos; la revisión adversarial final los
      encontró en todas las ramas.
  - **Qué cambia.**
    - Dos skills nuevas: `express`, el flujo por defecto para features dentro de un contexto, y
      `adversarial-review`, la revisión final única.
    - `brainstorming` queda solo para la cadena completa y pregunta en rondas agrupadas.
    - `writing-plans` escribe planes **sin código de producción**.
    - `executing-plans` pasa a ser el ejecutor por defecto, con una auditoría al final.
    - `subagent-driven-development` queda para planes grandes de tareas independientes, sin
      revisores por tarea.
    - `javascript-typescript-jest` pierde las convenciones que ya fija `CLAUDE.md`.
  - **Dos comprobaciones en todos los flujos:** cada respuesta declarada tiene que poder
    producirse hoy, y cada test de guarda tiene que fallar sin su protección. Cada una nació de un
    defecto real que la revisión encontró en la rama exprés.
  - **`.claude/settings.json` deniega a los agentes el git que escribe**, en las formas
    `git <sub>` y `git -C <dir> <sub>`, y `src/__tests__/claude-settings.spec.ts` fija la lista.
    Medido con Claude Code 2.1.283 en un repo desechable.
  - **`pnpm test:mutation:changed [base]`** muta solo las líneas nuevas de `domain/` y
    `application/`; sobre la cancelación, 36 mutantes en 8 segundos.
  - **Límite.** Una sola ejecución por rama. La cadena completa ajustada todavía no se ha medido.
- **La skill `nestjs-best-practices` se alinea con NestJS 12, y su regla de apagado deja de
  recomendar dos dueños para la misma señal** (2026-09-28). Se revisaron sus 45 reglas contra los
  paquetes 12.1.0 instalados y docs.nestjs.com; cambian 24.
  - **Apagado.** La regla recomendaba `enableShutdownHooks()` junto a un `process.on` propio. Con
    Nest 12 ese bloque sale con 0 en vez de 143, y también con 0 cuando un hook falla (medido
    compilando y ejecutando el bloque de HEAD). Ahora esa forma es el ejemplo Incorrect. Hay dos
    salidas válidas con tabla comparativa: A, un único handler propio (`close(signal)` y
    `process.exit(128 + n)`), que es la recomendada; y B, `enableShutdownHooks()` con
    `useProcessExit: true`, que sale con 0. `return503OnClosing` se documenta con su ventana real:
    solo hasta que el servidor deja de escuchar.
  - **La opción A usa `process.on` con guarda, no `process.once`.** Bajo `nest start`, un solo
    Ctrl+C llega dos veces al hijo: la terminal avisa a todo el grupo de procesos y el CLI reenvía
    su copia. Con `once`, la segunda copia lo mata a mitad del apagado. Medido con el bloque del
    markdown compilado tal cual, 3 de 3: con `once`, petición en vuelo en ECONNRESET y sin
    `onApplicationShutdown`; con la guarda, 200, hooks completos y salida 130. `SKILL.md`
    prescribe este patrón para `src/main.ts`.
  - **Resto.** El suelo de Node pasa a ser `require(esm)` sin flag (20.19 / 22.12), con la LTS 24
    recomendada. La de health checks pasa a `HealthIndicatorService`, porque `HealthIndicator` y
    `HealthCheckError` no existen en Terminus 12. Además: config con Standard Schema, `errorCode`,
    parámetros estructurados del logger, CSRF y cabeceras nativos desde 12.1, comodines de ruta
    `{/*splat}`, y las líneas 12.x de cache-manager, bullmq y axios.
  - **`AGENTS.md` se regenera con su script**, nunca a mano. Un comprobador de paridad
    independiente da 24 fallos con el `AGENTS.md` de HEAD y 0 con el regenerado.
  - **Límite.** Nada automático vigila estas skills: Prettier ignora `.claude/`, y el comprobador
    de paridad vivió en el scratch de la sesión, no en la suite.
- **Skills de arquitectura, tests y flujo de trabajo alineadas con NestJS 12 y con el código real**
  (2026-09-28). `clean-ddd-hexagonal`, `javascript-typescript-jest`, `writing-plans`,
  `subagent-driven-development`, `executing-plans` y `brainstorming` seguían anunciando
  «NestJS 11 + Node 22», y la etiqueta era lo de menos.
  - **Qué enseñaban mal.** `NESTJS-MAPPING.md`, que `CLAUDE.md` declara fuente de verdad de la
    forma del código, enseñaba tokens `Symbol` con `@Inject`, carpetas `commands/` y `handlers/` y
    tests «junto al SUT». Los prompts de revisión exigían esos tokens, así que habrían marcado como
    crítico el código correcto del repo.
  - **Cómo queda el mapeo.** Sigue la forma de `users` y `orders`: puertos `abstract class` con
    adaptadores que hacen `implements`, un caso de uso por archivo con su `…Input`, VOs y agregados
    sobre `shared/domain`, outbox en una transacción, filtro por contexto y tests en `__tests__/`.
    Separa lo unitario sin base (mappers, filtros, controllers, adaptadores ACL) de lo que va
    contra PostgreSQL, que son solo los repositorios; `executing-plans` exigía desde HEAD un E2E a
    toda tarea de infraestructura, mappers y filtros incluidos. Una sección nueva explica qué
    cambia Nest 12, y la de controllers avisa de `routeConflictPolicy`. Las DoD de la cadena
    incluyen ahora `format:check`.
  - **Cómo se comprobó.** Los fragmentos TypeScript del mapeo y de la skill de Jest compilan con el
    tsconfig del repo, y un control negativo da `TS2720` si falta un método del puerto. Los specs
    de ejemplo pasan con el Jest del repo y fallan al quitar el `record()` del agregado. Los 15
    specs unitarios de infraestructura pasan con el puerto de la base cerrado. El grep de «NestJS 11
    / Node 22 / v11» sobre las seis skills da cero coincidencias.
- **nestjs-cls 6.3.1 → 7.0.1, evaluada después del merge** (2026-09-28, PR #82 de Renovate,
  `24577e6`). Entró sin revisión y sin cambios de código; esta es la evaluación que faltó.
  - **Cambios incompatibles.** El único publicado es el mapa `exports`: solo se puede importar la
    raíz del paquete, y el build pasa de `dist/src` a `dist/cjs` + `dist/esm`. El repo solo importa
    esa raíz, desde `app.module.ts` y `transform.interceptor.ts`. Las notas no dicen que `engines`
    sube de `>=18` a `>=22` (se ve en el lockfile de `6e83472`); `.nvmrc`, `engines` y la imagen
    Docker están en 24.21.0 y lo cumplen.
  - **Paquete dual.** Con dos copias del paquete en el mismo proceso, `cls.getId()` podría devolver
    `undefined` en una de ellas. No se da: la app, `dist/` y Jest cargan el build CJS, y nada del
    árbol importa el paquete con `import`. Además, la 7.0.0 lo resuelve upstream: guarda el
    `AsyncLocalStorage` y las claves (`CLS_ID`…) con `Symbol.for`. Medido en Node 24.21.0 con
    `ClsMiddleware` real: un contexto abierto por un build lo lee el otro, y con una copia
    parcheada que no los comparte `getId()` sí da `undefined`. Solo queda que `ClsService` es una
    clase distinta en cada build, y usarla como token cruzado rompe el arranque con
    `UnknownDependenciesException`: un fallo ruidoso.
  - **Sin código ni test de guarda.** La CI de `6e83472` pasó entera: E2E, smoke de arranque y
    build de Docker. Quien sí tiene ese riesgo, latente, es `nestjs-pino` 5.2.1, cuyo
    `AsyncLocalStorage` es propio de cada build: queda en `docs/backlog.md` #28 con su criterio de
    reapertura.
- **dotenv 17 → 18 para las herramientas de línea de comandos** (2026-09-28, sustituye a la PR #80
  de Renovate). La única consumidora directa es `src/database/data-source.ts`: CLI de TypeORM,
  `seed:admin`, `outbox:relay` y los E2E que los importan. La aplicación ya cargaba su `.env` con
  dotenv 18 a través de `@nestjs/config` 12. El cambio de la major que sí importa aquí: `config()`
  toma sus valores por defecto de variables del entorno como `DOTENV_OVERRIDE`, y con ella
  exportada el `.env` pisaba lo que ya estaba en `process.env`. Eso rompía la redirección a la base
  de tests (los E2E del seed y del relay harían TRUNCATE sobre la base de desarrollo) e invertía
  la precedencia `.env.local` > `.env`. `data-source.ts` pasa ahora `override: false` explícito, y
  `data-source.spec.ts` lo fija con los dos casos, que salieron en rojo con dotenv 18 sin el
  arreglo. Quedan tres copias de dotenv en el árbol (17.4.2 por `dotenv-expand`, 18.0.3 por
  `@nestjs/config` y 18.0.4 directa); no se pueden deduplicar y es cosmético.
- **NestJS 11 → 12** (2026-09-25, backlog #27). `@nestjs/common`, `core`, `platform-express` y
  `testing` pasan a 12.1.0, además de config 12.0.1, jwt 12.0.2, swagger 12.0.2, terminus 12.1.0,
  typeorm 12.0.1, cli 12.0.6 y schematics 12.0.5.
  - **Los paquetes `@nestjs/*` 12.x son ESM puro y el repo sigue siendo CJS.** `@nestjs/throttler`
    6.x sigue en CJS. En producción Node carga los ESM con `require(esm)`, sin flag en Node 24.
    Jest necesita `--experimental-vm-modules`: los scripts `test*` lo pasan y Stryker lo recibe
    por `testRunnerNodeArgs`. Un `npx jest` a secas ya no funciona.
  - Sobra la excepción de `@scalar` en `transformIgnorePatterns`.
  - `test:debug` apuntaba al shim de shell `.bin/jest` y no arrancaba; ahora usa `jest/bin/jest.js`.
  - Nuevo paso de CI «Smoke de arranque», que levanta `node dist/src/main` y pide las sondas. Es el
    único que carga el grafo completo de la app con el `require(esm)` de Node; las migraciones solo
    cargan `@nestjs/config`.
  - Sin cambios en el código de dominio ni de aplicación: el typecheck pasa sobre 12.1.0 sin
    tocar nada fuera de `health`.
  - Mutación: 93.24 % con el mismo censo en tres corridas. Entre 14 y 18 mutantes pasan de killed
    a timeout, según la carga, porque el cargador de VM modules es más lento; la aritmética está en
    `stryker.config.mjs`.
  - Nest y terminus 12 traen tres cambios silenciosos de comportamiento:
    - El `responseTime` del indicador `database`, que se publica (en esta sección).
    - El `message` con el texto del driver, que se neutraliza (en `Security`).
    - El código de salida de un apagado con un hook roto, que se acepta (en esta sección).
- **Un hook de apagado que falla ya no se distingue de un apagado limpio** (2026-09-25). Con Nest
  12, `onModuleDestroy`, `beforeApplicationShutdown` y `onApplicationShutdown` corren con
  `Promise.allSettled` y sus rechazos solo se registran con `Logger.error`. El listener de
  `enableShutdownHooks()` termina entonces relanzando la señal, así que el proceso sale con 143
  (SIGTERM). En Nest 11 ese mismo fallo acababa en `process.exit(1)`. Aceptado; está anotado en
  `main.ts`, junto con algo que ya ocurría en la 11: por señal, el `.then`/`.catch` propio de
  `main.ts` nunca llega a ejecutarse.
- **El indicador `database` de `/health` y `/health/readiness` trae `responseTime`** (2026-09-25),
  los milisegundos del ping, en verde y en rojo. Es terminus 12, y el esquema y los ejemplos del
  contrato ya lo recogen.
- **El rate limit agrupa los clientes IPv6 por su /64** (2026-09-25). `@nestjs/throttler` 6.7
  cambia el tracker por defecto a `normalizeIp(req.ip, 64)`: todas las direcciones de un mismo
  /64 comparten contador. Es la defensa estándar contra la rotación de IPv6 —un solo equipo
  dispone de 2⁶⁴ direcciones y antes cada una estrenaba cupo—, con el coste de que varios
  clientes legítimos detrás del mismo prefijo se reparten el límite. IPv4 no cambia. Llega con
  la subida de throttler 6.5.0 → 6.7.1, nestjs-pino 4.6.1 → 5.2.0 y nestjs-cls 6.2.2 → 6.3.1,
  las tres versiones que ya admiten Nest 11 y 12 (paso previo de la migración, backlog #27).
- **La mutación pasó de sugerencia a gate** (2026-08-07, backlog #9). `thresholds.break: 85` en
  `stryker.config.mjs` y job `mutation` propio en `ci.yml`. El umbral sale de un baseline medido
  —90.14 % global— y su aritmética está en la cabecera de la config: bajar el score rompe la CI,
  así que un módulo nuevo sin casos no entra en silencio.
- **Los puertos son `abstract class`, y los adaptadores hacen `implements`** (2026-08-07). Una
  sola referencia es a la vez el contrato y el token de inyección, así que ningún consumidor
  necesita `@Inject`. Como consecuencia, `eslint.config.mjs` prohíbe hacer `import type` de un
  puerto en un archivo con decoradores: la referencia se borra del emit y Nest falla **en runtime**
  con lint y typecheck en verde.
- **Un caso de uso por archivo, con su input al lado** (2026-08-07). Desaparecen `commands/`,
  `queries/` y `handlers/`. Los inputs son `type` planos —nunca clases con `class-validator`— y el
  método público siempre se llama `execute()`.
- **`auth` es un bounded context propio y dueño de la credencial** (2026-08-07, ciclo 4). El hash
  se mudó de la columna `users.password_hash` a la tabla `auth_credentials`, y `users` dejó de
  saber qué es una contraseña. La dependencia corre `auth → users` y solo así.
- **`UsersFacade` se partió en dos puertas segregadas por intención** (2026-08-08, backlog #13):
  `UsersLookup` (`userExists`, `findByEmail`) y `UsersProvisioning` (`createProfile`,
  `deleteProfile`), con una sola implementación detrás vía `useExisting`. La fachada única
  entregaba a `orders` un borrado físico que nunca pidió; ahora llamarlo no compila.
- **La documentación de endpoints dejó de ser una convención** (2026-08-01) y pasó a ser un
  requisito que el build verifica en ambas direcciones.
- **`staging` se trata como producción**, no como desarrollo (2026-07-28): los mensajes de error
  nativos se sanitizan y helmet aplica CSP.
- **La CSP corre también en desarrollo** (2026-08-01), para que lo que rompa, rompa en local.
- **⚠️ El suelo de Node sube de `22.22.1` a `22.23.2`** (2026-08-14). No es mantenimiento
  rutinario: es la única forma de mover el OpenSSL que la aplicación usa de verdad (ver _Security_).
  Toca `.nvmrc`, `.node-version`, `engines` de `package.json` y el `FROM` del `Dockerfile` —y
  desde el 2026-08-19 también `README.md` y la plantilla de incidencias, con
  `src/__tests__/toolchain-pins.spec.ts` afirmándolo, porque esta lista de cuatro se cumplió a tres
  en el siguiente bump. Quien derive la plantilla necesita `nvm install 22.23.2`; `engines` no
  bloquea la instalación —no hay `engine-strict`— así que una versión anterior solo avisa, pero se
  queda con el OpenSSL vulnerable.

- **⚠️ `engines.node` se estrecha a `>=24.19.0 <25.0.0`** (2026-08-19). Anunciaba
  `>=22.23.2 <25.0.0` —tres majors— mientras `.nvmrc`, `.node-version`, el `FROM` del `Dockerfile`
  y `@types/node` estaban ya en 24, y la CI toma la versión de `.nvmrc` sin matriz: se ejercitaba
  uno de los tres. Quien derive la plantilla necesita **Node 24.19.0**; `engines` sigue sin
  bloquear la instalación, así que con Node 22 la instalación solo avisa —y el aviso ahora aparece,
  que antes no— pero nada de lo que hay aquí se prueba contra ese runtime.
- **El censo de mutación se remidió y quedó fechado** (2026-08-19). La cabecera de
  `stryker.config.mjs` razonaba sobre 277 mutantes válidos y el número real es **296**: el bump
  `42ea415` (`@stryker-mutator/core` 9.6.1 → 10.0.0, un MAJOR) no disparó la remedición que ese
  archivo declara obligatoria por ciclo. Medido: **93.24 %**, 276 killed, 0 timeout, 20 survived,
  7 error. `thresholds.break` **se queda en 85**, con la aritmética del margen escrita al lado.
- **La suite E2E mide la cobertura de `data-source.ts`, `seeds/` y `outbox/`** (2026-08-19).
  `jest.config.mjs` excluía seis grupos de la cobertura unitaria argumentando que «los cubren los
  E2E», y la lista del config E2E tenía dos: cuatro grupos no los medía ninguna suite mientras tres
  comentarios publicaban lo contrario. `migrations/` sigue fuera de las dos, ahora dicho en voz
  alta y con su deuda apuntada (backlog #17).
- **Node 24.20.0 → 24.21.0** (2026-09-28, PR #72). Primera PR de Node que Renovate completa por
  sí sola, `engines.node` incluido, tras el arreglo de la forma del rango (ver `Fixed`). No es
  security release de Node; sube OpenSSL de 3.5.7 a **3.5.8**, que corrige 10 CVE moderados o
  bajos (QUIC, CMS, CMP, DTLS). **Medido** sobre la imagen base por digest, como exige el
  `Dockerfile`: `v24.21.0 | openssl 3.5.8`, anotado en su tabla junto a los pins anteriores.
- **Node 24.19.0 → 24.20.0, los seis sitios a la vez** (2026-08-30). `.nvmrc`, `.node-version`, el
  `FROM` del `Dockerfile` con su digest, `engines.node`, la tabla de requisitos del `README.md` y
  la plantilla de incidencias. El PR automático (#38) movía dos de los seis, que es justo lo que
  `src/__tests__/toolchain-pins.spec.ts` pone en rojo. **La medición de OpenSSL que el `Dockerfile`
  declara obligatoria está hecha** y anotada junto a la anterior: `v24.20.0 | openssl 3.5.7`, el
  mismo 3.5.7 que cerró el CVE-2026-31789, así que el frente sigue cubierto. Se mide sobre la
  imagen base traída por digest, sin construir el archivo entero: el OpenSSL que usa la aplicación
  va enlazado estáticamente dentro del binario de Node y `apk upgrade` no lo toca.
- **Renovate mantiene por sí solo los seis sitios de Node y los tres de pnpm** (2026-08-30). Dos
  `customManagers` de tipo regex cubren la prosa que ningún manager nativo ve —la tabla del README
  y la plantilla de incidencias— y dos `groupName` fuerzan a que todos los managers implicados
  viajen en un único PR en vez de depender de que coincidan por casualidad en el mismo
  `branchTopic`. Un cuarto `packageRule` pone `rangeStrategy: "bump"` sobre `engines.node`, que
  con la estrategia por defecto no se movía nunca porque un patch nuevo ya satisface el rango.
  Acotado a `node`: `engines.pnpm` es `>=11.0.0` y ningún test lo ata a la versión pineada. Las
  seis regex están probadas contra los archivos reales (una coincidencia cada una, sin ambigüedad)
  y la config pasa `renovate-config-validator` 44.51.0.

### Removed

- **`details` desaparece del sobre de error** (2026-09-25). Estaba declarado en
  `ErrorResponseDto` —el esquema de los 401, 403, 404, 409, 429 y 500 de todo el contrato— pero
  **ningún camino HTTP lo producía**. La rama `ZodError` de `AllExceptionsFilter` era
  inalcanzable: el único esquema Zod del repo es la config, que falla en el arranque (y
  `validate-env` la convierte en un `Error` plano), antes de que exista una petición que el filtro
  pueda formatear. Y ninguna `HttpException` real —`ValidationPipe`, Throttler, Terminus, los filtros de dominio— lleva las
  claves que `extractDetails` reenviaba. Se verificó pasando por el filtro cada excepción que la
  app puede producir. Era una respuesta declarada pero imposible, el defecto que el contrato
  bidireccional prohíbe. El sobre queda en sus 6 claves, y el test del filtro las ata a
  `ErrorPayload` con `satisfies`. Una `ZodError` fuera del arranque pasa a ser un 500, porque
  sería un fallo del servidor y no del cliente. ⚠️ Al regenerar un SDK con el documento nuevo
  desaparece el campo tipado `details?`, y el código que lo lea deja de compilar; no se pierden
  datos, porque el servidor nunca lo envió. Si algún día
  hacen falta errores de validación estructurados, el camino nativo de Nest 12 es
  `ValidationPipe({ errorFormat: 'grouped' })`, que los manda en `message` como objeto: exigirá
  revisar la normalización de `message` del filtro, no resucitar `details`.
- **El override de `js-yaml` se retira** (2026-08-19). Parcheaba GHSA-pm4m-ph32-ghv5 y cumplió su
  propia condición de salida: `@nestjs/swagger@11.4.7` ya pinea `js-yaml@5.3.0`, con el fix. Se
  retira porque lo único que seguía aportando era el techo `<6.0.0`, que habría retenido a swagger
  en la línea 5.x sin avisar el día que pase a 6.x. Es seguro **porque
  `pnpm audit --prod --audit-level=high` corre en CI**: es el gate que cazó este CVE la primera vez.
  Verificado tras retirarlo — el árbol trae 5.3.0 y el audit responde `No known vulnerabilities`.
- **`POST /users` desaparece** (2026-08-07, ciclo 4). El alta pública es `POST /auth/register`,
  porque lo que nace en un registro es una **cuenta** —perfil y credencial— y el endpoint
  pertenece al contexto que posee la credencial. `CreateUserUseCase` sobrevive con `{ email, name }`
  y su único consumidor es la puerta pública del contexto.
- **`swagger-ui-dist` fuera del árbol** (2026-08-01). Son 12 MB de assets que Scalar hace
  innecesarios; se retira con un override de pnpm, y un step de CI verifica que el override
  siguió aplicando.
- **`SWAGGER_ENABLED` y `SWAGGER_PATH` ya no se leen** (2026-08-01). Renombradas a `DOCS_ENABLED` y
  `DOCS_PATH`: dejarlas en el entorno **impide el arranque** con un mensaje que nombra su
  reemplazo, en vez de ignorarse y dejar a alguien sin documentación en silencio.
- **Tests que pasaban aunque se borrara la implementación** (2026-07-28). Se eliminaron en vez de
  arreglarse: un test que no puede ponerse rojo no es una red.

### Fixed

- **El seed del primer admin ya no acepta credenciales que el login rechaza** (2026-10-01, #34).
  `ADMIN_PASSWORD` solo exigía 12 caracteres a Zod, que cuenta los selectores de variación de los
  emojis y el login no, y `ADMIN_EMAIL` solo pasaba por `z.email()`: con `'a'×129`, `'❤️'×6` o una parte local de 65 caracteres,
  `pnpm seed:admin` creaba o promovía el admin y el login le respondía 400 — el rescate
  documentado dejaba un admin que no podía entrar. Ahora `env.schema.ts` valida las dos con las
  mismas funciones de class-validator que `LoginDto`, y los límites de la contraseña viven en
  `src/config/password-policy.ts`, de donde los leen también los DTO, su `@ApiProperty` y el
  ejemplo del 400 del login. El documento OpenAPI sale idéntico byte a byte. ⚠️ **Un `.env` con
  un valor que el login rechazaría deja de arrancar** —la app, las migraciones que cargan
  `data-source.ts`, `outbox:relay` y el seed—. Por ejemplo: un `ADMIN_PASSWORD` de más de 128
  caracteres, o uno que solo llega a 12 contando los selectores de variación de sus emojis
  (`'❤️'×6` se rechaza, `'❤️'×12` no); un `ADMIN_EMAIL` con más de 64 caracteres antes de la `@`,
  una etiqueta de más de 63, más de 254 en total o una etiqueta que acaba en guion (`a@b-.com`).
- **La documentación de `ADMIN_*` ya no dice que la app no las mira, y avisa del `#` y del `$`**
  (2026-10-01). `.env.example` y el README decían que solo las lee el seed (el comentario de
  `env.schema.ts` lo siguió diciendo hasta #34); las usa solo él, pero las valida todo proceso que
  carga la configuración, y un valor inválido impide arrancar la app. Ahora avisan de que dotenv
  corta en el `#` un valor sin comillas (`CLAVE=abc#123` vale `abc`, medido con dotenv 18): con
  una contraseña así, o el seed guardaba la versión cortada y el login respondía 401 sin pista de
  por qué, o, si el `#` caía antes del carácter 12, ni el seed ni la app arrancaban con un «too
  small» que no cuadraba con lo escrito. Docker Compose no corta ese `#`, y un `DB_PASSWORD` así
  daba `28P01`. El `$` lo expande la app y no los CLI (#36). `SECURITY.md` documenta además la
  política de contraseña —12 a 128 caracteres, sin composición— y sus dos límites frente a NIST
  800-63B-4, y su práctica 2 ya no manda borrar solo `ADMIN_PASSWORD`, que dejaba a
  `ADMIN_EMAIL` sola e impedía arrancar.
- **Arreglos de las revisiones de los PR #90 y #91** (2026-10-01). Dos `/code-review`, 30
  hallazgos y unos 25 menores; el detalle de cada uno, con su medición, vive en el código y en las
  docs que cambia. Por área:
  - **`orders`.** La transacción pide `READ COMMITTED` explícitamente: con un aislamiento por
    defecto distinto, el perdedor del doble clic recibía un `40001` y un 500 (un E2E abre una
    conexión con defecto SERIALIZABLE para probarlo). La lectura lleva el dueño en la consulta
    (`findByIdAndCustomer`): un pedido ajeno con la fila corrupta respondía 500 en vez del 404
    indistinguible, y en desarrollo con datos de la fila. El mapper rechaza una `version` menor
    que 1. El outbox se escribe con `insert`, no con `save`. El byte NUL en `concept` (y en el
    nombre del alta) daba 500; ahora el DTO lo rechaza con 400.
  - **Tests de guarda que no fallaban sin su protección.** El INSERT solo traduce el `23505`, y
    ahora un test lo fija forzando un `22021`; el doble guardado lleva su `OrderPlaced`, así que
    «sin tocar el outbox» puede fallar. Las tres guardas se comprobaron en rojo quitando la
    protección. Más higiene: un factory de `Order`, helpers compartidos en `test/helpers/`
    (`captureError`, `captureRejection`, `expectDocumentedError`, que además exige `timestamp` y
    `requestId`) y un fake que se comporta como el adaptador con mayúsculas y en el UPDATE.
  - **Contrato.** `@ApiStandardErrors()` declara el 408 del `TimeoutInterceptor` global, y el
    guardián lo comprueba en los dos sentidos; health queda exento con `@SkipTimeout()`.
  - **Migraciones.** La de la cancelación acota la espera de bloqueos (`SET LOCAL lock_timeout`):
    con otra sesión sujetando `orders`, el `ALTER` esperaba sin límite y el pod nuevo no
    arrancaba. `migration-conventions.spec.ts` lo exige a toda migración desde esa.
  - **Mutación.** El comando documentado para mutar un módulo (`{domain,application}`) mutaba
    cero archivos y salía en verde con score `NaN`. Las filas `P` de fast-check no mataban nada
    bajo Stryker: `test/stryker-setup.ts` fija su semilla, y el censo pasa de 16 a 11
    supervivientes sin casos nuevos. `test:mutation:changed` muta archivos enteros y puntúa los
    mutantes que tocan el cambio (antes, un `&&` sobre dos líneas quedaba fuera), ignora la
    re-indentación y los movimientos, cuenta los cambios que solo tocan tests, acepta el `--` de
    pnpm, lee el alcance de la config y ya no necesita `NODE_PATH` (`jest-environment-node` es
    dependencia directa). Stryker limpia siempre sus sandboxes y deja la caché de Jest dentro.
  - **Guardas.** El `deny` de git cubre cada subcomando a secas y tras cualquier opción global
    (antes pasaban `git -C <dir> stash`, `git -c k=v commit` o `git branch -q -D x`) y suma `mv`,
    `rm`, `read-tree`, `update-ref`, `symbolic-ref`, `bisect` y otros; medido con el arnés real.
    La regla 2 de boundaries prohíbe por fin `class-validator` en `application/`, y la 6, nueva,
    impide que un adaptador HTTP toque el repositorio.
  - **Flujos y skills.** El riesgo de seguridad se evalúa antes que «trivial»; el stub del TDD
    devuelve un valor neutro en vez de lanzar; el rojo de un caso que mata un superviviente se
    demuestra aplicando el mutante a mano; la mutación se repite tras los arreglos de la
    revisión; la copia del revisor ya no escribe en el `node_modules` real ni toca la base de
    desarrollo; la comprobación mecánica de SDD funciona dentro de Claude Code; el hook de nvm
    documentado deja de recargarse en cada comando (0,19 s → 0,016 s).

- **El apagado por señal vuelve a pasar por `main.ts` y pino se vacía antes de salir**
  (2026-09-28). Cierra lo que la entrada del 2026-09-25 («Un hook de apagado que falla…») dejaba
  anotado sin arreglar: por señal, el `.then`/`.catch` de `main.ts` no corría nunca.
  - **El defecto.** El listener de `enableShutdownHooks()` relanzaba la señal con `process.kill`,
    así que el proceso moría sin emitir `'exit'`, que es donde pino vacía su SonicBoom asíncrono y
    el worker de `pino-pretty`. Medido sobre `dist`: con el código anterior faltaba «Graceful
    shutdown completed» en 12 de 12 apagados, y con `LOG_PRETTY=true` también «Received SIGTERM»,
    en 6 de 6. El `Logger.error` de un hook que falla se perdía incluso con JSON (una corrida por
    modo).
  - **Cómo queda.** Se retira `enableShutdownHooks()`. `main.ts` es el único dueño de SIGTERM y
    SIGINT: hace `app.close(signal)` y sale con `process.exit(128 + señal)`. El código sigue
    siendo 143/130, que es lo que ven Kubernetes y Docker; `useProcessExit` lo habría convertido
    en 0. Ahora las dos líneas salen en 12 de 12, y el error de un hook roto llega al log, aunque
    el proceso siga saliendo con 143 (`Promise.allSettled`).
  - **Segunda señal.** Se ignora, porque Ctrl+C sobre `nest start` llega dos veces al hijo; con
    `process.once` el apagado no terminaba en 3 de 3.
  - ⚠️ **Efectos visibles.** SIGHUP, SIGQUIT, SIGUSR2 y el resto de señales que escuchaba Nest
    dejan de pasar por los hooks y aplican su acción por defecto. Ctrl+C sobre `pnpm start`
    muestra ahora `[ELIFECYCLE] Command failed with exit code 130.`
  - **Opciones de creación.** `NEST_APP_OPTIONS`, que la app comparte con `createTestApp()`, fija
    `routeConflictPolicy: { duplicate: 'error', shadow: 'error' }`.
    `src/__tests__/main.spec.ts` fija su efecto con apps reales: 3 de sus 6 casos salen en rojo
    con las opciones vacías. Sobre la app real, un `@Get('me')` detrás de `@Get(':id')` pasa de
    arrancar sin queja a abortar con `RouteConflictException`. ⚠️ `shadow` rechaza también
    `users/me` declarado antes que `users/:id`, el orden que funcionaba: quien necesite ese patrón
    baja `shadow` a `'warn'`.
  - **Smoke de CI.** El paso de `ci.yml` arranca con `DOCS_ENABLED=true` y pide el documento JSON,
    el HTML de Scalar y el bundle con hash, cuyo `Content-Type` comprueba. Después exige el 143 y
    la línea de cierre en el log. Contra un build del commit anterior falla justo en esa aserción;
    sin el bundle en `public/`, falla porque el catch-all de Scalar lo sirve como HTML.
  - **`return503OnClosing` se queda apagado, a propósito.** Se probó y se retiró: platform-express
    contesta desde el primer instante de `close()` un 503 `text/html` (`Service Unavailable`),
    sin sobre de error ni `x-request-id`, que tapa el 503 JSON `shutting_down` que el contrato
    OpenAPI publica para `/health/liveness` y `/health/readiness`. Tampoco protegía nada: el
    `DataSource` se destruye en `onApplicationShutdown`, después de que el servidor HTTP cierre y
    espere a las peticiones en vuelo. Medido sobre `dist` con el hook de Terminus alargado 2 s: sin
    la opción, la sonda da el 503 JSON con sobre y `x-request-id`; con ella, el de texto.
    `main.spec.ts` fija que la app sigue atendiendo mientras el apagado espera a los hooks, y el
    comentario de `health.controller.ts` ya no cita `enableShutdownHooks()`.
- **El `errorCode` de Nest 12 ya no se pierde en el sobre de error** (2026-09-28). Nest 12 añadió
  `options.errorCode` a `HttpException`, pero `AllExceptionsFilter` reconstruía el cuerpo solo con
  `message` y `error`: el código se descartaba sin avisar.
  - **Cómo viaja ahora.** Es una clave **opcional** del sobre, presente solo cuando la excepción lo
    trae, nunca como `undefined` ni `null`. Con eso, el sobre pasa de las 6 claves que cita la
    entrada «`details` desaparece…» a 6 fijas y 1 opcional. Manda la propiedad `exception.errorCode`
    y el cuerpo es el respaldo, porque con una respuesta objeto Nest no lo copia al cuerpo (medido
    en 12.1.0). Solo vale una cadena no vacía, el mismo criterio que aplica Nest. Una
    `HttpException` 5xx lo publica también en producción, igual que su `message`. Un `Error`
    no-HTTP con una propiedad de ese nombre no lo publica nunca.
  - **Contrato.** `ErrorResponseDto` lo declara con `required: false`, y
    `ValidationErrorResponseDto` lo omite porque el `ValidationPipe` nunca lo fija. El guardián de
    claves de `openapi-contract.e2e-spec.ts` lo admite sin exigirlo.
  - **No es el caso de `details`.** Aquel campo se retiró por declarado e imposible. Este tampoco lo
    emite hoy ningún filtro de dominio, pero es un campo nativo de Nest que el filtro destruía: se
    transporta el dato, no se añade funcionalidad. La descripción del DTO lo dice.
  - **Cómo se comprobó.** 8 tests en rojo con la suite actual contra el filtro y el DTO de HEAD, y
    diez mutaciones del filtro y del DTO, todas cazadas. En un documento OpenAPI generado de
    verdad, `errorCode` queda fuera de `required`, y los ejemplos de `buildErrorExample`, que no lo
    llevan, siguen validando con Ajv. La suite E2E completa pasa con el cambio (12 suites, 136
    tests).
- **El lint ya no deja pasar imports profundos de `@nestjs/*` por la puerta de atrás, y
  `cors.config.ts` deja de usar uno** (2026-09-28).
  - **La regla era demasiado estrecha.** `no-restricted-imports` vetaba solo el nombre exacto
    `@nestjs/common/constants`. Pero el mapa `exports` de `@nestjs/common` 12.1.0 es
    `{".", "./internal", "./*.js", "./*"}`, así que `@nestjs/common/constants.js` y
    `@nestjs/common/internal` pasaban el lint y compilaban. `./internal` reexporta `constants.js`
    bajo una cabecera «not part of the public API».
  - **`cors.config.ts` usaba una subruta.** Importaba `CorsOptions` de
    `@nestjs/common/interfaces/external/cors-options.interface`, que solo resuelve por el comodín
    `./*`.
  - **Qué cambió.** La regla pasa a un patrón `regex` `^@nestjs/[^/]+/` que prohíbe toda subruta,
    `import type` incluido, sin distinguir mayúsculas, porque en APFS `@NestJS/common/constants`
    también resuelve. `CorsConfig` deriva su tipo de `NestApplicationOptions['cors']`, que exporta
    la raíz, quitando el booleano y la función delegada. La regla también veta las pocas subrutas
    declaradas a propósito, como `@nestjs/swagger/plugin`; hoy ningún archivo importa una.
  - **Cómo se comprobó.** `src/__tests__/eslint-config.spec.ts` prueba la regla resuelta de la
    config real vía `calculateConfigForFile`, no una copia. Con la regla anterior salen 3 de 8 en
    rojo (`constants.js`, `internal`, `import type`), y uno de sus casos detecta un bloque posterior
    que pisara la regla, comprobado con una mutación. `src/config/__tests__/cors.config.spec.ts`
    fija, con igualdad exacta de tipos, que el tipo derivado es el que acepta `enableCors` en
    `@nestjs/platform-express`; tres mutantes de la derivación dan TS2322.
  - **Corrige la entrada del 2026-08-19** («Claves de metadatos de Nest copiadas y ancladas»). Esa
    entrada decía que el import profundo era una rotura de arranque «con typecheck en verde». Con
    `moduleResolution: nodenext`, el del repo desde que existe `tsconfig.json`, TypeScript lee el
    mismo mapa que Node. Medido con el de `@nestjs/swagger` 12.0.2: cerrar la subruta da TS2307 en
    `typecheck`, sea el import de valor o de tipo, y `ERR_PACKAGE_PATH_NOT_EXPORTED` en runtime. Un
    renombrado de la constante no lanza en runtime, pero da TS2305.
  - **Límite medido.** La regla no ve `require()`, `import('…').X` ni `import()` dinámico. Los dos
    primeros ya son error por `@typescript-eslint/no-require-imports` y
    `@typescript-eslint/consistent-type-imports`. El único hueco real es el `import()` dinámico
    fuera de `domain/`, y hoy no hay ninguno hacia `@nestjs` en `src/`, `test/` ni `scripts/`.
- **`toolchain-pins.spec.ts` comprueba exactamente los sitios que Renovate reescribe, CLAUDE.md
  incluido, y los major de NestJS se configuran para llegar en una sola PR** (2026-09-28).
  - **El agujero.** El spec comprobaba los documentos con un `toContain` sobre el archivo entero, y
    el comentario HTML que precede a la tabla del README citaba la versión de pnpm. Con la fila
    `| **pnpm** |` cambiada a otra versión, el spec seguía 10 de 10 en verde: el fallo de
    `2723d87`, el mismo para el que existe el test.
  - **Cómo lo comprueba ahora.** Lee los `customManagers` de `renovate.json` y aplica cada
    `matchString` de forma global, como la estrategia `any` de Renovate. Por documento, exige que
    un `managerFilePatterns` lo cubra, que haya al menos una coincidencia y que todas las versiones
    capturadas sean la fijada. Exige además que cada expresión case en algún documento vigilado.
    Con la misma fila alterada sale rojo (`"11.28.0"` esperado, `"11.27.0"` recibido). El
    comentario del README ya no lleva números de versión.
  - **Séptimo sitio de Node.** La línea de Stack de `CLAUDE.md` decía `Node 24.20.0+` con `.nvmrc`
    en 24.21.0, y nadie la vigilaba. Pasa a 24.21.0 y entra en el customManager de Node con una
    expresión anclada a `## Stack`. Las entradas del 2026-08-30 hablan de seis sitios; ahora son
    siete.
  - **Grupo de major de NestJS.** Una `packageRule` nueva mete los major de `@nestjs/**`,
    `nestjs-cls` y `nestjs-pino` en el grupo «ecosistema NestJS». El preset de monorepo agrupa por
    repositorio de origen y dejaba fuera jwt, swagger, typeorm, throttler, nestjs-pino y
    nestjs-cls; con Nest 12 eso fueron cuatro PR en rojo por separado (#40, #41, #43 y #44;
    backlog #27). Los minor y patch no cambian: los del monorepo siguen agrupados por el preset y
    el resto llega en PR sueltas. `src/__tests__/renovate.spec.ts` recorre `package.json` y
    `node_modules` con el criterio «`@nestjs/*` o peers sobre `@nestjs/common`/`core`» y exige que
    cada dependencia acoplada quede cubierta: 15 rojos antes de la regla, 17 verdes después.
  - **Sin comprobar en Renovate real.** `renovate.json` valida contra el JSON Schema oficial
    44.117.0, pero ese esquema acepta claves desconocidas; una mal escrita la caza el spec. Renovate
    no se ejecutó: la prueba será la próxima PR de Node, que debería tocar también `CLAUDE.md`, y el
    próximo major de Nest, que debería llegar desde la rama `renovate/major-ecosistema-nestjs`.
- **Las PR de Renovate que cambian la longitud de una versión ya no rompen el `format:check`**
  (2026-09-28). Los `customManagers` de `renovate.json` reescriben las versiones de Node y pnpm de
  la tabla de requisitos del README sin recalcular el relleno de las celdas, y Prettier exige la
  tabla alineada: la #74 (pnpm 11.28.0 → 12.6.0) se quedó en rojo en Format check y la CI se saltó
  todo lo que va detrás —typecheck, tests, build, Docker y trivy—. La tabla va ahora tras un
  `<!-- prettier-ignore -->`. Medido simulando la edición de Renovate: con pnpm 12.6.0, pnpm
  11.100.0 o Node 24.100.0, `prettier --check` fallaba sobre el README de `main` y pasa con el
  cambio; las expresiones de Renovate siguen encontrando las dos filas.
- **La documentación ya no provoca una violación de CSP en cada carga, y la checklist de Scalar
  mira donde de verdad aparecen** (2026-09-28). El Zod 4 que Scalar empaqueta prueba
  `Function('')` al cargar para decidir si compila el parser rápido de `z.object`; nuestra
  `script-src` sin `'unsafe-eval'` lo bloquea. Era inocuo —Zod lo captura y valida por el camino
  interpretado—, pero Chrome lo anotaba en cada carga en el panel Issues («Content Security Policy
  of your site blocks the use of `eval` in JavaScript»). Estaba ya en la 1.67.0 (A/B medido contra
  la 1.72.1: la misma violación, solo cambia la línea) y nadie lo vio porque Chrome no lo escribe en
  la consola, y la checklist mandaba buscar `Refused to`, un prefijo que Chromium dejó de usar en
  septiembre de 2025: de 10 violaciones provocadas en una página de prueba (Chrome 154 headless), ese
  filtro encontró 1. `scripts/scalar-bundle.mjs` antepone ahora al bundle servido una línea,
  `ZOD_JITLESS_PRELUDE`, que activa `jitless` —el interruptor que Zod prevé para entornos sin
  `eval`— antes de que Zod cargue, y la sonda no llega a ejecutarse. La lógica de publicar salió de
  `copy-scalar-asset.mjs` a ese módulo para poder testearla (salida idéntica byte a byte antes del
  prelude, comprobado con `diff -r`). `scalar-bundle.spec.ts` (12 casos) ejecuta lo publicado —un
  prelude sin `;` final dejaba la documentación en blanco con los demás casos en verde— y hace de
  gate sobre el bundle **instalado**: toda sonda de eval debe ir detrás de la guarda `jitless`, o
  la PR de Renovate se pone en rojo. Un caso nuevo de `openapi.e2e-spec.ts` comprueba que el bundle
  servido empieza por el prelude. Medido en la app real: cero violaciones en los cinco pasos, y los
  controles positivos (eval, script inline, `connect-src`) se siguen detectando. La checklist de
  `CLAUDE.md` pasa a leerse en el panel Issues con criterio **cero**, en un perfil sin extensiones
  (Dark Reader imitaba el síntoma del paso 2), y el comentario de `docs-csp.ts` deja de afirmar que
  el bundle no evalúa código.
- **La regla de Renovate que debía mover `engines.node` no hacía nada** (2026-09-28). La entrada
  del 2026-08-30 de más abajo afirma que un `packageRule` con `rangeStrategy: "bump"` sube el suelo
  de `engines.node` en cada PR de Node. No era cierto con la forma del rango, `>=24.20.0 <25.0.0`:
  el manager npm de Renovate degrada `bump` a `widen` en cualquier rango compuesto, y con `widen`
  un patch nuevo ya cabe, así que el suelo no se movía nunca. Se vio en la primera PR que ejercitó
  la regla, Node 24.21.0 (#72), que llegó sin tocar `engines.node` y con `toolchain-pins.spec.ts`
  en rojo. El rango pasa a `^24.20.0`: equivalente para toda versión estable (solo excluye además
  las prerelease de Node 25) y de un solo elemento, así que `bump` funciona. El test exige ahora
  esa forma, la descripción de la regla en `renovate.json` cuenta por qué, y el paso `nvm use` del
  README deja de citar un literal de versión que ningún manager mantenía.
- **`TRUST_PROXY` se valida con la semántica real de Express** (2026-09-25). Antes el schema
  aceptaba cualquier cadena no vacía (`.env.example` lo reconocía como límite), y una errata como
  `loopbak`, un `true` o un `-1` no se detectaba hasta `main.ts`: el arranque moría con
  `TypeError: invalid IP address: …`, fuera del canal de errores de configuración. Ahora la última
  palabra la tiene el mismo `app.set('trust proxy', …)` de Express, dentro del schema, y el error
  llega por `validate-env` nombrando la entrada culpable, también en las listas separadas por
  comas. `true` se rechaza con una explicación: en Express confía en todos los saltos y haría
  falsificable `req.ip`. `false` también se rechaza —como cadena nunca fue válido para Express—:
  su equivalente es `0`. Hay **formas que Express aceptaba y ahora no**, a propósito: la IPv4 en
  notación no estándar —ceros a la izquierda, hexadecimal o un entero de 32 bits dentro de una
  lista; `192.168.001.010` se leía en octal y confiaba en 192.168.1.8— y las subredes
  IPv4-mapeadas con prefijo menor que /96 (`::ffff:10.0.0.0/8`, GHSA-jqcg-44mw-7w3h), que no
  casan con ningún cliente IPv4. Límite escrito: se valida que la spec sea válida, no que sea
  prudente; un número de saltos exagerado o `::ffff:0:0/96` siguen aceptándose.
- **Las variables de tipo lista del `.env` dejaron de descartarse en silencio** (2026-07-28).
  `@nestjs/config` solo devuelve a `process.env` los valores validados que son
  `string | number | boolean`; arrays y objetos los tira sin decir nada. `CORS_ORIGINS` y
  `LOG_REDACT_FIELDS` se quedan como string y se trocean en el factory.
- **Una variable vacía ya no vale `0`** (2026-07-28). `Number('')` es `0`, y un
  `SHUTDOWN_TIMEOUT_MS=` convertido en cero mataba el proceso antes de terminar el cierre ordenado
  en **todos** los despliegues.
- **El readiness comprueba PostgreSQL** (2026-07-28). Sin el ping devolvía 200 con la base caída,
  el orquestador mantenía el pod en rotación y el 100 % de las peticiones acababa en 500.
- **`isHealthPath` compara segmentos completos, no substrings** (2026-07-28), así que un endpoint
  de negocio llamado `/api/healthcare` no desaparece de los logs.
- **La violación de unicidad se traduce en el adaptador** (2026-07-28). El `23505` de PostgreSQL
  se convierte en `EmailAlreadyTakenError`, así que un insert concurrente sale como 409 y no
  como 500.
- **El stage de producción del Dockerfile y su healthcheck** (2026-07-28). `--ignore-scripts` es
  obligatorio: pnpm ejecuta el hook `prepare` también en instalaciones de producción, y `prepare`
  invoca a husky, que es devDependency.
- **El esquema publicado de las listas paginadas era insatisfacible** (2026-08-01): declaraba un
  array de arrays.
- **Arreglos bloqueantes de la revisión adversarial del ciclo 4** (2026-08-07, A1-A6). Entre
  ellos, la migración copiaba `createdAt`/`updatedAt` del perfil en vez de estamparlos con `now()`.
- **La credencial ya no sobrevive al borrado del perfil** (2026-08-08, backlog #14). La
  compensación del registro borra las dos filas, en ese orden: el perfil primero, porque un perfil
  huérfano bloquea su propio email por el índice único y su dueño no puede volver a registrarse
  nunca, mientras que una credencial huérfana es basura silenciosa que no colisiona con nada.

### Security

- **El 503 de las sondas de health no publica el texto del driver de la base** (2026-09-25).
  Terminus 12 añade `message: err.message` al indicador `database` cuando la query falla, y
  `AllExceptionsFilter` publica ese mapa en el 503 de `/health` y `/health/readiness`, dos endpoints
  `@Public`. El texto crudo (`password authentication failed for user …`,
  `connect ECONNREFUSED host:puerto`) habría llegado a cualquiera. Medido antes del arreglo con el
  `DataSource` destruido, que es lo que hace el E2E: `"message": "Driver not Connected"`. Con
  PostgreSQL parado de verdad, el texto sería el del driver `pg`; ese caso solo se midió después
  del arreglo, con el 503 ya limpio. `HealthController` lo quita y solo conserva el mensaje de
  timeout que compone el propio terminus, casado con una regex anclada por los dos extremos; si
  terminus cambia esa redacción, también se descarta. Así se mantiene el contrato de v11, donde un
  fallo de query no llevaba mensaje. Lo fijan un E2E con la forma exacta del 503 y cuatro
  propiedades con `fast-check`, dos de ellas sobre las anclas de la regex. El texto tampoco llega
  al log: Terminus registra el resultado ya saneado, igual que en v11.
- **Tres avisos high de `multer` cerrados sin salir de Nest 11** (2026-09-25). El gate
  `pnpm audit --prod --audit-level=high` puso `main` en rojo —y con él cualquier PR, también las
  ajenas a Nest— por `multer@2.2.0`, que llega a producción a través de
  `@nestjs/platform-express@11.2.3`: GHSA-wc9g-mqfw-jrwm y GHSA-535w-7cp7-47q4 (DoS, parcheados en
  2.3.0) y GHSA-qfvm-cv95-jqjf (fuga de descriptores, solo 2.2.0). El repo no usa `multer` —no
  hay `FileInterceptor`—, pero viaja en el árbol igualmente. Cerrado subiendo el monorepo de Nest a
  **11.2.6** (dist-tag `legacy`), que fija `multer@2.4.0`; 11.2.4 y 11.2.5 seguían en 2.2.0. **Sin
  override**: el arreglo ya estaba publicado aguas arriba, y un override sustituye la regla de
  upstream por completo (la lección de js-yaml, en el tombstone de `pnpm-workspace.yaml`). Entró a
  mano con dos días de publicación, por debajo de los tres de `minimumReleaseAge` que Renovate
  verifica: decisión explícita del mantenedor frente a dejar `main` en rojo. Es el primer paso de
  la migración a NestJS 12 (backlog #27).
- **El cooldown de paquetes nuevos cambia de sitio, no desaparece** (2026-08-19). pnpm 11 reaplica
  `minimumReleaseAge` (24 h por defecto) a **cada entrada del lockfile en cada install**, así que
  cualquier paquete publicado hace menos de un día ponía en rojo los dos jobs de `ci.yml` con un
  lockfile coherente byte a byte — el fallo que obligó a `b79372b` a llevar un embargo de reloj en
  el mensaje de commit. Ahora la verificación la hace Renovate aguas arriba
  (`"minimumReleaseAge": "3 days"` en `renovate.json`, antes de abrir la PR) y CI confía en el
  lockfile ya verificado (`--trust-lockfile`, el uso que pnpm documenta para el flag). **Son una
  sola decisión en dos mitades:** quitar el flag devuelve los rojos sin causa; quitar la regla de
  Renovate deja el cooldown sin verificar en ningún punto.
- **`enableImplicitConversion` está deliberadamente ausente del `ValidationPipe`** (2026-07-28).
  Convertía cada valor al tipo declarado _antes_ de validar, así que un `{"name": {"$ne": null}}`
  llegaba a `@IsString()`, `@MinLength` y `@MaxLength` como la cadena `"[object Object]"` y pasaba
  las tres. Eso es inyección NoSQL entrando por la puerta principal.
- **`whitelist` + `forbidNonWhitelisted`** (2026-07-28): un campo no declarado en el DTO se
  rechaza con 400 en vez de ignorarse, así que nadie cuela un `isAdmin: true`.
- **`DB_SYNCHRONIZE` no puede encenderse fuera de desarrollo** (2026-07-28). `synchronize: true`
  deja que TypeORM altere el esquema, y eso incluye borrar columnas con sus datos.
- **Secretos fuera de los logs** (2026-07-28, ampliado 2026-08-07). `redact` de Pino tapa
  cabeceras de autorización, cookies y los campos habituales; el ciclo 4 añadió
  `err.parameters[*]` tras detectar un hash argon2id saliendo en claro en los parámetros de un
  `QueryFailedError`.
- **CVE real cerrado antes de que existiera CI que lo detectara** (2026-08-06, backlog #6).
  `pnpm audit --prod --audit-level=high` salió con exit 1 en su primera ejecución local:
  `js-yaml@5.2.1` (High, ReDoS, GHSA-pm4m-ph32-ghv5) llegaba por `@nestjs/swagger` a las
  dependencias de producción. Remediado con un override _scoped_ al path en `pnpm-workspace.yaml`.
- **Guard global seguro por defecto** (2026-08-06). Un endpoint nuevo sin `@Public()` exige un JWT
  válido sin que su autor haga nada.
- **Login anti-enumeración medido, no razonado** (2026-08-06, reforzado en el ciclo 4). El mismo
  error para email inexistente, perfil sin credencial, contraseña incorrecta y usuario inactivo,
  con exactamente una llamada a `verify()` en los cuatro caminos. Una fila de propiedad lo fija.
- **Fuga de tiempo cerrada en `POST /auth/register`** (2026-08-08, backlog #15). La contraseña se
  hashea **antes** de comprobar la unicidad, así que los dos caminos pagan el argon2id. Medido
  sobre HTTP contra PostgreSQL real: las medianas 409/201 pasaron de 7.52 ms / 91.47 ms (rangos
  disjuntos, 12.2×) a 79.61 ms / 90.82 ms (rangos solapados, 1.14×). El 409 en sí **se mantiene**,
  como decisión escrita: sin él, quien ya tiene cuenta no sabe por qué no puede darse de alta.
- **El primer scan real de trivy salió rojo, y el arreglo inicial dejó verde el gate sin cerrar el
  CRITICAL** (2026-08-14, backlog #25). 49 vulnerabilidades HIGH/CRITICAL con fix, ninguna de este
  repositorio. El commit `55b42e8` las atacó con `apk upgrade` y borrando el npm global; trivy pasó
  a verde. **La imagen seguía ejecutando OpenSSL 3.5.5**, la versión del CVE que se daba por
  cerrado: `node:*-alpine` enlaza OpenSSL **estáticamente dentro del binario de Node** —`ldd` no
  lista `libssl.so.3`— y es ese, no el de `apk`, el que usan `pg` con `DB_SSL=true` y toda llamada
  HTTPS saliente. `apk` no puede tocarlo y el analizador de paquetes de SO de trivy no lo mira.
  Cerrado subiendo el `FROM` a `node:22.23.2-alpine` (security release; recupera además 22.22.2,
  22.23.0 y 22.23.2), con lo que `process.versions.openssl` pasa a **3.5.7**. La lección, escrita
  en el propio Dockerfile: **un verde de trivy no significa que el TLS de la aplicación esté
  parcheado**; lo que lo significa es `node -p "process.versions.openssl"`.
- **Aserciones sobre el resultado en el `Dockerfile`** (2026-08-14). El `apk upgrade` sale 0 aunque
  no parchee nada —apk hace un `preupgrade` de `apk-tools` en dos fases— y se llevaba por delante
  el `/etc/passwd` que declara al usuario `node`, dejando además `.apk-new` (incluido
  `/etc/shadow.apk-new`) en la imagen publicada. Ahora comprueba que no queda nada pendiente, que
  `node` existe, y los borra. Fuera también corepack, sus cinco shims y `/opt/yarn-v1.22.22`: el
  pnpm que se conservaba «para instalar» no era funcional (nunca se horneó store) sino una vía de
  descarga-y-ejecución con el prompt suprimido.
- **`docker build --pull` en CI** (2026-08-14). La clave de caché de un `RUN` es su cadena literal,
  que no cambia nunca: sin `--pull`, un build tibio reutiliza la capa parcheada el día que se
  construyó y ni re-baja el tag base.
- **Endurecido `security.yml`** (2026-08-14). Comentarios de PR de gitleaks apagados
  (`pulls.createReviewComment` exigía `pull-requests: write` y daba 403 con un mensaje que culpaba
  al tamaño del diff), `workflow_dispatch` añadido, `github.event_name` en la clave de
  `concurrency` —un push a main cancelaba el cron semanal, que es el único trigger que recorre el
  historial entero— y versión de gitleaks fijada explícitamente en vez de heredar la de 2025 que
  trae la action por defecto.

### Known issues

Limitaciones conocidas, cada una con su decisión escrita en
[`docs/backlog.md`](./docs/backlog.md). Están enumeradas en [`SECURITY.md`](./SECURITY.md) con lo
que puede hacer al respecto quien despliegue:

- Un token sobrevive a la desactivación de su dueño; no hay refresh ni revocación (#11).
- El rate limiting cuenta en memoria, por réplica, y por `req.ip` (#3).
- No hay bloqueo de cuenta por identidad en el login.
- Las migraciones que mueven datos no las ejercita ninguna prueba (#17).
- No hay lista de contraseñas prohibidas: `123456789012` es una contraseña válida (#35).
- Un `$` en el `.env` lo expande la app y no los CLI: cada proceso puede ver un valor distinto
  (#36).

---

## Historial por ciclos

La reconstrucción de arriba sale de estos bloques de commits. Se conserva porque las categorías de
Keep a Changelog rompen el orden cronológico, y este repositorio razona por ciclos.

| Fechas        | Ciclo                                     | Commits               |
| ------------- | ----------------------------------------- | --------------------- |
| 2026-07-27/28 | Base hexagonal, TypeORM y saneamiento     | `b84d2d7` … `a20bd51` |
| 2026-08-01    | Documentación OpenAPI + Scalar            | `dbfccbb` … `2ebb947` |
| 2026-08-03/04 | Roadmap, modelo de colaboración y Stryker | `f51082f` … `a1d0e2d` |
| 2026-08-04/05 | Fronteras de módulo (backlog #4)          | `41fa873` … `52a9a4d` |
| 2026-08-05/06 | Auth con roles (backlog #5)               | `8f98fa4`, `83d6148`  |
| 2026-08-06    | Cadena de suministro (backlog #6)         | `9611f63`, `3907fdd`  |
| 2026-08-06    | `@CurrentUser()`                          | `da86eb7`             |
| 2026-08-07    | `orders`: eventos de dominio y outbox     | `d6ee3d7`             |
| 2026-08-07    | Mutación como gate (backlog #9)           | `6994611`             |
| 2026-08-07    | Refactor de arquitectura, 4 ciclos        | `7e0e11f` … `54b1893` |
| 2026-08-07/08 | Revisión adversarial y sus cierres        | `fe90327` … `fcaebc0` |

[unreleased]: https://github.com/JorgeIPN7/template-nest-js-hexagonal-ddd-mudblood/commits/main
