# nest-base-template

Base NestJS 11 lista para producción con arquitectura hexagonal (Clean Architecture + DDD), TypeORM sobre PostgreSQL, SWC, Pino, Zod para configuración, documentación OpenAPI servida con Scalar, Terminus, rate limiting y buenas prácticas de seguridad y observabilidad.

<!-- template-only:start -->

---

## Empezar un proyecto nuevo desde esta base

Esta sección solo existe mientras el repositorio **es** el template: `pnpm init:project` la borra del README del proyecto derivado, junto con el resto de bloques marcados `template-only`.

### 1. Traerte el código

Cuatro formas, y solo una recomendada:

| Forma                          | Cómo                                                                         | Qué historial arrastras                | Veredicto                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Botón «Use this template»**  | En la página del repositorio en GitHub                                       | Un único commit inicial, limpio        | ✅ **Recomendada**                                                                          |
| `degit` / `giget`              | `pnpm dlx giget gh:JorgeIPN7/template-nest-js-hexagonal-ddd-mudblood mi-api` | Ninguno — descarga el árbol sin `.git` | Buena si no quieres pasar por la interfaz web, o si el origen no está en GitHub             |
| `git clone` + reiniciar el git | `git clone --depth 1 <url> mi-api && cd mi-api && rm -rf .git && git init`   | Ninguno                                | Equivalente a la anterior, con más pasos                                                    |
| **Fork**                       | Botón _Fork_                                                                 | Todo, **y queda ligado al original**   | ❌ Los PR apuntan por defecto al repositorio de origen y el tuyo aparece en su red de forks |

Un fork no es una copia independiente: es una rama pública del proyecto original. Para un proyecto de cliente eso es lo contrario de lo que quieres.

> **⚠️ Copiar y pegar los archivos en una carpeta nueva es la peor opción, y no por comodidad.** El explorador de archivos oculta lo que empieza por punto, que es justo donde vive media configuración. Esto es lo que se queda atrás y qué se rompe:

| Lo que no copias                                                             | Qué deja de funcionar                                                                                                                                                        |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.swcrc`                                                                     | **⚠️ La inyección de dependencias, en runtime.** Sin `decoratorMetadata` Nest no sabe qué inyectar y muere con `Nest can't resolve dependencies` — con el typecheck en verde |
| `.husky/`                                                                    | Los hooks de `pre-commit` y `commit-msg`: ni lint, ni typecheck, ni commitlint, ni el escaneo de secretos antes de commitear                                                 |
| `.github/`                                                                   | La CI entera. Nada verifica un PR                                                                                                                                            |
| `.secretlintrc.json`                                                         | `secretlint` corre sin reglas: una clave staged deja de bloquear el commit                                                                                                   |
| `.gitignore`                                                                 | Acabas commiteando `node_modules/`, `dist/` y tu `.env` — con el `JWT_SECRET` dentro                                                                                         |
| `.env.example`                                                               | El único sitio donde está documentada cada variable, con qué rompe y con qué combina mal                                                                                     |
| `.prettierrc`, `.prettierignore`, `.editorconfig`, `.nvmrc`, `.node-version` | Formato y versión de Node dejan de estar fijados: el primer `pnpm format:check` reformatea el repositorio entero                                                             |

Y aunque copies también los ocultos, sigue faltando `.git`: sin él `pnpm install` termina bien pero imprime `husky - .git can't be found` y los hooks no quedan instalados.

### 2. Qué hace falta para que exista el botón «Use this template»

| Lado                   | Requisito                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quien publica**      | Marcar el repositorio como plantilla: _Settings → General → ✅ Template repository_. Es una casilla; no cambia visibilidad ni permisos, solo añade el botón. También con `gh repo edit --template`      |
| **Quien lo usa**       | Una cuenta de GitHub. Si el repositorio es privado, además acceso de lectura                                                                                                                            |
| **Lo que se lleva**    | Todo el árbol de la rama por defecto, en **un commit inicial** sin relación con el original. Marcando _Include all branches_ se lleva también las demás ramas                                           |
| **Lo que NO se lleva** | Historial, tags, releases, issues, wiki, stars y —importante si algún día los hubiera— los _secrets_ de GitHub Actions. La CI de este repositorio no usa ninguno, así que funciona desde el primer push |

### 3. Ponerle nombre: `pnpm init:project`

El template lleva su identidad escrita en 17 archivos: el nombre del paquete, el de la base de datos (dos: la de desarrollo y la de tests), el del proyecto y el contenedor de Docker Compose, el título del documento OpenAPI y el `service` de los logs. Cambiarlos a mano es donde se queda algo atrás.

```bash
pnpm init:project --name mi-api --dry-run     # enseña el plan, no escribe nada
pnpm init:project --name mi-api --title "Mi API" --repo https://github.com/tu-org/mi-api
```

| Qué toca                           | Cómo                                                                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15 archivos con el nombre literal  | Sustitución de tokens: paquete, base de datos, proyecto Compose, título OpenAPI, URL del repositorio                                                                 |
| `package.json`                     | Campo a campo: `name`, `version` a `0.1.0`, `description`, `author`. Sin `--repo`, **elimina** `repository`, `bugs` y `homepage` en lugar de dejarlos apuntando aquí |
| `CHANGELOG.md` y `docs/backlog.md` | Los archiva en `docs/template-history/` y crea los del proyecto nuevo, vacíos. No los reescribe: son historia real de otro proyecto, y renombrarla la falsearía      |
| Los bloques `template-only`        | Los recorta del README                                                                                                                                               |
| Un `JWT_SECRET`                    | Lo genera y lo **imprime** — nunca lo escribe en un archivo: `.env.example` está versionado y `secretlint` bloquearía el commit, con razón                           |

Lo que **no** hace: tocar git, y borrar los módulos de ejemplo (§4). Tampoco se autoelimina salvo con `--self-destruct`, para que un renombrado interrumpido a mitad se pueda reintentar.

Después: `pnpm install` → `cp .env.example .env` (pega ahí el `JWT_SECRET`) → **`pnpm db:reset`** → `pnpm migration:run`. El `db:reset` no es opcional: el nombre de la base cambió y el volumen anterior contiene la antigua.

`src/__tests__/init-project.spec.ts` vigila el manifiesto del script contra el repositorio real. Si alguien escribe el nombre del template en un archivo nuevo sin declararlo, la suite se pone roja — sin ese gate, el renombrado quedaría a medias en silencio.

### 4. Quitar los módulos de ejemplo (a mano, y con este orden)

`health` se queda siempre. Los otros tres son ejemplos, pero **no son independientes**:

| Módulo   | ¿Se puede quitar?                | Qué arrastra                                                                                  |
| -------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| `orders` | Sí, sin tocar nada más           | Es el único consumidor de `UsersLookup`; nadie depende de él                                  |
| `auth`   | Sí, pero deja la API **abierta** | Registra el `APP_GUARD` global. Quitarlo sin sustituirlo deja todo endpoint sin autenticación |
| `users`  | **No sin reescribir `auth`**     | `auth` consume `UsersLookup` y `UsersProvisioning`; sin ellos no hay ni login ni registro     |

Para cada módulo que quites:

1. Borra `src/modules/<contexto>/` entera — los tests van dentro, así que se van con ella.
2. Quita su import y su entrada en `imports:` de [`src/app.module.ts`](src/app.module.ts).
3. Borra su migración y la tabla que creó. La de `orders` es [`1786076763455-create-orders-and-outbox.ts`](src/database/migrations/1786076763455-create-orders-and-outbox.ts); si ya la aplicaste, `pnpm migration:revert` antes de borrar el archivo. Con la base todavía sin datos, `pnpm db:reset` es más rápido.
4. Quita su scope del `scope-enum` de [`commitlint.config.cjs`](commitlint.config.cjs).
5. Si era `orders`, quita también `pnpm outbox:relay` de `package.json` y `src/database/outbox/`.
6. Revisa las secciones que lo describen en este README y en [`CLAUDE.md`](CLAUDE.md).
7. **Vuelve a medir la mutación.** `stryker.config.mjs` apunta por globs, así que no hay que editarlo, pero el umbral `break: 85` está calibrado sobre el peso en mutantes de los módulos actuales: quitar uno mueve el score global. Corre `pnpm test:mutation` y ajusta el umbral con el número nuevo, no a ojo.
8. Definition of Done completo: `typecheck` → `lint:check` → `format:check` → `test` → `test:e2e` → `build`.

<!-- template-only:end -->

---

## Contenido

- [Puesta en marcha](#puesta-en-marcha) — empieza por aquí
- [Variables de entorno](#variables-de-entorno)
- [Problemas frecuentes](#problemas-frecuentes)
- [El stack](#el-stack--qué-hace-cada-pieza-y-por-qué) — qué hace cada tecnología y por qué está
- [Lo que este template ya te resolvió](#lo-que-este-template-ya-te-resolvió)
- [Arquitectura](#arquitectura)
- [Base de datos](#base-de-datos)
- [Testing](#testing)
- [Scripts](#scripts)
- [Skills de IA](#skills-de-ia) — cómo se trabaja en este repo con un asistente

---

## Puesta en marcha

### 1. Qué necesitas instalar antes

Nada de esto requiere darse de alta en ningún servicio. **El proyecto no usa tokens, ni registries privados, ni APIs de terceros**: todo sale de npm público y Docker Hub. Lo único que se descarga de un tercero es el bundle de CA de AWS, y solo si vas a conectar a RDS con verificación de certificado ([ver más abajo](#conexión-y-tls-rds)).

| Herramienta             | Versión             | Quién la fija                              | Descarga                                                                                                                             |
| ----------------------- | ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Node.js**             | `22.22.1`           | `.nvmrc`, `.node-version`, `Dockerfile`    | [nodejs.org](https://nodejs.org/) · [nvm](https://github.com/nvm-sh/nvm) · [nvm-windows](https://github.com/coreybutler/nvm-windows) |
| **pnpm**                | `11.17.0`           | `packageManager` en `package.json`         | Vía Corepack (incluido en Node): `corepack enable`                                                                                   |
| **Docker** + Compose v2 | cualquiera reciente | los scripts usan `docker compose`          | [Docker Desktop](https://www.docker.com/products/docker-desktop/)                                                                    |
| **Git**                 | cualquiera          | necesario para que Husky instale los hooks | [git-scm.com](https://git-scm.com/)                                                                                                  |

> **Ojo con la versión de Node:** `engines` en `package.json` **no bloquea la instalación**. No hay `.npmrc` con `engine-strict=true`, así que con una versión distinta solo verás un aviso y pnpm seguirá adelante. Si algo se comporta raro, comprueba primero `node --version`.

> **Sobre pnpm:** el proyecto fija la versión exacta en `packageManager`. Con `corepack enable` (una sola vez) tu `pnpm` global respeta ese pin automáticamente. Si prefieres no habilitarlo, ejecuta los comandos como `corepack pnpm …`. Los ajustes de pnpm viven en `pnpm-workspace.yaml`; desde pnpm 11 la clave `pnpm` de `package.json` **se ignora en silencio**.

### 2. Arranque desde cero

```bash
git clone https://github.com/JorgeIPN7/template-nest-js-hexagonal-ddd-mudblood.git && cd template-nest-js-hexagonal-ddd-mudblood

nvm use                 # o instala Node 22.22.1 a mano
corepack enable         # recomendado: usa el pnpm que fija el repo

pnpm install
cp .env.example .env     # revísalo ANTES del siguiente paso

pnpm db:up               # levanta PostgreSQL 18 en Docker
pnpm migration:run       # crea el esquema de ejemplo
pnpm start:dev
```

Con eso la API queda en `http://localhost:8888/api`, los endpoints en `/api/v1/…` y la documentación en `http://localhost:8888/api/docs`.

### 3. Qué pasa si te saltas un paso

Merece la pena leerlo: casi todos los tropiezos de la primera vez están aquí.

| Paso                   | Si lo omites                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`         | Nada funciona. Si además descargaste un ZIP en vez de clonar, verás `husky - .git can't be found`: **la instalación no falla**, pero los hooks de pre-commit y commit-msg no se instalan.                                                                                                                                                                                                                                                                            |
| Crear `.env`           | La app arranca igual —en `development`, todas las variables tienen valor por defecto o quedan opcionales—, pero `docker compose` lee `DB_PORT` de ese fichero para publicar el contenedor. Si lo creas o lo editas **después** de `pnpm db:up`, hace falta `db:down && db:up`. Al editarlo, ojo con las líneas comentadas de `.env.example`: son opcionales a propósito, y descomentarlas dejándolas **vacías** impide el arranque (ver la regla 1 de su preámbulo). |
| `pnpm db:up`           | TypeORM reintenta unos 30 s y el arranque muere con `Fatal bootstrap error … ECONNREFUSED 127.0.0.1:5432`.                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm migration:run`   | **La app arranca y `/api/v1/health` responde 200**, así que parece que todo va bien. Pero cualquier `/api/v1/users` devuelve 500 con `relation "users" does not exist`. En desarrollo `DB_MIGRATIONS_RUN` no hace nada: es a propósito, solo aplica fuera de development.                                                                                                                                                                                            |
| Migrar tras `db:reset` | `db:reset` borra el volumen, así que el esquema desaparece. Hay que volver a ejecutar `pnpm migration:run`.                                                                                                                                                                                                                                                                                                                                                          |

### 4. Comprobar que está todo bien

```bash
curl http://localhost:8888/api/v1/health

curl -X POST http://localhost:8888/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"maria@example.com","name":"María González","password":"una-frase-larga-y-dificil-de-adivinar"}'

curl -X POST http://localhost:8888/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"maria@example.com","password":"una-frase-larga-y-dificil-de-adivinar"}'

curl http://localhost:8888/api/v1/users/<id> \
  -H 'Authorization: Bearer <accessToken>'
```

La segunda llamada (alta) debe devolver `201` y un cuerpo con la forma `{ "success": true, "data": { "user": { … } }, "request": { … } }`. Crea **dos filas**: el perfil en `users` y la credencial en `auth_credentials` — son bounded contexts distintos desde el ciclo 4, y por eso el alta vive en `/auth/register` y no en `/users`. La tercera (login) devuelve `200` con `accessToken` en `data`; cópialo, junto con el `data.user.id` de la segunda llamada, para la cuarta. Esa última, con `Authorization: Bearer <accessToken>`, devuelve `200` con el mismo usuario — sin ese header, el guard global responde `401`.

### 5. Probar los endpoints de admin

**`POST /auth/register` crea siempre rol `user`, nunca `admin`** — está fijo en `User.create()` (`src/modules/users/domain/entities/user.entity.ts`). Así que con el token de la sección anterior, dos de las rutas responden `403`, y no es un fallo de configuración:

| Endpoint                                         | Exige                  | Con el token del registro |
| ------------------------------------------------ | ---------------------- | ------------------------- |
| `GET /api/v1/users/:id` · `POST /api/v1/orders`  | cualquiera autenticado | `200`                     |
| `GET /api/v1/users` · `DELETE /api/v1/users/:id` | rol `admin`            | **`403`**                 |

El único camino a un admin es el seed. Añade la pareja al `.env` —**ambas o ninguna**, o la app no arranca; la contraseña exige 12 caracteres mínimo— y ejecútalo:

```bash
# .env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=una-frase-larga-de-prueba
```

```bash
pnpm seed:admin          # crea el admin, o promueve el perfil si ese email ya existe

curl -X POST http://localhost:8888/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"una-frase-larga-de-prueba"}'

curl http://localhost:8888/api/v1/users \
  -H 'Authorization: Bearer <accessToken del admin>'
```

El seed es **idempotente y sirve de rescate**: si el email ya existe, lo deja operativo —rol `admin`, activo y con hash nuevo— en vez de fallar. Eso importa porque `DELETE /users/:id` desactiva sin borrar, y desactivar al único admin por error dejaría la API sin nadie que pueda listar ni reactivar. `LoginUseCase` responde a un usuario inactivo con el mismo `401` que a una contraseña mal puesta, así que sin esta vía el síntoma sería indistinguible.

---

## Variables de entorno

Todas pasan por validación Zod (`src/config/env.schema.ts`): tipos coercionados, defaults seguros y un error detallado al arrancar si algo no encaja.

> **Las tablas de esta sección son el índice; el detalle vive en [`.env.example`](./.env.example).** Allí cada variable dice qué controla, qué pasa si la cambias, con qué combina mal y dónde se aplica en el código — junto al valor que vas a editar, en vez de en otro archivo. Empieza por el preámbulo: seis reglas que aplican a todas.

Dos cosas que conviene saber antes de tocar el `.env`:

- **Casi ninguna variable es obligatoria.** De las 43, todas tienen default o son opcionales sin condición, salvo `JWT_SECRET`: fuera de `development`/`test` el arranque falla sin ella (ver [Auth](#auth) más abajo). Dos parejas —`DOCS_USERNAME`/`DOCS_PASSWORD` y `ADMIN_EMAIL`/`ADMIN_PASSWORD`— son opcionales pero ambas-o-ninguna: definir solo una de cada pareja también impide el arranque (ver sus filas). Lo que nunca es opcional es que exista un PostgreSQL al que conectarse.
- **Dejar una variable vacía no es lo mismo que omitirla.** `PORT=` es un error de configuración y la app se niega a arrancar; el default solo se aplica cuando la variable **no está**. Es deliberado: `Number('')` es `0`, y un `SHUTDOWN_TIMEOUT_MS=` silenciosamente convertido en cero hacía que cada despliegue matara el proceso antes de terminar el cierre ordenado. Para usar el valor por defecto, comenta la línea o bórrala.

### Aplicación

| Variable        | Default            | Notas                                                                                             |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV`      | `development`      | `development` / `test` / `staging` / `production`. Un valor fuera de la lista impide el arranque. |
| `PORT` / `HOST` | `8888` / `0.0.0.0` | Puerto y bind del servidor HTTP.                                                                  |
| `GLOBAL_PREFIX` | `api`              | Prefijo de todas las rutas.                                                                       |
| `API_VERSION`   | `1`                | Versión del versioning por URI: las rutas quedan en `/<prefix>/v<versión>/…`.                     |
| `TRUST_PROXY`   | `0`                | Confianza en cabeceras `X-Forwarded-*`. Acepta un entero o una spec de Express.                   |
| `BODY_LIMIT`    | `1mb`              | Límite del body parser.                                                                           |

### CORS

| Variable           | Default | Notas                                                                                                                                                             |
| ------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CORS_ENABLED`     | `true`  | Solo acepta `true`/`false`/`1`/`0`. `yes` o `TRUE` fallan la validación.                                                                                          |
| `CORS_ORIGINS`     | `*`     | Lista separada por comas.                                                                                                                                         |
| `CORS_CREDENTIALS` | `false` | **Incompatible con `CORS_ORIGINS=*`**: la combinación lanza un error explícito al arrancar, porque enviar credenciales a cualquier origen anularía la protección. |

### Logging

| Variable            | Default              | Notas                                                                                        |
| ------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`         | `info`               | `fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent`.                                      |
| `LOG_PRETTY`        | `false`              | Formato legible vía `pino-pretty`. **Por defecto verás JSON crudo**, también en `start:dev`. |
| `LOG_REDACT_FIELDS` | (ver `.env.example`) | Paths adicionales a redactar, que se suman a los seguros por defecto.                        |

### Rate limiting, docs y runtime

| Variable                                       | Default          | Notas                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `THROTTLER_TTL_MS` / `THROTTLER_LIMIT`         | `60000` / `100`  | Ventana y máximo de peticiones por cliente.                                                                                                                                                                                                                                                                  |
| `DOCS_ENABLED`                                 | **`false`**      | Apagado por defecto a propósito: las rutas de la documentación se registran fuera del pipeline de Nest, así que el rate limiting global **no las cubre**. `.env.example` lo pone en `true` para desarrollo.                                                                                                  |
| `DOCS_PATH`                                    | `docs`           | Interfaz en `/<prefix>/<DOCS_PATH>`, sin segmento de versión. El documento crudo, en `/<prefix>/<DOCS_PATH>/json`.                                                                                                                                                                                           |
| `DOCS_USERNAME` / `DOCS_PASSWORD`              | _(sin valor)_    | Basic Auth opcional sobre la documentación **y sobre el documento crudo**. Ambas o ninguna: definir solo una **impide el arranque**, porque el middleware no llegaría a montarse y las docs saldrían publicadas creyendo estar protegidas. Sin ellas quedan abiertas a quien alcance la ruta.                |
| `SHUTDOWN_TIMEOUT_MS`                          | `10000`          | Debe ser **mayor que cero**: con 0 el proceso muere antes de completar el cierre ordenado.                                                                                                                                                                                                                   |
| `REQUEST_TIMEOUT_MS` / `KEEP_ALIVE_TIMEOUT_MS` | `15000` / `5000` | `REQUEST_TIMEOUT_MS` gobierna **dos** mecanismos con el mismo número: `server.requestTimeout` de Node y un interceptor global que responde **408** con el sobre estándar, ajustable por endpoint con `@TimeoutMs(n)` / `@SkipTimeout()`. En `KEEP_ALIVE_TIMEOUT_MS` el 0 sí es válido: desactiva el timeout. |
| `HEALTH_HEAP_LIMIT_MB` / `HEALTH_RSS_LIMIT_MB` | `300` / `600`    | Umbrales de memoria de `/health` y `/health/readiness`. **No afectan a `/health/liveness`**, que no ejecuta ningún indicador. Son MiB, y el heap se mide sobre `heapUsed`.                                                                                                                                   |

> **`SWAGGER_ENABLED` y `SWAGGER_PATH` ya no se leen.** Fueron renombradas a `DOCS_ENABLED` y `DOCS_PATH`, y dejarlas en el entorno **impide el arranque** con un mensaje que nombra su reemplazo. Es deliberado: el riesgo no era publicar la documentación por accidente —el default es `false`— sino lo contrario, que quien la tuviera encendida en staging se quedara sin ella en silencio.

> **Si activas Basic Auth detrás de un balanceador, revisa `TRUST_PROXY`.** Con `0`, `req.ip` es la IP del proxy y el limitador de intentos fallidos agrupa a todos los clientes en un solo contador. Lo que se degrada es la disponibilidad —cualquiera puede dejar sin documentación al resto quemando el contador—, no la protección. La aplicación avisa al arrancar cuando detecta esa combinación.

### Auth

| Variable                         | Default       | Notas                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                     | _(sin valor)_ | **Obligatoria fuera de `development`/`test`**: en `staging`/`production` la app no arranca sin ella. Mínimo 32 caracteres. Sin definir en `development`/`test` cae a un secreto de desarrollo inseguro, publicado en el propio repositorio.                                                                                                                                                                                                         |
| `JWT_EXPIRES_IN_S`               | `3600`        | Vigencia del access token, en segundos.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | _(sin valor)_ | Credenciales del primer admin, consumidas por `pnpm seed:admin` (nunca la app en marcha). Ambas o ninguna: definir solo una **impide el arranque** — la validación vive en el mismo `envSchema` que valida toda la app, no en el seed. `ADMIN_PASSWORD` exige 12 caracteres mínimo. Sin ellas no hay forma de obtener un admin, y las rutas `@Auth('admin')` responden 403 — ver [probar los endpoints de admin](#5-probar-los-endpoints-de-admin). |

### PostgreSQL

| Variable                                                               | Default                                        | Notas                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DB_HOST` / `DB_PORT`                                                  | `localhost` / `5432`                           | Ver [problemas frecuentes](#problemas-frecuentes) si ya tienes Postgres instalado. |
| `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE`                          | `postgres` / `postgres` / `nest_base_template` | Coinciden con los del `docker-compose.yml`.                                        |
| `DB_SCHEMA`                                                            | `public`                                       | Schema donde viven las tablas.                                                     |
| `DB_SSL` / `DB_SSL_REJECT_UNAUTHORIZED` / `DB_SSL_CA`                  | `false` / `true` / —                           | Ver [conexión y TLS](#conexión-y-tls-rds).                                         |
| `DB_SYNCHRONIZE`                                                       | `false`                                        | Solo surte efecto en `development`; ver abajo.                                     |
| `DB_MIGRATIONS_RUN`                                                    | `false`                                        | Solo surte efecto **fuera** de `development`.                                      |
| `DB_LOGGING`                                                           | `false`                                        | Registra cada consulta SQL.                                                        |
| `DB_POOL_MAX` / `DB_POOL_IDLE_TIMEOUT_MS` / `DB_CONNECTION_TIMEOUT_MS` | `10` / `30000` / `10000`                       | Pool de `pg`.                                                                      |

---

## Problemas frecuentes

**`28P01 password authentication failed`** — Tienes un PostgreSQL instalado en la máquina ocupando el 5432, así que la app se conecta a ese en vez de al contenedor. Cambia `DB_PORT` en tu `.env` a un puerto libre (por ejemplo `5433`) y relanza con `pnpm db:down && pnpm db:up`: `docker-compose.yml` publica el contenedor en esa misma variable, así que no hay nada más que tocar.

**`Bind for 0.0.0.0:5432 failed: port is already allocated`** — Mismo origen, misma solución.

**`EADDRINUSE` al arrancar la app** — El 8888 está ocupado. Cambia `PORT`.

**`Starting inspector on 127.0.0.1:9229 failed`** — Ya hay un depurador escuchando. Usa `npx nest start --debug=9230 --watch`.

**`relation "users" does not exist`** — Falta `pnpm migration:run`.

**`husky - .git can't be found`** — Descargaste el proyecto como ZIP. La instalación termina bien, pero los hooks de Git no quedan instalados: los commits no se validarán.

**Los logs salen como JSON en una sola línea** — Es el comportamiento por defecto. Pon `LOG_PRETTY=true` en tu `.env` para leerlos cómodamente en desarrollo.

**`pnpm test` pasa en local y CI falla** — `pnpm test` no mide cobertura; `pnpm test:ci` sí, y aplica umbrales. Ejecuta `pnpm test:cov` antes de subir. Del mismo modo, CI instala con `--frozen-lockfile`: si tocaste `package.json` sin regenerar `pnpm-lock.yaml`, fallará solo allí.

---

## El stack — qué hace cada pieza y por qué

Todas las piezas son **libres y gratuitas** (MIT o Apache-2.0). No hay cuentas, API keys ni servicios de pago en ninguna.

| Pieza         | Sustituye a                  | Qué te da                                                       |
| ------------- | ---------------------------- | --------------------------------------------------------------- |
| **SWC**       | `tsc` (solo al compilar)     | Builds y tests 10–20× más rápidos                               |
| **Zod**       | Joi / Yup                    | Una config inválida mata el arranque, no la primera petición    |
| **Pino**      | `console.log`, Morgan        | Logs JSON consultables, con request-id y secretos tapados       |
| **Scalar**    | Swagger UI                   | Documentación interactiva sin llamar a ningún tercero           |
| **Terminus**  | Un endpoint `/health` casero | El orquestador sabe cuándo reiniciar y cuándo sacar de rotación |
| **Throttler** | `express-rate-limit`         | Rate limiting que entiende guards y decoradores de Nest         |

### SWC — compilar rápido sin renunciar al typecheck

Compila TypeScript a JavaScript. Está escrito en Rust y es 10–20× más rápido que `tsc`, y lo consigue haciendo trampa: **borra los tipos sin comprobarlos**.

**Sí se usa en producción.** `nest-cli.json` declara `builder: "swc"`, y eso aplica a `nest build` (producción), `nest start --watch` (desarrollo) y Jest (tests). El código que despliegas lo generó SWC.

**Entonces, ¿nadie comprueba los tipos?** Sí, en dos sitios:

1. `nest-cli.json` tiene `typeCheck: true`, así que `nest build` lanza `tsc --noEmit` **en paralelo**. Un error de tipos rompe el build.
2. `pnpm typecheck` hace lo mismo por separado, y es obligatorio en el [Definition of Done](#scripts).

Donde **no** hay typecheck es en watch mode y en Jest. Por eso puedes ver un error de tipos en el editor mientras `pnpm test` pasa en verde: no es un bug, es el precio de la velocidad. `pnpm typecheck` es quien lo caza.

#### Las cuatro opciones de `.swcrc` que no debes tocar

TypeScript borra los tipos al compilar, pero **NestJS los necesita en tiempo de ejecución** para saber qué inyectar. Cuando escribes:

```ts
constructor(private readonly users: UserRepository) {}
```

Nest tiene que averiguar, con el programa ya en marcha, que ese parámetro es un `UserRepository`. Si el compilador borró el tipo, Nest ve un parámetro anónimo y muere con `Nest can't resolve dependencies`. Estas cuatro opciones existen para evitarlo:

| Opción                           | Qué pasa si falta                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `decoratorMetadata: true`        | **La inyección de dependencias deja de funcionar.** Es lo que escribe los tipos en un metadato justo antes de borrarlos |
| `legacyDecorator: true`          | Los decoradores de Nest no se aplican: Nest usa la propuesta antigua, no la estándar de TC39                            |
| `keepClassNames: true`           | Nest usa el nombre de la clase como identificador; si el compilador renombra `UserService` a `a`, se pierde             |
| `useDefineForClassFields: false` | Las propiedades de clase se reinicializan vacías al construir el objeto, pisando lo que inyectó el decorador            |

Los alias de rutas (`@config/`, `@common/`…) se declaran también aquí — ver [aliases de TypeScript](#aliases-de-typescript).

### Zod — la config inválida mata el arranque, no la primera petición

Valida las variables de entorno **antes** de que se instancie nada. Sin esto, un `PORT` mal escrito no falla al desplegar: falla tres horas después, en la primera petición, con un error incomprensible.

**¿Lo recomienda el equipo de Nest?** No oficialmente. La documentación de `@nestjs/config` usa **Joi** en su ejemplo, pero también documenta la opción `validate`, que acepta cualquier función — y es por ahí por donde entra Zod.

**¿Por qué Zod y no Joi o Yup?**

| Criterio         | Zod                       | Joi                           | Yup          |
| ---------------- | ------------------------- | ----------------------------- | ------------ |
| Tipos TypeScript | **Inferidos del esquema** | Manuales, se desincronizan    | Parciales    |
| Escrito en       | TypeScript                | JavaScript (`@types/` aparte) | JavaScript   |
| Dependencias     | **Cero**                  | Varias                        | Pocas        |
| Mantenimiento    | Muy activo                | Estable, poco movimiento      | Menos activo |

El argumento decisivo es el primero: escribes el esquema **una vez** y `z.infer<typeof envSchema>` te da el tipo TypeScript gratis. Con Joi mantienes a mano el esquema y la `type Env`, y el día que se desincronizan el compilador no se entera.

**División de responsabilidades:** Zod valida **configuración**; `class-validator` valida **DTOs HTTP**. No se pisan y no hay que unificarlos.

### Pino — logs que se pueden consultar

**¿Lo recomienda Nest?** No hay bendición oficial. Lo que sí es cierto: Fastify —el otro adaptador HTTP de Nest— trae Pino integrado. En la práctica la elección real es Pino o Winston, y Pino gana por ser el más rápido y por emitir **JSON desde el primer día** en vez de texto que luego hay que parsear.

Esto no se puede consultar: `[2026-08-04] Usuario 42 creado correctamente`.
Esto sí: `{"level":30,"userId":42,"requestId":"3f25…","msg":"user created"}`.

Con lo segundo buscas en CloudWatch, Datadog o Loki todas las peticiones de un `requestId`. Con lo primero haces `grep` y rezas.

#### Los siete niveles, y cuándo usar cada uno

| Nivel    | Nº  | Cuándo                                                     | ¿Despierta a alguien? |
| -------- | --- | ---------------------------------------------------------- | --------------------- |
| `fatal`  | 60  | El proceso no puede continuar y va a morir                 | Sí, ya                |
| `error`  | 50  | Una operación falló; el servicio sigue vivo                | Si se repite          |
| `warn`   | 40  | Raro pero recuperable: un reintento, una config sospechosa | No, pero revísalo     |
| `info`   | 30  | **Default en producción.** Hechos de negocio y arranque    | No                    |
| `debug`  | 20  | Detalle para depurar en local                              | No                    |
| `trace`  | 10  | Todo, incluidas las queries SQL. Ruidosísimo               | No                    |
| `silent` | —   | Apaga el logger. Útil en tests                             | —                     |

Tres reglas prácticas:

- **Producción en `info`.** Poner `debug` multiplica el coste de ingesta y entierra lo importante.
- **Un error esperado no es `error`.** Un 404 porque el usuario no existe es `info` o `warn`; `error` se reserva para lo que no debería pasar. Si todo es `error`, las alertas dejan de servir.
- **`LOG_PRETTY=true` solo en local.** `pino-pretty` cuesta rendimiento y rompe el JSON.

Y tres configuraciones que valen su peso en oro, todas en `src/common/logger/pino-options.ts`:

| Configuración        | Qué evita                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `redact`             | Que un `Authorization: Bearer …` acabe escrito en los logs. Un token logueado es un token filtrado |
| `genReqId`           | Reutiliza el `x-request-id` entrante en vez de generar uno nuevo, así la traza cruza servicios     |
| `autoLogging.ignore` | Los health checks se sondean cada pocos segundos; sin esto ahogan el resto de trazas               |

**Complemento obligatorio: `nestjs-cls`.** Usa `AsyncLocalStorage` de Node para que el request-id esté disponible en cualquier punto de la cadena **sin pasarlo como parámetro**. Sin CLS, un log dentro de un repositorio no sabría a qué petición pertenece.

### Scalar — documentación interactiva sin llamar a terceros

**Scalar no sustituye a `@nestjs/swagger`.** Son piezas distintas y ambas siguen aquí:

- `@nestjs/swagger` → **genera** el documento OpenAPI leyendo tus decoradores (`@ApiOperation`…).
- Scalar → **renderiza** ese documento en una interfaz web.

Lo que Scalar sustituye es **Swagger UI**, la interfaz.

**¿Por qué Scalar y no Redoc o Stoplight?**

| Herramienta        | Cliente HTTP integrado | Rendimiento con docs grandes | Auto-hospedable |
| ------------------ | ---------------------- | ---------------------------- | --------------- |
| **Scalar**         | Sí                     | Bueno                        | Sí              |
| Swagger UI         | Sí, tosco              | Se arrastra                  | Sí              |
| Redoc              | **No** (solo lectura)  | Bueno                        | Sí              |
| Stoplight Elements | Limitado               | Bueno                        | Sí              |

Redoc queda fuera porque no puedes probar un endpoint desde la página, y eso es la mitad del valor de publicar documentación. Frente a Swagger UI, Scalar gana en rendimiento, en ejemplos de código multi-lenguaje y en aspecto.

#### Seguridad de la documentación

**No usamos el SaaS de Scalar.** Ni registro de APIs, ni hosting, ni cuenta, ni API key: solo el renderizador, que es MIT. Y hay que decirlo explícitamente, porque **el paquete llama a servicios de Scalar por defecto** y hay que apagarlos uno a uno en `src/bootstrap/scalar-config.ts`:

| Default del paquete                    | Qué hacía                                       | Cómo se apaga               |
| -------------------------------------- | ----------------------------------------------- | --------------------------- |
| `proxyUrl: 'https://proxy.scalar.com'` | Tus peticiones de prueba pasaban por un tercero | `proxyUrl: ''`              |
| Fuentes desde `fonts.scalar.com`       | Cargaba Inter y JetBrains Mono desde fuera      | `withDefaultFonts: false`   |
| Telemetría activa                      | Enviaba métricas de uso                         | `telemetry: false`          |
| Agente IA autodetectado por URL        | Encendido en `localhost`                        | `agent: { disabled: true }` |

**El bundle se sirve desde nuestro propio origen, nunca desde el CDN de Scalar.** El motivo es concreto: el paquete no permite adjuntar un hash `integrity`, así que auto-hospedarlo es la única forma de saber qué JavaScript se ejecuta en el navegador de quien abre la documentación. `scripts/copy-scalar-asset.mjs` lo copia a `public/` con un hash de contenido en el nombre, y los hooks `prebuild`, `prestart:dev`, `pretest:e2e` y `pretest:e2e:ci` lo ejecutan solos. Los cuatro nombres van explícitos porque los hooks de pnpm se resuelven **por nombre exacto**: `pretest:e2e` no cubre a `test:e2e:ci`, y esa diferencia rompió la CI mientras en local todo seguía verde por los restos de un build anterior.

Tres capas antes de que nadie vea las docs: [`DOCS_ENABLED` apagado por defecto](#rate-limiting-docs-y-runtime), Basic Auth opcional, y una CSP propia y restrictiva (`default-src 'none'`) acotada a esa ruta, con nonce por petición.

### Terminus — dos preguntas distintas, dos sondas distintas

Nombre pomposo, trabajo simple: **expone endpoints que el orquestador consulta para decidir qué hacer con tu proceso.** Es el módulo oficial de NestJS.

| Sonda        | Pregunta que responde              | Si falla, el orquestador…        | ¿Consulta la base? |
| ------------ | ---------------------------------- | -------------------------------- | ------------------ |
| `/liveness`  | ¿Hay que **reiniciar** el proceso? | Mata y reinicia el pod           | **No**             |
| `/readiness` | ¿Puede **atender tráfico** ahora?  | Lo saca de rotación, sin matarlo | **Sí**             |

**Por qué liveness no consulta la base:** si Postgres cae, reiniciar el pod no arregla nada y solo añade un arranque en frío. Peor: reiniciarías _todos_ los pods en bucle mientras la base está mal.

**Por qué readiness sí:** sin el ping, el endpoint devolvía 200 con la base caída, el orquestador mantenía el pod en el Service y el 100 % de las peticiones acababa en 500. La sonda no podía sacar el pod de rotación, que es su única razón de existir.

### Tecnologías evaluadas y descartadas

Están aquí para que nadie reabra la discusión sin un motivo nuevo.

| Propuesta            | Veredicto      | Por qué                                                                                                                                                      |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cors`               | **Redundante** | `app.enableCors()` **usa este mismo paquete** por debajo. Instalarlo aparte duplica y se salta la config de Nest                                             |
| `morgan`             | **No**         | `pino-http` ya loguea cada petición, y además en JSON, con request-id y con los secretos tapados. Morgan escribe texto plano que no sabe nada del request-id |
| `express-rate-limit` | **No**         | `@nestjs/throttler` ya está: entiende guards, `@SkipThrottle()` por ruta y storage pluggable. `express-rate-limit` es middleware ciego a la capa de Nest     |
| `jest`               | **Ya está**    | Jest 30, con `@swc/jest` como transformador                                                                                                                  |
| `supertest`          | **Ya está**    | Supertest 7, usado en toda la suite E2E                                                                                                                      |
| `mocha` + `chai`     | **No**         | Cambiar Jest por dos librerías equivalentes perdiendo mocks y cobertura integrados. Los schematics de Nest generan specs de Jest                             |

#### Qué sí falta, por orden de impacto

Roadmap decidido el 2026-08-04 para el perfil objetivo del template — **monolito modular**
(spec: `docs/specs/2026-08-04-roadmap-and-collaboration-model-design.md`; detalle y criterios de
cierre en `docs/backlog.md`, entradas 4–9). El ítem de fronteras de módulo se completó el
2026-08-04 (backlog #4). El de autenticación mínima se completó el 2026-08-05, con roles
`admin`/`user` incluidos (backlog #5) — el alcance creció sobre el criterio original por
decisión del usuario. El de cadena de suministro se completó el 2026-08-06 (backlog #6) — con
él, el Tier 1 del roadmap queda completo. Lo que sigue son ítems condicionados a un trigger que
aún no ocurrió, y descartes ya registrados.

Condicionados a trigger (backlog): **Redis** para throttler compartido + caché (más de una
réplica), **`prom-client` `/metrics`** (primer entorno con Prometheus), **BullMQ** (primer caso
real de background jobs).

Descartados con registro en `docs/backlog.md` («Cerrado al verificarlo»): OpenTelemetry completo
—sin malla de servicios no hay trazas distribuidas que lo justifiquen—, circuit breakers,
feature flags y testcontainers.

---

## Lo que este template ya te resolvió

Cada punto es un fallo que ya ocurrió aquí y que ya no puede volver a ocurrir. Si vienes de otro proyecto, esto es lo que te ahorras.

### Configuración

- **Una variable vacía ya no vale `0`.** `Number('')` es `0`, y un `SHUTDOWN_TIMEOUT_MS=` convertido en cero hacía que cada SIGTERM matara el proceso antes de terminar el cierre ordenado, cortando peticiones en vuelo en **todos** los despliegues. Ver [variables de entorno](#variables-de-entorno).
- **`.default()` vs `.prefault()` (Zod 4).** `.default()` recibe el tipo de **salida** y cortocircuita el parseo, así que si tu esquema acaba en `.transform()` se la salta sin avisar. `.prefault()` sustituye un valor de **entrada** y sí ejecuta el pipeline. Ver `booleanString` en `src/config/env.schema.ts`.
- **Las listas del `.env` no se pierden en silencio.** `@nestjs/config` solo devuelve a `process.env` los valores validados que son `string | number | boolean`; arrays y objetos los descarta **sin decir nada**. Por eso `CORS_ORIGINS` y `LOG_REDACT_FIELDS` se quedan como string y se trocean en el factory con `splitList()`. Un test lo vigila.
- **`CORS_ORIGINS=*` con `CORS_CREDENTIALS=true` impide el arranque.** El navegador rechaza esa combinación de todos modos; mejor fallar al desplegar que depurarlo desde el frontend.
- **`DB_SYNCHRONIZE` no puede encenderse fuera de desarrollo** — ver [migraciones, no `synchronize`](#migraciones-no-synchronize).
- **Las variables retiradas fallan ruidosamente.** `SWAGGER_ENABLED` y `SWAGGER_PATH` impiden el arranque nombrando su reemplazo, en vez de ignorarse y dejarte sin documentación en silencio.

### Seguridad

- **`enableImplicitConversion` está deliberadamente ausente del `ValidationPipe`.** Convertía cada valor al tipo declarado _antes_ de validar, así que un `{"name": {"$ne": null}}` se volvía la cadena `"[object Object]"` y pasaba `@IsString`, `@MinLength` y `@MaxLength` sin una queja. Eso es inyección NoSQL entrando por la puerta principal.
- **`whitelist` + `forbidNonWhitelisted`:** un campo no declarado en el DTO no se ignora, se rechaza con 400. Sin esto, alguien puede probar a colar `isAdmin: true`.
- **Los secretos no llegan a los logs.** `redact` tapa `authorization`, `cookie`, `*.password`, `*.token`, `*.apiKey` antes de escribir.
- **La CSP también corre en desarrollo.** Antes se desactivaba en dev porque estorbaba a Swagger UI, y eso significaba que un problema de CSP solo aparecía al desplegar. Ahora lo que rompa, rompe en local.
- **`styleSrc` lleva `'unsafe-inline'` sin nonce, a propósito.** En CSP Level 3, una directiva que contiene un nonce hace que `'unsafe-inline'` se **ignore**, y Scalar emite atributos `style="…"` que ningún nonce puede autorizar. "Arreglarlo" por simetría daría una página que carga sin un solo error de JavaScript y con el layout destrozado.

### Operación

- **Apagado ordenado con red de seguridad.** SIGTERM drena las peticiones en vuelo; si `app.close()` se atasca, un temporizador fuerza la salida.
- **Los health checks no ensucian los logs** ni consumen cuota del rate limiter.
- **`isHealthPath` no muerde `/api/healthcare`.** Compara segmentos completos, no substrings, así que un endpoint de negocio con ese nombre no desaparece de los logs.
- **Los errores del driver se traducen en el adaptador.** El `23505` de PostgreSQL se convierte en `EmailAlreadyTakenError`, así que un insert concurrente sale como 409 y no como 500.
- **Cada endpoint está documentado, y el build lo verifica.** `src/bootstrap/__tests__/openapi-contract.e2e-spec.ts` recorre el documento OpenAPI y rompe el build si falta un `operationId`, una `description`, un ejemplo o un código de error. También al revés: declarar un 400 en un endpoint que no acepta ni parámetros ni body también falla.

---

## Arquitectura

Cada **bounded context** vive bajo `src/modules/<context>/` con sus tres capas dentro. Nunca a la raíz de `src/`.

```
src/
├── main.ts                     # Bootstrap: helmet, compression, CORS, pipes, filtros, docs, shutdown
├── app.module.ts               # Módulo raíz
├── bootstrap/openapi.ts        # Documento OpenAPI + montaje de Scalar
├── common/                     # Cross-cutting: decorators, dto, filters, interceptors, logger
├── config/                     # Namespaces tipados validados con Zod (app, cors, database, log, …)
├── database/                   # DataSource, opciones de TypeORM y migraciones
│   ├── data-source.ts          # DataSource que usa la CLI de migraciones
│   ├── typeorm-options.ts      # Builder de opciones (compartido por app y CLI)
│   ├── database.module.ts
│   └── migrations/
└── modules/
    ├── health/                 # /health, /health/liveness, /health/readiness
    ├── auth/                   # Credenciales y tokens: /auth/register, /auth/login
    ├── orders/                 # Segundo contexto: eventos de dominio + outbox
    └── users/                  # ← implementación de referencia de las tres capas
        ├── domain/             # Sin imports de @nestjs/*: entidad, VOs, puertos, errores
        │   ├── entities/user.entity.ts
        │   ├── value-objects/  # email.vo.ts, user-id.vo.ts, user-role.ts
        │   ├── errors/user.errors.ts
        │   └── ports/user.repository.ts     # abstract class: contrato Y token de inyección
        ├── application/        # Casos de uso; @Injectable sí, ORM/HTTP no
        │   ├── use-cases/      # create-user.use-case.ts: el caso de uso Y su Input
        │   └── users.facade.ts # Puerta pública del contexto (no es un caso de uso)
        ├── infrastructure/     # Única capa que toca librerías externas
        │   ├── persistence/    # orm-entity, mapper, repositorio TypeORM
        │   └── http/           # controller, dto, filtro de errores de dominio
        ├── __tests__/          # Réplica exacta de la estructura de arriba
        └── users.module.ts     # Composition root: une puerto ↔ adaptador
```

**Los contextos se hablan solo por su `*.module.ts`.** `auth` necesita el perfil para autenticar
y `orders` para saber si un cliente sigue vigente: los dos definen un puerto propio
(`UserDirectory`, `CustomerDirectory`) y lo implementan con un adaptador que inyecta las
puertas que `users.module.ts` publica. Son **dos**, segregadas por intención: `UsersLookup`
(`userExists`, `findByEmail`) para quien solo pregunta —`orders`— y `UsersProvisioning`
(`createProfile`, `deleteProfile`) para quien da de alta y de baja perfiles —`auth`, que usa
las dos—. Una sola fachada con los cuatro métodos le entregaba a `orders` un borrado físico
que nunca pidió; con dos tipos, llamarlo no compila. Ningún módulo importa el `domain/` ni el
`application/` de otro, y la dirección es siempre de una sola vía —`auth → users`,
`orders → users`—: si `users` importara `auth.module` para el guard nacería el único ciclo
módulo↔módulo posible del repo, y por eso `@Public`, `@Auth` y `@CurrentUser` viven en
`common/`.

**Reglas que no se negocian:**

- **Dependencias hacia adentro.** `domain/` no importa `@nestjs/*`, TypeORM, `axios`, decoradores de `class-validator` ni `pino`.
- **Dos modelos, nunca uno.** La entidad de dominio (`user.entity.ts`) es una clase plana con invariantes; la entidad ORM (`user.orm-entity.ts`) lleva los decoradores de TypeORM. `UserMapper` es el único puente. Decorar la entidad de dominio con `@Entity` para ahorrarse un archivo acopla el dominio a la base.
- **Los puertos son `abstract class`, no `type` + token `Symbol`.** Un `type` se borra al compilar y Nest no podría inyectarlo por nombre; una clase sobrevive, así que la MISMA referencia es el contrato y el token: el módulo cablea `{ provide: UserRepository, useClass: UserTypeOrmRepository }` y ningún consumidor necesita `@Inject`. El adaptador hace `implements` (nunca `extends`), y el puerto declara solo miembros `abstract` públicos. Cuidado con un detalle que no avisa: hacer `import type` de un puerto en un archivo con decoradores borra la referencia del emit y Nest falla **en runtime** con `lint` y `typecheck` en verde — por eso `eslint.config.mjs` prohíbe esa forma de import bajo `application/` e `infrastructure/`.
- **Los errores de dominio no son errores HTTP.** El dominio lanza `UserNotFoundError`; `UserDomainExceptionFilter` decide que eso es un 404. Traducir los errores del driver también es tarea del adaptador: `UserTypeOrmRepository` convierte la violación del índice único (`23505`) en `EmailAlreadyTakenError`, para que una colisión concurrente salga como 409 y no como 500.
- **La validación de entrada vive en los DTOs HTTP**, no en las entidades. El dominio protege sus invariantes en constructores y value objects.

### Aliases de TypeScript

| Alias         | Apunta a         |
| ------------- | ---------------- |
| `@/*`         | `src/*`          |
| `@common/*`   | `src/common/*`   |
| `@config/*`   | `src/config/*`   |
| `@database/*` | `src/database/*` |
| `@modules/*`  | `src/modules/*`  |
| `@shared/*`   | `src/shared/*`   |
| `@test/*`     | `test/*`         |

Están declarados en `tsconfig.json`, `.swcrc` y `jest.config.mjs`. La config E2E hereda de esta última, así que **solo hay tres sitios que mantener en sincronía**, no cuatro.

**Dentro de un módulo, importa con rutas relativas** (`../../domain/user.entity`), no con alias: así el módulo se puede mover completo sin tocar imports.

---

## Base de datos

### Migraciones, no `synchronize`

`synchronize: true` deja que TypeORM altere el esquema para que encaje con las entidades, y eso incluye **borrar columnas y tablas con sus datos**. Por eso no se toma directamente del entorno:

```ts
// src/config/database.config.ts
synchronize: env.NODE_ENV === 'development' && env.DB_SYNCHRONIZE;
```

`DB_SYNCHRONIZE` solo puede **apagarlo**; encenderlo exige además estar en `development`. Un `.env` de producción mal copiado no puede tocar el esquema.

El flujo normal es:

```bash
# 1. Cambias una *.orm-entity.ts
# 2. Generas la migración con el diff contra la base
pnpm migration:generate src/database/migrations/AddPhoneToUser

# 3. La revisas (siempre) y la aplicas
pnpm migration:run

# Para deshacer la última
pnpm migration:revert

# Para ver el estado
pnpm migration:show
```

En producción, `DB_MIGRATIONS_RUN=true` aplica las pendientes al arrancar.

> **Si la migración DROPEA o RENOMBRA algo, no vale con generarla y correrla.** Se parte en dos
> —expand y contract— con el despliegue del código en medio, y `DB_MIGRATIONS_RUN=true` deja de
> ser seguro para la mitad destructiva. La regla completa, con el ejemplo trabajado de
> `MoveCredentialsToAuthExpand` / `MoveCredentialsToAuthContract`, vive en
> [`CLAUDE.md` §«Destructive migrations: expand/contract»](./CLAUDE.md#destructive-migrations-expandcontract).

### Conexión y TLS (RDS)

La conexión se define por campos separados (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_SCHEMA`), no por una URL, para que cada uno pase por la validación de Zod.

| Escenario                     | Configuración                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Local (docker-compose)        | `DB_SSL=false`                                                                        |
| RDS con verificación completa | `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=true`, `DB_SSL_CA=/ruta/global-bundle.pem` |
| RDS sin CA a mano             | `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=false`                                     |

> `DB_SSL_REJECT_UNAUTHORIZED=false` **cifra el tráfico pero no verifica la identidad del servidor**: acepta cualquier certificado, así que no protege de un man-in-the-middle. Úsalo solo si no puedes montar el bundle de CA de AWS ([descargarlo aquí](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html)). Si apuntas `DB_SSL_CA` a una ruta que no existe, el arranque falla con `ENOENT`.

El pool se ajusta con `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT_MS` y `DB_CONNECTION_TIMEOUT_MS`. Con varias réplicas, `DB_POOL_MAX × réplicas` no debe superar el `max_connections` de la instancia.

---

## Testing

Los tests viven en una carpeta `__tests__/` en la raíz de cada módulo, replicando su estructura interna. Así, mover un módulo se lo lleva con todos sus tests de una pieza.

```
src/modules/users/
├── domain/entities/user.entity.ts
├── application/use-cases/create-user.use-case.ts
└── __tests__/
    ├── domain/entities/user.entity.spec.ts
    ├── application/use-cases/create-user.use-case.spec.ts
    ├── application/users.facade.spec.ts
    ├── infrastructure/http/users.controller.spec.ts
    ├── infrastructure/persistence/user.mapper.spec.ts
    ├── helpers/user.factory.ts
    ├── helpers/in-memory-user.repository.ts
    └── users.e2e-spec.ts
```

**Convenciones:**

- **Un spec por archivo de código**, con el mismo nombre base y la misma ruta relativa dentro de `__tests__/`.
- `describe` con el identificador real del código (en inglés); cada `it` es una frase en español que empieza por **`debería…`**. El código, las variables y los helpers siguen en inglés.
- **AAA obligatorio**: cada `it` marca `// Arrange`, `// Act`, `// Assert`. Si una fase no existe, se omite el comentario en vez de escribirlo vacío.
- **Mocking por capa**: sin mocks en `domain/`; fakes escritos a mano en `application/` (nunca `jest.mock`); los repositorios se prueban contra PostgreSQL real en los E2E.
- **Helpers al final del archivo**, bajo `// Helpers`. Los compartidos por todo un módulo van en `__tests__/helpers/`; los transversales, en `test/helpers/` y se importan por `@test/`.
- **Property-based con `fast-check`** donde más rinde: value objects, funciones puras y round-trips de mapeo. Los arbitrarios se **construyen**, nunca se filtran con `.filter()`.

### Base de datos de los tests

Los E2E corren contra **`nest_base_template_test`**, no contra tu base de desarrollo. La crea automáticamente el init script de `docker/initdb/` al levantar el contenedor, y `test/setup-env.ts` apunta la suite ahí antes de que arranque el `AppModule`.

Es necesario porque cada E2E hace `TRUNCATE` en su `beforeEach`: la suite afirma conteos exactos y, sin vaciar la tabla, el índice único devolvería 409 donde el primer test espera 201 en la segunda ejecución.

> Si ya tenías el contenedor creado de antes de este cambio, el init script no se ejecuta sobre un volumen existente. Corre `pnpm db:reset` (borra los datos locales) o crea la base a mano:
> `docker exec nest-base-template-db psql -U postgres -c 'CREATE DATABASE nest_base_template_test'`

### Cobertura

La suite unitaria excluye módulos, repositorios TypeORM, `data-source.ts` y migraciones, porque los valida la suite E2E contra base real. **Eso ya no es un acto de fe**: `test/jest-e2e.config.mjs` mide exactamente esos archivos y les aplica su propio umbral, así que `pnpm test:e2e:ci` falla si dejan de estar cubiertos.

El umbral de `branches` (50) es más bajo que el resto a propósito: SWC instrumenta el código que genera para `emitDecoratorMetadata`, y esas ramas no son alcanzables desde un test. Los archivos sin decoradores llegan al 88-100 %.

---

## Scripts

| Comando                        | Descripción                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `pnpm start:dev`               | Arranca en modo watch                                                         |
| `pnpm start:debug`             | Watch + inspector en el 9229                                                  |
| `pnpm build`                   | Compila con SWC a `dist/`                                                     |
| `pnpm start:prod`              | Corre el build (`node dist/src/main`)                                         |
| `pnpm lint` / `lint:check`     | Lint con autofix / sin escribir (CI)                                          |
| `pnpm format` / `format:check` | Prettier write / check (CI)                                                   |
| `pnpm typecheck`               | `tsc --noEmit`                                                                |
| `pnpm test`                    | Unit tests                                                                    |
| `pnpm test:watch`              | Unit tests en watch                                                           |
| `pnpm test:cov`                | Unit tests con cobertura y umbrales                                           |
| `pnpm test:ci`                 | Unit tests para CI                                                            |
| `pnpm test:e2e`                | E2E — **requiere la base levantada**                                          |
| `pnpm test:e2e:ci`             | E2E para CI, con su propia cobertura                                          |
| `pnpm db:up` / `db:down`       | Levanta / detiene PostgreSQL                                                  |
| `pnpm db:reset`                | Borra el volumen y arranca limpio                                             |
| `pnpm migration:generate`      | Genera migración por diff contra la base                                      |
| `pnpm migration:run`           | Aplica migraciones pendientes                                                 |
| `pnpm migration:revert`        | Revierte la última migración                                                  |
| `pnpm migration:show`          | Lista el estado de las migraciones                                            |
| `pnpm seed:admin`              | Crea o promueve el primer admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), idempotente |
| `pnpm outbox:relay`            | Publica (hoy: log) los eventos pendientes de `orders_outbox` y los marca      |

**Definition of Done** de cualquier cambio: `typecheck` → `lint:check` → `format:check` → `test` → `test:e2e` → `build`, todo en verde.

---

## Docker

```bash
# Solo la base de datos (desarrollo)
pnpm db:up

# Imagen de la aplicación
docker build -t nest-base-template .
docker run --env-file .env -p 8888:8888 nest-base-template
```

El `Dockerfile` es multi-stage (deps → build → production), corre como usuario `node` sin privilegios e incluye un `HEALTHCHECK` contra el endpoint de liveness, cuya ruta se construye desde `GLOBAL_PREFIX` y `API_VERSION`.

> El stage de producción instala con `--prod --ignore-scripts`. Ese `--ignore-scripts` es obligatorio: pnpm ejecuta el hook `prepare` también en instalaciones de producción, y `prepare` invoca a `husky`, que es devDependency. Sin él el build falla con `husky: command not found`.

> `LOG_PRETTY=true` en la imagen requiere `pino-pretty`, que por eso está en `dependencies` y no en `devDependencies`.

---

## Skills de IA

Una **skill** es un manual que se le carga a un asistente de IA para que trabaje como se trabaja aquí, en vez de improvisar. Son archivos de texto: viven en [`.claude/skills/`](./.claude/skills/), se leen igual que cualquier documento y no ejecutan nada por su cuenta.

Hay siete, y se dividen en dos grupos según cómo se usan.

### Las cuatro que forman el flujo de trabajo

Se invocan **en este orden** para cualquier cambio que no sea trivial. Cada una produce algo escrito que alimenta a la siguiente:

```
brainstorming  →  writing-plans  →  subagent-driven-development   (preferido)
   (spec)           (plan)      └→  executing-plans               (alternativa)
```

| Skill                                                                                               | Qué hace                                                                                     | Cuándo usarla                                                             |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`brainstorming`](https://www.skills.sh/obra/superpowers/brainstorming)                             | Convierte una idea en una especificación escrita, preguntando de una en una hasta entenderla | **Antes de escribir código nuevo.** Deja la spec en `docs/specs/`         |
| [`writing-plans`](https://www.skills.sh/obra/superpowers/writing-plans)                             | Parte esa spec en tareas pequeñas, con qué archivo tocar y cómo probar cada una              | Cuando ya hay spec y antes de tocar código. Deja el plan en `docs/plans/` |
| [`subagent-driven-development`](https://www.skills.sh/obra/superpowers/subagent-driven-development) | Ejecuta el plan tarea a tarea, cada una con un asistente nuevo y dos revisiones              | **La opción por defecto** cuando las tareas del plan son independientes   |
| [`executing-plans`](https://www.skills.sh/obra/superpowers/executing-plans)                         | Ejecuta el mismo plan, pero en la conversación actual y sin delegar                          | Planes pequeños, o con tareas tan acopladas que separarlas estorba        |

Las dos últimas hacen el mismo trabajo; la diferencia es si cada tarea va a un asistente limpio o todas comparten la misma conversación.

### Las tres que se consultan

No son pasos del flujo: son la referencia que se abre mientras se escribe código, para no reinventar criterios ya decididos.

| Skill                                                                                                   | Manda sobre                                                                        |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`clean-ddd-hexagonal`](https://www.skills.sh/ccheney/robust-skills/clean-ddd-hexagonal)                | Dónde va cada archivo, qué capa puede importar a cuál, cómo se modela un dominio   |
| [`nestjs-best-practices`](https://www.skills.sh/kadajett/agent-nestjs-skills/nestjs-best-practices)     | 45 reglas de NestJS 11: módulos, inyección de dependencias, seguridad, rendimiento |
| [`javascript-typescript-jest`](https://www.skills.sh/github/awesome-copilot/javascript-typescript-jest) | Cómo se escriben los tests aquí: nombres, estructura AAA, qué mockear en cada capa |

### De dónde vienen y qué cuidar al actualizarlas

Las siete se instalaron desde repositorios públicos, y [`skills-lock.json`](./skills-lock.json) fija el origen y un hash de contenido de cada una — el equivalente a un `pnpm-lock.yaml` para las skills.

> **⚠️ Tres están adaptadas a este repositorio y no son la versión original:** `clean-ddd-hexagonal` y `javascript-typescript-jest` se reescribieron para este stack y estas convenciones, y `nestjs-best-practices` lleva las reglas alineadas con NestJS 11. Traerse la versión de arriba sin más **pisaría esas adaptaciones**. Compara antes de actualizar.

El lint y Prettier ignoran `.claude/` a propósito: son documentación, no código del proyecto. Sin esa exclusión, el hook de pre-commit fallaba al intentar analizar con tipos un `.ts` que no pertenece a ningún `tsconfig`.

---

## Convenciones

- **Tipos**: `type`, nunca `interface` (`@typescript-eslint/consistent-type-definitions`).
- **Logging**: nunca `console.log` (ESLint lo advierte). Inyectar `PinoLogger` o el logger de contexto.
- **Errores**: en `infrastructure/` se lanza `HttpException`; en `domain/` y `application/`, errores de dominio que un filtro traduce.
- **Validación**: DTOs con `class-validator` + `class-transformer`. El `ValidationPipe` global aplica `whitelist`, `forbidNonWhitelisted` y `transform`. **No usa `enableImplicitConversion`**: convertía los valores antes de validar, así que un objeto pasaba por `@IsString()` como `"[object Object]"`. Los DTO que necesitan coerción la piden con `@Type(() => Number)`.
- **Respuestas**: `TransformInterceptor` envuelve todo como `{ success, data, request }`. Los controllers lo declaran en el OpenAPI con `@ApiEnvelope(Dto)` / `@ApiPaginatedEnvelope(Dto)`, para que un SDK generado desde `/api/docs/json` deserialice el cuerpo real. Para formatos específicos (health, descargas), usar `@SkipTransform()`.

- **Documentación obligatoria**: todo endpoint nuevo se documenta por completo —ejemplos de request y response, parámetros con valores válidos, un ejemplo por cada status code— y `src/bootstrap/__tests__/openapi-contract.e2e-spec.ts` **rompe el build** si falta algo. Las reglas exactas, con el criterio de qué declarar y qué no, están en `CLAUDE.md`. `UsersController` es la implementación de referencia.
- **Commits**: Conventional Commits obligatorio (commitlint en `commit-msg`). Husky corre `lint-staged` en `pre-commit`. Desde el 2026-08-06 (backlog #6), `lint-staged` también escanea **todo archivo staged** con `secretlint` (preset recommend): una clave o token detectado bloquea el commit antes de que entre al historial.

## Convención de commits

Los mensajes se validan con [commitlint](./commitlint.config.cjs) en el hook `commit-msg`. Si el mensaje no cumple, el commit se rechaza.

```
<type>(<scope opcional>): <descripción>

<body opcional>

<footer opcional>
```

| Type       | Cuándo usarlo                                                       |
| ---------- | ------------------------------------------------------------------- |
| `feat`     | Nueva funcionalidad para el usuario final (bumpea minor en SemVer). |
| `fix`      | Corrección de bug (bumpea patch en SemVer).                         |
| `docs`     | Cambios solo en documentación.                                      |
| `style`    | Formato, espacios, comas; sin cambio funcional.                     |
| `refactor` | Reestructuración sin cambiar comportamiento ni arreglar bug.        |
| `perf`     | Mejora de rendimiento.                                              |
| `test`     | Agregar o ajustar tests.                                            |
| `build`    | Cambios al build, dependencias, `tsconfig`, `package.json`.         |
| `ci`       | Cambios en pipelines de CI/CD.                                      |
| `chore`    | Mantenimiento que no encaja en otros tipos.                         |
| `revert`   | Revertir un commit anterior.                                        |

El `scope` está restringido a una lista cerrada, con una entrada por cada carpeta real del repo: `health`, `users`, `config`, `database`, `logger`, `common`, `shared`, `main`, `bootstrap`, `openapi`, `cors`, `throttler`, `test`, `docker`, `deps`, `docs`, `ci`, `release`. **Al añadir un bounded context, añade su scope** a `commitlint.config.cjs`.

Para un cambio incompatible, añadir `!` tras el type/scope **o** un footer `BREAKING CHANGE:`:

```
feat(users)!: cambiar formato de respuesta de /users

BREAKING CHANGE: el campo `userId` ahora se llama `id`.
```

---

## Endpoints base

- `GET /api/v1/health` — health agregado (memoria + base de datos). **Público.**
- `GET /api/v1/health/liveness` — liveness probe, sin dependencias externas. **Público.**
- `GET /api/v1/health/readiness` — readiness probe: memoria **y** ping a PostgreSQL. **Público.**
- `POST /api/v1/auth/register` — registra una cuenta: perfil en `users` **y** credencial en
  `auth_credentials`. **Público** — sin alta pública nadie llegaría a tener credenciales que
  presentar en `/auth/login`. Si la credencial no puede escribirse, el perfil recién creado se
  borra (compensación) y la petición falla: nunca queda una cuenta sin forma de entrar.
- `POST /api/v1/auth/login` — autentica y emite un JWT. **Público.** Los dos endpoints de auth
  comparten el mismo límite de 10/min (más estricto que el global) por ser el blanco natural de
  fuerza bruta, pero con contadores separados: `ThrottlerGuard` indexa por clase **y** método.
- `GET /api/v1/users` — lista paginada. **Requiere rol `admin`.**
- `GET /api/v1/users/:id` — obtiene uno por id. **Autenticado** (cualquier rol).
- `DELETE /api/v1/users/:id` — desactiva sin borrar. **Requiere rol `admin`.**
- `POST /api/v1/orders` — coloca una orden a nombre del usuario del token. **Autenticado**
  (cualquier rol). El `customerId` sale siempre del token, nunca del body; si el usuario fue
  desactivado después de emitirse el token, responde 403.
- `GET /api/docs` — documentación Scalar (si `DOCS_ENABLED=true`).
- `GET /api/docs/json` — el documento OpenAPI crudo, para generar SDKs.

Todo endpoint sin `@Public()` exige un JWT válido: el guard (`JwtAuthGuard`) es **global y activo
por defecto**, registrado como `APP_GUARD` desde `auth.module` — la matriz de boundaries impide
hacerlo desde `app.module`, y verificar un token es responsabilidad de `auth`. `@Auth()` marca
«autenticado, cualquier rol»; `@Auth('admin')` exige además ese rol, con 403 para quien no lo
tenga.

Los endpoints de `/health` están exentos del throttler global (`@SkipThrottle`) y del `TransformInterceptor` (`@SkipTransform`) para preservar el shape canónico de Terminus.

La distinción entre liveness y readiness es intencionada: liveness responde a «¿hay que reiniciar el proceso?» y por eso no consulta la base —si Postgres cae, reiniciar el pod no arregla nada—, mientras que readiness responde a «¿puede este pod atender tráfico?» y sí la comprueba, para que el orquestador lo saque de rotación.

## Deploy notes

- `app.enableShutdownHooks()` está activo; los handlers de `SIGTERM`/`SIGINT` aplican un timeout de `SHUTDOWN_TIMEOUT_MS` antes de forzar `process.exit(1)` (útil en Kubernetes).
- `main.ts` solo arranca el servidor si es el punto de entrada del proceso (`require.main === module`), para que importarlo desde los tests no levante un servidor real.
- Server timeouts a nivel socket: `requestTimeout = REQUEST_TIMEOUT_MS`, `headersTimeout = REQUEST_TIMEOUT_MS + 1s`, `keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS`. Para Cloud Run / ALB, `keepAliveTimeout` debe superar el del LB para evitar 502s.
- Tras un proxy (LB / ingress / Cloud Run), configura `TRUST_PROXY` para que `ThrottlerGuard` discrimine clientes reales y `req.ip` apunte al cliente.
- El header `x-request-id` se respeta si viene del cliente; si no, se genera un UUID v4 y se refleja en la respuesta. Se propaga vía `nestjs-cls` y aparece en todos los logs de la petición.
- **`staging` se trata como producción**, no como desarrollo: los mensajes de error nativos se sanitizan a `Internal server error` y helmet aplica CSP. En `development` y `test` se devuelve el mensaje real para poder depurar.
- **`JWT_SECRET` es obligatorio fuera de `development`/`test`** — ver [Auth](#auth).
- **El primer admin se crea con `pnpm seed:admin`, idempotente** — ver [Auth](#auth).
- **⚠️ Una migración que dropea o renombra algo NO se despliega con `DB_MIGRATIONS_RUN=true` en un despliegue rodante**: corre al arrancar el primer pod nuevo, mientras las réplicas viejas siguen sirviendo, y TypeORM enumera las columnas en cada `SELECT` —así que un `DROP COLUMN` tumba **toda** lectura de esa tabla, no solo la que usaba la columna. El patrón obligatorio (expand → despliegue → contract), las dos salidas operativas y el ejemplo trabajado están en [`CLAUDE.md` §«Destructive migrations: expand/contract»](./CLAUDE.md#destructive-migrations-expandcontract).
