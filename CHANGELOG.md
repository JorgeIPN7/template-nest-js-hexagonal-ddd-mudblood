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
  de por tag, workflow `security.yml` con gitleaks sobre el historial completo (push, PR y cron
  semanal) y `renovate.json` con `:pinAllExceptPeerDependencies`. Todo config-ready: nada de esto
  se ha ejecutado nunca, porque hasta ahora el repositorio no tenía remoto.
- **Segundo bounded context: `orders`** (2026-08-07). Un solo caso de uso (`POST /orders`) que
  ejercita las tres costuras que un contexto único no puede: paso cross-módulo por la puerta
  pública, eventos de dominio (`OrderPlaced`) y outbox transaccional con relay por CLI
  (`pnpm outbox:relay`).
- **Shared kernel de dominio** (2026-08-07). `src/shared/domain/` con `value-object.base.ts` y
  `aggregate-root.ts`, y su propio element type en la matriz de fronteras.
- **Regla de migraciones destructivas: expand/contract** (2026-08-08, backlog #12). Documentada en
  `CLAUDE.md` con el ejemplo trabajado, y con el dato medido que la justifica: TypeORM enumera
  cada columna en cada `SELECT`, así que un `DROP COLUMN` rompe **toda** lectura de la tabla en el
  código viejo, no solo la que usaba la columna.
- **Gobernanza del repositorio** (2026-08-08). `LICENSE` (MIT), `SECURITY.md`, `CHANGELOG.md`,
  `.github/CODEOWNERS` y plantillas de issue en formato de formulario, de cara a la creación del
  primer remoto.

### Changed

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

### Removed

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

### Known issues

Limitaciones conocidas, cada una con su decisión escrita en
[`docs/backlog.md`](./docs/backlog.md). Están enumeradas en [`SECURITY.md`](./SECURITY.md) con lo
que puede hacer al respecto quien despliegue:

- Un token sobrevive a la desactivación de su dueño; no hay refresh ni revocación (#11).
- El rate limiting cuenta en memoria, por réplica, y por `req.ip` (#3).
- No hay bloqueo de cuenta por identidad en el login.
- Las migraciones que mueven datos no las ejercita ninguna prueba (#17).
- La base de datos de test hay que migrarla a mano y nada lo documenta (#18).

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
