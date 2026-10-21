# _nest-base-template

Production-ready NestJS 12 base template, hexagonal/DDD. History, measurements and worked examples live in `docs/` (backlog #32); this file overrides them.

## Stack

NestJS 12 · TypeScript 6.0 · Node 24.22.0+ · pnpm 12 · SWC · Jest 30 · Supertest · Pino 10 · Zod 4 · class-validator 0.15 · TypeORM 1 · PostgreSQL 18 · Scalar 1.72

Why: [docs/toolchain.md](docs/toolchain.md).

- **`@nestjs/swagger` generates the OpenAPI document, Scalar renders it;** our own names (config, env vars, files) say `docs`/`openapi`.
- **pnpm only** (version in `packageManager`; older global pnpm: `corepack pnpm …`). Its settings (`overrides`, `allowBuilds`) go in `pnpm-workspace.yaml`: pnpm 11+ silently ignores the `pnpm` key of `package.json`.
- **An override replaces upstream's rule entirely;** retiring a CVE one is safe only because CI runs `pnpm audit --prod --audit-level=high` (backlog #6). The `typescript` one stays scoped to `'@nestjs/cli>typescript'` and moves with the devDependency (`toolchain-pins.spec.ts`).
- **NestJS 12 is ESM-only and this repo CJS: run tests only through `pnpm test*`;** a bare `npx jest` dies with `Must use import to load ES Module` (backlog #27).
- **`src/main.ts` alone owns SIGTERM/SIGINT** (`app.close(signal)`, `process.exit(128 + n)`, a second signal ignored): never `enableShutdownHooks()` (pino never flushes) nor `useProcessExit` (143 becomes 0). CI's «Smoke de arranque», not Jest, asserts the 143.
- **Zod 4 gotcha:** after `.transform()` use `.prefault()` (an input value; the pipeline runs), never `.default()` (the output type; it short-circuits).

## Commands

```bash
pnpm typecheck # tsc --noEmit
pnpm lint:check # eslint; pnpm lint applies --fix
pnpm format:check # prettier, NOT over docs/: pnpm exec prettier --check docs/<file>.md
pnpm test # unit, *.spec.ts under src/
pnpm test:e2e # *.e2e-spec.ts, needs the DB up
pnpm test:mutation # Stryker over domain/ + application/ (CI gate, break: 90)
pnpm test:mutation:changed [base] # only what changed since base (default: merge-base with main)
pnpm build # nest build (SWC); pnpm start:dev watches
pnpm db:up # postgres, blocks until healthy; pnpm db:down stops it
pnpm db:reset # drop the volume, migrate BOTH databases
pnpm db:migrate:test # migrate nest_base_template_test, which E2E needs
pnpm migration:run # pnpm migration:revert rolls back the last one
pnpm migration:generate src/database/migrations/<Name> # diff entities vs schema
```

**Definition of Done** (any change beyond docs): `typecheck` → `lint:check` → `format:check` → `test` → `test:e2e` → `build`, all green. E2E uses `nest_base_template_test` (forced by `test/setup-env.ts`), which **`docker/initdb/` creates but never migrates:** on a fresh clone run `pnpm db:migrate:test` first, or it dies with `relation "auth_credentials" does not exist` (backlog #18).

## Git policy — never commit on the user's behalf

- **Agents never run a git command that writes history, moves `HEAD` or a ref, touches the index or discards work (`commit`, `add`, `push`, `tag`, `rebase`…), not even when asked, subagents and Workflow agents included.** When a commit seems due, suggest it and stop: _"Te sugiero hacer un commit de los cambios por &lt;razón&gt;. Avísame y lo redacto."_
- **`.claude/settings.json` enforces it** (`claude-settings.spec.ts`; [details](docs/development-workflows.md#10-git-quién-hace-los-commits)), a guardrail and not a sandbox: the written rule governs. **`git branch` and `git stash` are denied whole, reads included:** use `git rev-parse --abbrev-ref HEAD` and `git log -g refs/stash`.

## Formato de respuesta

Para toda respuesta al usuario; no para lo que un subagente devuelve a la sesión ni para una salida que lee un script.

1. **Secciones numeradas con TÍTULO EN MAYÚSCULAS,** un tema por sección.
2. **Primero la respuesta directa:** si es «no», la primera palabra es «no».
3. **Tablas** para comparar opciones, listar estados o inventariar.
4. **⚠️ marca lo que tiene consecuencia para el usuario** (una decisión suya, un riesgo, un cambio incompatible, algo que debe ejecutar), en una frase.
5. **Cierra SIEMPRE con una sección de estado:** ¿estás bloqueado?, ¿necesitas algo de mí?, ¿y de un tercero? _Si solo sobreviviera una regla, es esta._
6. **Verifica antes de afirmar** y enseña la salida; nunca de memoria.
7. **Si no lo verificaste, dilo:** «no lo he comprobado» vale; afirmarlo, no.
8. **Distingue «hecho» de «desplegado» o «en efecto».**
9. **Di lo que NO funciona y lo que decidiste no hacer, con el motivo.**
10. **Si te equivocaste, corrígelo en una o dos frases y sigue.**
11. **Si lo pedido está mal planteado, dilo ANTES de construirlo.**
12. **No adornes:** un parche se llama parche; un límite se nombra.
13. **Con varias opciones, recomienda una** y di por qué en una frase.
14. **Separa lo que decides tú de lo que decide el usuario:** negocio, coste y riesgo son suyos; lo técnico rutinario lo decides y avisas.
15. **No des por hecha la aprobación** de lo difícil de revertir o de lo que sale hacia fuera.
16. **Completo, no extenso.**
17. **No repitas lo ya dicho.**

Para otro equipo, entre `====RESPUESTA PARA <EQUIPO>===` y `===FIN RESPUESTA PARA <EQUIPO>===`; lo que es solo para el usuario, fuera.

## Flujo de trabajo

Elige el nivel antes de tocar código; ante la duda, pregunta con tu recomendación ([mediciones](docs/development-workflows.md)).

- **Directo** (por defecto, sin skill): errata, docs, config que no es de seguridad, un bump o un bug cuyo comportamiento correcto ya está decidido (lo dice un `it`, la doc o el contrato), aunque esté en `domain/`, si no toca la lista de riesgo. Si cambia el comportamiento, test primero en rojo por aserción; mientras, `pnpm typecheck && pnpm test`; al cerrar, la DoD, o con solo docs, `format:check`, `prettier --check` de los `docs/*.md` tocados y `pnpm test`. `adversarial-review`, a petición.
- **[`/feature`](.claude/skills/feature/SKILL.md)** si hay comportamiento que decidir (un endpoint o caso de uso nuevo, una regla nueva o cambiada en `domain/` o `application/`, una migración) o algo de la lista de riesgo: auth, credenciales, tokens o permisos (su config incluida, aunque sea una línea), un cambio entre contextos, una migración destructiva, un contexto nuevo. Los pasos están en el skill.
- **En todo flujo,** cada test de guarda falla sin su protección y cada respuesta declarada tiene hoy un camino que la produce.
- **`docs/nestjs-mapping.md` es la fuente de verdad de la forma del código;** lee solo la sección que necesitas.
- **Mutación** (gate de CI, `break: 90`) de un módulo entero: `pnpm test:mutation --mutate "src/modules/<context>/domain/**/*.ts,src/modules/<context>/application/**/*.ts"`. ⚠️ Sin llaves: `{domain,application}` da cero mutantes, un score `NaN` que pasa cualquier umbral y salida 0.
- **«Tabla D…R», «fila R11», «caso E5» o «spec §N» en `src/`** citan planes perdidos (backlog #29): no los busques; el caso vive en el texto del `it`.

## Sesiones

- **Una tarea por sesión;** `/clear` entre tareas sin relación, y también tras corregir lo mismo dos veces: el contexto ya arrastra el error.
- **Una spec o una porción terminada se ejecuta en una sesión nueva.**
- **La investigación amplia va a un subagente.**
- **Sin plan si el diff cabe en una frase.**

## Architecture rules

Each bounded context lives in `src/modules/<context>/` with `domain/`, `application/` (use cases and the facade), `infrastructure/` (the only layer touching external libs) and `__tests__/`; **`src/modules/users/` is the reference implementation** ([why](docs/architecture.md)).

- **Dependency rule — outer → inner only, enforced by `eslint.boundaries.js`** (its 6 rules and `eslint-boundaries.spec.ts` are the only source): controllers call a use case, never a repository (rule 6).
- **Two routes that can match one request abort the boot** (`routeConflictPolicy`, `main.spec.ts`): lowering `shadow` to `'warn'` is a knowing decision, not a fix.
- **Ports are `abstract class`, never `type` + `Symbol`:** the class is type and token (`{ provide: UserRepository, useClass: UserTypeOrmRepository }`, no `@Inject`, no `Port` suffix). Only public `abstract` members (a field or parameter property breaks object-literal fakes with `TS2741`; no constructor); adapters `implements`, never `extends` (`useClass` checks nothing). **Never `import type` a port in a file with decorators:** DI fails at runtime with lint and typecheck green (`eslint.config.mjs` bans it; decorator-free fakes must `import type`).
- **Inline `type` is legal for a port's data** on the lint rule's closed list, which grows by a reviewed line; a file importing only such data takes a justified `eslint-disable-next-line` while it injects no port.
- **One use case per file, input included** (`CreateUserUseCase` + `export type CreateUserInput`): no `commands/`, `queries/` or `handlers/`, one public `execute()`, plain `type` inputs, never `class-validator` classes (boundaries rule 2). `users.facade.ts` stays loose in `application/` and grows by method.
- **Validation lives in HTTP DTOs;** entities guard invariants in constructors and VOs. **Two models:** a domain entity, an ORM entity with the decorators and a mapper between them.
- **Module contract over the kernel (`src/shared/domain/`), verified by `module-contract.spec.ts`** ([why](docs/architecture.md#el-contrato-de-módulo)): `abstract class <X>DomainError extends DomainError {}`; aggregates extend `Entity<TId>` or `AggregateRoot<TId, TEvent>`, call `touch(now)` only from intention methods after their no-op guard and never redeclare `id`, `createdAt` or `updatedAt` (a parameter property compiles silently); ids are `class <X>Id extends UuidIdentifier<'<X>Id'>`; another context's id stays a `string`.
- **Domain errors are not HTTP errors:** never `HttpException` in `domain/` or `application/`; each context maps them in `<context>-domain-exception.filter.ts` (first match wins, unmapped → 400). **A corrupt row is a 500 through `failClosed`,** never a 400 carrying the value; `auth` sanitises it in its own filter.

## Auth

**Owner of the credential** (`auth_credentials`; `users` knows no password): HS256 JWT, argon2id with `ARGON2_PARAMS` (`src/config/auth.config.ts`) shared by hasher and seed ([why](docs/architecture.md#auth)).

- **`auth → users` only,** through `UsersLookup` and `UsersProvisioning`; the reverse would be a module cycle, so `@Public`, `@Auth`, `@CurrentUser` and `AuthenticatedUser` live in `common/`.
- **Registration is `POST /auth/register`, never `POST /users`.** Two writes, compensated: if the credential fails, delete the profile first (an orphan blocks its email), then the credential, and re-throw (backlog #14).
- **Zero foreign keys in the whole schema, never reintroduced** (`migration-conventions.spec.ts`, the contract's `orm-relations` key).
- **A taken email is a 409 by decision, and the password is hashed before the uniqueness check** so both paths cost the same (backlog #15).
- **The provisioning gate returns `{ ok: false, reason }`, never exceptions** (`auth` can't import `users`' errors); `invalid-profile` stays a 400.
- **`JwtAuthGuard` is the global `APP_GUARD`: without `@Public()` an endpoint needs a JWT** (public: health, register and login, the last two at 10/min per handler). **`@Auth(...roles)` is the only roles decorator** and adds the OpenAPI docs the guard demands; `@CurrentUser()` throws on a `@Public()` route.
- **`JWT_SECRET` has no default outside `development`/`test`** (`env.schema.ts`).
- **`pnpm seed:admin` is idempotent:** it creates the admin or makes it operational again (active, fresh hash and v4 credential id). `ADMIN_EMAIL`/`ADMIN_PASSWORD` are both-or-none; the password limits live only in `src/config/password-policy.ts` (backlog #34).
- **Anti-enumeration login:** one `InvalidCredentialsError` for a missing email, no credential, a wrong password or an inactive user, always with exactly one `hasher.verify()` (`login.use-case.spec.ts`).
- **Email normalisation lives in `users`:** `findByEmail` returns `null` for a malformed email (a 401, not a 400); `auth` passes the raw string.
- **`AuthenticatedUserDto` is a deliberate twin of `UserResponseDto`** (`authenticated-user.dto.spec.ts`).

## Orders

`POST /orders` and `POST /orders/:id/cancel`, both `@Auth()`; `customerId` is the token's `sub`, never the body ([why](docs/architecture.md#orders)).

- **Only through `users.module.ts`'s gates, split by intention** (backlog #13): `CustomerDirectory` gets `UsersLookup`; `UsersProvisioning` is another token, so the type keeps `deleteProfile` out of `orders`.
- **A deactivated user keeps a valid JWT until it expires:** every placement and cancellation re-checks the directory (`CustomerGoneError` → 403).
- **Events travel with the aggregate:** `place()` emits `OrderPlaced`, `cancel(now)` `OrderCancelled`; `save(order, events)` writes order and `orders_outbox` in one transaction. The relay is a CLI (`pnpm outbox:relay`), at-least-once.
- **Cancellation is idempotent and owner-only:** a second cancel is a no-op (200, original `cancelledAt`, no event, no save); a foreign order is the same 404 as a missing one, and **the owner goes into the read** (`findByIdAndCustomer`): a later check would let a corrupt foreign row 500 in the mapper and betray the order.
- **Optimistic version:** INSERT at 1, `UPDATE … WHERE version = v`; 0 rows or an INSERT `23505` (only that code) → `OrderVersionConflictError`, outbox rolled back, and `CancelOrderUseCase` retries once. No 409 is published (unreachable with two states). **The adapter asks for `READ COMMITTED`:** under REPEATABLE READ or SERIALIZABLE the loser gets a `40001` nobody retries.
- **The mapper fails closed** on an unknown `status`, a status contradicting `cancelled_at` or `version` < 1. **`cancelledAt` is omitted, not `null`, on a placed order;** omission is mandatory only where `nullable` would sit beside a `$ref`, which Ajv won't compile.

## Endpoint documentation — mandatory and verified

**Every endpoint is documented in full, `UsersController` being the reference: `openapi-contract.e2e-spec.ts` breaks the build on anything missing.**

### Document what the endpoint really does

A declared-but-impossible response is as wrong as an undeclared one ([cases](docs/api-contract.md#lo-que-el-endpoint-hace-de-verdad)):

- **The guard checks 400, 408 and 429 both ways** (400 only with path, query or cookie parameters or a body; `throttled: false` with `@SkipThrottle()`, `timeout: false` with `@SkipTimeout()`) and demands 401/403 where `@Auth` adds them.
- **Nothing checks a 404, a 409 or a 403 outside roles: declare one only with the input and branch that produce it today;** a future-state defence is a code comment.
- **Error examples come from `buildErrorExample()`, never by hand;** bodyless responses (204, 304) need none. `errorCode` is emitted by no endpoint yet: the first one documents it in its example and drops «not used yet» from `ErrorResponseDto.errorCode` (no guard checks it).

### Three checks, and none replaces another

**example ↔ factory** (`openapi-contract.e2e-spec.ts`), **factory ↔ filter** (`error-example.factory.spec.ts`) and **example ↔ schema** (Ajv, the only one that caught the unsatisfiable `GET /users`): dropping one because «another covers it» leaves a hole ([incidents](docs/api-contract.md#tres-comprobaciones)).

### Maintaining the Scalar bundle

- **Served from our origin, never its CDN** (no `integrity` hash is possible), with our `ZOD_JITLESS_PRELUDE` line in front (`scalar-bundle.spec.ts`). **Review `@scalar/api-reference` quarterly.**
- **After a bump or an edit to `scripts/scalar-bundle.mjs`, run the [CSP checklist](docs/api-contract.md#mantener-el-bundle-de-scalar): zero `Content Security Policy…` entries in DevTools' Issues tab.** Never `'unsafe-eval'`; `'wasm-unsafe-eval'` only if code samples fail; a harmless violation is fixed at its source or logged in `docs/backlog.md`, never left «expected».

## Database

PostgreSQL through TypeORM ([details](docs/database.md)).

- **`synchronize` also needs `NODE_ENV=development`** (`resolveSynchronize()`; `DB_SYNCHRONIZE` can only turn it off): it can drop data.
- **Schema changes go through migrations;** outside `development`, `DB_MIGRATIONS_RUN=true` applies them on boot (read «Destructive migrations» first). CI's «Schema drift» step fails if entities and schema disagree.
- **The domain owns the dates:** `@Column({ type: 'timestamptz', default: () => 'now()' })`, never `CreateDateColumn`, `UpdateDateColumn`, `DeleteDateColumn` or `VersionColumn` (the contract's `orm-managed-columns` key), whatever generic NestJS material teaches.
- **New tables: multi-word columns in snake_case with an explicit `name:`;** the camelCase dates of `users` and `auth_credentials` stay (a rename is destructive).
- **ORM entities load by glob** (`*.orm-entity.ts`): no central list.
- **TLS:** `DB_SSL=true` against RDS with `DB_SSL_CA` (the AWS bundle); `DB_SSL_REJECT_UNAUTHORIZED=false` doesn't verify the server.
- **Driver errors are translated in the adapter** (`23505` → `EmailAlreadyTakenError` → 409, not 500); the pre-check is a nicety, not the defence.

## Destructive migrations: expand/contract

**A migration that drops or renames a column or a table is split — expand, deploy, contract — never in one release** ([worked example](docs/database.md#expandcontract-el-ejemplo-trabajado)). Every migration, additive included, follows two deploy-breaking rules:

- **An added `NOT NULL` column carries a `DEFAULT`,** or `ADD COLUMN` fails on a table with rows and old replicas' `INSERT`s fail on an empty one; no test sees it.
- **Every `up()` and `down()` starts with `SET LOCAL lock_timeout = '5s'`:** `ALTER TABLE` takes `ACCESS EXCLUSIVE`, and an unbounded wait blocks the new pod and the table (`migration-conventions.spec.ts`).

**Expand** (new tables and columns, indexes, the data copy, `DROP NOT NULL` on what new code stops writing) → **deploy** until no old replica remains → **contract** (the destructive statement alone, unsafe with old replicas).

- **The `down()` pair mirrors the split:** contract's re-adds the column nullable and refills it; expand's refills, restores the `NOT NULL`, drops the new table and holds the check naming unrestorable rows.
- **During the window each version misses what the other writes;** if that's unaffordable, add a dual-write trigger.
- ⚠️ **`DB_MIGRATIONS_RUN=true` migrates on the first new pod's boot, with old replicas serving:** fine for an expand, fatal for a contract. Write the choice in the migration's header: **(1) contract in a later release** (recommended) or **(2) same release with `DB_MIGRATIONS_RUN=false`** and `pnpm migration:run` after the rollout.
- **TypeORM names every mapped column in every `SELECT` and `INSERT`:** a dropped column breaks every read in old code.

## Config gotcha worth knowing

- **`env.schema.ts` emits scalars only:** `@nestjs/config` silently drops arrays and objects (the default applies), so lists stay strings, split with `splitList()` in the `registerAs` factory ([why](docs/toolchain.md#zod-4-y-la-configuración)).
- **Present-but-empty is not absent:** `.default()` fires only on `undefined`, so numeric fields use `rejectEmpty()` and `PORT=` fails instead of becoming `0`.

## Code conventions

Why: [docs/testing.md](docs/testing.md).

- **Code in English, prose in Spanish** (comments, docs, OpenAPI `summary`/`description`, lint and operator messages; `language-convention.spec.ts`); `env.schema.ts`/`validate-env.ts` messages stay English, sharing strings with Zod.
- **The lint enforces** `type` over `interface` (generic DDD `interface` is pseudocode), inline type imports, no barrels, cross-module imports only of `*.module.ts`, and only the root of a `@nestjs/*` package (metadata keys live in `src/common/nest-metadata.constants.ts`; a dynamic `import()` escapes the rule).
- **Path aliases** (`@/`, `@common/`, `@test/`…) stay in sync in `tsconfig.json`, `.swcrc`, `jest.config.mjs` and `scripts/mutation-targets.mjs`; inside a module, import relatively.
- **Tests mirror the module in its `__tests__/`, one spec per source file;** logic-free ports are exempt, errors and events are not (Stryker mutates them).
- **`describe` in code, `it` in Spanish starting with `debería…`;** file-local helpers last, under `// Helpers`.
- **AAA: `// Arrange`, `// Act` and `// Assert` in every `it`, each on its own line, even if empty;** a throw is captured in `// Act` (`const act = () => …`), never `// Act + Assert` (`aaa-convention.spec.ts`; backlog #30).
- **Mocking by layer:** no mocks in `domain/`; hand-written port fakes in `application/`, never `jest.mock`; repositories against real PostgreSQL in E2E. No suite measures `src/database/migrations/**` (backlog #17).
- **Shared fixtures:** module-wide in `<module>/__tests__/helpers/`, cross-cutting in `test/helpers/` (via `@test/`); never copy a builder into several specs.
- **`fast-check`** for VOs, pure functions and mapping round-trips, with **constructed** arbitraries, never `.filter()`-ed.
- **Each E2E `beforeEach` must `TRUNCATE`.**
- **A test must fail without the fix;** for a guard test (concurrency, ownership, authorization, atomicity, anti-enumeration, idempotency) it's mandatory: remove the protection, see it fail by assertion, restore it ([cases](docs/testing.md#un-test-debe-fallar-sin-el-arreglo)).
- **Conventional Commits** with `commitlint.config.cjs`'s closed scope list (a new context adds its own).

## Deferred work

`docs/backlog.md` is the issue tracker, even with a remote: postponed work with its decision attached, and what was closed by verifying it. **Read the entry before reopening a discussion.**
