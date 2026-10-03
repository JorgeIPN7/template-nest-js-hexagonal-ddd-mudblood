# _nest-base-template

Production-ready NestJS 12 base template: hexagonal/DDD, Pino with request-id via CLS, Zod-validated config, self-hosted Scalar docs, Terminus health checks.

History, measurements and worked examples live in `docs/` (backlog #32), which this file overrides.

## Stack

NestJS 12 · TypeScript 6.0 · Node 24.21.0+ · pnpm 12 · SWC · Jest 30 · Supertest · Pino 10 · Zod 4 · class-validator 0.15 · TypeORM 1 · PostgreSQL 18 · Scalar 1.72

Why: [docs/toolchain.md](docs/toolchain.md).

- **`@nestjs/swagger` generates the OpenAPI document; Scalar only renders it:** its imports keep the upstream name, our own vocabulary (config, env vars, file names) says `docs`/`openapi`.
- **pnpm only, never `npm install` or `yarn`;** the version is pinned in `packageManager` (older global pnpm: `corepack pnpm …` or `corepack enable`).
- **pnpm settings (`overrides`, `allowBuilds`) go in `pnpm-workspace.yaml`:** pnpm 11+ silently ignores the `pnpm` key of `package.json`.
- **An override replaces upstream's rule entirely; retiring a CVE override is only safe because `pnpm audit --prod --audit-level=high` runs in CI** (backlog #6).
- **The `typescript` override is scoped to `'@nestjs/cli>typescript'`, never global, and a TypeScript bump edits both lines** (override and devDependency): a global one makes TS PRs inert, unequal literals mean two compilers (`toolchain-pins.spec.ts`).
- **NestJS 12 is ESM-only and this repo stays CJS, so run tests only through the `pnpm test*` scripts:** Jest ≥ 30.5 with `--experimental-vm-modules` — a bare `npx jest` dies with `Must use import to load ES Module` (backlog #27).
- **`src/main.ts` alone owns SIGTERM/SIGINT and never calls `enableShutdownHooks()`** (its listener re-raises the signal and pino never flushes): it runs `app.close(signal)`, then `process.exit(128 + signal number)`, and ignores a second signal; `useProcessExit` is no alternative (it turns 143 into 0). CI's «Smoke de arranque», not Jest, boots `dist/` with `DOCS_ENABLED=true` and asserts SIGTERM exits 143 with «Graceful shutdown completed».
- **Zod 4 gotcha:** after `.transform()` use `.prefault()` (an **input** value; the pipeline runs), never `.default()` (the **output** type; it short-circuits) — see `src/config/env.schema.ts`.

## Commands

```bash
pnpm typecheck # tsc --noEmit
pnpm lint:check # eslint, no --fix
pnpm lint # eslint --fix
pnpm format:check # prettier --check
pnpm test # unit, *.spec.ts under src/
pnpm test:e2e # *.e2e-spec.ts (needs the DB up)
pnpm test:mutation # Stryker over domain/ + application/ of every module (CI gate, break: 85)
pnpm test:mutation:changed [base] # only what changed since base (default: merge-base with main)
pnpm build # nest build (SWC)
pnpm start:dev # watch mode

pnpm db:up # docker compose up -d --wait postgres (blocks until healthy)
pnpm db:down # stop it
pnpm db:reset # drop the volume, start clean and migrate BOTH databases
pnpm db:migrate:test # migrate nest_base_template_test — the E2E suite needs it
pnpm migration:run # apply pending migrations
pnpm migration:revert # roll back the last one
pnpm migration:generate src/database/migrations/<Name> # diff entities vs schema
```

**Definition of Done** for any change: `typecheck` → `lint:check` → `format:check` → `test` → `test:e2e` → `build`, all green. E2E needs PostgreSQL (`pnpm db:up`) and runs against the separate `nest_base_template_test` database, created by `docker/initdb/` and forced by `test/setup-env.ts`.

**`docker/initdb/` never migrates that database:** on a fresh clone run `pnpm db:migrate:test` before the first `pnpm test:e2e`, or it dies with `relation "auth_credentials" does not exist` — an unmigrated schema, not a bug (backlog #18). `pnpm db:reset` migrates both.

## Git policy — never commit on the user's behalf

- **Agents never run `git commit`, `add`, `push`, `tag`, `rebase` or any git command that writes history, moves `HEAD` or a ref, touches the index or discards work — not even when asked, subagents and Workflow agents included.** The user commits from their own terminal.
- **When a commit seems due, suggest it and stop:** _"Te sugiero hacer un commit de los cambios por &lt;razón&gt;. Avísame y lo redacto."_
- **Enforced:** `.claude/settings.json` denies each subcommand as `git <sub> *`, `git * <sub> *` and `git * <sub>`, covering global options in front (`claude-settings.spec.ts`; [details](docs/development-workflows.md#10-git-quién-hace-los-commits)); reads such as `status`, `log`, `diff` and `rev-parse` stay allowed.
- **`git branch` and `git stash` are denied whole, reads included:** use `git rev-parse --abbrev-ref HEAD` and `git log -g refs/stash`. It's a guardrail, not a sandbox (it only sees commands starting with `git`; `git fetch . a:b` still moves a ref): the written rule governs.

## Formato de respuesta — cómo el usuario quiere que se le responda

Aplica a **todas** las respuestas al usuario en este repo. No aplica al código, a los comentarios ni a los mensajes de commit, que siguen las convenciones de sus propias secciones.

### Formato

1. **Secciones numeradas con TÍTULO EN MAYÚSCULAS.** Un tema por sección. Nunca prosa continua mezclando asuntos distintos.
2. **Empieza por la respuesta directa.** Si la respuesta es «no», que la primera palabra sea «no». El contexto va después.
3. **Tablas** para comparar opciones, listar estados o inventariar cosas. Se leen más rápido que un párrafo.
4. **⚠️ marca lo que tiene consecuencia para el usuario**: una decisión que le toca, un riesgo, un cambio incompatible, algo que debe ejecutar. En una frase, sin rodeos.
5. **Cerrar SIEMPRE con una sección de estado** que responda tres cosas: ¿estás bloqueado?, ¿necesitas algo de mí?, ¿necesitas algo de un tercero? El usuario no debería tener que preguntarlo. _Si solo sobreviviera una regla de esta lista, es esta._

### Verificación

6. **Verifica antes de afirmar.** Si dices que algo funciona, que un archivo contiene X o que un comando devuelve Y, compruébalo y enseña la salida. Nunca responder de memoria sobre hechos comprobables.
7. **Si no lo verificaste, dilo.** «No lo he comprobado» es aceptable; afirmarlo como cierto no.
8. **Distingue «hecho» de «desplegado» / «en efecto».** Terminar de construir algo no es que esté funcionando donde el usuario lo va a usar.

### Honestidad

9. **Di lo que NO funciona y lo que decidiste no hacer, con el motivo.** Un reporte que solo cuenta los aciertos obliga al usuario a descubrir el resto por su cuenta, normalmente tarde.
10. **Si te equivocaste, corrígelo en una o dos frases y sigue.** Sin disculpas largas ni autocrítica: el dato correcto, no el arrepentimiento.
11. **Si lo que se pide está mal planteado, dilo ANTES de construirlo.** Una objeción antes cuesta un mensaje; después cuesta rehacerlo.
12. **No adornes.** Si algo es un parche, llámalo parche. Si tiene un límite, nómbralo.

### Decisiones

13. **Con varias opciones, recomienda una** y explica por qué en una frase. Nunca un menú sin criterio.
14. **Separa lo que decides tú de lo que decide el usuario.** Negocio, coste y riesgo son suyos; las técnicas rutinarias son tuyas — tómalas y avisa, no preguntes cada una.
15. **No des por hecho la aprobación.** Si algo es difícil de revertir o sale hacia fuera, confírmalo antes.

### Longitud

16. **Completo, no extenso.** Cabe todo lo que importa; no cabe el relleno.
17. **No repitas lo ya dicho.** Ve a lo nuevo.

### Respuestas para terceros (cuando aplique)

Cuando la respuesta sea para otro equipo, envuélvela entre `====RESPUESTA PARA <EQUIPO>===` y `===FIN RESPUESTA PARA <EQUIPO>===`, y deja fuera de esos marcadores lo que sea solo para el usuario.

## Skills and development flows

Nine skills live in `.claude/skills/`. **Pick the level of the change before touching code** (full guide: [`docs/development-workflows.md`](docs/development-workflows.md)).

- **Trivial** — typo, docs, non-security config, dependency bump, a one-line bug with an obvious test → no skill: the change, its test if it has behaviour, the DoD.
- **Express** (default for features) — a feature or behavioural bug inside ONE existing bounded context, ≤ ~8 tasks, at most an additive migration → `/express`: ≤ 2 rounds of grouped questions → spec ≤ 150 lines with the case table and the contract → TDD, red by assertion → `pnpm test:mutation:changed` → `adversarial-review` → DoD.
- **Full** — a new bounded context; a change across contexts (facades, shared ports); a destructive migration; auth, credentials, tokens or permissions — their config included, even one line; > ~10 tasks; work someone else continues → `/brainstorming` → `writing-plans` (plan WITHOUT production code) → `executing-plans` in a new session, or `subagent-driven-development` only for ~10+ mostly independent tasks → `adversarial-review` → DoD.
- **Doubt between trivial and express → express; between express and full → ask the user, with your recommendation:** the full flow costs several times more (52.54 vs 11.82 USD, measured) and that's their call.
- **Every flow runs two checks** (each caught a real defect): every declared response is producible today, its contract-table row naming the input and code path («Endpoint documentation»), and every guard test fails without its protection («A test must fail without the fix»).
- **Skill descriptions say when each applies** (they load every session, so not repeated here). The reference skills — `clean-ddd-hexagonal` (its `references/NESTJS-MAPPING.md` is the source of truth for code shape), `nestjs-best-practices`, `javascript-typescript-jest` — are **read, never invoked**, only when needed: this file is enough for conventions.

## Modelo de colaboración — casos primero, TDD después, mutación como auditor

Definición vigente del modelo ([historia](docs/testing.md#modelo-de-colaboración)):

1. **Contrato:** la tabla «Casos acordados» de cada pieza con lógica en `domain/` o `application/` —casos puntuales más filas `P` de propiedad con `fast-check`— vive en la spec exprés o en cada tarea del plan; la propone la IA y el usuario la aprueba en bloque, con preguntas agrupadas.
2. **Ejecución (IA):** stub del SUT → tests en ROJO 1:1 con la tabla (el texto del `it` es el caso), **fallando por aserción** y no por «Cannot find module» → verde → refactor. **Prohibido implementar sin rojo previo.** Un caso nuevo se consulta, agrupado, nunca se añade en silencio; sin confirmación rutinaria antes de cada tarea (medido: no cambió nada).
3. **Validación:** `pnpm test:mutation:changed <base>`, `adversarial-review` y la DoD. El humano coteja tabla ↔ suite verde, el score y el informe de la revisión, sin leer el diff línea a línea.

- **La mutación es gate, no sugerencia:** `thresholds.break: 85` en `stryker.config.mjs` (racional en su cabecera) y job `mutation` en `ci.yml`; un módulo sin casos no entra en silencio ([historia](docs/testing.md#la-mutación-como-gate)).
- **Un módulo entero:** `pnpm test:mutation --mutate "src/modules/<context>/domain/**/*.ts,src/modules/<context>/application/**/*.ts"`. ⚠️ Sin llaves: `{domain,application}` da cero mutantes, un score `NaN` que pasa cualquier umbral y salida 0.
- **Infra, config, wiring y docs quedan exentas de la tabla;** el resto de convenciones de testing no cambia.
- **«Tabla D…R», «fila R11», «caso E5» o «spec §N» en `src/`** citan planes perdidos (backlog #29): no los busques; el caso vive en el texto del `it`.

## Architecture rules

Every bounded context lives under `src/modules/<context>/` with its layers inside, never at the root of `src/`; **`src/modules/users/` is the reference implementation** — copy its shape. Contexts: `users` (profiles), `auth` (credentials, tokens), `orders`, plus the flat `health` ([why](docs/architecture.md)).

Layers: `domain/` (entities, VOs, events, `ports/`, `errors/`; no `@nestjs/*`), `application/` (`@Injectable` OK, no ORM or HTTP clients; `use-cases/` + the facade), `infrastructure/` (the only one touching external libs: `http/`, `persistence/`, `messaging/`), `__tests__/` (mirrors them), `<context>.module.ts`.

- **Dependency rule — outer → inner only:** `domain/` imports nothing from `@nestjs/*`, ORMs, `axios`, `class-validator` decorators or `pino`.
- **Controllers are driver adapters in `infrastructure/http/` and call a use case, never a repository:** boundaries rule 6 bars `infrastructure/http/` from `domain/ports/*.repository.ts`, `infrastructure/persistence/**`, `typeorm` and `@nestjs/typeorm`; the module root wires port and adapter.
- **Two routes that can match one request abort the boot** (`routeConflictPolicy: { duplicate: 'error', shadow: 'error' }` in `NEST_APP_OPTIONS`, shared with `createTestApp()`; `shadow` is symmetric, see `main.spec.ts`): lowering `shadow` to `'warn'` is a knowing decision, not a fix.
- **Ports are `abstract class`, never `type` + `Symbol`:** one reference is type and injection token (`{ provide: UserRepository, useClass: UserTypeOrmRepository }`, no `@Inject`; no `Port` suffix, TypeORM's `Repository` stays inside the adapter):
  - **only public `abstract` members** — fields or parameter properties break object-literal fakes (`TS2741`); no `protected`/`private`, no constructor, not even an empty `protected` one (it never runs);
  - **adapters `implements`, never `extends`** — it's the only conformity check (`useClass` accepts any class);
  - **never `import type` a port in a file with decorators** — DI then fails at runtime with lint and typecheck green; `eslint.config.mjs` bans both shapes (declaration and inline specifier) from `ports/` and foreign `*.module` files under `src/modules/*/{application,infrastructure}/**`; decorator-free test fakes must `import type`.
- **Inline `type` is legal for a port's data** — `UserPage`, `FindUsersCriteria`, `SignedToken`, `TokenClaims`, `DirectoryUser`, `CreateProfileResult`, `UserSummary`: a **closed list in the lint rule**, failing closed, that grows by a reviewed line. A file importing only such data that can't go inline (`jwt-auth.guard.ts`, `authenticated-user.dto.ts`, `registered-account-response.dto.ts`) takes a justified `eslint-disable-next-line`, valid while it injects no port.
- **One use case per file, input included** (`CreateUserUseCase` + `export type CreateUserInput`): no `commands/`, `queries/` or `handlers/` (a command class bought a file and no invariant); the one public method is `execute()`; inputs are plain `type`s, never `class-validator` classes (boundaries rule 2 bans that library from `application/`); controllers call `execute({ … })`.
- **`users.facade.ts` stays loose in `application/`, outside `use-cases/`:** the context's public gate, not a user intention, it grows by method, not by file.
- **Validation lives in HTTP DTOs**, never in domain entities, which enforce invariants through constructors and value objects.
- **Two models, never one:** a plain domain entity, an ORM entity with the decorators, a mapper as the only bridge — never `@Entity` on the domain entity.
- **Domain errors are not HTTP errors:** the domain throws `UserNotFoundError` and `user-domain-exception.filter.ts` maps it to 404; never `HttpException` in `domain/` or `application/`.

## Auth

**Its own bounded context, owner of the credential** (`auth_credentials`; `users` knows no password). HS256 JWT via `@nestjs/jwt`; argon2id via `argon2`, its costs from one source shared by hasher and seed: `ARGON2_PARAMS` in `src/config/auth.config.ts` ([why](docs/architecture.md#auth)).

- **The dependency runs `auth → users` only** (`users.module.ts`'s `UsersLookup` and `UsersProvisioning`); the reverse would be the only possible module cycle, so `@Public`, `@Auth`, `@CurrentUser` and `AuthenticatedUser` live in `common/`.
- **Registration is `POST /auth/register`, never `POST /users`** (an account: profile and credential); `CreateUserUseCase` (`{ email, name }`) lives on behind the facade.
- **Two writes, compensated:** `RegisterAccountUseCase` hashes, creates the profile, then writes the credential; if that fails it deletes **both** rows — `deleteProfile` first (an orphan profile would block its email), then `credentials.deleteByUserId` — and re-throws (row R10 of `register-account.use-case.spec.ts` covers the commit-but-lost-response path; `auth.e2e-spec.ts` forces the second write to fail; backlog #14).
- **Zero foreign keys in the whole schema, never reintroduced:** the contexts may stop sharing a database.
- **A taken email answers 409 by written decision (an account holder must learn why sign-up fails), but its timing leak is closed:** the password is hashed **before** the uniqueness check, and row R11 of the same spec pins `hash()` once on both paths (backlog #15).
- **The provisioning gate returns results, never exceptions, for business rejections** (`auth` can't import `users`' errors): `{ ok: false, reason: 'email-taken' | 'invalid-profile' }`, the latter carrying the domain message so it stays a 400.
- **`JwtAuthGuard` is the global `APP_GUARD`, registered from `auth.module`** (boundaries rule 3): without `@Public()`, an endpoint requires a valid JWT.
- **`@Public()`** bypasses the guard (health, `POST /auth/register`, `POST /auth/login`; the two auth ones share a class-level 10/min `@Throttle`, counted per handler). **`@Auth(...roles)` is the single roles decorator** (`@Auth()` any authenticated user, `@Auth('admin')` that role, else 403) and attaches the OpenAPI docs the contract guard demands (bearer + 401, 403 with roles). **`@CurrentUser()`** injects the claims as `AuthenticatedUser` (`src/common/auth/authenticated-user.ts`) and throws on a `@Public()` route.
- **`JWT_SECRET` has no default outside `development`/`test`:** a `refine()` in `env.schema.ts` stops staging/production from booting without it.
- **`pnpm seed:admin` is idempotent: it creates the admin or leaves an existing one operational** (role `admin`, `active = true`, fresh hash — the rescue for a deactivated only-admin), both tables in one `dataSource.transaction` (`ON CONFLICT (user_id) DO UPDATE`). `ADMIN_EMAIL`/`ADMIN_PASSWORD` are both-or-none and accept only what login accepts; the password limits (12, 128) live only in `src/config/password-policy.ts`, tests aside (backlog #34).
- **Anti-enumeration login:** one `InvalidCredentialsError` for a missing email, a profile without credential, a wrong password and an inactive user, always with exactly one `hasher.verify()` (a pregenerated dummy hash if needed) so all four take the same time — property row L9 of `login.use-case.spec.ts`.
- **Email normalisation lives in `users`, once:** `findByEmail` uses `Email.from` and returns `null` for a malformed one (a typo is a 401, not a 400); `auth` passes the raw string.
- **`AuthenticatedUserDto` is a deliberate twin of `UserResponseDto`** (neither context can import the other's): `authenticated-user.dto.spec.ts` seals their `@ApiProperty` parity.

## Orders

Place an order (`POST /orders`, `@Auth()`; `customerId` from the token's `sub` via `@CurrentUser()`, never the body) and cancel it (`POST /orders/:id/cancel`, `@Auth()`, 200 with the order) ([why](docs/architecture.md#orders)).

- **Cross-module only through `users.module.ts`'s gates, split by intention** (backlog #13): the `CustomerDirectory` adapter injects `UsersLookup` (`userExists`, `findByEmail`); `UsersProvisioning` (`createProfile`, `deleteProfile`) is another token over `UsersFacadeImpl` (`useExisting`), so the type, not the path-based boundaries, keeps `deleteProfile` out of `orders`.
- **A deactivated user keeps a valid JWT until it expires:** `orders` re-checks the directory on every placement and cancellation and maps `CustomerGoneError` to 403 in its own filter (string-constructed, canonical message).
- **Domain events travel with the aggregate:** `place()` emits `OrderPlaced`, `cancel()` `OrderCancelled`; `save(order, events)` gets `pullEvents()` and writes order and outbox atomically; the payload is the event as-is (exact `toEqual`).
- **Cancellation is idempotent and owner-only:** cancelling a cancelled order is a no-op (200, original `cancelledAt`, no event; save only when events exist), and a foreign order is the same 404, same message, as a missing one, and **the owner goes into the read** (`findByIdAndCustomer`), never a later check: a corrupt foreign row would 500 in the fail-closed mapper and betray the order.
- **Optimistic version:** the aggregate carries the `version` it was read with (0 = new); INSERT at 1, `UPDATE … WHERE version = v`; 0 rows or an INSERT `23505` (only that code) → `OrderVersionConflictError`, outbox rolled back; `CancelOrderUseCase` retries once, on that error only (the double-click loser gets 200 with the winner's `cancelledAt`). No 409 is published (two states can't conflict twice); the filter maps it as a defence, declared once a third state makes it reachable. **The adapter asks for `READ COMMITTED` explicitly:** under REPEATABLE READ or SERIALIZABLE the loser gets a `40001` nobody retries.
- **The mapper fails closed** on an unknown `status`, a status contradicting `cancelled_at`, or `version` < 1; **`cancelledAt` is omitted, not `null`, on a placed order** — a choice; omitting a key is mandatory only where `nullable` would sit beside a `$ref` with no `type` (a nested DTO), which Ajv won't compile.
- **Transactional outbox:** order and `orders_outbox` rows in one `dataSource.transaction`; the relay is a CLI (`pnpm outbox:relay`, `src/database/outbox/`, since modules can't import `database`) that publishes at-least-once.

## Endpoint documentation — mandatory and verified

**Every new endpoint is documented in full:** `openapi-contract.e2e-spec.ts` (E2E: it compiles `AppModule`) walks every operation and **breaks the build** on anything missing; `UsersController` is the reference. Each operation declares `@ApiOperation` (unique `operationId`, non-empty `summary` **and** `description`); success via `@ApiEnvelope`/`@ApiPaginatedEnvelope` with an `example` of the full body, envelope included; `@ApiStandardErrors({ throttled, timeout })` (408, 429, 500); its own errors (`@ApiConflictResponse`, `@ApiNotFoundResponse`, `@ApiBadRequestResponse`…) typed, with `example`; `@ApiParam`/`@ApiQuery` with `description` **and** `example`; `@ApiBody` with one named example at least, two for interesting edge cases.

### Document what the endpoint really does, not what would be symmetric

The guard is bidirectional on purpose, because a declared-but-impossible response is the same defect as an undeclared one: _the published contract describes something the server does not do._ ([cases](docs/api-contract.md#lo-que-el-endpoint-hace-de-verdad))

- **400 only with `path`, `query` or `cookie` parameters, or a body;** documented headers don't count.
- **`throttled: false` with `@SkipThrottle()`, `timeout: false` with `@SkipTimeout()`:** the global `TimeoutInterceptor` answers 408 past `REQUEST_TIMEOUT_MS` though the operation may still commit (its description says so); `HealthController` skips both.
- **Every other status names the path that produces it:** the guard checks 400, 408 and 429 both ways and demands 401/403 where `@Auth` adds them; whether a 404, 409 or 403 outside roles is reachable depends on the code, so the spec's contract table gives each declared status its input or state and branch (no path, no declaration; a future-state defence is a code comment).
- **Bodyless responses (204, 304) need no example; error examples come from `buildErrorExample()`, never by hand** — it derives `error` from the status, where every drift appeared.
- **`errorCode` is the error envelope's one optional key,** emitted only when the `HttpException` carries one (none does yet, so `buildErrorExample()` omits it); the first endpoint to emit one documents it in its own example and updates the description of `ErrorResponseDto.errorCode` — no guard enforces either.

### Three checks, and none replaces another

Deleting one because «another covers it» leaves a hole ([incidents](docs/api-contract.md#tres-comprobaciones)):

1. **example ↔ factory** (`openapi-contract.e2e-spec.ts`) catches hand-written examples drifting from the factory; it's tautological for the factory itself.
2. **factory ↔ filter** (`error-example.factory.spec.ts`) runs real exceptions through `AllExceptionsFilter`: it catches the factory being wrong.
3. **example ↔ schema** (Ajv, in the contract guard) is the only one that would have caught the `array of arrays` that made `GET /users` unsatisfiable.

### Maintaining the Scalar bundle

- **Served from our own origin, never its CDN** — no `integrity` hash is possible, so it's the only way to know what runs (`scripts/copy-scalar-asset.mjs` → `public/`): upstream's bundle plus **one line of ours in front**, `ZOD_JITLESS_PRELUDE`, which stops Zod's `Function('')` probe (`scalar-bundle.spec.ts`: every eval probe of the installed bundle sits behind the `jitless` guard, so a breaking bump turns the Renovate PR red; `openapi.e2e-spec.ts`: the served bundle starts with it). **Review `@scalar/api-reference` quarterly** (self-hosting gives up the CDN's updates); a bump regenerates the content hash.
- **After a bump or an edit to `scripts/scalar-bundle.mjs`, run the [CSP checklist](docs/api-contract.md#mantener-el-bundle-de-scalar)** on `DOCS_ENABLED=true pnpm start:dev` (forced reload, cache off) and **expect zero** `Content Security Policy…` entries in DevTools' Issues tab, clean profile: any entry is a finding. Relax the CSP only for a step that functionally breaks — never `'unsafe-eval'` (see `docs-csp.ts`), `'wasm-unsafe-eval'` only if code samples fail; a harmless violation is neutralised at its source or recorded in `docs/backlog.md`, never left «expected» (Issues groups entries by type: the next one would hide behind it).

## Database

PostgreSQL through TypeORM; config in `src/config/database.config.ts`, wiring in `src/database/` ([details](docs/database.md)).

- **`synchronize` is resolved in code:** `DB_SYNCHRONIZE` can only turn it off; on also needs `NODE_ENV=development` (`resolveSynchronize()`), since it can drop columns and data.
- **Schema changes go through migrations** (`pnpm migration:generate src/database/migrations/<Name>`, then `pnpm migration:run`); `DB_MIGRATIONS_RUN=true` applies them on boot — read «Destructive migrations» before dropping or renaming anything.
- **ORM entities are found by glob** (`*.orm-entity.ts` under `src/modules/`), with no central list.
- **TLS:** `DB_SSL=true` against RDS; `DB_SSL_REJECT_UNAUTHORIZED=false` encrypts without verifying the server — prefer `DB_SSL_CA` with the AWS bundle.
- **Driver errors are translated in the adapter** (users: a concurrent insert's `23505` → `EmailAlreadyTakenError` → 409, not 500); the pre-check is a nicety, not the defence.

## Destructive migrations: expand/contract

**A migration that drops or renames a column or a table is split — expand, code deploy, contract — never in one release.** A template can't publish a rule its only example breaks: the worked example and its history are in [docs/database.md](docs/database.md#expandcontract-el-ejemplo-trabajado).

Additive migrations need none of this, but two rules apply (the suite sees neither; both break the deploy):

- **An added `NOT NULL` column carries a `DEFAULT`:** else `ADD COLUMN` fails on a table with rows, or old replicas' `INSERT`s fail on an empty one (example: `1790796856575-add-cancellation-to-orders.ts`).
- **Every `up()` and `down()` starts with `SET LOCAL lock_timeout = '5s'`:** `ALTER TABLE` takes `ACCESS EXCLUSIVE`, and an unbounded wait blocks the new pod and the table ([measured](docs/database.md#el-límite-de-espera-de-los-locks)); `migration-conventions.spec.ts` fails without it (those before `1790796856575` predate the rule).

**Expand** (`CREATE TABLE`/`ADD COLUMN`, indexes, the data copy, `DROP NOT NULL` on what new code stops writing — safe with old replicas serving) → **deploy** until no old replica remains → **contract** (the destructive statement alone: `DROP COLUMN`, `DROP TABLE`, a rename's second half — **not** safe with old replicas).

- **A column the new code stops writing loses its `NOT NULL` in the expand,** or the expand isn't survivable either.
- **The `down()` pair mirrors the split:** contract's re-adds the column nullable and refills it; expand's refills, restores the `NOT NULL`, drops the new table and, being the only one restoring a `NOT NULL`, holds the check naming unrestorable rows.
- **During the window each version misses what the other writes (new sign-ups can't log in on old replicas); when that's unaffordable, add a dual-write trigger.**
- ⚠️ **`DB_MIGRATIONS_RUN=true` runs migrations on the first new pod's boot, with old replicas still serving:** fine for an expand, fatal for a contract. Pick one and write it in the migration's header: **(1) contract in a later release** (recommended) or **(2) same release with `DB_MIGRATIONS_RUN=false`** and `pnpm migration:run` by hand after the rollout.
- **TypeORM names every mapped column in every `SELECT` and `INSERT`, never `SELECT *`:** a dropped column breaks every read of the table in old code ([measured](docs/database.md#por-qué-un-drop-column-rompe-todas-las-lecturas)).

## Config gotcha worth knowing

Why: [docs/toolchain.md](docs/toolchain.md#zod-4-y-la-configuración).

- **`env.schema.ts` emits scalars only:** every `registerAs` factory re-parses `process.env` and `@nestjs/config` writes back only `string | number | boolean`, silently dropping arrays and objects (the default applies); lists stay strings split with `splitList()` (guarded in `env.schema.spec.ts`).
- **Present-but-empty is not absent:** `.default()` fires only on `undefined`, so numeric fields use `rejectEmpty()` and `PORT=` fails instead of becoming `0`.

## Code conventions

Why: [docs/testing.md](docs/testing.md).

- **Code in English, prose in Spanish:** identifiers, object keys, file/folder names, env vars, config keys, SQL columns, `operationId` and form ids in English; comments, docs, OpenAPI `summary`/`description`, ESLint and operator messages in Spanish (`language-convention.spec.ts` checks identifiers, not strings). Exception: `env.schema.ts`/`validate-env.ts` messages stay English, shared with Zod's.
- **`type`, never `interface`** (`consistent-type-definitions`); a skill reference's `interface` is pseudocode — translate it. Ports are `abstract class`.
- **Path aliases** `@/` (→ `src/`), `@common/`, `@config/`, `@database/`, `@modules/`, `@shared/`, `@test/` (→ `test/`; shared test helpers go through it), kept in sync in `tsconfig.json`, `.swcrc` and `jest.config.mjs` (the E2E config inherits it).
- **Inside a module, import relatively:** it survives the module moving.
- **No barrels (`index.ts`) in `src/`: every import targets the concrete file, and across modules only `*.module.ts` is importable** — the 6 rules of `eslint.boundaries.js` and its suite `eslint-boundaries.spec.ts` are the only source (backlog #29).
- **Only the root of a `@nestjs/*` package is importable** (a patch can close subpaths, as `@nestjs/swagger` 11.4.3 did; `no-restricted-imports`, `import type` included): metadata keys are copied in `src/common/nest-metadata.constants.ts`, a missing type derives from an exported one, a deliberate subpath takes a justified `eslint-disable-next-line`; dynamic `import()` escapes it (`eslint-config.spec.ts`).
- **Type-only imports are explicit, inline** (`consistent-type-imports`): `import { ValidationPipe, type INestApplication }`.
- **Tests live in the module's `__tests__/`, mirroring it, so moving the module moves them:** unit `*.spec.ts`, E2E `*.e2e-spec.ts`; only shared helpers go in `test/helpers/` (via `@test/`).
- **`describe` in code, `it` in Spanish:** the root `describe` is the identifier, a nested one the method (`describe('cancel()')`) or a Spanish scenario; each `it` starts with `debería…`; file-local helpers go last, under `// Helpers`.
- **AAA: `// Arrange`, `// Act` and `// Assert` in every `it`, each on its own line, even if empty;** a throw is captured under `// Act` (`const act = () => …`) and asserted under `// Assert` — never a combined `// Act + Assert` (legacy: backlog #30).
- **One spec per source file (1:1),** same name and relative path; never several SUTs in one file. Logic-free ports (`domain/ports/`) are exempt; errors and events are not (Stryker mutates their messages and data).
- **Mocking by layer:** no mocks in `domain/`; hand-written port fakes in `application/`, never `jest.mock`; repositories against real PostgreSQL in E2E. Modules, TypeORM repositories, `data-source.ts`, seeds, the outbox CLI and migrations are out of unit coverage and `jest-e2e.config.mjs` measures them — **except `src/database/migrations/**`, which no suite measures** (backlog #17; [history](docs/testing.md#mocking-por-capa-y-cobertura)).
- **Shared fixtures:** module-wide in `<module>/__tests__/helpers/`, cross-cutting in `test/helpers/`; never copy a builder into several specs.
- **Property-based tests with `fast-check`** for VOs, pure functions and mapping round-trips; arbitraries are **constructed**, never `.filter()`-ed from `fc.string()`.
- **Each E2E `beforeEach` must `TRUNCATE`,** or the suite isn't repeatable (it runs on the test database, see Commands).
- **A test must fail without the fix.** Verify a regression test before trusting it ([cases](docs/testing.md#un-test-debe-fallar-sin-el-arreglo)); for a **guard test** (concurrency, ownership, authorization, atomicity, anti-enumeration, idempotency) it's mandatory: remove the protection, see it fail by assertion, restore it.
- **Conventional Commits with a closed scope list** (`commitlint.config.cjs`): a new bounded context adds its scope there.
- **Pre-commit scans secrets:** `secretlint` checks every staged file (`.secretlintrc.json`, `secretlint.spec.ts`); a detected secret blocks the commit.

## Deferred work

`docs/backlog.md` is the issue tracker, even with a remote (an issue title can't carry its reasoning): work postponed **with a decision attached** (what happens, the approach chosen, how you'll know it's done) and what was closed by verifying it. **Read the entry before reopening the discussion.**
