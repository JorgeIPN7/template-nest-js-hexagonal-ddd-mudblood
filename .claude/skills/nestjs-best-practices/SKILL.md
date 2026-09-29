---
name: nestjs-best-practices
description: NestJS best practices and architecture patterns for building production-ready applications, aligned with NestJS 12 (ESM-only packages loaded from CommonJS through require(esm) on Node 20.19+ / 22.12+, 24 LTS recommended; lifecycle hooks by hierarchy level with allSettled termination; one owner of the shutdown signals; Standard Schema config; Terminus HealthIndicatorService; errorCode; built-in CSRF and security headers since 12.1) plus the v11 changes it keeps (Express v5 / Fastify v5, cache-manager v6+ / Keyv, BullMQ WorkerHost). This skill should be used when writing, reviewing, or refactoring NestJS code to ensure proper patterns for modules, dependency injection, security, and performance.
allowed-tools: Read, Grep, Glob
---

# NestJS Best Practices

Comprehensive best practices guide for NestJS applications. Contains **45 rules across 10 categories**, prioritized by impact to guide automated refactoring and code generation. Updated for **NestJS 12** (checked against the 12.1.0 packages).

## When to Apply

Reference these guidelines when:

- Writing new NestJS modules, controllers, or services
- Implementing authentication and authorization
- Reviewing code for architecture and security issues
- Refactoring existing NestJS codebases
- Optimizing performance or database queries
- Building microservices architectures
- **Migrating from NestJS 11 → 12** (see "NestJS 12 changes" below)

## NestJS 12 changes worth knowing

These cross-cutting v12 changes are referenced by individual rules where relevant:

- **Every `@nestjs/*` package ships as ESM only.** A CommonJS app keeps working because Node loads them through `require(esm)`, which is unflagged only from **Node.js 20.19 and 22.12**. That is the real floor, not `@nestjs/core`'s `engines` (`>= 20`), and the ecosystem is often stricter (`nestjs-pino` 5 `>=22.12.0`; the CLI's `@nestjs/schematics` `^22.22.3 || ^24.15.0 || >=26.0.0`). Node 20 is EOL since 2026-04-30: pick the **24.x LTS** (`devops-node-version`).
- **Jest in a CommonJS project needs Node 24.9+ and `--experimental-vm-modules`** (`node --experimental-vm-modules node_modules/jest/bin/jest.js`), plus Jest ≥ 30.5; a bare `npx jest` fails with `Must use import to load ES Module`. Vitest is the default for ESM projects. Import Supertest with a default import (`test-use-testing-module`, `test-e2e-supertest`, `test-mock-external-services`).
- **Lifecycle hooks run by hierarchy level**, also inside a module: a provider's `onModuleInit` waits for the providers it depends on. Termination hooks walk the levels in reverse and settle with **`Promise.allSettled`**, so a failing hook is only logged and `app.close()` still resolves; init hooks keep `Promise.all` and fail fast (`perf-async-hooks`).
- **One owner of the shutdown signals.** `enableShutdownHooks()` runs the shutdown and then re-raises the signal (`process.kill`, exit 143), or calls `process.exit(0)` with `{ useProcessExit: true }`. A `process.on(signal)` of your own next to it races it. Either your handler owns the signal (`process.on` + a shutting-down guard, `close(signal)` + `process.exit(128 + n)`) or Nest does. `return503OnClosing: true` answers 503 to new requests until the HTTP server stops listening, while in-flight ones finish (`devops-graceful-shutdown`).
- **Route conflict diagnostics** are opt-in: `routeConflictPolicy` (`duplicate` / `shadow`) and `routeResolutionStrategy: 'specificity'` catch `/users/me` being shadowed by `/users/:id` (`api-versioning`).
- **`@nestjs/config` validates with Standard Schema** (Zod, Valibot, ArkType, …). Joi needs v18+ and its options move to `validationOptions.libraryOptions` (`devops-use-config-module`).
- **Terminus 12 removed the legacy indicator API** (`HealthIndicator`, `HealthCheckError`): inject `HealthIndicatorService`, return `up()` / `down()` / `degraded()`. A check answers `503 shutting_down` from `beforeApplicationShutdown` on (`micro-use-health-checks`).
- **`HttpException` accepts `errorCode`**, serialized into the body when the first argument is a string, an array or a number (an object response is kept as-is, so only `exception.errorCode` carries it); a custom filter that rebuilds the body must copy `exception.errorCode` (`error-throw-http-exceptions`, `error-use-exception-filters`).
- **`ConsoleLogger` treats plain objects after the message as structured params** of the same entry (`params`, or flattened with `flattenParams`). Log errors inside an object, not as extra positional arguments (`devops-use-logging`, `error-handle-async-errors`).
- **Since 12.1: built-in `app.enableCsrfProtection()` and `app.useSecurityHeaders()`** (`security-csrf-protection`, `security-use-helmet`).
- **Ecosystem packages follow the major:** install `@nestjs/cache-manager`, `@nestjs/bullmq` and `@nestjs/axios` **12.x**. The previous lines declare peers up to `^11` only. `@nestjs/throttler` stays on 6.x (CommonJS, peers include `^12`) and has no `getLimit()` hook: pass `limit` as a function (`perf-use-caching`, `micro-use-queues`, `test-mock-external-services`, `security-rate-limiting`). BullMQ 6 moved repeating jobs to `Queue.upsertJobScheduler()`. TypeORM 1 (accepted by `@nestjs/typeorm` 12) only takes the object form of `select` / `relations` (`db-avoid-n-plus-one`, `perf-optimize-database`).
- **Reflector typing:** `getAllAndOverride<T>()` is typed `T` but returns `undefined` at runtime when no target carries the metadata. Write `T | undefined` yourself. `getAllAndMerge()` returns the object itself for a single object entry (`security-use-guards`).

## Still true from NestJS 11

- **Node.js 16 and 18 are unsupported** (both EOL); v12 raises the floor further (above).
- **Express v5 by default** (`path-to-regexp` v8): middleware routes use named wildcards (`*splat`, `{*splat}`). Neither `'*splat'` nor `'api/*splat'` matches the bare root or prefix. Use `'api{/*splat}'` to cover `/api` too (`api-middleware-wildcards`).
- **Fastify v5** in `@nestjs/platform-fastify`.
- **Cache module on Keyv** (`cache-manager` v6+): `redisStore` removed, use `stores: [new KeyvRedis(...)]` (`perf-use-caching`).
- **BullMQ uses `WorkerHost`**: the legacy `@Process('name')` decorator does not exist in `@nestjs/bullmq` (`micro-use-queues`).
- **Termination hooks run in reverse order** of initialization. In v12 this happens per hierarchy level (`perf-async-hooks`, `devops-graceful-shutdown`).
- **Logger `fatal` level and native JSON output in `ConsoleLogger`** (`devops-use-logging`).

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Architecture | CRITICAL | `arch-` |
| 2 | Dependency Injection | CRITICAL | `di-` |
| 3 | Error Handling | HIGH | `error-` |
| 4 | Security | HIGH | `security-` |
| 5 | Performance | HIGH | `perf-` |
| 6 | Testing | MEDIUM-HIGH | `test-` |
| 7 | Database & ORM | MEDIUM-HIGH | `db-` |
| 8 | API Design | MEDIUM | `api-` |
| 9 | Microservices | MEDIUM | `micro-` |
| 10 | DevOps & Deployment | LOW-MEDIUM | `devops-` |

## Quick Reference

### 1. Architecture (CRITICAL)

- `arch-avoid-circular-deps` - Avoid circular module dependencies
- `arch-feature-modules` - Organize by feature, not technical layer
- `arch-module-sharing` - Proper module exports/imports, avoid duplicate providers
- `arch-single-responsibility` - Focused services over "god services"
- `arch-use-repository-pattern` - Abstract database logic for testability
- `arch-use-events` - Event-driven architecture for decoupling

### 2. Dependency Injection (CRITICAL)

- `di-avoid-service-locator` - Avoid service locator anti-pattern
- `di-durable-providers` - Use durable providers for multi-tenant request scope
- `di-interface-segregation` - Interface Segregation Principle (ISP)
- `di-liskov-substitution` - Liskov Substitution Principle (LSP)
- `di-prefer-constructor-injection` - Constructor over property injection
- `di-scope-awareness` - Understand singleton/request/transient scopes
- `di-use-interfaces-tokens` - Use injection tokens for interfaces

### 3. Error Handling (HIGH)

- `error-use-exception-filters` - Centralized exception handling (propagate v12 `errorCode`)
- `error-throw-http-exceptions` - Use NestJS HTTP exceptions (v12 `errorCode`)
- `error-handle-async-errors` - Handle async errors properly (one log entry per error)

### 4. Security (HIGH)

- `security-auth-jwt` - Secure JWT authentication
- `security-csrf-protection` - Protect cookie-authenticated endpoints from CSRF (built-in `enableCsrfProtection()` since 12.1)
- `security-rate-limiting` - Implement rate limiting (`limit` as a function, `trust proxy` behind a load balancer)
- `security-sanitize-output` - Prevent XSS attacks
- `security-use-guards` - Authentication and authorization guards (type Reflector results as `T | undefined`)
- `security-use-helmet` - Default security headers (Helmet, or built-in `useSecurityHeaders()` since 12.1)
- `security-validate-all-input` - Validate with class-validator

### 5. Performance (HIGH)

- `perf-async-hooks` - Proper async lifecycle hooks (v12 hierarchy levels, `allSettled` termination)
- `perf-use-caching` - Implement caching strategies (`@nestjs/cache-manager` 12.x on Keyv)
- `perf-optimize-database` - Optimize database queries
- `perf-lazy-loading` - Lazy load modules for faster startup

### 6. Testing (MEDIUM-HIGH)

- `test-use-testing-module` - Use NestJS testing utilities (Jest on v12: Node 24.9+ and `--experimental-vm-modules`)
- `test-e2e-supertest` - E2E testing with Supertest (default import)
- `test-mock-external-services` - Mock external dependencies

### 7. Database & ORM (MEDIUM-HIGH)

- `db-use-transactions` - Transaction management
- `db-avoid-n-plus-one` - Avoid N+1 query problems (object-form `relations` for TypeORM 1)
- `db-use-migrations` - Use migrations for schema changes

### 8. API Design (MEDIUM)

- `api-middleware-wildcards` - Use named wildcards in middleware routes (Express v5, since v11)
- `api-use-dto-serialization` - DTO and response serialization
- `api-use-interceptors` - Cross-cutting concerns
- `api-use-pipes` - Input transformation with pipes
- `api-versioning` - API versioning strategies (v12 route conflict diagnostics)

### 9. Microservices (MEDIUM)

- `micro-use-patterns` - Message and event patterns
- `micro-use-health-checks` - Health checks for orchestration (Terminus 12 `HealthIndicatorService`)
- `micro-use-queues` - Background job processing (`@nestjs/bullmq` 12.x, `WorkerHost`)

### 10. DevOps & Deployment (LOW-MEDIUM)

- `devops-graceful-shutdown` - Zero-downtime deployments (one owner of the signal, `return503OnClosing`)
- `devops-node-version` - Run on a supported Node.js LTS (v12 in CommonJS: unflagged `require(esm)`, 20.19+ / 22.12+; 24 LTS recommended)
- `devops-use-config-module` - Environment configuration (v12 Standard Schema validation)
- `devops-use-logging` - Structured logging (`fatal` + JSON ConsoleLogger since v11, structured params in v12)

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/arch-avoid-circular-deps.md
rules/security-validate-all-input.md
rules/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`. It is generated from `rules/*.md` and `metadata.json`: regenerate it after editing a rule with `node build-agents.ts` from `scripts/` (Node 24 strips the TypeScript types natively; nothing to install).

## Integration with Hexagonal / DDD layers

This skill provides **rule-level checks** (DI, security, performance, API). The companion skill `clean-ddd-hexagonal` provides the **architectural layout** (domain / application / infrastructure). Both apply at the same time. Use this mapping when deciding which rule belongs to which layer:

| Layer | Rules that apply | Rules that do NOT apply |
|-------|------------------|--------------------------|
| `domain/` | None of these (domain has zero NestJS dependencies) | All — domain is pure TS, no `@Injectable()`, no `class-validator` decorators, no HTTP/DB |
| `application/` | `arch-single-responsibility`, `arch-use-events`, `di-*` (all), `error-throw-http-exceptions` only via filter, `test-use-testing-module` | `api-*`, `db-*`, `security-rate-limiting`, `security-csrf-protection` (those are adapter concerns) |
| `infrastructure/http/` | `api-*` (all), `security-*` (all), `error-use-exception-filters`, `perf-use-caching` for read endpoints | `arch-use-repository-pattern` (already abstracted by domain port) |
| `infrastructure/persistence/` | `arch-use-repository-pattern`, `db-*` (all), `perf-optimize-database`, `test-mock-external-services` | `api-*`, `security-validate-all-input` |
| `infrastructure/messaging/` | `micro-*` (all), `arch-use-events`, `error-handle-async-errors` | `api-versioning`, `security-csrf-protection` |
| `bootstrap/` & `main.ts` | `devops-*` (all), `security-use-helmet`, `security-rate-limiting`, `perf-async-hooks` | Domain/application rules |

**Rule of thumb:**
- **Ports are `abstract class`, never `type` + `Symbol` token.** Every port/adapter pair needs an injection token (`di-use-interfaces-tokens`), and in this repo the port itself is that token. That is the rule's "Option 2", not its `Symbol` "Option 1". Wire it with `{ provide: Port, useClass: Adapter }`, inject it with no `@Inject`, and have the adapter `implements` the port, never `extends` it (translate the rule's `extends` example). Source of truth: `${CLAUDE_SKILL_DIR}/../clean-ddd-hexagonal/references/NESTJS-MAPPING.md` §2.
- **Declare every other contract as `type`, not `interface`.** The `rules/*.md` examples use `interface` (they are framework-generic), but this repo's ESLint enforces `@typescript-eslint/consistent-type-definitions: ['error', 'type']`. Translate every `export interface X { … }` example into `export type X = { … };` before writing it. Ports are the one exception: a `type` or an `interface` is erased at compile time and cannot be an injection token, while an `abstract class` survives.
- Validation (`security-validate-all-input`) lives in HTTP DTOs, never in domain entities. The domain enforces invariants via constructor logic and value objects.
- `arch-use-repository-pattern`: the **port lives in `domain/ports/`** as an `abstract class`, the **implementation in `infrastructure/persistence/`**.
- `devops-graceful-shutdown`: in `src/main.ts` use option A. One `process.on` handler per signal behind a shutting-down guard, never `process.once` (under `nest start` one Ctrl+C reaches the app twice, and `once` lets the second copy kill it mid-shutdown); no `enableShutdownHooks()`; `close(signal)`, then `process.exit(128 + n)`. That keeps the 143/130 exit codes and emits `'exit'`, so async loggers flush; option B would turn SIGTERM's 143 into 0. `return503OnClosing` stays **off** here: its `text/html` 503 would pre-empt the `shutting_down` JSON that the published health contract documents, and it protects nothing because the `DataSource` closes in `onApplicationShutdown`, after the HTTP server.
- `api-versioning`: `NEST_APP_OPTIONS` in `src/main.ts` (shared with `createTestApp()`) sets `routeConflictPolicy: { duplicate: 'error', shadow: 'error' }` and keeps the default `declaration` strategy. The rule's example (`shadow: 'warn'` plus `specificity`) is the generic option, not this repo's choice: do not "fix" `main.ts` towards it. `shadow` is symmetric — `users/me` next to `users/:id` aborts the boot in either order (`src/__tests__/main.spec.ts`).

## Workflow Integration

This skill is consulted at three points:

1. **brainstorming** — when the design touches a NestJS-specific concern (auth, caching, queues, validation, throttling), cite the relevant rule code (e.g. `security-auth-jwt`) when proposing tradeoffs.
2. **writing-plans** — every task that creates Nest artifacts (controllers, providers, modules, filters) lists the applicable rule codes inline so the implementer can verify against them.
3. **execution (executing-plans / subagent-driven-development)** — code-quality review checks the changed files against the rule codes the plan attached to each task.

Pair this skill with `clean-ddd-hexagonal` — they are designed to be used together in this repo.
