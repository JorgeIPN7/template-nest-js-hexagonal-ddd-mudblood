# Toolchain y arranque

Este documento guarda el porqué, las mediciones y la historia de las reglas de toolchain y
arranque de [CLAUDE.md](../CLAUDE.md): pnpm y sus overrides, NestJS 12 (ESM) dentro de un repo
CJS, el apagado ordenado, el reparto entre `@nestjs/swagger` y Scalar, y Zod 4 con `@nestjs/config`.
Cada sección nombra su regla en una línea; la regla vigente está en CLAUDE.md y, si este documento y
CLAUDE.md discrepan, gana CLAUDE.md.

## pnpm

> **Regla (CLAUDE.md, «Stack»):** solo **pnpm**, nunca `npm install` ni `yarn`, con la versión
> fijada en `packageManager`; sus ajustes (`overrides`, `allowBuilds`) van en `pnpm-workspace.yaml`.

La versión exacta está fijada en `packageManager`. Si tu `pnpm` global es más antiguo, lanza los
comandos a través de `corepack pnpm …`, o ejecuta una sola vez `corepack enable` para que la
versión fijada se use automáticamente.

Los ajustes de pnpm (`overrides`, `allowBuilds`) viven en
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml): desde pnpm 11, la clave `pnpm` de
`package.json` se ignora **en silencio**.

### El override de `js-yaml`, retirado

> **Regla (CLAUDE.md, «Stack»):** un override sustituye por completo la regla de upstream; retirar
> un override de CVE solo es seguro porque `pnpm audit --prod --audit-level=high` corre en la CI.

El override que parcheaba GHSA-pm4m-ph32-ghv5 se retiró el 2026-08-19, porque upstream cumplió
la condición de salida que el override tenía escrita: `@nestjs/swagger@11.4.7` ya fija
`js-yaml@5.3.0`, con el fix incluido. Sus dos lecciones siguen en el comentario lápida de
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) y en el backlog #6: un override
**sustituye por completo la regla de upstream** —mientras estuvo puesto, el árbol se quedó en la
5.2.3 y nunca vio la 5.3.0 que pide swagger—, y retirarlo solo es seguro
**porque `pnpm audit --prod --audit-level=high` corre en la CI**: ese gate es el que cazó este
CVE la primera vez.

## El override de TypeScript

> **Regla (CLAUDE.md, «Stack»):** el override de `typescript` está acotado a
> `'@nestjs/cli>typescript'`, nunca global, y subir TypeScript edita las dos líneas (el override y
> la devDependency).

Ese ámbito es estructural (_load-bearing_). [`renovate.json`](../renovate.json) tiene
`pnpm-workspace.yaml` en `enabled: false`, así que nada sube el literal automáticamente; un
override _global_ se impondría en la resolución a la devDependency `typescript` de `package.json` y
dejaría inerte, en silencio, toda PR futura de TypeScript.

El ámbito por sí solo cambiaría ese fallo por el de dos compiladores que divergen
(`nest-cli.json` fija `typeCheck: true`), así que
[`src/__tests__/toolchain-pins.spec.ts`](../src/__tests__/toolchain-pins.spec.ts) comprueba que
se resuelve exactamente un `typescript` y que coincide con el manifiesto.
**Subir TypeScript significa editar las dos líneas:** la devDependency `typescript` de
`package.json` y el override `'@nestjs/cli>typescript'` de `pnpm-workspace.yaml`.

La cabecera de [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) desarrolla este mismo razonamiento
junto al override.

## NestJS 12 es ESM y el repo es CJS

> **Regla (CLAUDE.md, «Stack»):** NestJS 12 es solo ESM y este repo sigue siendo CJS, así que los
> tests se lanzan solo por los scripts `pnpm test*`.

Todos los paquetes `@nestjs/*` 12.x se publican como ESM puro (`@nestjs/throttler` 6.x sigue en
CJS), y este repo sigue siendo CJS. En producción se cargan con el `require(esm)` de Node (en
Node 24 no hace falta ningún flag). Jest no puede sin `--experimental-vm-modules`, así que los
scripts `test*` ejecutan `node --experimental-vm-modules node_modules/jest/bin/jest.js` y
[`stryker.config.mjs`](../stryker.config.mjs) pasa el mismo flag vía `testRunnerNodeArgs`.

De ahí la regla: un `npx jest` a secas muere con
`Must use import to load ES Module: …/@nestjs/config/dist/index.js` (medido con Jest 30.5.2). El
flag exige Jest ≥ 30.5: la 30.4 evalúa dos veces los módulos compartidos en grafos mixtos CJS/ESM.

### Lo que Jest no ejercita: el «Smoke de arranque»

Nada en Jest ejercita el `require(esm)` del propio Node sobre `dist/` (el paso `migration:run`
solo carga `@nestjs/config`): arrancar el grafo entero de la aplicación es trabajo del paso
«Smoke de arranque» de [`ci.yml`](../.github/workflows/ci.yml). Ese paso arranca con
`DOCS_ENABLED=true` (el documento OpenAPI, el HTML de Scalar y su bundle con hash) y comprueba
que SIGTERM sale con **143** y deja «Graceful shutdown completed» en el log. Lo que vigila esa
última comprobación está en [Apagado ordenado](#apagado-ordenado).

Historia y mediciones en el backlog #27.

## Apagado ordenado

> **Regla (CLAUDE.md, «Stack»):** `src/main.ts` es el **único** dueño de SIGTERM/SIGINT y
> **nunca llama a `enableShutdownHooks()`**; su handler hace `app.close(signal)` y luego
> `process.exit(128 + signal number)`, ignora una segunda señal, y `useProcessExit` no es una
> alternativa.

La última comprobación del «Smoke de arranque» —SIGTERM sale con **143** y deja «Graceful
shutdown completed» en el log— es la que vigila este diseño. No se llama a
`enableShutdownHooks()` porque su listener relanza la señal: el proceso muere sin `'exit'` y pino
nunca vacía su búfer.

El handler de [`src/main.ts`](../src/main.ts) hace `app.close(signal)` y después
`process.exit(128 + signal number)`, e ignora una segunda señal. `useProcessExit` no es una
alternativa: convierte el 143 en 0.

Historia y mediciones en el backlog #27.

## OpenAPI y Scalar

> **Regla (CLAUDE.md, «Stack» y «Maintaining the Scalar bundle»):** los imports de `@nestjs/swagger`
> conservan el nombre upstream y el vocabulario propio del repo dice `docs`/`openapi`; el bundle de
> Scalar se sirve desde el propio origen, nunca desde su CDN.

### Dos piezas que el nombre «Swagger» confunde

`@nestjs/swagger` sigue siendo el **generador** del documento a partir de decoradores; Scalar es
solo el **renderizador** que lo consume. Por eso los imports de `@nestjs/swagger` se quedan —es
el nombre del paquete upstream— mientras que el vocabulario propio del repo (config, variables
de entorno, nombres de archivo) dice `docs`/`openapi`.

### Por qué el bundle no sale del CDN

El paquete no permite adjuntar un hash `integrity`, así que auto-hospedarlo es la única forma de
saber qué JavaScript se ejecuta.

En la CI, el «Smoke de arranque» arranca con `DOCS_ENABLED=true` (el documento OpenAPI, el HTML de
Scalar y su bundle con hash): ver
[NestJS 12 es ESM y el repo es CJS](#nestjs-12-es-esm-y-el-repo-es-cjs).

## Zod 4 y la configuración

> **Regla (CLAUDE.md, «Stack» y «Config gotcha worth knowing»):** `.prefault()` en vez de
> `.default()` cuando un schema termina en `.transform()`; `env.schema.ts` emite solo escalares; los
> campos numéricos usan `rejectEmpty()`.

### `.default()` frente a `.prefault()`

En Zod 4, `.default()` toma el tipo de **salida** del schema y cortocircuita el parseo. Cuando un
schema termina en `.transform()`, hay que usar `.prefault()`: sustituye un valor de **entrada** y
aun así ejecuta el pipeline. Ver [`src/config/env.schema.ts`](../src/config/env.schema.ts).

### Solo escalares en `env.schema.ts`

Cada factory de `registerAs` vuelve a parsear `process.env`, y `@nestjs/config` solo escribe de
vuelta los valores validados que son `string | number | boolean`: los arrays y los objetos se
descartan en silencio. Por eso **`env.schema.ts` debe emitir solo escalares**; las variables con
forma de lista se quedan como strings y se trocean en el factory con `splitList()`. Lo vigila un
test de [`env.schema.spec.ts`](../src/config/__tests__/env.schema.spec.ts). Equivocarse es
invisible: el valor del `.env` se ignora y se aplica el default.

### Presente pero vacía no es lo mismo que ausente

El `.default()` de Zod solo salta con `undefined`, así que una variable presente pero vacía **no**
es lo mismo que una ausente. Los campos numéricos usan `rejectEmpty()` para que `PORT=` falle
ruidosamente en vez de convertirse en `0`.
