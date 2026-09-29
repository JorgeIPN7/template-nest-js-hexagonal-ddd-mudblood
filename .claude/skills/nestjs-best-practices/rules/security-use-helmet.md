---
title: Apply Helmet for Default Security Headers
impact: HIGH
impactDescription: A single line of code blocks a wide class of browser-based attacks
tags: security, helmet, headers, csp, xss, clickjacking, v12
---

## Apply Helmet for Default Security Headers

Helmet sets a curated bundle of HTTP response headers that block common browser-based attacks: clickjacking, MIME-type sniffing, cross-origin resource loading, referrer leakage, and (with CSP) most XSS and data-exfiltration payloads. It is the lowest-effort, highest-payoff security middleware you can add to a NestJS app — install it once, configure CSP to match your frontend, and forget about it. Since NestJS 12.1 the same headers are also available without the dependency, through `app.useSecurityHeaders()` (see below).

Helmet does **not** replace input validation, output encoding, authentication, or CSRF protection. It is the browser-side complement to those server-side controls.

**Incorrect (no security headers, or `app.use(helmet())` mounted after routes):**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe());

  await app.listen(3000);
  // ❌ no Helmet — every response is missing CSP, X-Frame-Options, HSTS, ...
}
```

```typescript
// ❌ Helmet mounted AFTER global guards / controllers — won't apply to those responses
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalGuards(new AuthGuard());
  await app.listen(3000);
  app.use(helmet());                 // too late
}
```

**Correct (Express — mount before everything, configure CSP):**

```typescript
// npm i helmet
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: {
        // Strict-by-default; loosen per directive based on your frontend.
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],                        // never use 'unsafe-inline' if you can avoid it
          styleSrc: ["'self'", "'unsafe-inline'"],      // loosen for utility-CSS frameworks if needed
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://api.example.com'],
          frameAncestors: ["'none'"],                   // clickjacking — strictly stronger than X-Frame-Options
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      // For an API behind HTTPS, HSTS instructs browsers to never downgrade to HTTP
      strictTransportSecurity: {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        includeSubDomains: true,
        preload: true,              // only enable after registering on hstspreload.org
      },
      // If you serve cross-origin assets (CDNs, third-party iframes), tune these:
      crossOriginEmbedderPolicy: false,                 // off if you embed third-party content
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  await app.listen(3000);
}
```

**Correct (NestJS 12.1+ — built-in `app.useSecurityHeaders()`, no dependency):**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Right after create(), once, before app.init() / app.listen() — later, or twice, it throws.
  // Same headers and defaults as helmet 8, same option names (helmet's legacy aliases such as
  // `hsts` or `frameguard` are rejected at startup).
  app.useSecurityHeaders({
    contentSecurityPolicy: {
      // Merged into the helmet-8 default policy (useDefaults: true)
      directives: {
        connectSrc: ["'self'", 'https://api.example.com'],
        frameAncestors: ["'none'"],
      },
    },
    strictTransportSecurity: { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  await app.listen(3000);
}
```

It writes the headers on every response — routes, `404`s and errors, including the `403`s of `app.enableCsrfProtection()` — and removes `X-Powered-By`; a route can still override one header with `@Header()`. Two limits keep `helmet` relevant: middleware registered with `app.use()` before the call runs first, so a response it ends itself carries no headers; and directive values are static (`string | string[] | boolean | null`), so a per-request CSP nonce still needs `helmet`'s function-valued directives.

**Correct (Fastify — use `@fastify/helmet`):**

```typescript
// npm i @fastify/helmet
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyHelmet from '@fastify/helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await app.listen(3000);
}
```

**Pure-JSON API note:** if your service only emits `application/json` and is consumed by non-browser clients, you still want Helmet for `X-Content-Type-Options`, `Strict-Transport-Security`, and to disable referrer leakage. You can drop CSP (`contentSecurityPolicy: false`) since browsers won't parse a JSON response, but **do not** disable Helmet wholesale.

**CSP rollout strategy:** start in `Content-Security-Policy-Report-Only` mode pointed at a reporting endpoint, fix violations in your frontend, then switch to enforcing mode. A blanket `'unsafe-inline'` defeats most of CSP's value — fix the inline scripts/styles instead.

Reference: [NestJS Security — Helmet and built-in security headers](https://docs.nestjs.com/security/helmet) · [helmet docs](https://helmetjs.github.io/) · [MDN: CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
