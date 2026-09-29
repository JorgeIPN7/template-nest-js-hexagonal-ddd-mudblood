---
title: Protect Cookie-Authenticated Endpoints from CSRF
impact: HIGH
impactDescription: CSRF lets an attacker perform state changes as the victim user
tags: security, csrf, cookies, authentication, v12
---

## Protect Cookie-Authenticated Endpoints from CSRF

If your NestJS app authenticates browser users with **cookies** (session cookies, persistent JWT-in-cookie, OAuth refresh cookie), every state-changing endpoint is reachable from a cross-origin form unless you protect it. Since NestJS 12.1 the framework ships the protection built in: `app.enableCsrfProtection()` rejects cross-origin, state-changing browser requests based on Fetch Metadata (`Sec-Fetch-Site`) with an `Origin`/`Host` fallback — the algorithm of Go's `net/http.CrossOriginProtection`, no tokens and no cookies. Token schemes — the double-submit-cookie pattern via `csrf-csrf` (Express) or `@fastify/csrf-protection` (Fastify) — remain the answer on older NestJS versions and a supplement for browsers that send neither header. The deprecated `csurf` package is no longer maintained and should not be used.

CSRF protection is **not needed** for endpoints authenticated with `Authorization: Bearer ...` headers from a non-cookie source — browsers do not auto-attach those, so cross-origin requests can't impersonate the user.

**When you need CSRF protection:**

| Auth mechanism | CSRF risk | Need protection? |
|----------------|-----------|------------------|
| Session cookie | High — browser auto-sends | **Yes** |
| HTTP-only JWT cookie | High — browser auto-sends | **Yes** |
| `Authorization: Bearer` header (read from `localStorage`/memory) | Low | No |
| Pure machine-to-machine API (no browser clients) | None | No |
| `SameSite=Strict` cookie + no third-party login flows | Reduced, not zero | Yes (defense in depth) |

**Incorrect (cookie-authenticated app with no CSRF guard):**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.use(session({ secret: 'x', cookie: { httpOnly: true } }));

  // ❌ No CSRF protection — any cross-origin <form> targeting /api/* succeeds
  await app.listen(3000);
}

// Attacker page on evil.com:
// <form method="POST" action="https://yourapp.com/api/account/delete">
//   <button>Click for free coupon</button>
// </form>
// → cookie auto-sent, account deleted
```

**Correct (NestJS 12.1+ — built-in `app.enableCsrfProtection()`):**

```typescript
import { RequestMethod } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Once, before app.init() / app.listen(). The check runs before Nest middleware,
  // body parsing, guards and handlers; a rejection is a ForbiddenException that goes
  // through your exception filters.
  app.enableCsrfProtection({
    // Cross-origin callers allowed to change state. Origins allowed by CORS are
    // NOT trusted implicitly — list them here too. Exact "scheme://host[:port]".
    trustedOrigins: ['https://admin.example.com'],
    // Server-to-server callers that send a foreign Origin (e.g. webhooks). Declared
    // like MiddlewareConsumer.exclude(), without the global prefix, but matched exactly.
    exclude: [{ path: 'webhooks/stripe', method: RequestMethod.POST }],
  });

  await app.listen(3000);
}
```

What it lets through, measured with NestJS 12.1.0:

| Request | Result |
|---------|--------|
| `GET` / `HEAD` / `OPTIONS` | Always allowed |
| `Sec-Fetch-Site: same-origin` or `none` | Allowed |
| `Sec-Fetch-Site: same-site` or `cross-site` | **403** (unless trusted origin or excluded route) |
| No `Sec-Fetch-Site`, `Origin` not matching `Host` | **403** |
| Neither `Sec-Fetch-Site` nor `Origin` (curl, server-to-server) | Allowed — it protects browsers, not the API from non-browser clients |

Two deployment traps: browsers send `Sec-Fetch-Site` only to secure origins (HTTPS or `localhost`), so over plain HTTP only the `Origin`/`Host` comparison applies; and `X-Forwarded-Host` is ignored — behind a proxy that rewrites `Host`, preserve it or list the public origin in `trustedOrigins`. Middleware registered with `app.use()` **before** the call runs before the check.

**Correct (Express — `csrf-csrf` double-submit-cookie token, for NestJS < 12.1 or as a supplement):**

```typescript
// npm i csrf-csrf cookie-parser   (csrf-csrf v4 API)
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';
import type { Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser(process.env.COOKIE_SECRET));

  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => process.env.CSRF_SECRET!,
    // Required since v4: binds the token to the session (express-session here)
    getSessionIdentifier: (req) => req.session.id,
    cookieName: '__Host-psifi.x-csrf-token',
    cookieOptions: {
      sameSite: 'lax',
      path: '/',
      secure: true,
      httpOnly: true,
    },
    // Only protect mutating methods — GETs are read-only
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  });

  app.use(doubleCsrfProtection);

  // Expose a public endpoint that issues a fresh token to the SPA
  app.use('/csrf-token', (req: Request, res: Response) => {
    res.json({ token: generateCsrfToken(req, res) });
  });

  await app.listen(3000);
}

// Frontend
// 1. fetch('/csrf-token', { credentials: 'include' }) → { token }
// 2. POST/PUT/DELETE with header: 'x-csrf-token': token
```

**Correct (Fastify — `@fastify/csrf-protection`):**

```typescript
// npm i @fastify/csrf-protection @fastify/cookie
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET,
  });
  await app.register(fastifyCsrf);

  await app.listen(3000);
}
```

**Defense in depth — also do this:**

- Set session cookies as `Secure; HttpOnly; SameSite=Lax` (or `Strict` if no third-party login redirects).
- Use the `__Host-` cookie prefix to lock cookies to the exact host with `Path=/`.
- Check `Origin` on mutating endpoints — `app.enableCsrfProtection()` does it for you on NestJS 12.1+; on older versions validate `Origin` / `Referer` by hand.
- Never accept a CSRF token via query string (it leaks into logs and the Referer header).

Reference: [NestJS Security — CSRF](https://docs.nestjs.com/security/csrf) · [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) · [OWASP CSRF Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
