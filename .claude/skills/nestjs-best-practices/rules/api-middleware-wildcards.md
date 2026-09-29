---
title: Use Named Wildcards in Middleware Routes (Express v5)
impact: HIGH
impactDescription: Express v5 broke unnamed wildcards — silently mismatched routes are a security hazard
tags: api, middleware, routing, express, v11+, fastify
---

## Use Named Wildcards in Middleware Routes (Express v5)

Since NestJS 11 the default HTTP platform is Express v5, which upgraded `path-to-regexp` to v8 — and NestJS 12 keeps both (`@nestjs/platform-express` 12.1.0 pins `express` 5.2.1 and `path-to-regexp` 8.4.2). Unnamed wildcards (`*`, `(.*)`) are no longer valid syntax — middleware routes must use **named wildcards** (`*splat` or the more explicit `{*splat}`). NestJS still auto-converts the legacy syntax: a bare `'*'` or `'(.*)'` is rewritten to `'{*path}'` **without any warning**, and a prefixed one such as `'api/*'` is rewritten to `'api/{*path}'` with a warning. Relying on the shim is fragile: you can end up with middleware that silently doesn't run on the routes you expected, which is especially dangerous for auth/rate-limit middleware.

The same change affects `@nestjs/platform-fastify` — Fastify v5 ships since NestJS 11 and still in 12 (`@nestjs/platform-fastify` 12.1.x pins `fastify` 5.12.5, `@fastify/middie` 9.3.4 and the same `path-to-regexp` 8.4.2), though Fastify's path matching is less affected outside of middleware.

**Incorrect (Express v4 wildcards — auto-shimmed since NestJS 11, still in 12):**

```typescript
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('*');           // ❌ invalid in path-to-regexp v8 — only works because Nest silently rewrites it

    consumer
      .apply(AuthMiddleware)
      .forRoutes('(.*)');        // ❌ legacy syntax — same silent rewrite; stop relying on it

    consumer
      .apply(TrimBodyMiddleware)
      .forRoutes({ path: '/api/*', method: RequestMethod.ALL }); // ❌ rewritten (with a warning) to '/api/{*path}' — never runs on GET /api
  }
}
```

**Correct (named wildcards — Express v5, NestJS 11+):**

```typescript
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // {*splat} matches the root path AND every nested path — preferred for global middleware
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('{*splat}');

    // *splat needs at least one character after the slash: it does NOT run on the bare root '/'
    consumer
      .apply(AuthMiddleware)
      .forRoutes('*splat');

    // A prefix AND everything below it: make the whole tail optional
    consumer
      .apply(TrimBodyMiddleware)
      .forRoutes({ path: 'api{/*splat}', method: RequestMethod.ALL });

    // Excluding routes follows the same syntax
    consumer
      .apply(SessionMiddleware)
      .exclude('health', 'metrics', 'api/auth{/*splat}')
      .forRoutes('{*splat}');
  }
}
```

**Pattern cheat sheet** (what each pattern runs on, measured with NestJS 12.1.0 + Express 5.2.1):

| Goal | NestJS 11+ / Express v5 | Legacy v10 form → what Nest 11+ rewrites it to |
|------|-------------------------|------------------------------------------------|
| Match every path including `/` | `'{*splat}'` | `'*'` / `'(.*)'` → `'{*path}'` (no warning) |
| Match every path except the bare `/` | `'*splat'` | — |
| Match a prefix **and** everything below it (`/api`, `/api/`, `/api/x/y`) | `'api{/*splat}'` | — |
| Match only what is **below** a prefix (not `/api`, not `/api/`) | `'api/*splat'` | — |
| Match below a prefix, `/api/` included but not `/api` | `'api/{*splat}'` | `'api/*'` / `'api/(.*)'` → `'api/{*path}'` (warning) |
| Match exactly one extra segment | `'/users/:id'` | unchanged |
| Match the literal `/` only | `'/'` | unchanged |
| Exclude a subtree, prefix included | `.exclude('api/auth{/*splat}')` | — |
| Exclude only what is below a prefix | `.exclude('api/auth/{*splat}')` | `.exclude('api/auth/(.*)')` → `'api/auth/{*path}'` (warning) |

The token after `*` is just a name — `splat` is convention, not magic. `'{*everything}'` works too.

**Why this is a security concern, not just a syntax change:** auth, CSRF, rate limiting, and request-logging middleware are usually mounted with a wildcard. If the pattern silently mismatches, the middleware doesn't run on the routes you thought it would — but everything compiles and starts. The classic miss is the bare prefix: `'api/*splat'` and `'api/{*splat}'` both skip `GET /api`, so a controller mounted at `@Controller('api')` with a `@Get()` handler never sees the middleware. Always add an integration test that hits an unauthenticated route — the bare prefix included — and asserts the auth middleware kicked in.

Reference: [NestJS Middleware — route wildcards](https://docs.nestjs.com/middleware#route-wildcards) · [path-to-regexp v8](https://github.com/pillarjs/path-to-regexp)
