---
title: Run on a Supported Node.js LTS
impact: CRITICAL
impactDescription: NestJS 12 packages are ESM-only — a CommonJS app on Node below 20.19 / 22.12 dies at the first require
tags: devops, runtime, nodejs, v11, v12, esm, compatibility
---

## Run on a Supported Node.js LTS

NestJS 12 ships every `@nestjs/*` package as **ESM only**. A CommonJS application — most existing apps; migrating your own code to ESM is optional and not part of the upgrade — keeps working because Node loads those packages through `require(esm)`, which runs **without a flag only from Node.js 20.19 and 22.12** onwards. That, not `@nestjs/core`'s `engines` field (`>= 20`), is the real floor. The ecosystem around it is often stricter: `nestjs-pino` 5 declares `>=22.12.0`, `nestjs-cls` 7 `>=22`, and the CLI's `@nestjs/schematics` 12 (`nest new`, `nest generate`) `^22.22.3 || ^24.15.0 || >=26.0.0`. Your floor is the strictest of all of them.

Node.js 20 reached end-of-life on 2026-04-30, so the practical choice is the **24.x LTS** (supported until 2028-04-30), or 22.12+ (until 2027-04-30) if you cannot move yet. Pin it in `package.json`, your Dockerfile, CI and `.nvmrc` so dev, test and prod cannot drift onto an unsupported version.

> **Since v11:** Node.js 16 and 18 are unsupported (both are EOL).

**Incorrect (no engine pin, mismatched runtimes, Node without unflagged `require(esm)`):**

```dockerfile
# Dockerfile
FROM node:18-alpine     # ❌ unsupported since NestJS 11
# FROM node:20.11-alpine  ❌ NestJS 12 in a CJS app: no unflagged require(esm) before 20.19
WORKDIR /app
COPY . .
RUN npm ci && npm run build
CMD ["node", "dist/main"]
```

```jsonc
// package.json — silent on engine, anything goes
{
  "name": "api",
  "scripts": { "start": "node dist/main" }
  // no "engines" field — the package manager installs on any Node
}
```

```jsonc
// package.json — a floor copied from @nestjs/core's engines: too low for NestJS 12
{
  "engines": { "node": ">=20" } // ❌ admits 20.0–20.18, which cannot require() the ESM packages
}
```

```yaml
# .github/workflows/ci.yml
- uses: actions/setup-node@v7
  with:
    node-version: 22.11    # ❌ tests run on one version, prod on another — and 22.11 lacks unflagged require(esm)
```

**Correct (pin the LTS in every layer):**

```jsonc
// package.json
{
  "name": "api",
  "engines": {
    "node": "^24.15.0", // strictest of: require(esm) (20.19 / 22.12), your deps' engines, the CLI's
    "pnpm": ">=11"
  },
  "packageManager": "pnpm@11.28.0",
  "scripts": {
    "start": "node dist/main"
  }
}
```

```dockerfile
# Dockerfile — same LTS line in build and runtime (pin an exact version or digest in real images)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
CMD ["node", "dist/main"]
```

```yaml
# .github/workflows/ci.yml — same Node as production
- uses: actions/setup-node@v7
  with:
    node-version-file: '.nvmrc'    # single source of truth
    cache: 'pnpm'
```

```text
# .nvmrc
24.21.0
```

```bash
# Local dev: nvm + .nvmrc keeps every contributor on the same Node
$ nvm use
Found '/path/to/repo/.nvmrc' with version <24.21.0>
Now using node v24.21.0

# Detect the capability NestJS 12 needs in a CJS app (true from 20.19 / 22.12)
$ node -p "process.features.require_module"
true
```

**Why this matters:**

- **Security patches** stop landing on EOL Node — staying current is the only way to get them.
- **The failure is at startup, not at install time.** Without unflagged `require(esm)`, the first `require('@nestjs/core')` throws `Error [ERR_REQUIRE_ESM]: require() of ES Module …/@nestjs/core/index.js … not supported.` The message names a file, not the Node version you need.
- **`@nestjs/core`'s `engines` (`>= 20`) is not the answer.** It still admits the versions that cannot load it from CommonJS; take the floor from `require(esm)` and from the strictest `engines` in your dependency tree.
- **Drift between dev and prod** is the source of "works on my machine" bugs around `URL`, `crypto.subtle`, and timing. The `engines` field + lockfile + Dockerfile + `.nvmrc` together prevent it.

Reference: [NestJS v12 migration guide](https://docs.nestjs.com/migration-guide) · [Node.js — Loading ECMAScript modules using `require()`](https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require) · [Node.js release schedule](https://github.com/nodejs/release#release-schedule)
