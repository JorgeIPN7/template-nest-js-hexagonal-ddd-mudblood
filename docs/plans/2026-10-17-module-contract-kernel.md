# Contrato base de módulo: kernel compartido y guardas verificadas — plan de implementación

> **For agentic workers:** execute with `executing-plans` (default) in a NEW session, or
> `subagent-driven-development` if the plan says it qualifies. Steps use checkbox (`- [ ]`) syntax.
> **Never run `git commit`, `git add` or `git push`** — suggest a commit and wait.

**Spec:** `docs/specs/2026-10-17-module-contract-kernel-design.md`

**Estado (2026-10-19): ejecutado y cerrado.** Las 12 tareas están en `65a4fdb..1423807`, y su
cierre, en los commits que les siguen en la rama `feat/add-core-modules`. El informe de ejecución
—mediciones, rojos, guardas, revisiones y desvíos— va en la descripción del PR de esa rama, no
aquí. Las casillas no se marcaron: el estado lo dice esta línea, no ellas.

**Goal:** que `users`, `orders` y `auth` hereden de un kernel compartido y de unas bases de
`common/`, y que un test de arquitectura verifique ese contrato en todo módulo de `src/modules/`,
presente o futuro.

**Bounded context:** ninguno nuevo. Cambian el kernel (`src/shared/domain/`), `src/common/` y los
contextos `src/modules/users/`, `src/modules/orders/` y `src/modules/auth/`. `health`, que es
plano, queda exento.

**Architecture:**

- El kernel gana `DomainError`, `Entity<TId>` (`id`, `createdAt`, `updatedAt` y `touch(now)`) y
  `UuidIdentifier<TBrand>`, un id con marca nominal. `AggregateRoot<TId, TEvent>` pasa a extender
  `Entity`.
- `common/` gana tres piezas:
  - `DomainExceptionFilter<E>`: una tabla de mapeo, y cada contexto pone su propio `@Catch`;
  - `failClosed`, para los mappers;
  - la fuente única de los literales de los ejemplos OpenAPI.
- `module-contract.spec.ts` verifica diez reglas sobre `src/modules/*`.
- `migration-conventions.spec.ts` gana la guarda de cero claves foráneas.
- La CI gana el paso «Schema drift».
- Ningún puerto cambia de firma.

**Execution:** `executing-plans`. Las 12 tareas están acopladas: el trinquete del test de contrato
encadena de la 6 a la 9, y la 8 recrea las bases locales. Ver «Execution handoff».

---

## Cómo leer este plan

- **Base git: `32ade98`** (`main`). La Preparación la confirma o la sustituye.
- **Estado de las tablas «Casos acordados»: aprobadas en bloque por el usuario el 2026-10-17**,
  incluidas las filas propuestas por encima del mínimo. Una fila nueva que aparezca al
  implementar se consulta agrupada y se registra en su tarea antes de escribir su test.
- **Decisiones del usuario tomadas al revisar el plan** (se suman a las B1-B8 de la spec):
  - **B9:** `pnpm seed:admin` también rescata una credencial con un id que no es v4: su upsert
    renueva el id en cada promoción (Task 9);
  - **B10:** el `timestamp` de ejemplo de `RequestMetaDto` se unifica con el literal común
    (Task 5).
- **Los identificadores de fila (E1, P2, K5, A1…) son del plan.** No se copian a `src/`, donde
  citarían un plan que puede perderse (backlog #29): el caso vive en el texto del `it`.
- **Las referencias `archivo:línea` describen la base `32ade98`.** Las tareas anteriores mueven
  líneas, así que cada paso que dice «localízalo por texto» hay que hacerlo con grep, no por
  número.
- **El orden importa.** Cada tarea termina con `pnpm typecheck` y sus suites en verde, y usa solo
  lo que crearon las anteriores.

## Decisiones transversales del plan

Son técnicas y se aplican a varias tareas. Las de negocio están en la spec (B1-B8).

- **Trinquete del test de contrato.** La fila «árbol» de `src/__tests__/module-contract.spec.ts`
  compara con `toEqual` las violaciones del repo con la constante `PENDING_VIOLATIONS`, que nace
  con las diez de hoy (Task 6).
  - Cada tarea de contexto (7, 8 y 9) empieza quitando sus líneas de esa constante. La fila se
    pone roja por aserción, y ese es su primer rojo; al terminar vuelve a verde.
  - La Task 9 deja la lista vacía, cambia la fila a `toEqual([])` y borra la constante.
  - Así la suite no se queda en rojo de la Task 6 a la 9, y la igualdad exacta también falla si
    una violación se arregla sin quitarla de la lista.
  - El nombre va en inglés, como pide `CLAUDE.md`. El gate de idioma no lo vigilaría.
- **Forma común de los tres contextos.** La documenta la Task 11 y la comprueba en parte el test de
  contrato: mira las bases, el constructor `private`, `rehydrate`, `toSnapshot`, `from`, la marca,
  `@Catch` y los decoradores de las ORM entities. No ve la firma del constructor, que no se
  redeclaren campos de `Entity`, cuándo se llama a `touch` ni el contenido de `mappings`, que
  quedan a cargo de los tests de cada tarea y de la revisión:
  - la raíz de errores es `export abstract class <X>DomainError extends DomainError {}`, sin
    constructor: hereda el protegido y el `name` de la base;
  - los ids son `class <X>Id extends UuidIdentifier<'<X>Id'>`, sin constructor, con su propio
    `static from()` (que lanza el error de su contexto) y `static generate()`;
  - las entidades:
    - tienen un `private constructor(base: BaseEntityProps<XId>, …estado propio)` que llama a
      `super(base)`;
    - nunca redeclaran `id`, `createdAt` ni `updatedAt`. Un campo redeclarado da TS2612, TS2610
      o TS2415, pero una parameter property redeclarada compila sin aviso (medido con TS 6.0.3);
    - llaman a `touch(now)` solo desde sus métodos de intención, después de la guarda de no-op;
  - los filtros:
    - llevan `@Catch(<raíz>)` con un solo argumento y no declaran constructor;
    - declaran `protected readonly mappings: readonly DomainErrorMapping<Raíz>[] = [...]`, con
      funciones flecha y construyendo las `HttpException` con un string;
    - la anotación de tipo es obligatoria: sin ella, cada flecha da TS7006 (medido);
  - las columnas de fecha son `@Column({ type: 'timestamptz', default: () => 'now()' })`, nunca
    `CreateDateColumn` ni `UpdateDateColumn` (T9).
- **Tests nuevos:**
  - ids, entidades y errores se construyen dentro de cada `it`, nunca en el ámbito del módulo. Si
    un mutante vacía un constructor del kernel y el spec no carga, Stryker lo cuenta como error y
    no como killed;
  - las arbitrarias de `fcTest.prop([...])` se declaran como `function` bajo `// Helpers` o en
    línea, nunca como `const` al final: se evalúan al recolectar el `describe`, y una `const`
    sigue en su TDZ;
  - AAA con `// Arrange`, `// Act` y `// Assert` en líneas separadas. Las filas antiguas que
    llevan `// Act + Assert` se quedan como están (backlog #30);
  - ningún helper ni fixture de un spec se llama como un global de Jest (`describe`, `it`,
    `test`, `expect`): declarado bajo `// Helpers`, lo taparía y la suite no cargaría;
  - las tablas de un `it.each` se evalúan al recolectar, antes de los `beforeAll`: nunca llevan
    valores que asigna un hook (tokens, `prefix`). Llevan una etiqueta o un thunk, y el valor se
    resuelve dentro del `it`;
  - cuando el stub relanza la entrada o devuelve un error que no es el esperado, la primera
    aserción de la fila es la clase (`toThrow(Clase)` o `toBeInstanceOf(Clase)`), y el mensaje o
    `getResponse()` se leen después. Si no, la fila falla por excepción (`getResponse is not a
function`) o pasa en verde por casualidad.
- **Fixture compartida del kernel:** el `TestId` de prueba (un `ValueObject<string>` con
  `static of`) vive en `src/shared/__tests__/helpers/test-id.ts`. Lo crea la Task 2 y lo reutiliza
  la Task 8, porque `CLAUDE.md` prohíbe copiar un builder entre specs.
  `scripts/mutation-targets.mjs` ya reconoce esa carpeta como helper.
- **Entorno, en cada comando** (detalle en la Preparación):
  - todo comando que toque la base (`test:e2e`, `migration:*`, `db:*`, `seed:admin`) lleva
    `DB_PORT=5434` como prefijo en la misma línea, porque el shell de la herramienta no conserva
    variables entre llamadas. Donde una tarea diga «con `DB_PORT=5434`» o «en el mismo shell»,
    vale lo mismo: el prefijo va en cada línea. Sin él, el comando se conecta al 5433, que es de
    otro proyecto, y lo que se ve es un fallo de conexión, no el rojo o el verde que espera la
    tarea;
  - el nombre de la base de E2E no se escribe nunca en el plan ni en `docs/` (ver el punto
    siguiente). Se lee de `docker/initdb/01-create-test-database.sql` con
    `TEST_DB=$(sed -nE 's/^CREATE DATABASE ([a-z_]+);$/\1/p' docker/initdb/01-create-test-database.sql)`,
    en la misma línea que el comando que la usa;
  - nunca se compila con `tsc` sin `--noEmit`. Al redactar este plan, un `tsc` así dejó tres
    `.js` junto a sus `.ts` en `src/common/`, ya borrados, y Jest resuelve `.js` antes que `.ts`;
  - el ruido de `@pnpm/exe` en `pnpm-lock.yaml` se quita con Edit al cerrar CADA tarea, antes de
    su sugerencia de commit, para que no entre en ningún commit; la Task 12 lo comprueba contra la
    base con `git diff --exit-code 32ade98 -- pnpm-lock.yaml`.
- **Sin marcas del template en documentos nuevos.** `src/__tests__/init-project.spec.ts` exige
  declarar en `scripts/init-project.targets.json` todo archivo que contenga el nombre de la base,
  el del contenedor, el del repositorio o el título del template. Este plan, la spec y los
  `docs/*.md` que no están en ese manifiesto no los escriben: dicen «la base de E2E» o «el
  contenedor de la base».
- **Rule codes:** solo se citan donde cambian lo que hace el implementador. `security-sanitize-output`
  no aplica, porque trata de XSS: el saneado de los 500 lo dan `AllExceptionsFilter`, que en
  producción sanea los `Error` que no son HTTP, y el filtro de `auth` (T8).

## Mapa de archivos

Una fila por archivo que se crea, cambia o borra. «Temporal» se crea y se borra dentro de la
misma tarea.

| Archivo                                                                                                                                                                                                                                                                                     | Capa           | Tarea       | Qué cambia                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------- | ----------------------------------------------------------------------------- |
| `src/shared/domain/domain-error.ts`                                                                                                                                                                                                                                                         | kernel         | 1           | Nuevo: `DomainError`                                                          |
| `src/shared/domain/entity.base.ts`                                                                                                                                                                                                                                                          | kernel         | 2           | Nuevo: `BaseEntityProps`, `Entity`                                            |
| `src/shared/domain/uuid-identifier.base.ts`                                                                                                                                                                                                                                                 | kernel         | 3           | Nuevo: `UuidIdentifier`                                                       |
| `src/shared/domain/aggregate-root.ts`                                                                                                                                                                                                                                                       | kernel         | 8           | `AggregateRoot<TId, TEvent> extends Entity<TId>`                              |
| `src/shared/__tests__/domain/domain-error.spec.ts`                                                                                                                                                                                                                                          | test           | 1           | Nuevo                                                                         |
| `src/shared/__tests__/domain/entity.base.spec.ts`                                                                                                                                                                                                                                           | test           | 2           | Nuevo                                                                         |
| `src/shared/__tests__/helpers/test-id.ts`                                                                                                                                                                                                                                                   | test (helper)  | 2           | Nuevo: `TestId`; lo usa también la 8                                          |
| `src/shared/__tests__/domain/uuid-identifier.base.spec.ts`                                                                                                                                                                                                                                  | test           | 3           | Nuevo                                                                         |
| `src/shared/__tests__/domain/aggregate-root.spec.ts`                                                                                                                                                                                                                                        | test           | 8           | El doble se construye con props; fila K5                                      |
| `src/common/filters/domain-exception.filter.ts`                                                                                                                                                                                                                                             | common         | 4           | Nuevo: `DomainExceptionFilter`, `DomainErrorMapping`                          |
| `src/common/__tests__/filters/domain-exception.filter.spec.ts`                                                                                                                                                                                                                              | test           | 4           | Nuevo                                                                         |
| `src/common/nest-metadata.constants.ts` y su spec                                                                                                                                                                                                                                           | common         | 4           | `FILTER_CATCH_EXCEPTIONS`                                                     |
| `eslint.config.mjs`                                                                                                                                                                                                                                                                         | config         | 4 y 11      | Comentarios (`:104-105` en la 4; `:177-179` y el mensaje de `:208` en la 11)  |
| `src/common/persistence/fail-closed.ts` y su spec                                                                                                                                                                                                                                           | common         | 5           | Nuevo: `failClosed`                                                           |
| `src/common/dto/example-meta.factory.ts` y su spec                                                                                                                                                                                                                                          | common         | 5           | Nuevo: literales de ejemplo y `buildRequestMetaExample`                       |
| `src/common/dto/error-example.factory.ts` y su spec                                                                                                                                                                                                                                         | common         | 5 y 7       | Importa los literales (5); comentario del filtro renombrado (7)               |
| `src/common/dto/api-envelope.dto.ts`                                                                                                                                                                                                                                                        | common         | 5           | `timestamp` y `requestId` de ejemplo desde la fuente única (B10)              |
| `src/common/dto/error-response.dto.ts`                                                                                                                                                                                                                                                      | common         | 5 y 7       | Literales (5); comentario del filtro renombrado (7)                           |
| `src/modules/health/health.controller.ts`                                                                                                                                                                                                                                                   | health         | 5           | Literales del 503 desde la fuente única                                       |
| `src/bootstrap/__tests__/openapi-dump.tmp.e2e-spec.ts` y `.tmp/openapi-*.json`                                                                                                                                                                                                              | temporal       | 5           | Volcado del documento OpenAPI antes y después                                 |
| `src/__tests__/helpers/module-contract-checker.ts`                                                                                                                                                                                                                                          | test (helper)  | 6           | Nuevo: el checker                                                             |
| `src/__tests__/module-contract.spec.ts`                                                                                                                                                                                                                                                     | test           | 6, 7, 8 y 9 | Nuevo (6); trinquete (7-9)                                                    |
| `src/database/__tests__/migration-conventions.spec.ts`                                                                                                                                                                                                                                      | test           | 6           | `describe('sin claves foráneas')`                                             |
| `src/modules/users/domain/errors/user.errors.ts`                                                                                                                                                                                                                                            | domain         | 7           | Raíz sobre `DomainError`                                                      |
| `src/modules/users/domain/value-objects/user-id.vo.ts`                                                                                                                                                                                                                                      | domain         | 7           | Sobre `UuidIdentifier<'UserId'>`                                              |
| `src/modules/users/domain/entities/user.entity.ts`                                                                                                                                                                                                                                          | domain         | 7           | Sobre `Entity<UserId>`                                                        |
| `src/modules/users/application/users.facade.ts`                                                                                                                                                                                                                                             | application    | 7           | Solo un comentario                                                            |
| `src/modules/users/infrastructure/persistence/user.mapper.ts`                                                                                                                                                                                                                               | infrastructure | 7           | `failClosed`                                                                  |
| `src/modules/users/infrastructure/persistence/user.orm-entity.ts`                                                                                                                                                                                                                           | infrastructure | 7           | Fechas con `@Column`                                                          |
| `src/modules/users/infrastructure/http/users-domain-exception.filter.ts`                                                                                                                                                                                                                    | infrastructure | 7           | Nuevo: el filtro sobre la base                                                |
| `src/modules/users/infrastructure/http/user-domain-exception.filter.ts`                                                                                                                                                                                                                     | infrastructure | 7           | Se borra                                                                      |
| `src/modules/users/infrastructure/http/users.controller.ts`                                                                                                                                                                                                                                 | infrastructure | 5, 7 y 11   | Ejemplos (5); filtro (7); comentario de `UsersFacade` (11)                    |
| `src/modules/users/__tests__/domain/errors/user.errors.spec.ts`                                                                                                                                                                                                                             | test           | 7           | Nuevo                                                                         |
| `src/modules/users/__tests__/infrastructure/http/users-domain-exception.filter.spec.ts`                                                                                                                                                                                                     | test           | 7           | Nuevo, sustituye al del nombre viejo                                          |
| `src/modules/users/__tests__/infrastructure/http/user-domain-exception.filter.spec.ts`                                                                                                                                                                                                      | test           | 7           | Se borra                                                                      |
| `src/modules/users/__tests__/…`: `user-id.vo.spec.ts`, `user.entity.spec.ts`, `find-user-by-id.use-case.spec.ts`, `deactivate-user.use-case.spec.ts`, `users.facade.spec.ts`, `user.mapper.spec.ts`, `user.typeorm.repository.e2e-spec.ts`, `users.e2e-spec.ts`                             | test           | 7           | Filas nuevas o que cambian                                                    |
| `src/modules/auth/__tests__/auth.e2e-spec.ts`                                                                                                                                                                                                                                               | test           | 7 y 9       | Perfil corrupto en el registro (7); id de credencial corrupto en el login (9) |
| `src/modules/orders/domain/errors/order.errors.ts`                                                                                                                                                                                                                                          | domain         | 8           | Raíz sobre `DomainError`                                                      |
| `src/modules/orders/domain/value-objects/order-id.vo.ts`                                                                                                                                                                                                                                    | domain         | 8           | Sobre `UuidIdentifier<'OrderId'>`                                             |
| `src/modules/orders/domain/entities/order.entity.ts`                                                                                                                                                                                                                                        | domain         | 8           | Sobre `AggregateRoot<OrderId, OrderEvent>`, sin `placedAt`                    |
| `src/modules/orders/domain/ports/order.repository.ts`                                                                                                                                                                                                                                       | domain         | 8           | Solo el docstring: persistir `updatedAt` al actualizar                        |
| `src/modules/orders/application/use-cases/cancel-order.use-case.ts`                                                                                                                                                                                                                         | application    | 8           | `OrderNotFoundError(input.orderId)`                                           |
| `src/modules/orders/infrastructure/persistence/order.mapper.ts`                                                                                                                                                                                                                             | infrastructure | 8           | Fechas y `failClosed`                                                         |
| `src/modules/orders/infrastructure/persistence/order.orm-entity.ts`                                                                                                                                                                                                                         | infrastructure | 8           | `created_at` y `updated_at` en lugar de `placed_at`                           |
| `src/modules/orders/infrastructure/persistence/order.typeorm.repository.ts`                                                                                                                                                                                                                 | infrastructure | 8           | El UPDATE escribe `updatedAt`                                                 |
| `src/modules/orders/infrastructure/http/dto/order-response.dto.ts`                                                                                                                                                                                                                          | infrastructure | 8           | `createdAt` y `updatedAt` en lugar de `placedAt`                              |
| `src/modules/orders/infrastructure/http/orders.controller.ts`                                                                                                                                                                                                                               | infrastructure | 5 y 8       | Ejemplos (5); fechas del ejemplo y descripción (8)                            |
| `src/modules/orders/infrastructure/http/orders-domain-exception.filter.ts`                                                                                                                                                                                                                  | infrastructure | 8           | Sobre la base                                                                 |
| `src/modules/orders/orders.module.ts`                                                                                                                                                                                                                                                       | wiring         | 11          | Comentario de `UsersFacade`                                                   |
| `src/database/migrations/1786076763455-create-orders-and-outbox.ts`                                                                                                                                                                                                                         | migración      | 8           | Reescrita: `created_at` y `updated_at`, con cabecera                          |
| `src/modules/orders/__tests__/helpers/order.factory.ts` e `in-memory-order.repository.ts`                                                                                                                                                                                                   | test (helpers) | 8           | `DEFAULT_CREATED_AT`; el fake guarda `updatedAt`                              |
| `src/modules/orders/__tests__/infrastructure/http/dto/order-response.dto.spec.ts`                                                                                                                                                                                                           | test           | 8           | Nuevo                                                                         |
| `src/modules/orders/__tests__/…`: `order.errors.spec.ts`, `order-id.vo.spec.ts`, `order.entity.spec.ts`, `cancel-order.use-case.spec.ts`, `place-order.use-case.spec.ts`, `order.mapper.spec.ts`, `order.typeorm.repository.e2e-spec.ts`, `orders.controller.spec.ts`, `orders.e2e-spec.ts` | test           | 8           | Filas nuevas o que cambian                                                    |
| `src/modules/auth/domain/errors/auth.errors.ts`                                                                                                                                                                                                                                             | domain         | 9           | Raíz sobre `DomainError` e `InvalidCredentialIdError`                         |
| `src/modules/auth/domain/value-objects/credential-id.vo.ts`                                                                                                                                                                                                                                 | domain         | 9           | Nuevo: `CredentialId`                                                         |
| `src/modules/auth/domain/entities/credential.entity.ts`                                                                                                                                                                                                                                     | domain         | 9           | Sobre `Entity<CredentialId>`                                                  |
| `src/modules/auth/infrastructure/persistence/credential.mapper.ts`                                                                                                                                                                                                                          | infrastructure | 9           | `CredentialId.from(row.id)`, sin `failClosed`                                 |
| `src/modules/auth/infrastructure/persistence/credential.orm-entity.ts`                                                                                                                                                                                                                      | infrastructure | 9           | Fechas con `@Column`                                                          |
| `src/modules/auth/infrastructure/http/auth-domain-exception.filter.ts`                                                                                                                                                                                                                      | infrastructure | 9           | Sobre la base, con el 500 saneado del id corrupto                             |
| `src/modules/auth/infrastructure/http/auth.controller.ts`                                                                                                                                                                                                                                   | infrastructure | 5           | Ejemplos                                                                      |
| `src/modules/auth/auth.module.ts`                                                                                                                                                                                                                                                           | wiring         | 11          | Comentario de `UsersFacade`                                                   |
| `src/modules/auth/__tests__/domain/errors/auth.errors.spec.ts` y `…/value-objects/credential-id.vo.spec.ts`                                                                                                                                                                                 | test           | 9           | Nuevos                                                                        |
| `src/modules/auth/__tests__/…`: `credential.entity.spec.ts`, `credential.mapper.spec.ts`, `auth-domain-exception.filter.spec.ts`, `credential.typeorm.repository.e2e-spec.ts`                                                                                                               | test           | 9           | Filas nuevas o que cambian                                                    |
| `src/database/seeds/seed-admin.ts`                                                                                                                                                                                                                                                          | database (CLI) | 9           | El upsert de la credencial renueva también su id (B9)                         |
| `src/database/__tests__/seed-admin.e2e-spec.ts`                                                                                                                                                                                                                                             | test           | 9           | Fila SE1                                                                      |
| `.github/workflows/ci.yml`                                                                                                                                                                                                                                                                  | ci             | 10          | Paso «Schema drift»                                                           |
| `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `docs/architecture.md`, `docs/database.md`, `docs/testing.md`, `docs/development-workflows.md`, `docs/backlog.md`                                                                                                                                 | docs           | 11          | Inventario de la Task 11                                                      |
| `.claude/skills/clean-ddd-hexagonal/references/NESTJS-MAPPING.md`, `.claude/skills/clean-ddd-hexagonal/SKILL.md`, `.claude/skills/writing-plans/SKILL.md`                                                                                                                                   | docs (skills)  | 11          | Inventario de la Task 11                                                      |
| `stryker.config.mjs`                                                                                                                                                                                                                                                                        | config         | 12          | Solo la cabecera: el censo nuevo                                              |

**Sin cambios, comprobado:** las firmas de todos los puertos; los casos de uso de `users` y
`PlaceOrderUseCase`; `order-placed.event.ts` y `order-cancelled.event.ts`;
`outbox-message.orm-entity.ts`; el relay del outbox y su E2E; las demás migraciones;
`users.module.ts` y `orders.module.ts` salvo el comentario de la Task 11.

---

### Preparación

**Layer:** entorno. No cambia ningún archivo del repo.

**Para qué:** dejar la máquina en el estado medido, fijar la base y tomar las líneas base con las
que se comparan las Tasks 8, 10 y 12. Si una tarea dice `DB_PORT=5434`, `TEST_DB` o `32ade98`, el
dato viene de aquí.

**Lo que hay que saber de esta máquina.** Viene de la memoria del entorno, reverificada el
2026-10-16, y de lo medido al redactar este plan el 2026-10-17:

| Hecho                                                                                               | Qué implica                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker Desktop suele estar apagado                                                                  | Hay que arrancarlo antes de cualquier comando de base de datos.                                                                                                                                                                                                                                                                                                                                                                                                  |
| El puerto 5433 lo ocupa el contenedor de otro proyecto del usuario, y el `.env` dice `DB_PORT=5433` | ⚠️ Todo comando que toque la base lleva `DB_PORT=5434` **en la misma línea** (`DB_PORT=5434 pnpm …`).<br>El shell de la herramienta no conserva variables entre llamadas: sin el prefijo, la CLI se conecta a la base del otro proyecto.<br>Vale para `db:up`, `db:reset`, `migration:*`, `db:migrate:test`, `test:e2e`, `test:e2e:ci` y `seed:admin`.<br>Ese otro contenedor no se para.                                                                        |
| El nombre de la base de E2E y el del contenedor son marcas del template (`init-project.spec.ts:85`) | No se escriben en el plan.<br>Cada comando que necesita la base de E2E la lee en la misma línea con `TEST_DB=$(sed -nE 's/^CREATE DATABASE ([a-z_]+);$/\1/p' docker/initdb/01-create-test-database.sql)`.<br>El contenedor se nombra por su servicio de Compose, `postgres`: `docker compose ps postgres` y `docker compose exec -T postgres …`.                                                                                                                 |
| Cualquier `pnpm` añade unas 25 líneas de `@pnpm/exe` a `pnpm-lock.yaml`                             | No son de ninguna tarea. Se quitan con Edit (`git restore` está denegado) al cerrar cada tarea, antes de su sugerencia de commit, y otra vez en la Task 12. Al usuario se le avisa de que el pre-commit (`pnpm exec lint-staged`) puede volver a escribirlas.                                                                                                                                                                                                    |
| El `pnpm` del PATH rechaza `--trust-lockfile`                                                       | La instalación va con `corepack pnpm`; los scripts, con `pnpm` a secas.                                                                                                                                                                                                                                                                                                                                                                                          |
| La ruta del scratchpad supera MAX_PATH                                                              | Stryker se lanza solo desde la raíz del repo, con `pnpm test:mutation*`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `tsc` sin `--noEmit` deja un `.js` junto a cada `.ts` que compila                                   | Nunca se usa así. Jest resuelve `.js` antes que `.ts` (`jest.config.mjs:39`): ejecutaría la copia y no el fuente.                                                                                                                                                                                                                                                                                                                                                |
| ⚠️ La Task 8 ejecuta `pnpm db:reset`, que el usuario aprobó en la spec (B6)                         | Borra el volumen local, con los datos de desarrollo y el admin. El admin lo restaura el usuario desde su terminal, si lo necesita: `DB_PORT=5434 ADMIN_EMAIL=<suyo> ADMIN_PASSWORD=<suyo> pnpm seed:admin`, con una contraseña de 12 a 128 caracteres (`src/config/password-policy.ts:23`). El `.env` de esta máquina no define esas variables (el seed aborta sin ellas, `seed-admin.ts:39-40`), y la contraseña no debe pasar por la transcripción del agente. |

- [ ] **1. Base.** Ejecuta `git rev-parse HEAD` y `git log --oneline 32ade98..HEAD`.
  - La base es `32ade98` si HEAD es `32ade98d16395b9c9099fe460428127698bf611a`, o si los commits
    posteriores solo añaden la spec y este plan (compruébalo con `git diff --stat 32ade98 HEAD`).
  - Si hay otros commits (un merge de Renovate, por ejemplo), la base es el `git rev-parse HEAD` de
    ahora: anótala y úsala donde el plan dice `32ade98`.
- [ ] **2. Árbol limpio.**
  - `git status --porcelain --untracked-files=all` lista solo la spec y el plan como `??`, o nada
    si ya están confirmados, y como mucho ` M pnpm-lock.yaml`.
  - `find src test -name '*.js'` no devuelve nada.
  - Cualquier otra cosa contaminaría la mutación del código nuevo y la revisión: para y pregunta.
- [ ] **3. Gate de init-project.** `pnpm test src/__tests__/init-project.spec.ts` → todo en verde.
  - Si falla nombrando la spec o este plan, alguien les escribió una marca del template: quítala.
  - No se declaran en el manifiesto: el criterio es no escribir esas marcas en los documentos.
- [ ] **4. Estado de partida**, para dejarlo igual en la Task 12. Anota:
  - si `docker info --format '{{.ServerVersion}}'` responde;
  - qué devuelve `docker compose ps postgres --format '{{.Status}} {{.Ports}}'`.
- [ ] **5. Docker.** Si `docker info` falla, arranca Docker Desktop (en PowerShell:
      `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`). Espera a que
      `docker info` responda con un bucle de sondeo, no con un `sleep` en primer plano.
- [ ] **6. Dependencias.** `corepack pnpm install --frozen-lockfile --trust-lockfile` → exit 0
      («Already up to date» si ya cuadraban). Después comprueba:
  - `node --version` → `v24.21.0` (`.nvmrc`);
  - `node -p "require('./node_modules/@nestjs/core/package.json').version"` → `12.1.3`
    (`package.json:66`).

  Al redactar el plan, las dos ya coincidían.

- [ ] **7. Base de datos.** `DB_PORT=5434 pnpm db:up` → el servicio `postgres` queda `healthy`, y
      `docker compose ps postgres --format '{{.Ports}}'` → `0.0.0.0:5434->5432/tcp`.
  - Si el 5434 también está ocupado (`port is already allocated`), elige otro puerto libre y úsalo
    en todo el plan.
- [ ] **8. Migraciones.** `DB_PORT=5434 pnpm migration:run` (desarrollo) y
      `DB_PORT=5434 pnpm db:migrate:test` (E2E) → «No migrations are pending», o las aplican sin error.
- [ ] **9. Línea base de compilación y tests.**
  - `pnpm typecheck` → exit 0, sin salida.
  - `pnpm test` → todas las suites en verde. En la base hay 88 archivos `*.spec.ts` bajo `src/`,
    contados con `git ls-files`, no ejecutados.
  - `DB_PORT=5434 pnpm test:e2e` → las 12 suites `*.e2e-spec.ts` en verde. La memoria registra 161
    tests el 2026-10-16.

  Anota los totales: la DoD de la Task 12 se compara con ellos.

- [ ] **10. Línea base de deriva de esquema** (spec §13), antes de tocar código:
  - base de E2E, que es la que mira la CI:
    `TEST_DB=$(sed -nE 's/^CREATE DATABASE ([a-z_]+);$/\1/p' docker/initdb/01-create-test-database.sql) && DB_PORT=5434 DB_DATABASE="$TEST_DB" pnpm migration:generate src/database/migrations/DriftCheck --check; echo "exit=$?"`
    → `No changes in database schema were found` y `exit=0`;
  - base de desarrollo:
    `DB_PORT=5434 pnpm migration:generate src/database/migrations/DriftCheck --check; echo "exit=$?"`
    → lo mismo;
  - `ls src/database/migrations/` → los seis archivos de siempre y ningún `*-DriftCheck.ts`. Si
    aparece uno, pnpm no le pasó `--check` a la CLI: bórralo y avisa antes de seguir, porque la
    Task 10 depende de ese flag.
- [ ] **11. Si la línea base ya da diferencias.** Solo cuenta como deriva la salida «Unexpected
      changes in database schema were found in check mode» seguida de SQL. Un exit 1 con «Error during
      migration generation» es un fallo de conexión o de entorno.
  1. Mira si la base de E2E tiene migraciones de otra rama. Compara la salida de
     `TEST_DB=$(sed -nE 's/^CREATE DATABASE ([a-z_]+);$/\1/p' docker/initdb/01-create-test-database.sql) && docker compose exec -T -e TEST_DB="$TEST_DB" postgres sh -c 'psql -U "$POSTGRES_USER" -d "$TEST_DB" -Atc "SELECT name FROM migrations ORDER BY id"'`
     con `ls src/database/migrations/`.
     - Si sobran filas, recrea solo esa base, que no guarda nada porque los E2E la truncan:
       `TEST_DB=$(sed -nE 's/^CREATE DATABASE ([a-z_]+);$/\1/p' docker/initdb/01-create-test-database.sql) && docker compose exec -T -e TEST_DB="$TEST_DB" postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$TEST_DB" && createdb -U "$POSTGRES_USER" "$TEST_DB"'`.
     - Después, `DB_PORT=5434 pnpm db:migrate:test` y repite el `--check`.
  2. Si una base de E2E recién migrada sigue dando diferencias, la deriva está en el código de la
     base. **Para antes de la Task 1** y enséñale el SQL al usuario: la T9 da por hecho que no hay
     diferencias, y el paso de CI de la Task 10 nacería en rojo. Arreglarlo es un cambio aparte, y
     lo decide él.
  3. Si solo da diferencias la de desarrollo, esa base trae algo de otra rama y no del código.
     Anótalo y sigue: la Task 8 la recrea con `pnpm db:reset` y repite el `--check`.
- [ ] Si la spec y el plan siguen sin confirmar: _"Te sugiero hacer un commit de los cambios por
      añadir la spec y el plan del contrato base de módulo"_. Mensaje propuesto, a validar con el
      commitlint del repo: `docs: añadir la spec y el plan del contrato base de módulo`.

### Task 1: Kernel — `DomainError`

**Layer:** domain (kernel compartido, `src/shared/domain/`). Unitaria: no necesita Docker ni base de datos.

**Files:**

- Create: `src/shared/domain/domain-error.ts`
- Test: `src/shared/__tests__/domain/domain-error.spec.ts`
- Uses (from earlier tasks): ninguno. Al terminar no la usa nadie: las raíces de `users`, `orders` y `auth` pasan a extenderla en las Tasks 7, 8 y 9.

**Interfaces** (solo declaraciones):

`src/shared/domain/domain-error.ts`

```ts
export abstract class DomainError extends Error {
  protected constructor(message: string); // this.name = new.target.name
}
```

**Decisions:**

- Tiene la forma exacta de las tres raíces de hoy, que son idénticas entre sí (`user.errors.ts:5-10`, `order.errors.ts:6-11`, `auth.errors.ts:11-16`): `abstract`, `protected constructor(message)`, `super(message)` y `this.name = new.target.name` (spec T2). `new.target` es la clase concreta aunque haya una raíz abstracta en medio, y eso es lo que comprueba `login.use-case.spec.ts:175` (`error.name` = `'InvalidCredentialsError'`).
- No lleva `Object.setPrototypeOf` ni `Error.captureStackTrace`. Las clases son nativas (`target` ES2023 en `tsconfig.json:14` y `es2023` en `.swcrc:17`), así que `instanceof` funciona sin parches. SWC conserva el nombre de la clase (`.swcrc:16` fija `keepClassNames: true`); medido con `@swc/core` y las opciones de `.swcrc`, emite `let DomainError = class DomainError extends Error` con `this.name = new.target.name` intacto.
- El constructor no recibe `options` ni `cause`. Ninguna raíz de hoy los recibe, y `failClosed` (Task 5) envuelve el error de dominio en un `Error` nuevo con `{ cause }`, no en un `DomainError`.
- Los dobles son locales y van al final del spec, bajo `// Helpers`, con la forma de los contextos:
  - `SampleDomainError`: raíz `abstract`, sin constructor.
  - `SampleNotFoundError`: clase concreta con `constructor(readonly sampleId: string)`, que compone `Sample <id> was not found` como hace `UserNotFoundError` en `user.errors.ts:30-34`.
  - `DirectError`: extiende `DomainError` sin raíz en medio y declara un constructor público que reenvía el mensaje. Sin él, el constructor protegido heredado da TS2674 al instanciarla desde el test (comprobado con TS 6.0.3).
- El spec no importa errores de los módulos. Ninguna regla lo impediría, porque `boundaries/ignore` excluye `__tests__/` (`eslint.boundaries.js:113`). Pero el README manda borrar `src/modules/<contexto>/` entera para quitar un ejemplo (`README.md:313-325`), y el kernel tiene que poder probarse solo. Precedente: `value-object.base.spec.ts:95-100`.
- Los dobles se construyen dentro de cada `it`, en el Arrange, nunca en el ámbito del módulo. El mutante que vacía el constructor lanza `ReferenceError: Must call super constructor in derived class…` (medido sobre un prototipo). Si eso ocurre al cargar el archivo, el jest-runner de Stryker lo cuenta como error y no como killed (`@stryker-mutator/jest-runner/dist/src/jest-test-runner.js:160-167`).
- `name` se compara con el literal (`'SampleNotFoundError'`) y no con `SampleNotFoundError.name`, para que el valor esperado no salga del mismo mecanismo que usa el SUT.
- AAA con `// Arrange`, `// Act` y `// Assert` en líneas separadas en cada `it`. El `// Arrange + Act` de `value-object.base.spec.ts:87` es deuda (backlog #30) y no se toma como modelo.

**Casos acordados:**

| #   | Caso (se vuelve el `it`)                                                                              | Entrada / estado inicial                                                                                   | Resultado esperado                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | debería tomar como name el nombre de la clase concreta que la extiende directamente                   | `new DirectError('m')`                                                                                     | `name` = `'DirectError'`                                                                                                                                                                                          |
| 2   | debería tomar como name el nombre de la clase concreta aunque herede de una raíz abstracta intermedia | `new SampleNotFoundError('s-1')`, que extiende `SampleDomainError` (abstracta), que extiende `DomainError` | `name` = `'SampleNotFoundError'`                                                                                                                                                                                  |
| 3   | debería conservar el mensaje que compone la clase concreta                                            | `new SampleNotFoundError('s-1')`                                                                           | `message` = `'Sample s-1 was not found'`                                                                                                                                                                          |
| 4   | debería ser instancia de Error, de DomainError y de su raíz intermedia                                | `new SampleNotFoundError('s-1')`                                                                           | `instanceof Error`, `instanceof DomainError` e `instanceof SampleDomainError` dan `true`. **Ya verde desde el Stub:** lo da `extends Error` con clases nativas; fija que la base no rompa la cadena de prototipos |

- [ ] **Stub:** crea `domain-error.ts` con la Interface. El constructor solo llama a `super()` sin argumentos y no fija `name`. Mientras sea stub, el parámetro se llama `_message`, porque con `noUnusedParameters` (`tsconfig.json:28`) un parámetro sin uso da TS6133 → `pnpm typecheck` en verde.
- [ ] **Red:** escribe `domain-error.spec.ts` (raíz `describe('DomainError')`, un `it` por fila con su texto exacto) y ejecuta `pnpm test src/shared/__tests__/domain/domain-error.spec.ts`. Las filas 1 y 2 fallan por aserción (`name` vale `'Error'`) y la 3 también (`message` vale `''`). La 4 pasa, como dice su fila.
- [ ] **Green:** `super(message)` y `this.name = new.target.name` → `pnpm test src/shared/__tests__/domain/domain-error.spec.ts` da `Tests: 4 passed, 4 total`.
- [ ] **Refactor:** añade un comentario de cabecera en español con el porqué, al estilo de `value-object.base.ts:1-21`: es la base que sustituye a las tres raíces copiadas, por qué `new.target.name` y por qué sin `setPrototypeOf` → `pnpm typecheck`.
- [ ] **Verificación de cierre:**
  - `pnpm typecheck`: sin errores.
  - `pnpm test`: todas las suites en verde, incluida `src/__tests__/language-convention.spec.ts`, que también escanea los identificadores de los dobles (`language-convention.spec.ts:8`).
  - `pnpm lint:check`: sin errores.
  - `pnpm format:check`: «All matched files use Prettier code style!».
  - `git status --short`: solo los dos archivos nuevos. Si aparece `pnpm-lock.yaml`, es el ruido `@pnpm/exe` y se quita con Edit, como dice la Preparación.
- [ ] _"Te sugiero hacer un commit de los cambios por la base `DomainError` del kernel con su spec"_

### Task 2: Kernel — `Entity` y `BaseEntityProps`

**Layer:** domain (kernel compartido, `src/shared/domain/`). Unitaria: no necesita Docker ni base de datos.

**Files:**

- Create: `src/shared/domain/entity.base.ts`
- Test: `src/shared/__tests__/domain/entity.base.spec.ts`
- Create (helper de test): `src/shared/__tests__/helpers/test-id.ts`, con `TestId`. Lo reutiliza la Task 8 en `aggregate-root.spec.ts`.
- Uses (from earlier tasks): ninguno. Usa `ValueObject` (`src/shared/domain/value-object.base.ts:22`), que no cambia.
- No toca `src/shared/domain/aggregate-root.ts`. Pasa a `extends Entity<TId>` en la Task 8, junto con `orders`, para que el árbol compile en cada paso.

**Interfaces** (solo declaraciones):

`src/shared/domain/entity.base.ts`

```ts
export type BaseEntityProps<TId extends ValueObject<string>> = {
  id: TId;
  createdAt: Date;
  updatedAt: Date;
};
export abstract class Entity<TId extends ValueObject<string>> {
  readonly id: TId;
  readonly createdAt: Date;
  protected constructor(props: BaseEntityProps<TId>);
  get updatedAt(): Date;
  protected touch(now: Date): void; // updatedAt = now, aunque retroceda (T3)
  equals(other: Entity<TId> | null | undefined): boolean; // misma clase e id.equals(other.id)
}
```

**Decisions:**

- Sin props-bag (T3). El constructor copia los tres campos de `BaseEntityProps` y nada más. El resto del estado de cada entidad sigue en sus propios campos privados, con sus métodos de intención, que es el patrón de `user.entity.ts:30-38`.
- `updatedAt` vive en un campo `private _updatedAt` (la convención de `user.entity.ts:37`), detrás de un getter sin setter, y no en un campo `#`. Hay dos motivos, ambos medidos:
  - `toEqual` no ve los campos `#`. Con `expect@30.5.2`, dos objetos que solo difieren en `#updatedAt` pasan `toEqual`; con `_updatedAt`, no.
  - Con el `private` de TS, una subclase que conserve su propio `_updatedAt` no compila (TS2415), igual que una que declare `updatedAt` como campo (TS2610). Así, las Tasks 7 y 9 no pueden dejar por descuido dos fuentes de verdad.
- `touch(now)` deja `updatedAt` exactamente en `now`, también hacia atrás: sin `max()` y sin `new Date()` dentro. Es T3, que extiende a `updatedAt` el criterio de backlog #31 (`docs/backlog.md:1432-1433`). Es `protected`: solo lo llaman los métodos de intención de la propia entidad.
- Las fechas se guardan tal cual, sin copia defensiva, como hacen hoy las tres entidades (`user.entity.ts:42`, `credential.entity.ts:38`, `order.entity.ts:61`).
- `equals` devuelve `false` con `null` o `undefined`, y `false` si `other.constructor !== this.constructor` (el mismo criterio de clase que `value-object.base.ts:29`). Si no, devuelve `this.id.equals(other.id)`, que compara el valor a través del VO. `other` es nullable por el mismo motivo que en `ValueObject` (`value-object.base.ts:17-20`).
- `ValueObject` solo se usa como tipo. Se importa con `import type { ValueObject } from './value-object.base'`, en forma de declaración como en `user.entity.ts:1`, por `consistent-type-imports` y `no-import-type-side-effects` (`eslint.config.mjs:64-69`).
- La inmutabilidad de `id` y `createdAt` (`readonly`), la falta de setter de `updatedAt` y el `protected` de `touch` las impone el compilador (TS2540 y TS2445, comprobado con TS 6.0.3). No llevan fila con `@ts-expect-error`: son rasgos directos del lenguaje, y fijarlos probaría TypeScript, no el kernel. La marca de la Task 3 sí lleva su fila, porque es un mecanismo propio que depende de una regla sutil: los miembros privados vuelven nominal la comparación de tipos.
- La base no declara `toSnapshot()` ni `rehydrate`. Los exige el test de contrato (Task 6, clave `entities`), porque un tipo no puede exigir un miembro `static` (spec §2).
- No se importan ids de los módulos: el README manda borrar el módulo entero para quitar un ejemplo (`README.md:313-325`), y el kernel tiene que poder probarse solo.
  - `TestId extends ValueObject<string>`, con `static of(value)`, vive en `src/shared/__tests__/helpers/test-id.ts` y no en el spec: la Task 8 lo necesita también en `aggregate-root.spec.ts`, y `CLAUDE.md` («Shared fixtures») prohíbe copiar un builder entre specs. `scripts/mutation-targets.mjs` ya reconoce esa carpeta como helper. `UuidIdentifier` aún no existe.
  - Los demás dobles son locales, bajo `// Helpers`:
  - `Widget extends Entity<TestId>`, con `static create(props)` y un `bump(now)` público que delega en `touch` (el patrón de `emit()` → `record()` en `aggregate-root.spec.ts:52-60`).
  - `Gadget extends Entity<TestId>`, con `static create(props)`.
  - **`Widget` y `Gadget` usan el mismo `TestId`.** Con clases de id distintas, `id.equals` ya daría `false` por la clase del VO, y la fila 10 no mataría el mutante de la comprobación de clase. Medido sobre un prototipo con el instrumentador de Stryker 10.0.0: los tres mutantes de esa línea solo mueren con la fila 10 y la P1.
- Cuatro instantes fijos y distintos al principio del spec, como en `user.entity.spec.ts:8-9`: `T0` (`createdAt`), `T1` (`updatedAt` inicial), `T2`, posterior a `T1`, y `TM`, anterior a `T1`. `createdAt` y `updatedAt` difieren para que una implementación que los cruce falle la fila 1.
- Las entidades se construyen dentro de cada `it`. Un mutante que vacía el constructor lanza `ReferenceError`, y si salta al cargar el spec, el jest-runner de Stryker lo cuenta como error y no como killed (`jest-test-runner.js:160-167`).
- La fila `P` usa `@fast-check/jest` (`import { fc, test as fcTest } from '@fast-check/jest'`, como en `order.entity.spec.ts:1`). Bajo Stryker, su semilla la fija `test/stryker-setup.ts:20`. La arbitraria va en línea dentro de `fcTest.prop([...])` o como `function` bajo `// Helpers`, nunca como `const` al final: `fcTest.prop` evalúa sus argumentos al recolectar el `describe`, y la `const` daría ReferenceError (precedente: `user.entity.spec.ts:323,351`).
- **Red en dos pasadas.** `equals` devuelve un booleano, y ningún stub puede hacer fallar a la vez las filas que esperan `true` y las que esperan `false`. La primera pasada usa el stub con `false` y la segunda con `true`, de modo que cada fila se ve fallar por aserción en una de las dos.

**Casos acordados:**

| #   | Caso (se vuelve el `it`)                                                                                   | Entrada / estado inicial                                                                                                                                                                                                                                                          | Resultado esperado                                                      |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | debería exponer el id y las fechas de creación y de actualización con que se construye                     | `Widget.create({ id, createdAt: T0, updatedAt: T1 })`                                                                                                                                                                                                                             | `id` es la misma instancia recibida; `createdAt` = T0; `updatedAt` = T1 |
| 2   | debería fijar la fecha de actualización en el instante exacto que recibe touch                             | widget con `updatedAt` = T1; `bump(T2)`                                                                                                                                                                                                                                           | `updatedAt` = T2                                                        |
| 3   | debería fijar la fecha de actualización en el instante recibido aunque sea anterior a la actual            | widget con `updatedAt` = T1; `bump(TM)`, con TM < T1                                                                                                                                                                                                                              | `updatedAt` = TM, no T1                                                 |
| 4   | debería conservar la fecha de creación al tocar la entidad                                                 | widget con `createdAt` = T0; `bump(T2)`                                                                                                                                                                                                                                           | `createdAt` = T0                                                        |
| 5   | debería devolver false ante null                                                                           | `widget.equals(null)`                                                                                                                                                                                                                                                             | `false`                                                                 |
| 6   | debería devolver false ante undefined                                                                      | `widget.equals(undefined)`                                                                                                                                                                                                                                                        | `false`                                                                 |
| 7   | debería considerar igual a una entidad consigo misma                                                       | `widget.equals(widget)`                                                                                                                                                                                                                                                           | `true`                                                                  |
| 8   | debería considerar iguales dos instancias de la misma clase con el mismo id aunque difieran sus fechas     | dos `Widget`, cada uno con su propio `TestId.of('w-1')`; uno con T0/T1 y el otro con T2/T2                                                                                                                                                                                        | `true`                                                                  |
| 9   | debería considerar distintas dos instancias de la misma clase con ids distintos                            | un `Widget` con `'w-1'` y otro con `'w-2'`, mismas fechas                                                                                                                                                                                                                         | `false`                                                                 |
| 10  | debería considerar distintas dos entidades de clases distintas aunque compartan id                         | un `Widget` y un `Gadget`, cada uno con su `TestId.of('w-1')` y las mismas fechas                                                                                                                                                                                                 | `false`                                                                 |
| P1  | debería considerar iguales dos entidades si y solo si coinciden su clase y el valor de su id _(propiedad)_ | clase de cada lado: `fc.constantFrom('widget', 'gadget')`; id: `fc.string()`; un `fc.boolean()` decide si el segundo id copia el primero o le añade el sufijo `'-otro'` (distinto por construcción); fechas de cada lado: `fc.date` acotado a 2000-2100 con `noInvalidDate: true` | `a.equals(b)` y `b.equals(a)` valen los dos «misma clase y mismo id»    |

- [ ] **Stub:** crea `entity.base.ts` con la Interface. El constructor asigna `id` desde las props, porque no existe un `TId` neutro que construir, y pone `createdAt` y `_updatedAt` a `new Date(0)`. El getter devuelve `_updatedAt`, `touch(_now)` no hace nada y `equals(_other)` devuelve `false`. Los parámetros llevan `_` mientras sean stub, por `noUnusedParameters` (`tsconfig.json:28`) → `pnpm typecheck` en verde.
- [ ] **Red, primera pasada:** crea el helper `src/shared/__tests__/helpers/test-id.ts` (`TestId`, ya definitivo: es un doble, no el SUT), escribe `entity.base.spec.ts` (raíz `describe('Entity')`, con `describe('constructor')`, `describe('touch()')` y `describe('equals()')` anidados) y ejecuta `pnpm test src/shared/__tests__/domain/entity.base.spec.ts`. Fallan por aserción las filas 1-4 (las fechas valen `new Date(0)`), la 7, la 8 y la P1. Pasan la 5, la 6, la 9 y la 10, porque esperan el `false` del stub.
- [ ] **Red, segunda pasada:** cambia el `return false` del stub de `equals` por `return true` y repite el comando. Las filas 5, 6, 9 y 10 fallan por aserción.
- [ ] **Green:** implementa la Interface → `pnpm test src/shared/__tests__/domain/entity.base.spec.ts` da `Tests: 11 passed, 11 total`.
- [ ] **Refactor:** añade un comentario de cabecera en español con el porqué, al estilo de `value-object.base.ts:1-21`: sin props-bag, `touch(now)` sin `max()` (backlog #31) y `_updatedAt` en vez de `#` → `pnpm typecheck`.
- [ ] **Verificación de cierre:**
  - `pnpm typecheck`: sin errores.
  - `pnpm test`: todas las suites en verde, incluida `src/__tests__/language-convention.spec.ts`, que escanea los identificadores de `TestId`, `Widget` y `Gadget`.
  - `pnpm lint:check`: sin errores.
  - `pnpm format:check`: «All matched files use Prettier code style!».
  - `git status --short`: solo los tres archivos nuevos (la base, su spec y el helper `test-id.ts`). Si aparece `pnpm-lock.yaml`, es el ruido `@pnpm/exe` y se quita con Edit, como dice la Preparación.
- [ ] _"Te sugiero hacer un commit de los cambios por la entidad base `Entity` del kernel con su spec"_

### Task 3: Kernel — `UuidIdentifier` y mutación del kernel

**Layer:** domain (kernel compartido, `src/shared/domain/`). Unitaria: la mutación corre en local, sin Docker.

**Files:**

- Create: `src/shared/domain/uuid-identifier.base.ts`
- Test: `src/shared/__tests__/domain/uuid-identifier.base.spec.ts`
- Uses (from earlier tasks): ninguno. Usa `ValueObject` (`src/shared/domain/value-object.base.ts:22`), que no cambia.
- No toca `user-id.vo.ts` ni `order-id.vo.ts` (Tasks 7 y 8), `aggregate-root.ts` (Task 8) ni la cabecera de `stryker.config.mjs` (Task 12).

**Interfaces** (solo declaraciones):

`src/shared/domain/uuid-identifier.base.ts`

```ts
export abstract class UuidIdentifier<TBrand extends string> extends ValueObject<string> {
  declare private readonly brand: TBrand; // forma exacta: Prettier reescribe «private declare»
  protected constructor(value: string); // guarda value.toLowerCase()
  protected static isUuidV4(value: string): boolean; // anclada, sin distinguir mayúsculas
  protected static newUuid(): string; // randomUUID() de node:crypto
}
```

**Decisions:**

- La regex se muda tal cual desde `user-id.vo.ts:7` (idéntica en `order-id.vo.ts:7`) a una constante privada del módulo: anclada, con el flag `i` y sin `g`. Las dos copias desaparecen en las Tasks 7 y 8.
- `isUuidV4` es un predicado puro: no normaliza ni recorta. La normalización vive solo en el constructor (`super(value.toLowerCase())`), como hace el tipo `uuid` de PostgreSQL (T5). Así, el `from()` de cada id valida el valor tal como llegó y guarda su forma en minúsculas.
- La marca se escribe exactamente `declare private readonly brand: TBrand;`. Medido con TS 6.0.3, Prettier 3.9.10 y `@swc/core`:
  - sin `declare` (`private readonly brand!: TBrand`) da TS6133 por `noUnusedLocals` (`tsconfig.json:27`);
  - Prettier reescribe `private declare` como `declare private`, así que otro orden rompe `format:check`;
  - SWC no la emite: con las opciones de `.swcrc`, la clase solo lleva el constructor y los dos estáticos.
- Los helpers son `protected static` y no hay una factoría estática polimórfica en la base (T5): cada id escribe su `from()`, que lanza el error de SU contexto, y su `generate()`. Dentro de un `static` de la subclase compilan tanto `UuidIdentifier.isUuidV4(v)` como `this.newUuid()` (comprobado con TS 6.0.3). El contrato de uso para las Tasks 7-9 es `class UserId extends UuidIdentifier<'UserId'>`, con la marca igual al nombre de la clase, `static from(value: string): UserId` y `static generate(): UserId`.
- `node:crypto` es un builtin (`origin: 'core'`), permitido en bloque por `eslint.boundaries.js:134`; la lista negra del kernel (`eslint.boundaries.js:281-291`) no lo nombra. Es el primer import de un builtin en el kernel.
- Dobles bajo `// Helpers`:
  - `AlphaId extends UuidIdentifier<'AlphaId'>` expone tres estáticos públicos que delegan en lo protegido: `of(value)` (el constructor sin validar, para probar la normalización), `accepts(value)` (`isUuidV4`) y `fresh()`. `fresh()` devuelve el string crudo de `newUuid()`: si pasara por el constructor, su `toLowerCase()` taparía un `newUuid()` en mayúsculas.
  - `BetaId extends UuidIdentifier<'BetaId'>` expone `of(value)`.
  - `takesAlpha(id: AlphaId): string` devuelve `id.value` y sirve a la fila 12.

  Los dobles no imitan el `from()` ni el `generate()` de un id real, que pertenecen a los contextos. No se importan ids ni errores de los módulos (`README.md:313-325`: quitar un ejemplo es borrar su carpeta). Se construyen dentro de cada `it`: un mutante que vacía el constructor lanza `ReferenceError`, y al cargar el spec Stryker lo contaría como error y no como killed (`jest-test-runner.js:160-167`).

- Ejemplos fijos al principio del spec, todos v4 válidos y con variantes distintas:
  - `LOWERCASE_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'` (variante 9);
  - `UPPERCASE_UUID = 'F47AC10B-58CC-4372-A567-0E02B2C3D479'` (variante A);
  - `MIXED_CASE_UUID = '6Ba7B810-9dAd-41D1-80b4-00C04fD430c8'` (variante 8).

  Las filas de rechazo alteran `LOWERCASE_UUID` en un solo punto, para que solo falle lo que la fila nombra.

- Las arbitrarias son construidas y locales, y se escriben como `function` bajo `// Helpers`, porque `fcTest.prop([...])` las evalúa al recolectar el `describe`. Una `const` o una `class` declaradas al final darían ReferenceError (precedente: `user.entity.spec.ts:323,351`).
  - `uuidV4AnyCase()` combina `fc.uuid({ version: 4 })` con una máscara `fc.array(fc.boolean(), { minLength: 36, maxLength: 36 })` que pone en mayúsculas cada posición marcada. Devuelve el original y el escrito. `fc.uuid` sale en minúsculas (medido con fast-check 4.10.2).
  - `uuidV4WithNonHexChar()` toma `fc.uuid({ version: 4 })`, una de sus 32 posiciones hexadecimales (un `fc.constantFrom` de los índices que no son 8, 13, 18 ni 23) y un carácter de `fc.constantFrom('g', 'G', 'z', 'x', '-', ' ', '_')`.

  Ninguna se importa de `src/modules/*/__tests__/helpers/arbitraries.ts`: no tienen ninguna de uuid y el kernel no depende de los módulos.

- El oráculo de `newUuid()` es independiente: la forma del RFC 4122 (36 caracteres, guiones en las posiciones 8, 13, 18 y 23, un `4` en la 14 y `8`, `9`, `a` o `b` en la 19) más `value === value.toLowerCase()`. Nunca `isUuidV4`, que sería probar la regex contra sí misma (precedente: `user-id.vo.spec.ts:8-11`).
- La fila 12 es de compilación, y su `it` no puede fallar en Jest porque SWC no comprueba tipos. El rojo lo da `pnpm typecheck`, que incluye los specs (`tsconfig.json:43`) y corre en CI (`.github/workflows/ci.yml:159-160`). `pnpm build` no los ve (`tsconfig.build.json:3`). El `@ts-expect-error` lleva una descripción de al menos 3 caracteres en la misma línea, porque `ban-ts-comment` está en `error` vía `recommendedTypeChecked` (`@typescript-eslint/eslint-plugin` 8.71.2: `recommended-type-checked.js:25` y `ban-ts-comment.js:5`). Por ejemplo: `// @ts-expect-error -- marca nominal: un BetaId no es un AlphaId`.
- **Red en dos pasadas.** `isUuidV4` devuelve un booleano, y ningún stub puede hacer fallar a la vez las filas que esperan `true` y las que esperan `false`. La primera pasada usa el stub con `false` y la segunda con `true`.

**Casos acordados** (las filas 1-9, P1 y P2 pasan por `AlphaId.accepts`; la 10, la 11 y la P3, por `AlphaId.of`; la P4, por `AlphaId.fresh`):

| #   | Caso (se vuelve el `it`)                                                                                    | Entrada / estado inicial                                                                    | Resultado esperado                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | debería aceptar un uuid v4 escrito en minúsculas                                                            | `LOWERCASE_UUID`                                                                            | `true`                                                                                                                                                                                                                                                                                              |
| 2   | debería aceptar un uuid v4 escrito en mayúsculas                                                            | `UPPERCASE_UUID`                                                                            | `true`                                                                                                                                                                                                                                                                                              |
| 3   | debería aceptar un uuid v4 que mezcla mayúsculas y minúsculas                                               | `MIXED_CASE_UUID`                                                                           | `true`                                                                                                                                                                                                                                                                                              |
| 4   | debería rechazar un uuid de otra versión                                                                    | `LOWERCASE_UUID` con el dígito de versión (posición 14) cambiado a `1`, `3`, `5` y `7`      | los cuatro dan `false`                                                                                                                                                                                                                                                                              |
| 5   | debería rechazar un uuid con la variante fuera de 8, 9, a y b                                               | `LOWERCASE_UUID` con la variante (posición 19) en `7` y en `c`, a cada lado del rango       | los dos dan `false`                                                                                                                                                                                                                                                                                 |
| 6   | debería rechazar un uuid v4 válido con texto delante                                                        | `'x' + LOWERCASE_UUID`                                                                      | `false` (sin el ancla `^` sería `true`)                                                                                                                                                                                                                                                             |
| 7   | debería rechazar un uuid v4 válido con texto detrás                                                         | `LOWERCASE_UUID + 'x'`                                                                      | `false` (sin el ancla `$` sería `true`)                                                                                                                                                                                                                                                             |
| 8   | debería rechazar la cadena vacía                                                                            | `''`                                                                                        | `false`                                                                                                                                                                                                                                                                                             |
| 9   | debería rechazar un uuid v4 sin guiones                                                                     | `'3f2504e04f8941d39a0c0305e82c3301'`                                                        | `false`                                                                                                                                                                                                                                                                                             |
| 10  | debería guardar el valor en minúsculas                                                                      | `AlphaId.of(UPPERCASE_UUID).value`                                                          | `'f47ac10b-58cc-4372-a567-0e02b2c3d479'`                                                                                                                                                                                                                                                            |
| 11  | debería considerar iguales dos ids de la misma clase con el mismo uuid escrito con distinta capitalización  | `AlphaId.of(UPPERCASE_UUID).equals(AlphaId.of('f47ac10b-58cc-4372-a567-0e02b2c3d479'))`     | `true`                                                                                                                                                                                                                                                                                              |
| 12  | debería impedir en compilación usar un id de una marca donde se espera otra                                 | `takesAlpha(BetaId.of(LOWERCASE_UUID))` con `// @ts-expect-error -- …` en la línea anterior | `pnpm typecheck` en verde porque el error que espera la directiva existe (TS2345, `Argument of type 'BetaId' is not assignable to parameter of type 'AlphaId'`); en Jest la llamada devuelve `LOWERCASE_UUID`. **Ya verde desde el Stub:** la garantía es solo de tipos y su rojo es el Guard check |
| P1  | debería aceptar cualquier uuid v4 con cualquier capitalización _(propiedad)_                                | `uuidV4AnyCase()`                                                                           | `accepts(escrito)` = `true`                                                                                                                                                                                                                                                                         |
| P2  | debería rechazar cualquier uuid v4 con un carácter no hexadecimal en una posición hexadecimal _(propiedad)_ | `uuidV4WithNonHexChar()`                                                                    | `accepts(alterado)` = `false`                                                                                                                                                                                                                                                                       |
| P3  | debería guardar en minúsculas cualquier uuid v4, lo escriba como lo escriba _(propiedad)_                   | `uuidV4AnyCase()`                                                                           | `AlphaId.of(escrito).value` = el original en minúsculas                                                                                                                                                                                                                                             |
| P4  | debería generar siempre un uuid v4 en minúsculas _(propiedad)_                                              | `fc.integer({ min: 1, max: 10 })` llamadas seguidas a `AlphaId.fresh()`                     | cada valor tiene 36 caracteres, guiones en 8, 13, 18 y 23, un `4` en la 14, `8`, `9`, `a` o `b` en la 19, y `value === value.toLowerCase()`                                                                                                                                                         |

**Guard tests** (spec §12, «Los ids no son intercambiables»):

- Test: la fila 12.
- Protección que se quita: la línea `declare private readonly brand: TBrand;`.
- Rojo esperado (medido con TS 6.0.3):
  - `pnpm typecheck` falla con `TS2578: Unused '@ts-expect-error' directive.` en la línea del propio `@ts-expect-error` del spec;
  - y con `TS6133: 'TBrand' is declared but its value is never read.` en la declaración de la clase de `uuid-identifier.base.ts`, que lo da `noUnusedParameters` (`tsconfig.json:28`).

  `pnpm test src/shared/__tests__/domain/uuid-identifier.base.spec.ts` sigue en verde: por eso la garantía vive en `typecheck`.

- Se restaura la línea → `pnpm typecheck` en verde.

- [ ] **Stub:** crea `uuid-identifier.base.ts` con la Interface y la marca ya en su forma final. El constructor hace `super(value)` sin normalizar, `isUuidV4(_value)` devuelve `false` y `newUuid()` devuelve `''`. Todavía no van ni la regex ni el import de `node:crypto`: sin uso, `noUnusedLocals` los rechaza con TS6133 → `pnpm typecheck` en verde.
- [ ] **Red, primera pasada:** escribe `uuid-identifier.base.spec.ts` (raíz `describe('UuidIdentifier')`, con `describe('isUuidV4()')`, `describe('constructor')`, `describe('newUuid()')` y `describe('marca')` anidados). `pnpm typecheck` sigue en verde, porque el error que espera la fila 12 ya existe. Después, `pnpm test src/shared/__tests__/domain/uuid-identifier.base.spec.ts`:
  - fallan por aserción las filas 1-3, la 10, la 11, la P1, la P3 y la P4;
  - pasan las filas 4-9 y la P2, porque esperan el `false` del stub, y la 12, como dice su fila.
- [ ] **Red, segunda pasada:** cambia el `return false` del stub de `isUuidV4` por `return true` y repite el comando. Las filas 4-9 y la P2 fallan por aserción.
- [ ] **Green:** implementa la Interface → `pnpm test src/shared/__tests__/domain/uuid-identifier.base.spec.ts` da `Tests: 16 passed, 16 total`.
- [ ] **Guard check:** quita la línea de la marca, ejecuta `pnpm typecheck` y comprueba el TS2578 del spec y el TS6133 de la base que describe **Guard tests**. Restaura la línea y comprueba que `pnpm typecheck` vuelve a verde.
- [ ] **Refactor:** añade un comentario de cabecera en español con el porqué: la marca nominal (un `OrderId` hoy entra donde va un `UserId`, spec §2), `declare` en ese orden, por qué normaliza el constructor y no `isUuidV4`, y por qué helpers protegidos y no una factoría polimórfica → `pnpm typecheck`.
- [ ] **Mutación del kernel:**
  - Dónde: desde la raíz del repo, nunca desde una copia en el scratchpad, cuya ruta supera MAX_PATH y hace fallar a Node con `ERR_PACKAGE_IMPORT_NOT_DEFINED` (memoria del entorno). Y con la máquina sin otra carga, sin `pnpm test` en paralelo (`stryker.config.mjs:152-155`).
  - Comando: `pnpm test:mutation --mutate "src/shared/domain/**/*.ts"`, sin llaves en el glob: con `{…}` salen cero mutantes y un score `NaN` que pasa cualquier umbral.
  - Resultado esperado: «Instrumented 5 source file(s) with 59 mutant(s)». La cifra es orientativa: 23 de hoy (`value-object.base.ts` 19 y `aggregate-root.ts` 4, el censo de `stryker.config.mjs:197`) más 36 medidos con el instrumentador de Stryker 10.0.0 sobre un prototipo (`domain-error.ts` 1, `entity.base.ts` 18 y `uuid-identifier.base.ts` 17, de los que 13 son de la regex).
  - Lo que se exige: los cinco archivos al 100.00 %, con 0 survived y 0 no coverage, y salida 0. Los timeouts cuentan como detectados (la familia de `value-object.base.ts` que bascula entre Killed y Timeout, `stryker.config.mjs:105-110`).
  - Un número de mutantes distinto no es un fallo si sale de una escritura equivalente. Si sale 0 o `NaN`, el glob está mal.
  - Medido fuera del repo, aplicando cada mutante al prototipo, transpilando con las opciones de `.swcrc` y ejecutando las filas en Node: las filas de las Tasks 1-3 matan los 36 mutantes nuevos. Las anclas solo mueren con las filas 6 y 7; el `toLowerCase`, con la 10 y la P3; el cuerpo de `newUuid`, solo con la P4.
  - Si queda un superviviente, se propone el caso que lo mata. Todos los supervivientes van en una sola pregunta, con la recomendación, y la fila aprobada entra en esta tabla antes de su test. Ese test pasa a la primera, porque el código ya lo cumple, así que su rojo se demuestra aplicando el mutante a mano, viéndolo fallar por aserción y restaurando. Un mutante equivalente se marca en el código con `// Stryker disable next-line <Mutador>: <motivo>` y se cita en el informe (`docs/development-workflows.md:390-395`). Nunca se añade un caso en silencio.
  - Anota la tabla por archivo que imprime Stryker: la Task 12 la usa para el censo de la cabecera.
- [ ] **Verificación de cierre:**
  - `pnpm typecheck`: sin errores.
  - `pnpm test`: todas las suites en verde, incluida `src/__tests__/language-convention.spec.ts`, que escanea los nombres de los dobles y de las arbitrarias.
  - `pnpm lint:check`: sin errores; aquí cuenta el `ban-ts-comment` de la fila 12.
  - `pnpm format:check`: «All matched files use Prettier code style!».
  - `git status --short`: solo los dos archivos nuevos. `.stryker-tmp/` y `reports/` están ignorados (`.gitignore:22-23`). Si aparece `pnpm-lock.yaml`, es el ruido `@pnpm/exe` y se quita con Edit, como dice la Preparación.
- [ ] _"Te sugiero hacer un commit de los cambios por la base `UuidIdentifier` del kernel, su spec y la mutación del kernel al 100 %"_

### Task 4: `DomainExceptionFilter`, la base de los filtros de dominio

**Layer:** common

**Files:**

- Create: `src/common/filters/domain-exception.filter.ts`
- Test: `src/common/__tests__/filters/domain-exception.filter.spec.ts`
- Modify: `src/common/nest-metadata.constants.ts`
  - nueva constante `FILTER_CATCH_EXCEPTIONS`;
  - en `:17`, «con las mismas dos claves» pasa a «con las mismas claves».
- Modify (test): `src/common/__tests__/nest-metadata.constants.spec.ts`
  - nuevo `describe('FILTER_CATCH_EXCEPTIONS')`;
  - en la cabecera (`:11`), la lista «(`@Sse`, `@Req`)» suma `@Catch`.
- Modify: `eslint.config.mjs:104-105`. «Las dos claves que hacían falta» pasa a «Las claves que hacen falta», con el mismo número de líneas, porque la Task 11 edita `:177` y `:208` de ese archivo.
- Uses (from earlier tasks): ninguna. `common` no importa el kernel de las Tasks 1-3.

Todavía no usa la base nadie. Los tres filtros de contexto pasan a ella en las Tasks 7, 8 y 9.

**Interfaces**

`src/common/filters/domain-exception.filter.ts`

```ts
export type DomainErrorMapping<E extends Error> = {
  readonly error: abstract new (...args: never[]) => E;
  readonly toHttp: (error: E) => HttpException;
};
export abstract class DomainExceptionFilter<E extends Error> implements ExceptionFilter<E> {
  protected abstract readonly mappings: readonly DomainErrorMapping<E>[];
  catch(exception: E): never; // gana la primera coincidencia; si no, BadRequestException(exception.message)
}
```

`src/common/nest-metadata.constants.ts`

```ts
export const FILTER_CATCH_EXCEPTIONS: string; // '__filterCatchExceptions__': donde @Catch(...) guarda sus excepciones
```

**Decisions:**

- **Vive en `src/common/filters/`, junto a `AllExceptionsFilter`.** Es infraestructura transversal (elemento `common`), no un módulo Nest. Su spec 1:1 va en `src/common/__tests__/filters/`.
- **Es genérica sobre `Error` y no importa el kernel.** La matriz solo deja a `common` importar `common` y `config` (`eslint.boundaries.js:215-218`), y `DomainError` vive en `shared-domain`. Cada subclase fija `E` a la raíz de su contexto.
- **La base no lleva `@Catch`.**
  - Nest lee las excepciones de un filtro con `Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, prototype.constructor) || []` (`node_modules/@nestjs/core/exceptions/base-exception-filter-context.js:49-52`). Esa lectura recorre la cadena de prototipos, así que una subclase hereda lo que lleve la base. Medido: el hijo de una base `@Catch()` que no declara su propio `@Catch` expone `[]`.
  - Ningún valor en la base sirve a todas las subclases: `@Catch()` lo atrapa todo, y `@Catch(Error)` atrapa también las `HttpException`.
  - Ojo: una subclase que olvide su `@Catch` también lo atrapa todo, porque una lista vacía o ausente casa con cualquier excepción (`node_modules/@nestjs/common/utils/select-exception-filter-metadata.util.js:1-2`). En las rutas de su controller convertiría en 400 el 401 del guard JWT, el 403 de roles, el 408 del timeout y el 429 del throttler. Los guards corren dentro del callback protegido por esos filtros (`router-explorer.js:234-236`).
  - De ese olvido protege la clave `filter` del checker de la Task 6, no este spec.
- **Siempre lanza, nunca responde.**
  - Cuando un filtro de controller lanza, la excepción sale de `ExceptionsHandler.next` (`node_modules/@nestjs/core/exceptions/exceptions-handler.js:6-25`) y la promesa del proxy de la ruta se rechaza (`router-proxy.js:3-13`).
  - Express 5 entrega ese rechazo a `next(error)` (`router@2.2.0/lib/layer.js:155-161`), que llega al manejador de errores que Nest registra solo con los filtros globales (`routes-resolver.js:94-104`).
  - Así `AllExceptionsFilter` da forma al sobre, con `requestId` y log. Es lo que hacen hoy los tres filtros.
- **Gana la primera coincidencia, por `instanceof` y en el orden de la tabla.** No gana la más específica ni la última: así se comportan hoy las cadenas de `if`, y el orden queda a la vista en la subclase, que pone lo específico antes que lo general.
- **El 400 por defecto se construye con un string**, `new BadRequestException(exception.message)`, como hoy en `user-domain-exception.filter.ts:48`, `orders-domain-exception.filter.ts:48` y `auth-domain-exception.filter.ts:81`. Con un string, Nest pone en `error` el nombre canónico `Bad Request`, que es lo que `buildErrorExample(400, …)` deriva del status.
- **Forma de cada subclase (Tasks 7-9).** Lleva `@Catch(<Raíz>)` con un solo argumento, declara `protected readonly mappings: readonly DomainErrorMapping<Raíz>[] = [...]` con funciones flecha y no declara constructor.
  - **La anotación del tipo es obligatoria.** TypeScript no tipa el inicializador con la declaración abstracta de la base: sin ella, `(error) => …` da TS7006 (medido con TS 6.0.3).
  - **Funciones flecha, y `toHttp` como propiedad de tipo función:** `unbound-method` es error fuera de los tests (`@typescript-eslint` `recommended-type-checked.js:73`; apagada en tests, `eslint.config.mjs:140`).
  - **`readonly X[]`, nunca `ReadonlyArray<X>`:** `array-type` está con su valor por defecto, `'array'` (`stylisticTypeChecked`, `eslint.config.mjs:32`; `array-type.js:111-114`).
  - **Sin constructor.** Nest resuelve el filtro de `@UseFilters(Clase)` como injectable del módulo (`node_modules/@nestjs/core/scanner.js:151,162-175`) con `Reflect.getMetadata('design:paramtypes') || []` (`injector.js:237-240`). Sin constructor en la subclase y sin decoradores en la base, no hay nada que inyectar y el filtro se crea sin argumentos.
  - **La base lee `this.mappings` dentro de `catch()`, nunca en un constructor propio,** porque el campo de la subclase se asigna después de `super()` (`.swcrc:14`, `useDefineForClassFields: false`).
  - **La raíz no puede ser una entrada:** tiene el constructor protegido y da TS2322 (medido). El 400 por defecto ya la cubre.
- **La clave de `@Catch` se copia en `nest-metadata.constants.ts`; nunca se importa de una subruta** (`eslint.config.mjs:120-131`).
  - Su spec la ancla al `@Catch` público, como ya hace con `SSE_METADATA` y `ROUTE_ARGS_METADATA`.
  - Solo se copia `FILTER_CATCH_EXCEPTIONS`, que es la que Nest lee para elegir el filtro. `CATCH_WATERMARK` se escribe a la vez (`catch.decorator.js:19-23`) y no añade nada a la prueba.
- **Las filas de metadatos leen con `Reflect.getMetadata`, no con `getOwnMetadata`,** porque es la misma búsqueda que hace Nest. La fila 6 es el control positivo de la 5: con una clave equivocada la 5 pasaría igual, porque una clave que nadie escribe devuelve `undefined`.
- **Los fixtures son clases reales, locales al spec, sin mocks.**
  - Los errores son una raíz `WidgetDomainError`, abstracta y con constructor protegido como las de los contextos, más `WidgetNotFoundError(id)` con el mensaje `Widget <id> was not found`, `WidgetDeletedError extends WidgetNotFoundError` y `WidgetRuleError(message)`.
  - El helper local `filterWith(mappings)`, bajo `// Helpers`, instancia una subclase anónima sin constructor para cada tabla.
  - `WidgetDomainExceptionFilter`, con `@Catch(WidgetDomainError)` y la tabla anotada y vacía, sirve a las filas de metadatos.
- **La propiedad usa `fc.string({ minLength: 1 })`, una arbitraria construida sin `.filter()`.** Con `''`, `HttpException.createBody` sustituye el mensaje por la descripción y omite `error` (`node_modules/@nestjs/common/exceptions/http.exception.js:103-113`; medido: `{ message: 'Bad Request', statusCode: 400 }`). Ningún error de dominio tiene el mensaje vacío.
- **El stub de `catch` relanza `exception` tal cual.**
  - `never` no tiene un valor neutro que devolver.
  - Un `return undefined as never` haría que `captureError` lanzara su centinela (`test/helpers/capture-error.ts:12-19`), y eso es un rojo por excepción, no por aserción.
  - Relanzar la entrada hace fallar por aserción toda fila que nombra una clase `HttpException`. Ninguna fila usa `toThrow()` sin clase.
- **`src/common/` está fuera de Stryker** (`stryker.config.mjs:247-255`). El Guard check es la única prueba de que la fila 5 puede fallar.

**Tests** (exenta de tabla de casos; un `it` por fila; el `describe` raíz es `describe('DomainExceptionFilter')`, con `describe('catch()')` para las filas 1-4 y `describe('metadatos de @Catch')` para la 5 y la 6):

| #   | `it`                                                                                                                       | Entrada / estado                                                                                                                                                           | Resultado esperado                                                                                                                                                                                                                           | En el Red                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | debería traducir con la primera entrada que casa aunque una posterior sea más específica                                   | `filterWith` con `[WidgetNotFoundError → NotFoundException(error.message), WidgetDeletedError → ConflictException(error.message)]`; `catch(new WidgetDeletedError('w-1'))` | lanza `NotFoundException` (primera aserción: la clase) con `message` `Widget w-1 was not found`                                                                                                                                              | falla por aserción en la clase: el stub relanza un `WidgetDeletedError`, cuyo mensaje ya es ese        |
| 2   | debería casar por instanceof una subclase del error de una entrada                                                         | tabla con solo `WidgetNotFoundError → NotFoundException(error.message)`; `catch(new WidgetDeletedError('w-1'))`                                                            | lanza `NotFoundException`                                                                                                                                                                                                                    | falla por aserción                                                                                     |
| 3   | debería lanzar BadRequestException con el mensaje del dominio cuando ninguna entrada casa                                  | tabla con solo `WidgetNotFoundError`; `catch(new WidgetRuleError('Regla nueva sin mapeo'))`                                                                                | primero, `toBeInstanceOf(BadRequestException)`; después, `getResponse()` es `{ statusCode: 400, message: 'Regla nueva sin mapeo', error: 'Bad Request' }`. No se copia el cast sin comprobar de `auth-domain-exception.filter.spec.ts:77,80` | falla por aserción en la clase (sin ella, `getResponse is not a function` sería un rojo por excepción) |
| 4   | debería lanzar siempre, y nunca devolver, un 400 con el mensaje exacto del dominio cuando ninguna entrada casa (propiedad) | `filterWith([])`; `fc.string({ minLength: 1 })` como mensaje de un `WidgetRuleError`                                                                                       | lanza `BadRequestException` (primera aserción: la clase) y su `message` es exactamente el de la entrada                                                                                                                                      | falla por aserción en la clase: el mensaje del error relanzado ya coincide                             |
| 5   | debería no llevar metadatos de @Catch en la clase base                                                                     | `Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, DomainExceptionFilter)`                                                                                                      | `undefined`                                                                                                                                                                                                                                  | ya verde con el stub: fija el comportamiento, y su rojo se ve en el Guard check                        |
| 6   | debería exponer a Nest exactamente la raíz que declara @Catch en la subclase                                               | `Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, WidgetDomainExceptionFilter)`                                                                                                | `toEqual([WidgetDomainError])`                                                                                                                                                                                                               | falla por aserción (en el stub la clave es `''` y la lectura da `undefined`)                           |

En `nest-metadata.constants.spec.ts`, dentro de `describe('FILTER_CATCH_EXCEPTIONS')`:

| #   | `it`                                                             | Entrada / estado                                          | Resultado esperado                                                         | En el Red          |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| 7   | debería ser la clave bajo la que @Catch() guarda sus excepciones | `class Probe {}`; en `// Act`, `Catch(RangeError)(Probe)` | `Reflect.getOwnMetadata(FILTER_CATCH_EXCEPTIONS, Probe)` es `[RangeError]` | falla por aserción |

Los dos `it` que ya tiene ese spec no cambian. Cada `it` lleva `// Arrange`, `// Act` y `// Assert` por separado. Los specs de los filtros de contexto todavía usan `// Act + Assert`, que es legado (backlog #30): no se copia esa forma.

**Guard tests:**

- Fila 5: la base no hereda un `@Catch` a sus subclases. Se añade `@Catch()` sobre `DomainExceptionFilter` y la fila 5 falla por aserción (`toBeUndefined()` recibe `[]`); las demás filas siguen verdes. Se quita el decorador y la fila vuelve a verde.

**Contrato:** ningún endpoint cambia, porque la base aún no tiene consumidores.

- [ ] **Stub:**
  - Crea `domain-exception.filter.ts` con las Interfaces, sin `@Catch` y con un `catch` que relanza `exception` tal cual.
  - Añade `FILTER_CATCH_EXCEPTIONS = ''` a `nest-metadata.constants.ts`.
  - `pnpm typecheck` → verde.
- [ ] **Red:**
  - Escribe las filas 1-6 y la 7.
  - `pnpm test src/common/__tests__/filters/domain-exception.filter.spec.ts src/common/__tests__/nest-metadata.constants.spec.ts`
  - Resultado esperado: las filas 1, 2, 3, 4, 6 y 7 fallan por aserción, ninguna por `Cannot find module` ni por excepción. La 5 pasa, y los dos `it` previos de nest-metadata siguen verdes.
- [ ] **Green:**
  - `catch` recorre `this.mappings` en orden, toma la primera entrada cuyo `error` casa por `instanceof` y lanza lo que devuelve su `toHttp(exception)`. Si ninguna casa, lanza `new BadRequestException(exception.message)`.
  - `FILTER_CATCH_EXCEPTIONS` pasa a `'__filterCatchExceptions__'`.
  - El mismo comando del Red → todo verde.
- [ ] **Guard check:** el de «Guard tests». Se añade `@Catch()` a la base, se ve la fila 5 en rojo por aserción y se quita.
- [ ] **Refactor:**
  - Comentario de la clase base: primera coincidencia, por qué lanza, por qué no lleva `@Catch` y la forma de las subclases, con la anotación obligatoria de `mappings`.
  - Comentario de la constante: quién la escribe y que la lee el spec del filtro.
  - Las tres frases indicadas en Files: `nest-metadata.constants.ts:17`, `nest-metadata.constants.spec.ts:11` y `eslint.config.mjs:104-105`.
  - `pnpm typecheck` → verde.
- [ ] **Verificación de cierre:**
  - `pnpm typecheck` → 0 errores.
  - `pnpm lint:check` → 0 problemas. Comprueba `array-type`, `unbound-method` y que `common` no importa nada fuera de `common` y `config`.
  - `pnpm format:check` → limpio.
  - `pnpm test` → la suite unitaria entera en verde.
  - `grep -rnw "DomainExceptionFilter" src --include=*.ts` → solo `src/common/filters/domain-exception.filter.ts` y su spec, porque aún no la usa nadie. `-w` deja fuera `UserDomainExceptionFilter` y sus hermanos.
- [ ] Si `pnpm-lock.yaml` aparece modificado solo por `@pnpm/exe`, quítalo con Edit.
- [ ] Sugerir: _"Te sugiero hacer un commit de los cambios por la base `DomainExceptionFilter` de `common`, todavía sin consumidores"_.

### Task 5: `failClosed` y la fuente única de los ejemplos OpenAPI

**Layer:** common. También toca `infrastructure/http/` de `users`, `orders` y `auth` y el módulo plano `health`, pero solo en sus ejemplos OpenAPI.

**Files:**

- Create: `src/common/persistence/fail-closed.ts`
- Test: `src/common/__tests__/persistence/fail-closed.spec.ts`
- Create: `src/common/dto/example-meta.factory.ts`
- Test: `src/common/__tests__/dto/example-meta.factory.spec.ts`
- Modify: `src/common/dto/error-example.factory.ts`. Importa los dos literales y borra sus copias privadas junto con su comentario (`:5-10`).
- Modify (test): `src/common/__tests__/dto/error-example.factory.spec.ts`. Gana un `it`.
- Modify: `src/common/dto/api-envelope.dto.ts`: `:14`, el `timestamp` de `RequestMetaDto` (B10, ver Decisions), y `:20`, el `requestId`.
- Modify: `src/common/dto/error-response.dto.ts:39` (`timestamp`) y `:46` (`requestId`).
- Modify: `src/modules/health/health.controller.ts`: `:152` y `:177` (`timestamp`), `:154` y `:179` (`requestId`).
- Modify: `src/modules/users/infrastructure/http/users.controller.ts`.
  - Fuera `requestMeta` (`:31-36`) y `errorExample` con sus dos comentarios (`:48-64`).
  - Cambian 3 llamadas a `requestMeta` (`:110`, `:155`, `:205`) y 5 a `errorExample` (`:116`, `:161`, `:170`, `:211`, `:216`).
- Modify: `src/modules/orders/infrastructure/http/orders.controller.ts`.
  - Fuera `requestMeta` (`:33-38`) y `errorExample` (`:56-58`).
  - Cambian las llamadas de `:105` y `:163`, y las de `:113`, `:118`, `:169`, `:174` y `:186`.
- Modify: `src/modules/auth/infrastructure/http/auth.controller.ts`.
  - Fuera `requestMeta` (`:31-36`) y `errorExample` (`:48-50`).
  - Cambian las llamadas de `:122` y `:191`, y las de `:128`, `:137`, `:197` y `:204`.
- Temporal: `src/bootstrap/__tests__/openapi-dump.tmp.e2e-spec.ts` y `.tmp/openapi-*.json`. Se crean y se borran dentro de esta misma tarea.
- Uses (from earlier tasks): ninguna. `failClosed` no la usa nadie hasta las Tasks 7 y 8.

**Interfaces**

`src/common/persistence/fail-closed.ts`

```ts
export const failClosed: <T, E extends Error>(
  rebuild: () => T,
  isDomainError: (error: unknown) => error is E,
  describe: (error: E) => string,
) => T; // error de dominio → new Error(describe(error), { cause: error }); otro → se relanza intacto
```

`src/common/dto/example-meta.factory.ts` (`ApiSuccessResponse` viene de `src/common/interceptors/transform.interceptor.ts:16-24` con `import type`)

```ts
export const EXAMPLE_TIMESTAMP: string; // '2026-08-01T10:15:00.000Z', hoy privado en error-example.factory.ts:9
export const EXAMPLE_REQUEST_ID: string; // '3f2504e0-4f89-41d3-9a0c-0305e82c3301', hoy en :10
export const buildRequestMetaExample: (path: string) => ApiSuccessResponse<unknown>['request'];
```

La firma de `buildErrorExample` no cambia.

**Decisions:**

- **Dónde vive cada archivo.**
  - `fail-closed.ts` va en una carpeta nueva, `src/common/persistence/` (spec §4). Recibe funciones, no filas ni repositorios, así que no toca `typeorm`, vetado en `common` (regla 4, `eslint.boundaries.js:292-300`).
  - `example-meta.factory.ts` va en `src/common/dto/`, junto a `error-example.factory.ts` y con su mismo sufijo.
- **`common` no importa el kernel** (`eslint.boundaries.js:215-218`). Por eso `failClosed` es genérica sobre `E extends Error` y recibe un predicado: un tipo `abstract new (...)` rechaza las raíces con constructor protegido (TS2345, medido con TS 6.0.3).
- **El error de dominio se envuelve en un `Error` plano**, nunca en el propio error de dominio ni en una `HttpException`:
  - el error de dominio lo atraparía el `@Catch(Raíz)` del contexto, y saldría como 400 con el dato dentro;
  - una `HttpException` publica su mensaje en cualquier entorno (`all-exceptions.filter.ts:119-122`);
  - un `Error` plano da un 500, sale saneado en producción y staging (`:155-162`) y se registra como `fatal` (`:103-105`).
- **El mensaje es exactamente el que devuelve `describe`, y `cause` es el original, la misma referencia.** Así `orders` conserva su mensaje (`order.mapper.ts:82-87`, fijado en `order.mapper.spec.ts:150-152`) y el diagnóstico no pierde el error de dominio.
- **Un error que no es de dominio se relanza intacto, con la misma referencia.** Es un bug o un fallo de infraestructura, no una fila corrupta. Envolverlo le cambiaría la identidad, y además `describe` solo está tipada para `E`.
- **Los stubs, y por qué dos filas de `failClosed` nacen en verde.**
  - Sin un cast, la única forma de obtener una `T` es llamar a `rebuild`, así que el stub es `return rebuild()`, con `_isDomainError` y `_describe` para cumplir `noUnusedParameters` (`tsconfig.json:28`).
  - Con ese stub, F1 (la identidad) y F3 ya pasan. El rojo de F3 se ve en el Guard check.
  - El stub de `example-meta.factory.ts` deja las dos constantes en `''` y devuelve `{ timestamp: '', path: '', requestId: '' }` con el parámetro `_path`.
- **`buildRequestMetaExample` se tipa con el sobre real del interceptor, `ApiSuccessResponse<unknown>['request']`.**
  - Es el mismo criterio con que `buildErrorExample` se tipa con el `ErrorPayload` del filtro (`error-example.factory.ts:3,72-75`): si `TransformInterceptor` gana o pierde una clave, el helper deja de compilar.
  - Devuelve las claves en el orden en que el interceptor las emite (`transform.interceptor.ts:99-103`), que es el que llevan hoy los ejemplos. Otro orden cambiaría el documento sin que ninguna guarda lo detectara, y por eso la fila M1 fija el orden.
- **`health` usa las constantes, no el helper.**
  - El 503 es el cuerpo de error de `AllExceptionsFilter`, no el `request` del sobre de éxito. Tampoco puede usar `buildErrorExample`, porque su `error` es un objeto (spec T12).
  - En `:177-179` queda `timestamp: EXAMPLE_TIMESTAMP, path, requestId: EXAMPLE_REQUEST_ID`, en ese mismo orden.
- **Lo que no se toca:**
  - Las fechas de recurso que hoy coinciden con el literal: `createdAt`, `updatedAt` y `placedAt` en `users.controller.ts:44-45`, `auth.controller.ts:44-45`, `orders.controller.ts:45`, `user-response.dto.ts:51,59`, `authenticated-user.dto.ts:61,69` y `order-response.dto.ts:31`. Son otro dato: atarlas al `timestamp` del meta las movería cada vez que cambiara el ejemplo de la petición.
  - Los literales de los specs, como `error-response.dto.spec.ts:15,17` y los ids de prueba. Son datos de prueba, no ejemplos publicados.
- **`api-envelope.dto.ts:14` SÍ se unifica (B10, decisión del usuario del 2026-10-17).** No era una copia: valía `'2026-07-28T10:15:00.000Z'`, distinto del `'2026-08-01T10:15:00.000Z'` de todos los demás ejemplos. Pasa a `EXAMPLE_TIMESTAMP` para completar la fuente única de T12.
  - Es el único cambio del documento publicado en esta tarea: el `example` de `RequestMetaDto.timestamp` en `components.schemas`, que se publica porque `RequestMetaDto` entra con `ApiExtraModels` (`api-envelope.dto.ts:61,84`).
  - Ningún cliente depende de un valor de ejemplo.
  - La verificación del documento deja de esperar un diff vacío y espera exactamente ese valor cambiado.
- **Los controllers llaman directamente a `buildErrorExample(status, { path, message })`.**
  - El orden cambia respecto de `errorExample(status, message, path)`, y como `path` y `message` son los dos `string`, un cruce compila.
  - El guardián no lo detecta: el ejemplo sale de la propia factoría y Ajv acepta cualquier cadena. Lo detecta el volcado del documento.
- **Los comentarios de los helpers que se van se borran con ellos.** Lo que decían ya está en `error-example.factory.ts:12-23,59-71`. La frase «Lo que `TransformInterceptor` añade a toda respuesta de éxito» pasa al comentario de `buildRequestMetaExample`.
- **Cómo se demuestra que el documento publicado solo cambia en el ejemplo de B10** (el método más barato que de verdad lo prueba):
  - **Qué hace el spec temporal.** Es un E2E temporal, `src/bootstrap/__tests__/openapi-dump.tmp.e2e-spec.ts`, con un único `it`:
    - llama a `createTestApp()` y a `buildOpenApiDocument(app, appConfig)`, el mismo camino que el guardián (`openapi-contract.e2e-spec.ts:40-45`);
    - escribe `JSON.stringify(document, null, 2)` en `.tmp/openapi-${process.env.OPENAPI_DUMP}.json`;
    - cierra con `app.close()`.
  - **Por qué esa ubicación.** Jest solo busca tests bajo `src/` (`jest.config.mjs:37`), y el regex de la suite unitaria no lo recoge (`jest.config.mjs:85`). `.tmp` está ignorado por git (`.gitignore:50`).
  - **Por qué prueba el documento publicado.** Es el mismo objeto que el runtime sirve en `/json` (`src/bootstrap/openapi.ts:89,146-147`). Si la estructura, el orden de claves y los valores son iguales, la igualdad del JSON con sangría equivale a la del JSON compacto que sirve Express.
  - **Comparación.** Se hacen dos volcados antes de tocar nada, como control de determinismo: si difieren entre sí, el método no prueba nada y se para. Al final se hace otro volcado, y el `diff` tiene que mostrar solo el valor de ejemplo de B10.
  - **Descartado `curl /api/docs/json`:** exige build y servidor, y en esta máquina responde 401 por el Basic Auth del `.env` (memoria del entorno).
  - **Descartado un volcado de metadatos en un unitario:** no es el documento.
- **Sin `fast-check` en esta tarea:** ninguna fila afirma «siempre» sobre un dominio de entradas.

**Tests** (exenta de tabla de casos; un `it` por fila).

`fail-closed.spec.ts`, en `describe('failClosed')`. Usa estos fixtures locales:

- `GadgetDomainError`: abstracta, con constructor protegido.
- `InvalidGadgetCodeError(value)`: su mensaje es `"<value>" is not a valid gadget code`.
- el predicado `(error): error is GadgetDomainError => error instanceof GadgetDomainError`.
- `describeCorruptGadget = (error) => 'El gadget g-1 tiene datos que el dominio rechaza: ' + error.message`. No se llama `describe`: taparía el global de Jest y la suite no cargaría (ver «Tests nuevos» en las decisiones transversales).

| #   | `it`                                                                                                              | Entrada / estado                                         | Resultado esperado                                                                                                                                                                                                          | En el Red                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| F1  | debería devolver lo que devuelve rebuild cuando reconstruye sin error                                             | `rebuild = () => gadget`, un objeto literal              | devuelve `gadget`, la misma referencia (`toBe`)                                                                                                                                                                             | ya verde con el stub: fija la identidad                    |
| F2  | debería envolver un error de dominio en un Error con el mensaje de describeCorruptGadget y el original como cause | `rebuild` lanza `new InvalidGadgetCodeError('zz-9')`     | lo capturado con `captureError` tiene `constructor` exactamente `Error`, `message` igual a `El gadget g-1 tiene datos que el dominio rechaza: "zz-9" is not a valid gadget code` y `cause` igual al error original (`toBe`) | falla por aserción: el stub deja pasar el error de dominio |
| F3  | debería relanzar intacto, sin envolverlo, un error que no es de dominio                                           | `rebuild` lanza `new TypeError('row.code is undefined')` | lo capturado es esa misma instancia (`toBe`)                                                                                                                                                                                | ya verde con el stub; su rojo se ve en el Guard check      |

`example-meta.factory.spec.ts`, en `describe('buildRequestMetaExample')`:

| #   | `it`                                                                                                                   | Entrada / estado                             | Resultado esperado                                                                                                                                              | En el Red                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| M1  | debería devolver la ruta recibida con los literales compartidos, en el orden en que TransformInterceptor emite el meta | `buildRequestMetaExample('/api/v1/widgets')` | `toEqual({ timestamp: EXAMPLE_TIMESTAMP, path: '/api/v1/widgets', requestId: EXAMPLE_REQUEST_ID })`, y `Object.keys(…)` es `['timestamp', 'path', 'requestId']` | falla por aserción: el stub devuelve `path: ''` |

`error-example.factory.spec.ts` es una suite existente. Solo esta fila es nueva y el resto no cambia:

| #   | `it`                                                                                       | Entrada / estado                                                            | Resultado esperado                                                               | En el Red                                                                          |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| E1  | debería sellar timestamp y requestId con los literales compartidos de example-meta.factory | `buildErrorExample(404, { path: PATH, message: 'User abc was not found' })` | `toMatchObject({ timestamp: EXAMPLE_TIMESTAMP, requestId: EXAMPLE_REQUEST_ID })` | falla por aserción: la factoría aún usa sus literales privados y el stub vale `''` |

E1 hace falta porque la suite existente no cubre esos dos campos: sus filas los igualan a los del ejemplo antes de comparar (`error-example.factory.spec.ts:66-70,100-102`).

**Guard tests:**

- F3: un fallo que no es de dominio no se disfraza de fila corrupta. Se quita la comprobación de `isDomainError`, de modo que todo error se envuelve, y F3 falla por aserción (`toBe` recibe un `Error` nuevo). Se restaura y vuelve a verde. F2 ya enseñó su rojo en el Red.

**Contrato:** ningún endpoint cambia su respuesta. El documento publicado solo cambia en un valor de ejemplo, el `timestamp` de `RequestMetaDto` (B10); lo comprueba el paso «Verificación del documento».

- [ ] **Línea base del documento.** Se hace antes de tocar ningún archivo de producción, con Docker arriba (ver la Preparación).
  - Crea el spec temporal descrito en Decisions.
  - `export DB_PORT=5434 && OPENAPI_DUMP=before-1 pnpm test:e2e src/bootstrap/__tests__/openapi-dump.tmp.e2e-spec.ts`, y otra vez con `OPENAPI_DUMP=before-2` → un test en verde en cada ejecución.
  - `diff .tmp/openapi-before-1.json .tmp/openapi-before-2.json && echo IDENTICOS` → `IDENTICOS`. Si difieren, para: el volcado no es determinista y no demostraría nada.
  - `grep -c "3f2504e0-4f89-41d3-9a0c-0305e82c3301" .tmp/openapi-before-1.json` → un número mayor que 0, prueba de que los ejemplos están en el volcado.
- [ ] **Stub:** crea `fail-closed.ts` y `example-meta.factory.ts` con las Interfaces y los cuerpos que describe la Decision sobre los stubs. `pnpm typecheck` → verde, también con el spec temporal.
- [ ] **Red:**
  - Escribe F1-F3, M1 y E1.
  - `pnpm test src/common/__tests__/persistence/fail-closed.spec.ts src/common/__tests__/dto/example-meta.factory.spec.ts src/common/__tests__/dto/error-example.factory.spec.ts`
  - Resultado esperado: F2, M1 y E1 fallan por aserción. F1 y F3 pasan, como explica Decisions, y los 9 tests previos de `error-example.factory.spec.ts` siguen verdes.
- [ ] **Green:**
  - `failClosed` según su Interface.
  - Las dos constantes toman los literales de `error-example.factory.ts:9-10`, y su comentario (`:5-8`) se va con ellas. El helper devuelve `{ timestamp: EXAMPLE_TIMESTAMP, path, requestId: EXAMPLE_REQUEST_ID }`.
  - `error-example.factory.ts` importa las dos constantes y borra sus copias.
  - El mismo comando del Red → todo verde.
- [ ] **Guard check:** el de «Guard tests». Se envuelve todo error, se ve F3 en rojo por aserción y se restaura.
- [ ] **Refactor (fuente única de los literales):**
  - `api-envelope.dto.ts:14` → `EXAMPLE_TIMESTAMP` (B10) y `:20` → `EXAMPLE_REQUEST_ID`.
  - `error-response.dto.ts:39` → `EXAMPLE_TIMESTAMP`, y `:46` → `EXAMPLE_REQUEST_ID`.
  - `health.controller.ts:152` y `:177` → `EXAMPLE_TIMESTAMP`; `:154` y `:179` → `EXAMPLE_REQUEST_ID`. Se importan de `@common/dto/example-meta.factory`.
  - En los tres controllers se borran `requestMeta` y `errorExample` con sus comentarios.
  - Las 7 llamadas `requestMeta(PATH)` pasan a `buildRequestMetaExample(PATH)`.
  - Las 14 llamadas `errorExample(s, m, p)` pasan a `buildErrorExample(s, { path: p, message: m })`.
  - `pnpm typecheck` → verde.
- [ ] **Verificación del documento:**
  - `export DB_PORT=5434 && OPENAPI_DUMP=after pnpm test:e2e src/bootstrap/__tests__/openapi-dump.tmp.e2e-spec.ts`
  - `diff .tmp/openapi-before-1.json .tmp/openapi-after.json` → exactamente un cambio: la línea del `example` del `timestamp` de `RequestMetaDto` pasa de `"2026-07-28T10:15:00.000Z"` a `"2026-08-01T10:15:00.000Z"` (B10). Cualquier otra diferencia se corrige antes de seguir; lo habitual es un `path` y un `message` cruzados, o un orden de claves distinto.
  - `rm src/bootstrap/__tests__/openapi-dump.tmp.e2e-spec.ts .tmp/openapi-before-1.json .tmp/openapi-before-2.json .tmp/openapi-after.json`
  - `git status --short` → no aparece `openapi-dump`.
- [ ] **Verificación de cierre:**
  - `pnpm typecheck` → 0 errores.
  - `pnpm lint:check` y `pnpm format:check` → limpios.
  - `pnpm test` → la suite unitaria entera en verde.
  - `export DB_PORT=5434 && pnpm test:e2e` → la suite E2E entera en verde. Incluye el guardián del contrato (ejemplo ↔ factoría y Ajv), `openapi.e2e-spec.ts`, `health.e2e-spec.ts` y los E2E de `users`, `orders` y `auth`.
  - `grep -rn "3f2504e0-4f89-41d3-9a0c-0305e82c3301" src --include=*.ts | grep -v __tests__` → una sola línea, en `src/common/dto/example-meta.factory.ts`.
  - `grep -n "2026-08-01T10:15:00.000Z" src/common/dto/error-example.factory.ts src/common/dto/api-envelope.dto.ts src/common/dto/error-response.dto.ts src/modules/health/health.controller.ts` → sin salida.
  - `grep -rn "2026-07-28T10:15:00.000Z" src --include=*.ts` → sin salida (B10).
  - `grep -n "requestMeta\|errorExample\|timestamp" src/modules/users/infrastructure/http/users.controller.ts src/modules/orders/infrastructure/http/orders.controller.ts src/modules/auth/infrastructure/http/auth.controller.ts` → sin salida.
- [ ] Si `pnpm-lock.yaml` aparece modificado solo por `@pnpm/exe`, quítalo con Edit.
- [ ] Sugerir: _"Te sugiero hacer un commit de los cambios por `failClosed` y la fuente única de los ejemplos OpenAPI, con el documento publicado igual salvo el ejemplo unificado de B10"_.

### Task 6: Guardas de arquitectura — contrato de módulo y cero claves foráneas

**Layer:** tests de arquitectura

**Files:**

- Create: `src/__tests__/helpers/module-contract-checker.ts`
- Test: `src/__tests__/module-contract.spec.ts` (nuevo)
- Modify: `src/database/__tests__/migration-conventions.spec.ts`. Gana `import ts from 'typescript'`, un `describe('sin claves foráneas')` y tres helpers bajo `// Helpers`. El resto de la suite no cambia.
- Uses (from earlier tasks): ningún símbolo en runtime.
  - El checker compara como texto los especificadores de las bases de las Tasks 1-4: `@shared/domain/domain-error`, `@shared/domain/entity.base`, `@shared/domain/uuid-identifier.base` y `@common/filters/domain-exception.filter`.
  - También los de las dos bases que ya existen: `@shared/domain/aggregate-root` y `@shared/domain/value-object.base`.
  - Reutiliza `collectTsFiles` de `src/__tests__/helpers/language-scanner.ts:97-109`.

**Interfaces**

`src/__tests__/helpers/module-contract-checker.ts`

```ts
export type ContractKey =
  | 'structure'
  | 'errors'
  | 'filter'
  | 'controller-filter'
  | 'entities'
  | 'value-objects'
  | 'use-cases'
  | 'suffixes'
  | 'orm-relations'
  | 'orm-managed-columns';
export type ContractViolation = {
  readonly key: ContractKey;
  readonly file: string;
  readonly message: string;
};
export const FLAT_MODULES: readonly string[]; // ['health'], lista cerrada
export const discoverContexts: (sources: ReadonlyMap<string, string>) => string[]; // ordenados
export const checkModuleContract: (sources: ReadonlyMap<string, string>) => ContractViolation[]; // pura
export const readModuleSources: (root: string) => ReadonlyMap<string, string>; // la única que lee el disco
```

- `readModuleSources(root)` devuelve todos los `.ts` que hay bajo `<root>/src/modules`.
  - La clave es la ruta POSIX relativa a `root`, calculada como en `language-scanner.ts:116`. El valor es la fuente.
- `file` es una clave de ese mapa o, si el archivo falta, la ruta esperada. La ruta de una carpeta termina en `/`.

**Decisions:**

- **La lectura del disco vive en el helper (`readModuleSources`); `checkModuleContract` y `discoverContexts` son puras sobre el mapa.**
  - Es el mismo reparto que `scanTree` y `scanSource` en `language-scanner.ts:73-117`.
  - Así las filas detector montan un `billing` en memoria y la fila árbol lee el repo con la misma función.
- **El helper no lleva spec 1:1 propia: lo cubre `module-contract.spec.ts`.**
  - Hay precedente: `language-scanner.ts` lo cubre `language-convention.spec.ts:5`, y `secretlint-runner.ts` lo cubre `secretlint.spec.ts:7`.
  - Lo que vive en `__tests__/` no cuenta para la cobertura (`jest.config.mjs:90`), la matriz lo ignora (`eslint.boundaries.js:113`) y Stryker no lo muta (`stryker.config.mjs:247-256`).
- **El análisis es sintáctico, sin type-check.**
  - Cada archivo se lee con `ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)`, como en `language-scanner.ts:74`.
  - En TypeScript 6, decoradores y modificadores viajan en `modifiers`. Se leen con `ts.getDecorators` y `ts.getModifiers`, después de comprobar `ts.canHaveDecorators` y `ts.canHaveModifiers` (`typescript.d.ts:8669-8670` y `:9186-9187`).
- **Cada base se reconoce por su especificador EXACTO, no por el prefijo `@shared/domain/*`** (tabla de «Resolución de referencias»). No cuentan:
  - un `DomainError` declarado a mano;
  - uno importado de un archivo del contexto;
  - el del kernel importado por ruta relativa. Ese import no sobreviviría a mover el módulo, y CLAUDE.md reserva los imports relativos para lo que es interno del módulo.
- **Como máximo hay una violación por cada par (clave, archivo).** Si un archivo incumple una regla por varios motivos, `message` los une con `; `.
  - El trinquete compara `key file` con igualdad exacta. Con líneas duplicadas, la lista de pendientes dependería de cuántos motivos tiene cada archivo.
- **Sin cascadas: cada causa da una sola línea.**
  - `structure` corta el contexto: si falla, el contexto no recibe el resto de comprobaciones (spec §11).
  - `controller-filter` no comprueba nada si el filtro falta o no declara exactamente una clase, porque eso ya lo informa `filter`.
  - `filter` no compara el argumento de `@Catch` ni el tipo con la raíz cuando `errors` no encontró exactamente una raíz válida, porque eso ya lo informa `errors`.
  - Medido con un prototipo sobre la forma final de los tres contextos: poner después la raíz de `order.errors.ts` a `extends Error` da una sola línea (`errors …`), no dos.
- **Los comentarios no cuentan en ninguna regla, porque se mira el AST y no el texto.**
  - `order.orm-entity.ts:5` y `:9` nombran `CreateDateColumn` y `@VersionColumn` en comentarios. Un grep daría ahí falsos positivos de `orm-managed-columns`.
- **Importar un decorador vetado ya es una violación, aunque no se use.** El Guard check rompe el árbol justo así.
- **`structure` solo cuenta archivos `.ts`**, porque el lector no recoge otra cosa. Una carpeta que solo tiene un `.gitkeep` es una capa vacía.
- **`controller-filter` mira `infrastructure/http/**/*.controller.ts` de forma recursiva, y solo el decorador de CLASE.** Un `@UseFilters` puesto en un método deja sin filtro al resto de handlers.
- **`use-cases` exige el TIPO del único parámetro de `execute`, no su nombre.**
  - Los ocho casos de uso de hoy lo llaman `input`, pero `execute({ email }: XInput)` es igual de válido.
- **Una dependencia del constructor es pública si es una parameter property sin `private` ni `protected`.**
  - `constructor(readonly repo: X)` crea una propiedad pública aunque no lleve `public`.
- **El spec escribe sus propias listas literales y nunca las importa del helper:** los 11 decoradores de relación, las 4 columnas que rellena TypeORM y las 4 carpetas con sufijo. Si las importara, quitar un nombre del helper quitaría también su fila.
- **Las tablas de los `it.each` van en línea o antes del `describe` raíz, nunca como `const` bajo `// Helpers`.**
  - `describe` se ejecuta en la fase de colección, y una `const` declarada al final del archivo seguiría en su TDZ (`eslint-boundaries.spec.ts:471-476`).
  - `billingContext` y `render` sí van bajo `// Helpers`, porque solo los llaman los `it`.
- **La constante del trinquete se llama `PENDING_VIOLATIONS`.** Las instrucciones comunes la llaman «PENDING_VIOLATIONS».
  - CLAUDE.md pide identificadores en inglés. El gate de idioma no lo detectaría, porque «pendientes» no está en `SPANISH_ROOTS` (`language-scanner.ts:30-44`).
  - Va al principio del spec, con un comentario que explica el trinquete sin citar tareas ni secciones del plan: CLAUDE.md avisa de que esas citas en `src/` se pierden.
- **El detector de FKs usa la API de TypeScript, no el filtro por líneas del spec actual.**
  - Ese filtro solo descarta las líneas que empiezan por `//` (`migration-conventions.spec.ts:109-113`). No ve un bloque `/** … */` como la cabecera de `1786210289581-move-credentials-to-auth-expand.ts:6-43`.
  - Para el AST, un comentario de TypeScript nunca es un nodo. El texto de un literal sí lo es, incluidos los comentarios SQL que lleve dentro.
- **El detector de FKs mira todos los literales del archivo, no solo el argumento de `queryRunner.query()`.**
  - Así un SQL guardado antes en una variable también cuenta: falla en cerrado.
  - Hoy da cero coincidencias en las seis migraciones, incluidos sus comentarios (medido).
- **La fila de no vacuidad de las FKs no nombra ninguna migración.**
  - El README manda borrar las migraciones de `orders` al quitar ese módulo (`README.md:327`).
  - Con `length > 0`, la fila solo se pone roja si se borran todas.

**El algoritmo**

_Descubrimiento:_

- Un contexto es cada `<n>` que tiene alguna clave `src/modules/<n>/<algo>` y no está en `FLAT_MODULES`. `discoverContexts` los devuelve ordenados.
- Un archivo suelto en `src/modules/` no es un contexto.
- Salvo `structure`, ninguna regla mira los archivos de `src/modules/<ctx>/__tests__/`.

_Resolución de referencias:_

- Se leen los `import` de primer nivel de cada archivo que tienen el especificador como literal.
  - Un import nombrado (`{ A }` o `{ A as B }`) liga el nombre local al par (especificador, nombre importado).
  - Uno de espacio de nombres (`* as ns`) o por defecto (`x`) liga el nombre local a (especificador, `*`).
- Una referencia es la expresión de un `extends`, el callee de un decorador, un argumento o el nombre de un tipo. Se resuelve así:
  - Un identificador ligado por un import da su (especificador, nombre importado). Así se deshace el alias.
  - Un identificador que es una clase de primer nivel del mismo archivo es local.
  - `ns.Nombre` (acceso a propiedad o nombre cualificado) con `ns` ligado a `*` da (especificador de `ns`, `Nombre`).
  - Cualquier otra cosa queda sin resolver y nunca coincide.
- «Apunta a la clase `C` del archivo `G`» quiere decir una de dos cosas:
  - la referencia es local en `G` y se llama `C`;
  - su especificador es relativo y, resuelto contra la carpeta del archivo que importa (`path.posix.join`, `normalize` y `+ '.ts'`), da `G`, con nombre importado `C`.
- «Clase de primer nivel» es una `class` que es sentencia directa del archivo.
- «Clase exportada» es una clase de primer nivel con `export` (también `export default class`), o una nombrada en un `export { … }` sin `from` del propio archivo.

| Base                | Nombre importado                 | Especificador exacto                                                       |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| Raíz de errores     | `DomainError`                    | `@shared/domain/domain-error`                                              |
| Entidad             | `Entity` o `AggregateRoot`       | `@shared/domain/entity.base` o `@shared/domain/aggregate-root`             |
| Value object        | `ValueObject` o `UuidIdentifier` | `@shared/domain/value-object.base` o `@shared/domain/uuid-identifier.base` |
| Filtro              | `DomainExceptionFilter`          | `@common/filters/domain-exception.filter`                                  |
| Decoradores de Nest | `Catch`, `UseFilters`            | `@nestjs/common`                                                           |

_Las claves._ Las rutas son relativas a `src/modules/<ctx>/`. Cada motivo entre «» va a `message`.

- **`structure`.**
  - Violación si falta `<ctx>.module.ts`: «falta el module file del contexto».
  - Violación si `domain/`, `application/`, `infrastructure/` o `__tests__/` no tiene ningún `.ts`: «falta la carpeta `X/` o no tiene ningún `.ts`».
  - `file` es la ruta esperada.
  - Si hay alguna línea, el contexto no recibe el resto de comprobaciones.
- **`errors`.** Mira `domain/errors/**/*.errors.ts`.
  - Si no hay ninguno: «falta un `*.errors.ts` con la raíz de errores del contexto». `file` es `src/modules/<ctx>/domain/errors/`.
  - Raíz válida = clase abstracta cuyo `extends` resuelve al `DomainError` del kernel.
  - Con cero raíces, en cada archivo: «ninguna clase abstracta de los `*.errors.ts` del contexto extiende `DomainError` de `@shared/domain/domain-error`».
  - Con más de una raíz, en cada archivo que tiene alguna: «hay N raíces abstractas que extienden `DomainError` (A, B); debe haber una».
  - Con una sola raíz, cada clase exportada tiene que descender de ella. Se sigue `extends` por las clases de esos archivos, también a través de imports relativos entre ellos. Si no desciende: «`X` no desciende de la raíz `R`».
  - Un archivo que exporta algo que no es una clase también es violación: `const`, función, `type`, `interface`, `enum`, `namespace`, `export default` de una expresión, `export *` o una reexportación. Motivo: «exporta `n`, que no es una clase».
- **`filter`.** Mira `infrastructure/http/<ctx>-domain-exception.filter.ts`.
  - Si falta: «falta el filtro de dominio del contexto».
  - Si no declara exactamente una clase de primer nivel: «declara N clases; debe declarar exactamente una».
  - Si la clase no extiende `DomainExceptionFilter` de `@common/filters/domain-exception.filter`: «`X` no extiende `DomainExceptionFilter` de `@common/filters/domain-exception.filter`».
  - Si no lleva exactamente un decorador `Catch`: «`X` no lleva `@Catch`», o «lleva N `@Catch`».
  - Si `@Catch` no recibe exactamente un argumento: «`@Catch` recibe N argumentos; debe recibir exactamente uno, la raíz». `@Catch()` es un catch-all.
  - Solo cuando hay raíz única: «`@Catch` no recibe la raíz `R`» o «el tipo de `DomainExceptionFilter<…>` no es la raíz `R`». El tipo tiene que ser el único argumento de tipo y apuntar a la raíz.
  - `file` es la ruta esperada del filtro.
- **`controller-filter`.** Solo se evalúa si el filtro existe y declara exactamente una clase, `F`.
  - Mira `infrastructure/http/**/*.controller.ts`.
  - Cada clase de primer nivel necesita un decorador de clase `UseFilters` con algún argumento que apunte a `F` del archivo del filtro. Si no: «`C` no lleva `@UseFilters(F)` a nivel de clase».
  - `file` es el controller.
- **`entities`.** Mira `domain/**/*.entity.ts`. Son violaciones:
  - no declarar exactamente una clase de primer nivel;
  - no extender `Entity` ni `AggregateRoot` del kernel;
  - no tener constructor, o tener alguno que no sea `private`;
  - no tener un método `static rehydrate`;
  - no tener un método de instancia público `toSnapshot`. Un `toSnapshot` estático, `private` o `protected` no cuenta.
- **`value-objects`.** Mira `domain/**/*.vo.ts`.
  - Un archivo sin clases es violación: «no declara ninguna clase».
  - Para cada clase de primer nivel son violaciones:
    - no extender `ValueObject` ni `UuidIdentifier` del kernel;
    - declarar un constructor sin `private` ni `protected`;
    - no declarar su propio método `static from`;
    - si extiende `UuidIdentifier`, que su único argumento de tipo no sea el literal con el nombre de la clase. Motivo: «la marca de `X` es `'Y'` (o ninguna); debe ser `'X'`».
- **`use-cases`.** Mira `application/**/*.use-case.ts`.
  - `X` sale del nombre del archivo sin `.use-case.ts`: se parte por `-` y cada trozo empieza en mayúscula. Ejemplo: `find-user-by-id` da `FindUserById`.
  - Son violaciones:
    - no declarar exactamente una clase de primer nivel;
    - que la clase no se llame `XUseCase`;
    - que falte `export type XInput`;
    - que los miembros públicos, aparte del constructor, no sean exactamente un método de instancia `execute`. Público es todo lo que no lleva `private` ni `protected` y no tiene un nombre `#`. Una propiedad flecha `execute = …` cuenta como otro miembro, no como el método;
    - que `execute` no reciba un único parámetro de tipo `XInput`;
    - una parameter property del constructor sin `private` ni `protected`. Motivo: «la dependencia `d` del constructor es pública».
- **`suffixes`.** Mira todo archivo bajo `domain/entities/`, `domain/value-objects/`, `domain/errors/` y `application/use-cases/`.
  - Si exporta una clase y no termina en el sufijo de su carpeta (`.entity.ts`, `.vo.ts`, `.errors.ts` o `.use-case.ts`): «exporta la clase `X` y no termina en `S`».
- **`orm-relations`.** Mira `**/*.orm-entity.ts`. Los nombres vetados son `ManyToOne`, `OneToMany`, `OneToOne`, `ManyToMany`, `JoinColumn`, `JoinTable`, `RelationId`, `ForeignKey`, `Tree`, `TreeParent` y `TreeChildren`. Hay violación con cualquiera de estos casos:
  - un import de `'typeorm'` que trae uno de esos nombres, con alias o sin él y aunque no se use;
  - un `ns.Nombre` de la lista, con `ns` importado de `'typeorm'` con `* as` o por defecto;
  - un decorador cuyo nombre está en la lista una vez deshecho el alias, venga del módulo que venga.
  - El motivo es «usa `ManyToOne` (importado como `Parent`), …», con cada nombre una vez y en orden.
- **`orm-managed-columns`.** La misma detección, con `CreateDateColumn`, `UpdateDateColumn`, `DeleteDateColumn` y `VersionColumn`.
- _Salida._ El orden es determinista: contexto, clave en el orden de `ContractKey` y archivo. Las filas ordenan siempre con `render`, así que ese orden no forma parte del contrato.

**El detector de claves foráneas.** Son helpers locales de `migration-conventions.spec.ts`, bajo `// Helpers`.

- `foreignKeysIn(source, file = 'fixture.ts'): string[]`. Sigue el patrón de `scanSource` (`language-scanner.ts:73`).
  - Recorre el AST entero y mira dos cosas: los trozos de literal y los identificadores.
  - Trozos de literal: `ts.isStringLiteral(node)` o `ts.isTemplateLiteralToken(node)`, que cubre `NoSubstitutionTemplateLiteral`, `TemplateHead`, `TemplateMiddle` y `TemplateTail`.
  - Sobre el texto crudo de cada trozo (`node.getText(sf)`) busca `/\bforeign\s+key\b/gi` y `/\breferences\b/gi`.
  - La posición de cada coincidencia es `node.getStart(sf) + match.index`, así que la línea que se informa es exacta.
  - Identificadores: `createForeignKey`, `createForeignKeys`, `TableForeignKey` y `foreignKeys`.
  - Devuelve `${file}:${línea} ${coincidencia}` en orden de aparición. La coincidencia conserva la capitalización y junta los espacios en uno (`FOREIGN KEY`).
- `migrationFiles(): string[]` devuelve todo `.ts` de `MIGRATIONS_DIR`, sin corte por fecha.
- `foreignKeysInMigrations(): string[]` aplica `foreignKeysIn` a cada uno de esos archivos, con su nombre como `file`.
- El `describe('sin claves foráneas')` lleva un JSDoc que cuenta:
  - el porqué, con la regla de CLAUDE.md: cero FKs, porque los contextos pueden dejar de compartir base;
  - qué se busca y cómo se separan los literales de los comentarios;
  - sus límites:
    - una FK escrita en trozos que no forman un literal entero no se detecta;
    - tampoco un salto de línea escapado entre `FOREIGN` y `KEY` en una cadena con comillas simples.

**Tests**

En `src/__tests__/module-contract.spec.ts`:

- La estructura es:
  - `describe('module contract gate')`, con una cabecera JSDoc: el bloque detector es control positivo y negativo, como en `language-convention.spec.ts:41-43`.
  - Dentro, `describe('el detector')`, con un `describe` por clave más `describe('conforme y descubrimiento')`.
  - Al lado, `describe('el árbol')`.
- En cada `it` van `// Arrange`, `// Act` y `// Assert`, cada uno en su línea.
- Las líneas que se comparan salen de `render(violations)`: `` `${v.key} ${v.file}` ``, ordenadas con `sort()`. Se comparan con `toEqual`.
- `billingContext(changes = {})` devuelve el contexto conforme de la tabla siguiente, con `changes` aplicados.
  - Las claves de `changes` son relativas a `src/modules/billing/`, y un `null` borra el archivo.
  - Las fuentes se escriben como arrays de líneas unidos con `'\n'`, igual que en `language-convention.spec.ts:87-92`.
- En las tablas, `B/` abrevia `src/modules/billing/`. En el test se escribe la ruta completa.

| Archivo del `billing` conforme                             | Lo esencial                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `B/billing.module.ts`                                      | `export class BillingModule {}`                                                                                                                                                                                                                 |
| `B/domain/errors/billing.errors.ts`                        | `DomainError` de `@shared/domain/domain-error`; `export abstract class BillingDomainError extends DomainError {}`; `export class InvoiceNotFoundError extends BillingDomainError {}`                                                            |
| `B/domain/entities/invoice.entity.ts`                      | `Invoice extends AggregateRoot<InvoiceId, InvoiceEvent>` de `@shared/domain/aggregate-root`, con `private constructor`, `static rehydrate` y `toSnapshot()`                                                                                     |
| `B/domain/entities/payment.entity.ts`                      | `Payment extends Entity<PaymentId>` de `@shared/domain/entity.base`, con los mismos tres miembros                                                                                                                                               |
| `B/domain/value-objects/invoice-id.vo.ts`                  | `InvoiceId extends UuidIdentifier<'InvoiceId'>` de `@shared/domain/uuid-identifier.base`, con `static from`                                                                                                                                     |
| `B/domain/value-objects/invoice-amount.vo.ts`              | `InvoiceAmount extends ValueObject<number>` de `@shared/domain/value-object.base`, con `static from`                                                                                                                                            |
| `B/domain/value-objects/invoice-status.ts`                 | Solo una unión `export type InvoiceStatus` de dos literales, sin clase                                                                                                                                                                          |
| `B/application/use-cases/issue-invoice.use-case.ts`        | `export type IssueInvoiceInput` e `IssueInvoiceUseCase`, con `constructor(private readonly invoices: InvoiceRepository)`, `async execute(input: IssueInvoiceInput)`, un método `private` y uno `#`                                              |
| `B/infrastructure/http/billing-domain-exception.filter.ts` | `@Catch(BillingDomainError)` con `Catch` de `@nestjs/common` y la raíz de `'../../domain/errors/billing.errors'`; `BillingDomainExceptionFilter extends DomainExceptionFilter<BillingDomainError>` de `@common/filters/domain-exception.filter` |
| `B/infrastructure/http/billing.controller.ts`              | `@Controller('invoices')` y `@UseFilters(BillingDomainExceptionFilter)`, con el filtro de `'./billing-domain-exception.filter'`                                                                                                                 |
| `B/infrastructure/persistence/invoice.orm-entity.ts`       | `Column`, `Entity` y `PrimaryColumn` de `'typeorm'`; `createdAt` con `@Column({ type: 'timestamptz', default: () => 'now()' })`; un comentario que nombra `ManyToOne` y `CreateDateColumn` y que no cuenta                                      |
| `B/__tests__/billing.spec.ts`                              | Cualquier contenido                                                                                                                                                                                                                             |

| #   | `it`                                                                                                  | Entrada (sobre `billingContext`)                                                                                                                                                                                        | Esperado                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | debería marcar las cuatro carpetas de capa de un contexto que solo tiene su module file               | Un mapa con solo `B/billing.module.ts` vacío                                                                                                                                                                            | `structure B/__tests__/`, `structure B/application/`, `structure B/domain/`, `structure B/infrastructure/` |
| 2   | debería marcar el module file que falta                                                               | Sin `billing.module.ts`                                                                                                                                                                                                 | `structure B/billing.module.ts`                                                                            |
| 3   | debería no aplicar el resto de reglas a un contexto que falla structure                               | Sin `__tests__/billing.spec.ts` y con la raíz en `extends Error`                                                                                                                                                        | Solo `structure B/__tests__/`                                                                              |
| 4   | debería marcar una raíz de errores que extiende Error en vez de DomainError                           | `BillingDomainError extends Error`                                                                                                                                                                                      | `errors B/domain/errors/billing.errors.ts`                                                                 |
| 5   | `it.each`: debería marcar una raíz cuyo DomainError no viene de @shared/domain/domain-error: %s       | (a) `class DomainError extends Error {}` en el propio archivo; (b) importado de `'./domain-error'`; (c) importado del kernel por `'../../../../shared/domain/domain-error'`                                             | La línea de `errors` de la fila 4                                                                          |
| 6   | debería marcar una segunda raíz abstracta que extiende DomainError                                    | `export abstract class OtherRoot extends DomainError {}`                                                                                                                                                                | La línea de `errors`                                                                                       |
| 7   | debería marcar una clase de error exportada que no desciende de la raíz                               | `export class StrayError extends Error {}`                                                                                                                                                                              | La línea de `errors`                                                                                       |
| 8   | debería marcar un archivo de errores que exporta algo que no es una clase                             | `export const BILLING_CODE = 'B1'`                                                                                                                                                                                      | La línea de `errors`                                                                                       |
| 9   | debería marcar el contexto sin ningún *.errors.ts sin arrastrar al filtro                             | Sin `billing.errors.ts`                                                                                                                                                                                                 | Solo `errors B/domain/errors/`                                                                             |
| 10  | debería aceptar la raíz importada con import * as y los errores repartidos en varios *.errors.ts      | `extends kernel.DomainError`, con `import * as kernel`; además, `domain/errors/invoice.errors.ts` con una clase que extiende la raíz importada de `'./billing.errors'`                                                  | `[]`. Ya está en verde con el stub (control negativo)                                                      |
| 11  | debería marcar el filtro que falta y no repetirlo en controller-filter                                | Sin `billing-domain-exception.filter.ts`                                                                                                                                                                                | Solo `filter B/infrastructure/http/billing-domain-exception.filter.ts`                                     |
| 12  | `it.each`: debería marcar un filtro que no extiende el DomainExceptionFilter de @common: %s           | (a) `implements ExceptionFilter`; (b) la base importada de `'./domain-exception.filter'`                                                                                                                                | La línea de `filter`                                                                                       |
| 13  | `it.each`: debería marcar un @Catch sin exactamente un argumento: %s                                  | (a) `@Catch()`; (b) `@Catch(BillingDomainError, Error)`                                                                                                                                                                 | La línea de `filter`                                                                                       |
| 13b | `it.each`: debería marcar un filtro sin exactamente un decorador @Catch: %s                           | (a) ningún `@Catch`; (b) `@Catch()` encima de `@Catch(BillingDomainError)`. El de arriba se aplica el último y sobrescribe los metadatos con `[]` (`catch.decorator.js:22`), así que el filtro queda igual de catch-all | La línea de `filter`, con el motivo «no lleva `@Catch`» en (a) y «lleva 2 `@Catch`» en (b)                 |
| 13c | `it.each`: debería marcar un filtro cuyo argumento de tipo no es la raíz: %s                          | (a) `extends DomainExceptionFilter<InvoiceNotFoundError>` con `@Catch(BillingDomainError)`; (b) `extends DomainExceptionFilter` sin argumento de tipo                                                                   | La línea de `filter`                                                                                       |
| 13d | debería marcar un archivo de filtro con más de una clase                                              | Se añade `class FilterHelper {}` al archivo del filtro                                                                                                                                                                  | La línea de `filter`                                                                                       |
| 14  | debería marcar un filtro cuyo @Catch recibe una subclase en vez de la raíz                            | `@Catch(InvoiceNotFoundError)`                                                                                                                                                                                          | La línea de `filter`                                                                                       |
| 15  | debería marcar un controller sin @UseFilters a nivel de clase                                         | Sin el decorador                                                                                                                                                                                                        | `controller-filter B/infrastructure/http/billing.controller.ts`                                            |
| 15b | debería marcar un controller que solo pone @UseFilters en un método                                   | Se quita el `@UseFilters` de clase y se añade un handler `@Get() list()` con `@UseFilters(BillingDomainExceptionFilter)`. El fixture conforme no tiene handlers, así que este se añade solo aquí                        | `controller-filter B/infrastructure/http/billing.controller.ts`                                            |
| 15c | debería revisar también los controllers de las subcarpetas de infrastructure/http                     | Se añade `infrastructure/http/admin/billing-admin.controller.ts` con `@Controller('admin/invoices')` y sin `@UseFilters`                                                                                                | `controller-filter B/infrastructure/http/admin/billing-admin.controller.ts`                                |
| 16  | debería marcar un controller que usa el filtro de otro contexto                                       | `@UseFilters(ShippingDomainExceptionFilter)`, importado de `'../../../shipping/infrastructure/http/shipping-domain-exception.filter'`                                                                                   | La línea de `controller-filter`                                                                            |
| 17  | `it.each`: debería marcar una entidad que no extiende Entity ni AggregateRoot del kernel: %s          | (a) sin `extends`; (b) `AggregateRoot` importada de `'../aggregate-root'`                                                                                                                                               | `entities B/domain/entities/invoice.entity.ts`                                                             |
| 18  | `it.each`: debería marcar una entidad sin constructor private: %s                                     | (a) `protected constructor`; (b) sin constructor                                                                                                                                                                        | La línea de `entities`                                                                                     |
| 19  | debería marcar una entidad sin static rehydrate                                                       | `static rehydrate` renombrado a `static restore`                                                                                                                                                                        | La línea de `entities`                                                                                     |
| 20  | debería marcar una entidad cuyo toSnapshot no es de instancia                                         | `static toSnapshot()`                                                                                                                                                                                                   | La línea de `entities`                                                                                     |
| 21  | debería marcar un *.entity.ts con más de una clase                                                    | Se añade `class InvoiceLine {}`                                                                                                                                                                                         | La línea de `entities`                                                                                     |
| 22  | debería marcar un value object que no extiende ValueObject ni UuidIdentifier del kernel               | `InvoiceAmount` sin `extends`                                                                                                                                                                                           | `value-objects B/domain/value-objects/invoice-amount.vo.ts`                                                |
| 22b | `it.each`: debería marcar un *.vo.ts cuya base no viene del kernel o que no declara ninguna clase: %s | (a) `InvoiceAmount` extiende un `ValueObject` importado de `'./value-object.base'`; (b) se añade `domain/value-objects/invoice-kind.vo.ts`, que solo exporta un `type`                                                  | `value-objects` sobre el archivo afectado: `…/invoice-amount.vo.ts` en (a) e `…/invoice-kind.vo.ts` en (b) |
| 23  | debería marcar un value object con constructor público                                                | Se añade `constructor(value: number) { super(value); }`                                                                                                                                                                 | Esa línea                                                                                                  |
| 24  | debería marcar un value object sin su propio static from                                              | `static from` renombrado a `static of`                                                                                                                                                                                  | Esa línea                                                                                                  |
| 25  | `it.each`: debería marcar un id cuya marca no es el nombre de su clase: %s                            | (a) `UuidIdentifier<'PaymentId'>`; (b) `UuidIdentifier` sin argumento                                                                                                                                                   | `value-objects B/domain/value-objects/invoice-id.vo.ts`, con un `message` que contiene `'InvoiceId'`       |
| 26  | debería marcar un caso de uso con otro miembro público además de execute                              | `private audit()` pasa a `audit()`                                                                                                                                                                                      | `use-cases B/application/use-cases/issue-invoice.use-case.ts`                                              |
| 27  | debería marcar un execute declarado como propiedad flecha                                             | `execute = async (input: IssueInvoiceInput) => …`                                                                                                                                                                       | Esa línea                                                                                                  |
| 28  | `it.each`: debería marcar una dependencia pública del constructor: %s                                 | (a) `readonly invoices`; (b) `public invoices`                                                                                                                                                                          | Esa línea                                                                                                  |
| 29  | `it.each`: debería marcar un caso de uso cuyo nombre no empareja archivo, clase, Input y execute: %s  | (a) clase `CreateInvoiceUseCase`; (b) `IssueInvoiceInput` sin `export`; (c) `execute(input: { invoiceId: string })`                                                                                                     | Esa línea, con un `message` que contiene `IssueInvoice`                                                    |
| 30  | debería marcar un *.use-case.ts con más de una clase                                                  | Se añade `class Helper {}`                                                                                                                                                                                              | Esa línea                                                                                                  |
| 31  | `it.each`: debería marcar la clase exportada de %s, que no lleva el sufijo de su carpeta              | Se añade `export class X {}` en (a) `domain/entities/refund.ts`, (b) `domain/value-objects/invoice-number.ts`, (c) `domain/errors/billing-errors.ts` y (d) `application/use-cases/void-invoice.ts`                      | `suffixes B/<ese archivo>`                                                                                 |
| 32  | `it.each` con los 11 nombres literales: debería marcar %s de TypeORM en una entidad ORM               | El nombre se añade al import de `'typeorm'` de `invoice.orm-entity.ts`                                                                                                                                                  | `orm-relations B/infrastructure/persistence/invoice.orm-entity.ts`                                         |
| 33  | debería marcar un decorador de relación importado con alias                                           | `ManyToOne as BelongsTo` y `@BelongsTo(…)`                                                                                                                                                                              | Esa línea, con un `message` que contiene `ManyToOne`                                                       |
| 34  | debería marcar un decorador de relación usado a través de import * as                                 | `import * as orm from 'typeorm'` y `@orm.ManyToOne(…)`                                                                                                                                                                  | Esa línea                                                                                                  |
| 34b | debería marcar un decorador de relación vetado aunque llegue de un módulo que no es typeorm           | `import { ManyToOne } from './orm-shim'` y `@ManyToOne(…)`                                                                                                                                                              | Esa línea                                                                                                  |
| 35  | `it.each` con los 4 nombres literales: debería marcar %s de TypeORM en una entidad ORM                | Igual que la fila 32                                                                                                                                                                                                    | `orm-managed-columns B/infrastructure/persistence/invoice.orm-entity.ts`                                   |
| 36  | `it.each`: debería marcar una columna que rellena TypeORM aunque llegue %s                            | (a) `UpdateDateColumn as Touched`; (b) `@orm.CreateDateColumn(…)` con `import * as orm`                                                                                                                                 | Esa línea                                                                                                  |
| 37  | debería aceptar un contexto que cumple todo el contrato                                               | `billingContext()`                                                                                                                                                                                                      | `[]`. Ya está en verde con el stub                                                                         |
| 38  | debería descubrir como contexto cada carpeta de src/modules salvo los módulos planos                  | El conforme más `src/modules/health/health.module.ts`, `src/modules/shipping/shipping.module.ts` y el archivo suelto `src/modules/notes.ts`                                                                             | `discoverContexts` da `['billing', 'shipping']`                                                            |
| 39  | debería eximir del contrato a los módulos planos                                                      | El conforme más `src/modules/health/health.module.ts`                                                                                                                                                                   | `[]`. Ya está en verde con el stub                                                                         |
| 40  | debería mantener cerrada la lista de módulos planos                                                   | `FLAT_MODULES`                                                                                                                                                                                                          | `['health']`. Ya está en verde: la constante es real desde el Stub                                         |
| 41  | debería descubrir al menos un contexto en src/modules y dejar fuera los módulos planos                | `discoverContexts(readModuleSources(ROOT))`, con `ROOT` como en `language-convention.spec.ts:7`                                                                                                                         | Longitud mayor que 0, y ningún contexto de `FLAT_MODULES`                                                  |
| 42  | debería cumplir el contrato en todos los contextos salvo las violaciones pendientes                   | `render(checkModuleContract(readModuleSources(ROOT)))`                                                                                                                                                                  | `toEqual(PENDING_VIOLATIONS)`                                                                              |

Las filas 1-36 (con las siete que llevan letra: 13b, 13c, 13d, 15b, 15c, 22b y 34b) y 37-40 van en `describe('el detector')`, y las 41-42 en `describe('el árbol')`. Las que llevan letra cubren las sub-reglas que el algoritmo define y que ninguna otra fila podía poner en rojo: un filtro sin `@Catch` o con dos, el argumento de tipo, la segunda clase, el `@UseFilters` de método, los controllers anidados, la base de un VO y un decorador vetado que no viene de `typeorm`.

`PENDING_VIOLATIONS` es `readonly string[]` y contiene exactamente estas diez líneas, ya ordenadas:

```text
entities src/modules/auth/domain/entities/credential.entity.ts
entities src/modules/users/domain/entities/user.entity.ts
errors src/modules/auth/domain/errors/auth.errors.ts
errors src/modules/orders/domain/errors/order.errors.ts
errors src/modules/users/domain/errors/user.errors.ts
filter src/modules/auth/infrastructure/http/auth-domain-exception.filter.ts
filter src/modules/orders/infrastructure/http/orders-domain-exception.filter.ts
filter src/modules/users/infrastructure/http/users-domain-exception.filter.ts
orm-managed-columns src/modules/auth/infrastructure/persistence/credential.orm-entity.ts
orm-managed-columns src/modules/users/infrastructure/persistence/user.orm-entity.ts
```

En `src/database/__tests__/migration-conventions.spec.ts`:

- El `describe('sin claves foráneas')` va dentro de la raíz `describe('src/database/migrations')`. Tiene un `describe('el detector')` con las filas 1-7 y un `describe('el árbol')` con las 8-9.
- Los fixtures usan el builder `migrationSource({ up, down: [] })` (`:134-147`). Ese builder pone la primera línea de `up` en la línea 5 del archivo.

| #   | `it`                                                                                     | `up` del fixture                                                                                                                                                                                                                                                                 | Esperado                                                    |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | debería marcar FOREIGN KEY en un literal SQL                                             | `ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_customer" FOREIGN KEY ("customer_id")`                                                                                                                                                                                           | `['fixture.ts:5 FOREIGN KEY']`                              |
| 2   | `it.each([['REFERENCES'], ['references']])`: debería marcar %s sin distinguir mayúsculas | `ALTER TABLE "orders" ADD "customer_id" uuid %s "users"`                                                                                                                                                                                                                         | `['fixture.ts:5 %s']`                                       |
| 3   | debería marcar FOREIGN KEY aunque esté partido en dos líneas del literal                 | El `ALTER` de la fila 1, con `FOREIGN` al final de la línea 5 y `KEY ("customer_id")` en la 6                                                                                                                                                                                    | `['fixture.ts:5 FOREIGN KEY']`                              |
| 4   | debería no marcar una columna cuyo nombre contiene references, como preferences          | `ALTER TABLE "users" ADD "preferences" jsonb`                                                                                                                                                                                                                                    | `[]`. Ya está en verde con el stub                          |
| 5   | `it.each`: debería marcar %s de la API de esquema de TypeORM                             | (a) `await queryRunner.createForeignKey('orders', foreignKey);` (b) `await queryRunner.createForeignKeys('orders', foreignKeyList);` (c) `const foreignKey = new TableForeignKey(options);` (d) `await queryRunner.createTable(new Table({ name: 'orders', foreignKeys: [] }));` | `['fixture.ts:5 <nombre>']`: una sola coincidencia por caso |
| 6   | debería ignorar los comentarios de TypeScript aunque nombren una clave foránea           | `// Sin FOREIGN KEY ni REFERENCES, ni createForeignKey: cero FKs.`, `/* TableForeignKey, foreignKeys */` y un `ALTER … ADD "status"` limpio                                                                                                                                      | `[]`. Ya está en verde con el stub                          |
| 7   | debería marcar un comentario SQL dentro del literal, porque falla en cerrado             | Un `query` de varias líneas con `-- REFERENCES "users" ("id")` en la línea 6                                                                                                                                                                                                     | `['fixture.ts:6 REFERENCES']`                               |
| 8   | debería tener al menos una migración que revisar                                         | `migrationFiles()`                                                                                                                                                                                                                                                               | Longitud mayor que 0. Ya está en verde                      |
| 9   | debería no declarar ninguna clave foránea en ninguna migración, sin corte por fecha      | `foreignKeysInMigrations()`                                                                                                                                                                                                                                                      | `[]`. Ya está en verde; su rojo se ve en el Guard check     |

**Guard tests**

| Garantía                              | Fila                                                     | Qué se quita o se rompe                                                                                                                     | Rojo que se ve                                                                                                                              | Cómo se restaura                                                                                                           |
| ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Cada regla detecta lo suyo            | Detector 1-9, 11-36 (las siete con letra incluidas) y 38 | El checker como stub (estado del Red)                                                                                                       | Cada fila falla por aserción con `Received: []`                                                                                             | Con el Green                                                                                                               |
| El árbol se lee de verdad             | 41 y 42                                                  | El lector como stub vacío (estado del Red)                                                                                                  | La 41 da `Expected: > 0, Received: 0`; la 42, que faltan las diez líneas                                                                    | Con el Green                                                                                                               |
| Un módulo real roto se ve en el árbol | 42                                                       | Añadir `ManyToOne` al import de `typeorm` de `order.orm-entity.ts:1`, sin usarlo                                                            | Sobra `orm-relations src/modules/orders/infrastructure/persistence/order.orm-entity.ts`                                                     | Quitarlo y comprobar que `git diff --stat src/modules/orders/infrastructure/persistence/order.orm-entity.ts` sale vacío    |
| Un contexto nuevo sin capas se ve     | 42                                                       | Crear `src/modules/billing/billing.module.ts` vacío                                                                                         | Sobran cuatro líneas: `structure src/modules/billing/__tests__/`, `…/application/`, `…/domain/` y `…/infrastructure/`. La 41 sigue en verde | Borrar el archivo y la carpeta `src/modules/billing/`, y comprobar que `git status --short src/modules/billing` sale vacío |
| Cada patrón de FK se detecta          | FK 1, 2, 3, 5 y 7                                        | `foreignKeysIn` como stub (estado del Red)                                                                                                  | Cada fila falla por aserción                                                                                                                | Con el Green                                                                                                               |
| Cero FKs en el árbol                  | FK 9                                                     | Añadir ` REFERENCES "users"` al final del `ADD "cancelled_at" TIMESTAMP WITH TIME ZONE` de `1790796856575-add-cancellation-to-orders.ts:28` | `['1790796856575-add-cancellation-to-orders.ts:28 REFERENCES']`                                                                             | Quitarlo y comprobar que `git diff --stat src/database/migrations` sale vacío                                              |

Las tres roturas del árbol se midieron en memoria con un prototipo del algoritmo, y dan exactamente el rojo de la tabla.

- [ ] **Stub:**
  - Crea `src/__tests__/helpers/module-contract-checker.ts` con los dos tipos de **Interfaces** y `FLAT_MODULES = ['health']`, que ya es la definitiva.
  - `discoverContexts`, `checkModuleContract` y `readModuleSources` devuelven valores neutros (`[]`, `[]` y `new Map()`), con parámetros que empiezan por `_`.
  - Después, `pnpm typecheck` tiene que estar en verde.
  - Los helpers de FK no se crean en este paso: una `const` de spec que nadie usa rompe `noUnusedLocals` (`tsconfig.json:27`). Nacen en el Red, junto a sus filas.
- [ ] **Red:**
  - Crea `src/__tests__/module-contract.spec.ts` con las 49 filas (las 42 numeradas y las siete con letra), `ROOT` y `PENDING_VIOLATIONS`. Pon `billingContext` y `render` bajo `// Helpers`.
  - Ejecuta `pnpm test src/__tests__/module-contract.spec.ts`. Fallan por aserción las filas 1-9, 11-36 (con las siete con letra), 38, 41 y 42.
  - Pasan las filas 10, 37, 39 y 40. Son controles negativos: su valor llega con el Green, cuando un checker real ya podría dar falsos positivos.
  - En `migration-conventions.spec.ts`, añade el `describe('sin claves foráneas')` con sus 9 filas. Bajo `// Helpers` pon `foreignKeysIn` como stub que devuelve `[]`, y `migrationFiles` y `foreignKeysInMigrations` ya reales.
  - Ejecuta `pnpm test src/database/__tests__/migration-conventions.spec.ts`. Fallan por aserción las filas 1, 2, 3, 5 y 7. Pasan la 4, la 6, la 8, la 9 y las cinco filas de `lock_timeout`.
- [ ] **Green:**
  - Implementa el algoritmo de arriba y el detector de FKs.
  - `pnpm test src/__tests__/module-contract.spec.ts` y `pnpm test src/database/__tests__/migration-conventions.spec.ts` tienen que estar en verde.
  - ⚠️ La fila 42 tiene que dar EXACTAMENTE las diez líneas. Si el checker mide otro conjunto, PARA y consulta, con la línea que sobra o falta y el motivo. No se añade ni se quita nada de `PENDING_VIOLATIONS` en silencio.
  - Un prototipo fuera del repo, sobre `32ade98`, midió exactamente esas diez.
- [ ] **Guard check:**
  - Haz las tres roturas del árbol de la tabla, de una en una.
  - Para cada una: rompe, ejecuta `pnpm test <spec>`, comprueba el rojo descrito, restaura y verifica con el `git diff --stat` o el `git status --short` de la tabla.
- [ ] **Refactor:**
  - Separa una función por clave y deja compartida la resolución de referencias.
  - En el spec no queda más lógica que el fixture.
  - `pnpm typecheck` y los dos specs siguen en verde.
- [ ] **Verificación de cierre** (todo en verde):
  - `pnpm typecheck` sin errores.
  - `pnpm test src/__tests__/module-contract.spec.ts`.
  - `pnpm test src/database/__tests__/migration-conventions.spec.ts`.
  - `pnpm test src/__tests__/language-convention.spec.ts`: comprueba que los identificadores nuevos están en inglés.
  - `pnpm lint:check` y `pnpm format:check`.
  - `pnpm test`.
  - `git status --short src/modules/billing src/modules/orders/infrastructure/persistence src/database/migrations` tiene que salir vacío: las roturas del Guard check quedaron restauradas.
- [ ] Si `pnpm-lock.yaml` aparece modificado solo por `@pnpm/exe`, quítalo con Edit.
- [ ] _"Te sugiero hacer un commit de los cambios por añadir la guarda del contrato de módulo, con su trinquete de diez violaciones pendientes, y la de cero claves foráneas en las migraciones"_.

### Task 7: `users` al contrato de módulo

**Layer:** domain + infrastructure de `users`, con specs de application y E2E (uno de ellos en `auth`). En `common` solo cambian comentarios.

**Files:**

- Modify: `src/__tests__/module-contract.spec.ts` (solo se quitan de `PENDING_VIOLATIONS` las cuatro líneas de users)
- Modify: `src/modules/users/domain/errors/user.errors.ts`
- Modify: `src/modules/users/domain/value-objects/user-id.vo.ts`
- Modify: `src/modules/users/domain/entities/user.entity.ts`
- Modify: `src/modules/users/infrastructure/persistence/user.mapper.ts`
- Modify: `src/modules/users/infrastructure/persistence/user.orm-entity.ts`
- Create: `src/modules/users/infrastructure/http/users-domain-exception.filter.ts`
- Delete: `src/modules/users/infrastructure/http/user-domain-exception.filter.ts`
- Modify: `src/modules/users/infrastructure/http/users.controller.ts` (el import, `@UseFilters` y los comentarios que nombran el filtro)
- Modify (solo comentarios): `src/modules/users/application/users.facade.ts`, `src/common/dto/error-example.factory.ts`, `src/common/dto/error-response.dto.ts`
- Test (create): `src/modules/users/__tests__/domain/errors/user.errors.spec.ts`
- Test (create): `src/modules/users/__tests__/infrastructure/http/users-domain-exception.filter.spec.ts`
- Test (delete): `src/modules/users/__tests__/infrastructure/http/user-domain-exception.filter.spec.ts`
- Test (modify):
  - `src/modules/users/__tests__/domain/value-objects/user-id.vo.spec.ts`
  - `src/modules/users/__tests__/domain/entities/user.entity.spec.ts`
  - `src/modules/users/__tests__/application/use-cases/find-user-by-id.use-case.spec.ts`
  - `src/modules/users/__tests__/application/use-cases/deactivate-user.use-case.spec.ts`
  - `src/modules/users/__tests__/application/users.facade.spec.ts`
  - `src/modules/users/__tests__/infrastructure/persistence/user.mapper.spec.ts`
  - `src/modules/users/__tests__/infrastructure/persistence/user.typeorm.repository.e2e-spec.ts`
  - `src/modules/users/__tests__/users.e2e-spec.ts`
  - `src/modules/auth/__tests__/auth.e2e-spec.ts`
- Uses (from earlier tasks):
  - `DomainError` (Task 1);
  - `Entity` y `BaseEntityProps` (Task 2);
  - `UuidIdentifier` (Task 3);
  - `DomainExceptionFilter` y `DomainErrorMapping` (Task 4);
  - `failClosed` (Task 5);
  - `PENDING_VIOLATIONS` y la fila «árbol» de `module-contract.spec.ts` (Task 6).
- Sin cambios: los cuatro casos de uso, `user.typeorm.repository.ts`, `users.module.ts`, `user-response.dto.ts`, `email.vo.ts`, `user-role.ts`, `__tests__/helpers/` y las migraciones. No se genera ninguna migración.

**Interfaces** (lo que cambia; el resto del módulo conserva sus firmas):

`src/modules/users/domain/errors/user.errors.ts`

```ts
export abstract class UserDomainError extends DomainError {} // sin constructor: hereda el protected y el name de DomainError
// InvalidEmailError, InvalidUserIdError, InvalidUserNameError, UserNotFoundError y EmailAlreadyTakenError no cambian
```

`src/modules/users/domain/value-objects/user-id.vo.ts`

```ts
export class UserId extends UuidIdentifier<'UserId'> {
  static generate(): UserId;
  static from(value: string): UserId; // InvalidUserIdError si no es un UUID v4; value queda en minúsculas
}
```

`src/modules/users/domain/entities/user.entity.ts`

```ts
export class User extends Entity<UserId> {
  static create(params: { id: UserId; email: Email; name: string; now: Date }): User; // sin cambios
  static rehydrate(
    params: BaseEntityProps<UserId> & {
      email: Email;
      name: string;
      role: UserRole;
      active: boolean;
    },
  ): User; // la misma forma que hoy (user.entity.ts:46-54): ningún llamador cambia
  // id, createdAt, updatedAt y equals() vienen de Entity; getters, transiciones y toSnapshot() no cambian de firma
}
```

`src/modules/users/infrastructure/http/users-domain-exception.filter.ts`

```ts
@Catch(UserDomainError)
export class UsersDomainExceptionFilter extends DomainExceptionFilter<UserDomainError> {
  protected readonly mappings: readonly DomainErrorMapping<UserDomainError>[];
}
```

`src/modules/users/infrastructure/persistence/user.orm-entity.ts`

```ts
@Column({ type: 'timestamptz', default: () => 'now()' }) createdAt!: Date;
@Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt!: Date;
```

**Decisions:**

- **D1 · La tarea empieza por el trinquete.**
  - Antes de tocar código se borran de `PENDING_VIOLATIONS` las cuatro líneas de users: `entities …/user.entity.ts`, `errors …/user.errors.ts`, `filter …/users-domain-exception.filter.ts` y `orm-managed-columns …/user.orm-entity.ts`.
  - La fila «árbol» queda roja por aserción. Es el único rojo de las piezas que no cambian comportamiento (`User` sobre `Entity` y las columnas ORM), y vuelve a verde cuando desaparecen las cuatro violaciones.
  - Si el diff no muestra exactamente esas cuatro líneas, el implementador para y consulta.
- **D2 · `UserDomainError` sin constructor propio.**
  - Hereda de `DomainError` el `protected constructor(message)` y el `name = new.target.name` (T2), así que desaparece `user.errors.ts:6-9`. Las cinco clases concretas no cambian.
  - Una clase abstracta vacía no choca con el lint: el preset es `recommendedTypeChecked` + `stylisticTypeChecked` (`eslint.config.mjs:31-32`), que no incluye `no-extraneous-class`.
- **D3 · `UserId` sin constructor propio**, porque hereda el protegido de `UuidIdentifier`.
  - `from()` comprueba con `UuidIdentifier.isUuidV4(value)` y lanza `InvalidUserIdError`. `generate()` usa `UuidIdentifier.newUuid()`.
  - Se borran `UUID_V4`, `randomUUID` y el import de `ValueObject` (`user-id.vo.ts:1-3,7`).
  - La normalización solo cambia `value` cuando la entrada lleva mayúsculas. Las propiedades existentes con `fc.uuid` siguen valiendo, porque fast-check genera el hexadecimal en minúsculas (`fast-check.js:8936-8938`). Ningún otro test pasa a `users` ids en mayúsculas (el único es `user-id.vo.spec.ts:95`).
- **D4 · `User`: constructor posicional con la base delante.**
  - La firma es `private constructor(base: BaseEntityProps<UserId>, private _email: Email, private _name: string, private _role: UserRole, private _active: boolean)`, con `super(base)`.
  - Se borran `readonly id`, `readonly createdAt`, `_updatedAt` y `get updatedAt()` (`user.entity.ts:31,36-37,82-84`), porque ahora viven en `Entity`.
  - ⚠️ No hay que dejar `readonly id` ni `readonly createdAt` como parameter properties. Un campo redeclarado da TS2612, pero una parameter property redeclarada compila sin aviso (medido con TS 6.0.3).
  - Cada `this._updatedAt = now` (`:88,96,104,112,121`) pasa a `this.touch(now)`, detrás de la misma guarda de no-op. `rename` sigue validando con `assertName` antes de tocar.
  - El comportamiento no cambia. Hoy `User` ya tiene las dos fechas (`:36-37`), `create` las iguala a `now` (`:40-43`), `rename` las mueve siempre y los no-op salen con `return` sin tocar nada (`:86-122`).
- **D5 · Mapper con `failClosed`.**
  - `toDomain` envuelve el `User.rehydrate({...})` entero. Las dos llamadas que pueden lanzar son `UserId.from` y `Email.from` (`user.mapper.ts:16-17`).
  - El predicado es local: `isUserDomainError = (error: unknown): error is UserDomainError => error instanceof UserDomainError`.
  - El `describe` produce `` `El usuario ${row.id} tiene datos que el dominio rechaza: ${error.message}` ``. Va en español porque es para el operador, y calca el de `order.mapper.ts:82-84`.
  - `role` sigue sin validarse, porque falla al revés (`user.mapper.ts:19-22`).
- **D6 · Fechas con `@Column({ type: 'timestamptz', default: () => 'now()' })`.**
  - Con `@UpdateDateColumn`, si el dominio no movió la fecha pero sí otra columna, TypeORM añade `"updatedAt" = CURRENT_TIMESTAMP` (`UpdateQueryBuilder.js:442-445`).
  - El `default` es obligatorio para que no haya deriva. La tabla nació `NOT NULL DEFAULT now()` (`1785165436853-create-users-table.ts:13-14`) y ninguna migración posterior toca esas columnas. Sin el `default`, `defaultEqual` vería un cambio (`PostgresDriver.js:947-958`).
  - Con el `default`, los metadatos coinciden con los que ponían los decoradores de fecha: el mismo tipo, `default` `now()` y ninguna precisión en Postgres (`ColumnMetadata.js:225-245`, `PostgresDriver.js:195-199`). Además, `findChangedColumns` no compara `onUpdate` (`PostgresDriver.js:1143-1175`).
  - No se genera migración, y lo confirma `--check`.
  - El seed del admin escribe `"updatedAt"` por SQL (`seed-admin.ts:66-67,75-76`), así que no depende del decorador.
- **D7 · Filtro sobre la base.**
  - La tabla lleva la anotación `readonly DomainErrorMapping<UserDomainError>[]`. Sin ella, cada flecha da TS7006, porque el inicializador no recibe tipo de la declaración abstracta de la base (medido con TS 6.0.3).
  - Tiene dos entradas, `UserNotFoundError` → `new NotFoundException(error.message)` y `EmailAlreadyTakenError` → `new ConflictException(error.message)`. Las dos se construyen con string, para que `error` sea el nombre canónico.
  - Los `Invalid*` caen en el 400 por defecto, y desaparece la rama que lo repetía (`user-domain-exception.filter.ts:38-44`).
  - El 409 se conserva (spec §8) aunque ningún endpoint de users lo declare. Quien lanza `EmailAlreadyTakenError` es el alta, que sale por la fachada como `email-taken`. Un comentario lo presenta como defensa y nombra lo que lo haría alcanzable: un endpoint de users que cambie el email.
- **D8 · El código de la fachada no cambia.**
  - Su `throw error` (`users.facade.ts:146-147`) es lo que convierte el `Error` de `failClosed` en un 500 del alta, en vez de un `invalid-profile`. La fila F16 lo fija.
  - `findByEmail` y `userExists` no envuelven la llamada al repositorio (`:124`, `:164`). El login y la comprobación de cliente de `orders` siguen en 500, como hoy (spec §9), y no necesitan fila.
- **D9 · El 404 repite el id tal como llegó.**
  - Ya lo hacen `find-user-by-id.use-case.ts:20` y `deactivate-user.use-case.ts:21`, pero ningún test lo fija: `find-user-by-id.use-case.spec.ts:22-29` y `deactivate-user.use-case.spec.ts:28-36` solo miran la clase.
  - Con las minúsculas de T5, `input.userId` e `id.value` dejan de coincidir cuando el id llega en mayúsculas. C1 y C2 lo fijan, simétricos con T10.
  - Su rojo se prueba a mano, porque Stryker no genera ese cambio.
- **D10 · Las filas corruptas se crean por SQL, sin pasar por el alta.**
  - Para los endpoints de users se corrompe el email con `'sin-arroba'`, porque el id tiene que pasar el `UserId.from` del path. La columna es `varchar(254)` sin `CHECK` (`1785165436853-create-users-table.ts:10`).
  - Para el alta se corrompe el id con un UUID v1, que la columna `uuid` admite (`:9`). La comprobación previa busca por el email normalizado (`create-user.use-case.ts:36-38`, `user.typeorm.repository.ts:47-50`), así que la fila que lee siempre tiene un email válido.
  - `role`, `active` y las fechas toman su `DEFAULT`.
  - La fila que deja el último `it` no contamina a otras suites, porque todas las que leen `users` la vacían al empezar, en su `beforeEach` o su `beforeAll`: `users.e2e-spec.ts:362-364`, `auth.e2e-spec.ts:40-41`, `orders.e2e-spec.ts:31-32` (un `beforeAll`) y `seed-admin.e2e-spec.ts:47-48`. La del repositorio usa `clear()` (`:31-33`).
- **D11 · El 500 del alta lo cubren los dos tests, cada uno por un motivo.**
  - El E2E de `auth.e2e-spec.ts`, donde vive el endpoint, es el único que pasa de rojo a verde. Recorre la cadena entera:
    1. el mapper y `failClosed`;
    2. la fachada;
    3. `RegisterAccountUseCase` (`register-account.use-case.ts:70`, fuera del `try`);
    4. `UsersUserDirectory` (sin `catch`, `users-user.directory.ts:48-61`);
    5. el filtro de auth, que no lo captura (`auth-domain-exception.filter.ts:41`);
    6. el filtro global.
  - F16 nace verde, pero es el eslabón que ve la mutación, porque los E2E no corren bajo Stryker. Debería matar el superviviente `instanceof UserDomainError` → `true`.
- **D12 · Renombrar es crear y borrar.**
  - El filtro y su spec nuevos se crean. Los viejos se borran juntos del sistema de archivos en el Green, y el usuario hace `git add -A`.
  - Hasta entonces el controller sigue con el filtro viejo, para que los E2E de users no den 400 donde esperan 404 mientras dura el rojo.
- **D13 · AAA en lo que se escribe o se muda.** Las filas nuevas, las que cambian y las que se mudan al spec nuevo del filtro usan `const act = () => …` bajo `// Act` y la aserción bajo `// Assert`. El `// Act + Assert` heredado del resto de las suites se queda como está (backlog #30).
- **D14 · Fuera de alcance:**
  - el `.filter()` sobre `fc.string()` de `user-id.vo.spec.ts:103` y de `helpers/arbitraries.ts:24`, que ya estaba (las filas P nuevas usan arbitrarias construidas);
  - las menciones en `.md` y las de `UsersFacade` (Task 11);
  - la mutación (Task 12).

**Casos acordados.** En las suites existentes solo aparecen las filas nuevas o las que cambian; el resto de cada suite no cambia. Las filas P nuevas usan `@fast-check/jest` (`test.prop`).

`src/modules/users/__tests__/domain/errors/user.errors.spec.ts` (nuevo, 1:1). Usa `describe('UserDomainError')`, y cada fila es un `it.each` con una entrada por error concreto:

| #   | Caso (se vuelve el `it`)                                                 | Entrada / estado inicial                                                                                                                                                                                       | Resultado esperado                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | debería construir el mensaje exacto de %s                                | `InvalidEmailError('sin-arroba')`, `InvalidUserIdError('no-es-uuid')`, `InvalidUserNameError('x')`, `UserNotFoundError('3f2504e0-4f89-41d3-9a0c-0305e82c3301')`, `EmailAlreadyTakenError('taken@example.com')` | `message` exactamente `"sin-arroba" is not a valid email address`, `"no-es-uuid" is not a valid user id`, `"x" is not a valid user name`, `User 3f2504e0-4f89-41d3-9a0c-0305e82c3301 was not found` y `Email taken@example.com is already registered`. Ya verde: fija los mensajes y mata el superviviente de `user.errors.ts` (`stryker.config.mjs:199-202`) |
| E2  | debería llamarse como su clase concreta (%s)                             | los mismos cinco                                                                                                                                                                                               | `name` es el nombre de cada clase. Ya verde: hoy lo pone `user.errors.ts:8`, y tras el Green, `DomainError`                                                                                                                                                                                                                                                   |
| E3  | debería ser a la vez un UserDomainError y un DomainError del kernel (%s) | los mismos cinco                                                                                                                                                                                               | `toBeInstanceOf(UserDomainError)` y `toBeInstanceOf(DomainError)`. **Rojo:** hoy la raíz extiende `Error` (`user.errors.ts:5`)                                                                                                                                                                                                                                |

`user-id.vo.spec.ts` (existente). El error de su contexto ya lo fija «debería rechazar %s» (`:44-52`):

| #   | Caso (se vuelve el `it`)                                                                                                                                                                                                | Entrada / estado inicial                                             | Resultado esperado                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| I1  | debería aceptar un UUID v4 en mayúsculas y guardarlo en minúsculas _(propiedad; cambia «debería aceptar indistintamente mayúsculas y minúsculas», `:91`, que solo pide `not.toThrow()`; conserva su forma `fc.assert`)_ | `fc.uuid({ version: 4 })` pasado por `toUpperCase()`                 | `UserId.from(...).value` es el uuid generado, en minúsculas. **Rojo:** hoy guarda el valor tal cual (`user-id.vo.ts:22`) |
| I2  | debería rechazar un UUID v4 con cualquier texto delante _(propiedad)_                                                                                                                                                   | `fc.uuid({ version: 4 })` y un prefijo `fc.string({ minLength: 1 })` | lanza `InvalidUserIdError`. Ya verde: el ancla `^` está en `user-id.vo.ts:7`, y tras el Green, en el kernel              |
| I3  | debería rechazar un UUID v4 con cualquier texto detrás _(propiedad)_                                                                                                                                                    | `fc.uuid({ version: 4 })` y un sufijo `fc.string({ minLength: 1 })`  | lanza `InvalidUserIdError`. Ya verde (ancla `$`)                                                                         |

`user.entity.spec.ts` (existente). Hoy `User` ya tiene las dos fechas, las cinco transiciones y unos no-op que salen con `return` (D4), así que todas sus filas nacen verdes; su rojo es la línea `entities` del trinquete. P1 y P2 van en un `describe('updatedAt (property-based)')` nuevo:

| #   | Caso (se vuelve el `it`)                                                                                                                              | Entrada / estado inicial                                                                                                                                                                                                   | Resultado esperado                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| U1  | debería mover updatedAt al renombrar aunque el nombre sea el mismo                                                                                    | creado en `NOW` con `'María González'`; `rename('María González', LATER)`                                                                                                                                                  | `updatedAt` = `LATER`. Ya verde (`user.entity.ts:86-89`)                              |
| U2  | debería reactivar a un usuario desactivado y mover updatedAt _(cambia «debería reactivar a un usuario desactivado», `:164`, que no mira `updatedAt`)_ | desactivado en `LATER`; `activate(new Date('2026-07-27T12:00:00.000Z'))`                                                                                                                                                   | `active` es `true` y `updatedAt` es esa fecha. Ya verde (`:107-113`)                  |
| U3  | debería conservar el id, createdAt y updatedAt al rehidratar                                                                                          | `rehydrate` con un `UserId` fijo, `createdAt: NOW` y `updatedAt: LATER`                                                                                                                                                    | `id.equals(ese id)`, `createdAt` = `NOW` y `updatedAt` = `LATER`. Ya verde (`:46-64`) |
| P1  | debería fijar updatedAt en el instante exacto de cualquier renombrado válido, aunque sea anterior al alta _(propiedad)_                               | `timestampArb` (2000-2100, `helpers/arbitraries.ts:27-31`) × `fc.constantFrom('Ana López', 'Juan Pérez', 'Eva Ruiz')`, sobre un usuario creado en `NOW`                                                                    | `updatedAt` = el instante generado. Ya verde                                          |
| P2  | debería dejar updatedAt intacto en cualquier transición que no cambia nada _(propiedad)_                                                              | `fc.constantFrom('changeEmail', 'deactivate', 'activate', 'promoteToAdmin')` × `timestampArb`, con el usuario ya en el estado de llegada en `NOW`: el mismo email; `deactivate(NOW)`; recién creado; `promoteToAdmin(NOW)` | `updatedAt` sigue en `NOW`. Ya verde                                                  |

Casos de uso (`find-user-by-id.use-case.spec.ts` y `deactivate-user.use-case.spec.ts`, dentro de `describe('execute()')`):

| #   | Caso (se vuelve el `it`)                                                                 | Entrada / estado inicial                                                                         | Resultado esperado                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | debería repetir en el UserNotFoundError el id tal como llegó, aunque venga en mayúsculas | `FindUserByIdUseCase` con el repositorio vacío; `userId: '3F2504E0-4F89-41D3-9A0C-0305E82C3301'` | rechaza con `UserNotFoundError` (vía `captureRejection`) y `message` exactamente `User 3F2504E0-4F89-41D3-9A0C-0305E82C3301 was not found`. Ya verde (`find-user-by-id.use-case.ts:20`) |
| C2  | el mismo texto, en el spec de `DeactivateUserUseCase`                                    | `DeactivateUserUseCase` con la misma entrada                                                     | el mismo resultado. Ya verde (`deactivate-user.use-case.ts:21`)                                                                                                                         |

`users.facade.spec.ts` (existente). La fila F16 se añade también a la tabla de su cabecera (`:14-30`):

| #   | Caso (se vuelve el `it`)                                                                                                                                                                           | Entrada / estado inicial                                                                                                                                                                             | Resultado esperado                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| F16 | debería propagar intacto un error que no es de dominio al crear el perfil, sin convertirlo en invalid-profile                                                                                      | un repositorio cuyo `findByEmail` rechaza con `new Error('fila corrupta')`, que es lo que `failClosed` produce ante una fila corrupta. Es una subclase de `InMemoryUserRepository` bajo `// Helpers` | `createProfile` rechaza con ese mismo error (`toBe`, vía `captureRejection`). Ya verde (`users.facade.ts:146-147`) |
| F17 | debería devolver null ante un email malformado sin consultar el repositorio _(añadida en la Task 12: mata el superviviente `BlockStatement` del `catch` de `findByEmail`; aprobada el 2026-10-19)_ | `findByEmail('sin-arroba')` sobre un repositorio que registra cada email con que se le consulta. Es una subclase de `InMemoryUserRepository` bajo `// Helpers`                                       | `null`, y el registro de consultas vacío. Verde con el código; su rojo se demuestra vaciando el `catch` a mano     |

**Tests** (infraestructura, exenta de tabla):

`user.mapper.spec.ts`, dentro de `describe('toDomain()')` (el resto no cambia):

- **Cambia** «debería rechazar una fila cuyo email no es válido» (`:97-103`, con un `toThrow()` sin clase) a **debería fallar cerrado ante una fila cuyo email el dominio rechaza**.
  - Usa `buildRow({ email: 'sin-arroba' })`.
  - `captureError(act).message` es exactamente `El usuario <row.id> tiene datos que el dominio rechaza: "sin-arroba" is not a valid email address`.
  - El error no es un `UserDomainError`, y su `cause` es un `InvalidEmailError`.
  - Rojo hoy, porque sale el `InvalidEmailError` tal cual.
- **Nuevo:** **debería fallar cerrado ante una fila cuyo id no es un UUID v4**.
  - Usa `buildRow({ id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' })`, un UUID de versión 1.
  - El mensaje es `El usuario 3f2504e0-4f89-11d3-9a0c-0305e82c3301 tiene datos que el dominio rechaza: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" is not a valid user id`, y el `cause` es un `InvalidUserIdError`.
  - Rojo hoy.
- **Nuevo:** **debería relanzar intacto un error que no es de dominio**. Con `buildRow({ email: undefined })`, `Email.from` lanza un `TypeError`, y `captureError(act)` es ese `TypeError`, no un `Error` envuelto. Ya verde.

`users-domain-exception.filter.spec.ts` (nuevo; `describe('UsersDomainExceptionFilter')` > `describe('catch()')`). Sustituye a `user-domain-exception.filter.spec.ts`:

- Se mudan con el mismo texto, cambiando solo el SUT:
  - «debería traducir UserNotFoundError a 404» y «debería traducir EmailAlreadyTakenError a 409». Son rojos contra el stub, que responde 400.
  - «debería traducir %s a 400» (los tres `Invalid*`), «debería tratar un error de dominio sin mapeo como 400» (con su helper `UnmappedDomainError`) y «debería conservar el mensaje del error de dominio». Ya están verdes con el stub, porque son el camino por defecto de la base.
- **Nuevo:** **debería publicar el 400 por defecto con el mensaje exacto del dominio y el error canónico**.
  - `InvalidUserIdError('no-es-uuid')` produce una `BadRequestException` cuyo `getResponse()` es `{ statusCode: 400, message: '"no-es-uuid" is not a valid user id', error: 'Bad Request' }`.
  - Es el cuerpo que documenta el controller (`users.controller.ts:170-174`).
  - Ya verde con el stub.

E2E (cada comando con el prefijo `DB_PORT=5434`):

- **`user.typeorm.repository.e2e-spec.ts`**, dentro de `describe('save()')`, nuevo: **debería guardar el updatedAt que fija el dominio aunque el UPDATE cambie otras columnas**.
  - Arrange: `buildUser('duena.fecha@example.com')`, que nace en `T0 = 2026-07-27T10:00:00.000Z` (`:171-177`); después `save` y `user.rename('Nombre Cambiado', T0)`.
  - Act: `save`.
  - Assert: `SELECT name, "updatedAt" FROM users WHERE id = $1` devuelve `'Nombre Cambiado'` y `T0`. El nombre prueba que hubo UPDATE.
  - Rojo hoy.
  - ⚠️ El `rename` va con `T0` y no con otra hora. Con una hora distinta, `updatedAt` entra en el diff (`SubjectChangedColumnsComputer.js:41-47`) y TypeORM escribe el valor del dominio también con `@UpdateDateColumn`, así que el test no vería la regresión.
- **`users.e2e-spec.ts`**, en un `describe('fila corrupta')` nuevo, un `it.each`: **debería responder 500 en %s cuando la fila del usuario está corrupta**.
  - Tiene tres filas: `GET /users/:id` (rol `'user'`), `GET /users` (rol `'admin'`) y `DELETE /users/:id` (rol `'admin'`). La tabla lleva solo la etiqueta de la ruta y el rol. El token (`userToken` o `adminToken`) y `prefix` se resuelven DENTRO del `it`: los asigna el `beforeAll` (`users.e2e-spec.ts:30-54`), y en la tabla valdrían `undefined`, con lo que la petición daría 401 tanto en el rojo como en el verde.
  - Arrange: `INSERT INTO users (id, email, name) VALUES ($1, 'sin-arroba', 'Fila Corrupta')`, con `$1 = randomUUID()`.
  - Assert: solo el status, 500. En test, el cuerpo lleva el mensaje envuelto.
  - Rojo hoy: responde 400.
- **`auth.e2e-spec.ts`**, dentro de `describe('POST /auth/register')`, nuevo: **debería responder 500 sin escribir credencial cuando el perfil existente con ese email está corrupto**.
  - Arrange: `INSERT INTO users (id, email, name) VALUES ('3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'perfil.corrupto@example.com', 'Perfil Corrupto')`.
  - Act: `postRegister({ email: 'perfil.corrupto@example.com', name: 'Otra Persona', password: DEFAULT_PASSWORD })`.
  - Assert: responde 500, y `SELECT COUNT(*)::int AS count FROM auth_credentials` da 0.
  - Rojo hoy: responde 400 `invalid-profile`, con el id de la otra cuenta en el mensaje.

**Contrato.** No hay endpoints nuevos ni se declara o retira ningún status; el 500 ya está en `@ApiStandardErrors`:

| Endpoint                                                       | Código                                                          | Motivo                                                                                                                | Camino que lo produce (tras la tarea)                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ `GET /users`                                                | 500 (antes 400 con el valor y log `warn`)                       | una fila de `users` que el dominio rechaza: un email inválido o un id que no es v4                                    | `ListUsersUseCase` → `findMany` (`user.typeorm.repository.ts:52-60`) → `UserMapper.toDomain` → `failClosed` → un `Error` con `cause`, que `@Catch(UserDomainError)` no captura → `AllExceptionsFilter`: 500 y log `fatal` con el error (`all-exceptions.filter.ts:103-105`)                                                                           |
| ⚠️ `GET /users/:id`                                            | 500 (antes 400)                                                 | la fila pedida está corrupta                                                                                          | `FindUserByIdUseCase` → `findById` → el mismo camino                                                                                                                                                                                                                                                                                                  |
| ⚠️ `DELETE /users/:id`                                         | 500 (antes 400)                                                 | la fila pedida está corrupta                                                                                          | `DeactivateUserUseCase` → `findById` → el mismo camino                                                                                                                                                                                                                                                                                                |
| ⚠️ `POST /auth/register`                                       | 500 (antes 400 `invalid-profile` con el id ajeno en el mensaje) | el perfil que ya tiene ese email guarda un id que no es v4                                                            | `RegisterAccountUseCase` (`register-account.use-case.ts:70`) → `UsersUserDirectory.createProfile` → `UsersFacadeImpl.createProfile` → `CreateUserUseCase` (comprobación previa `findByEmail`) → mapper → `failClosed` → la fachada relanza lo que no es `UserDomainError` (`users.facade.ts:146-147`) → `@Catch(AuthDomainError)` no lo captura → 500 |
| `GET /users/:id`, `DELETE /users/:id`                          | 400 (sin cambio)                                                | el id del path no es un UUID v4                                                                                       | `UserId.from` → `InvalidUserIdError` → el 400 por defecto de la base (antes, la rama explícita de `user-domain-exception.filter.ts:38-44`)                                                                                                                                                                                                            |
| `GET /users/:id`, `DELETE /users/:id`                          | 404 (sin cambio)                                                | id inexistente                                                                                                        | `UserNotFoundError(input.userId)` → la entrada 404 de la tabla                                                                                                                                                                                                                                                                                        |
| `GET /users`                                                   | 400 (sin cambio)                                                | paginación inválida                                                                                                   | `PaginationDto` y `ValidationPipe`                                                                                                                                                                                                                                                                                                                    |
| `POST /auth/register`                                          | 400 (sin cambio)                                                | el DTO, o un `invalid-profile` legítimo: `Email.from` rechaza lo que `@IsEmail` acepta, y el nombre se mide recortado | `users.facade.ts:143-145` → `InvalidProfileError`                                                                                                                                                                                                                                                                                                     |
| `POST /auth/login`, `POST /orders` y `POST /orders/:id/cancel` | 500 (sin cambio)                                                | la fila del usuario está corrupta                                                                                     | `findByEmail` y `userExists` no envuelven la llamada al repositorio (`users.facade.ts:124,164`)                                                                                                                                                                                                                                                       |

En producción y staging, todos esos 500 llevan el cuerpo genérico (`all-exceptions.filter.ts:155-162`). En development y test llevan el mensaje envuelto (`:163-167`).

**Guard tests.** En cada uno se quita la protección, se ve el rojo, se restaura y se vuelve a ejecutar en verde:

| Garantía                                         | Test                                                                 | Qué se quita                                                                                              | Rojo que se ve                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El dominio es el dueño de `updatedAt` (spec §12) | la fila nueva del E2E del repositorio                                | `updatedAt` vuelve a `@UpdateDateColumn({ type: 'timestamptz' })`, con su import                          | `Expected: 2026-07-27T10:00:00.000Z` y `Received:` la hora del UPDATE (`UpdateQueryBuilder.js:442-445`). La fila «árbol» también se pone roja, por `orm-managed-columns` |
| El 404 repite el id tal como llegó (T10)         | C1 y C2                                                              | `new UserNotFoundError(input.userId)` pasa a `UserId.from(input.userId).value` en C1 y a `id.value` en C2 | el `message` llega en minúsculas. Stryker no genera este cambio                                                                                                          |
| Solo se envuelve el error de dominio             | «debería relanzar intacto un error que no es de dominio», del mapper | el predicado de `failClosed` devuelve siempre `true`                                                      | llega un `Error` envuelto en vez del `TypeError`. Stryker no muta la infraestructura                                                                                     |

**Rule codes:**

- `db-use-migrations`: no se genera migración. La prueba de que el esquema no cambia es `--check`.

- [ ] **Trinquete:** en `src/__tests__/module-contract.spec.ts`, borra de `PENDING_VIOLATIONS` las cuatro líneas de users (D1) y nada más.
  - Ejecuta `pnpm test src/__tests__/module-contract.spec.ts`. La fila «árbol» falla por aserción, y el diff marca esas cuatro líneas como recibidas de más.
  - Si el diff muestra otra cosa, para y consulta.
- [ ] **Stub:** crea `users-domain-exception.filter.ts` con la clase de **Interfaces**, `@Catch(UserDomainError)` y la tabla vacía (ya anotada).
  - No toques todavía el controller ni el filtro viejo.
  - `pnpm typecheck` en verde.
- [ ] **Red:** escribe un `it` por fila, de las tablas y de **Tests**. El texto del `it` es el caso, y cada `toThrow` nombra la clase.
  - El spec nuevo del filtro recibe las filas mudadas; el viejo sigue hasta el Green.
  - `user.errors.spec.ts` va en la carpeta nueva `__tests__/domain/errors/`.
  - Añade F16 a la tabla de la cabecera de `users.facade.spec.ts`.
  - Ejecuta `pnpm test src/modules/users`, `DB_PORT=5434 pnpm test:e2e src/modules/users` y `DB_PORT=5434 pnpm test:e2e src/modules/auth/__tests__/auth.e2e-spec.ts`.
  - Fallan por aserción:
    - E3 e I1;
    - las dos filas corruptas del mapper;
    - el 404 y el 409 del filtro;
    - los tres E2E nuevos;
    - la fila «árbol». Tras el Stub, el filtro nuevo ya existe, así que su línea `filter` desaparece; en su lugar sale `controller-filter src/modules/users/infrastructure/http/users.controller.ts`, porque el controller sigue con el filtro viejo. Quedan de más esa línea y las de `entities`, `errors` y `orm-managed-columns` de users.
  - Las demás nacen verdes, como dice su fila. Ninguna puede fallar con «Cannot find module» ni por una excepción.
- [ ] **Green**, en este orden:
  1. `user.errors.ts`, según D2 (import de `@shared/domain/domain-error`).
  2. `user-id.vo.ts`, según D3 (import de `@shared/domain/uuid-identifier.base`).
  3. `user.entity.ts`, según D4 (import de `Entity` y `type BaseEntityProps` desde `@shared/domain/entity.base`).
  4. `user.mapper.ts`, según D5 (import de `@common/persistence/fail-closed`).
  5. `user.orm-entity.ts`, según D6. Su import pierde `CreateDateColumn` y `UpdateDateColumn`.
  6. La tabla del filtro nuevo, según D7.
  7. `users.controller.ts`:
     - importa `UsersDomainExceptionFilter` de `./users-domain-exception.filter` y lo pone en `@UseFilters`;
     - renombra el filtro en los comentarios que queden tras la Task 5, localizándolos con `grep` y no por número de línea;
     - el comentario sobre `UserId.from()` (`:163-166` en `32ade98`) pasa a decir que el `InvalidUserIdError` cae en el 400 por defecto de `DomainExceptionFilter`.
  8. Borra `src/modules/users/infrastructure/http/user-domain-exception.filter.ts` y `src/modules/users/__tests__/infrastructure/http/user-domain-exception.filter.spec.ts`.
  9. En `src/common/dto/error-example.factory.ts` y `src/common/dto/error-response.dto.ts`, el comentario pasa a nombrar `UsersDomainExceptionFilter`.

  Después, todo en verde:
  - `pnpm typecheck`;
  - `pnpm test src/modules/users`;
  - `pnpm test src/__tests__/module-contract.spec.ts`: la fila «árbol» vuelve a verde, con las seis líneas de auth y orders;
  - `DB_PORT=5434 pnpm test:e2e src/modules/users`;
  - `DB_PORT=5434 pnpm test:e2e src/modules/auth/__tests__/auth.e2e-spec.ts`.

- [ ] **Guard check:** recorre las tres filas de **Guard tests** con su spec:
  - `DB_PORT=5434 pnpm test:e2e src/modules/users/__tests__/infrastructure/persistence/user.typeorm.repository.e2e-spec.ts`;
  - `pnpm test src/modules/users/__tests__/application/use-cases`;
  - `pnpm test src/modules/users/__tests__/infrastructure/persistence/user.mapper.spec.ts`.

  Comprueba que el rojo es el descrito, restaura y vuelve a ejecutar en verde.

- [ ] **Refactor**, sin cambiar comportamiento:
  - La cabecera de `user.orm-entity.ts` explica por qué no hay decoradores de fecha (T9 y `orm-managed-columns`) y por qué hace falta el `default`.
  - La cabecera del filtro nuevo explica la tabla, el 400 por defecto, el 409 como defensa y la construcción con string.
  - Las cabeceras de `user.entity.ts` y `user-id.vo.ts` explican qué ponen `Entity` y `UuidIdentifier`.
  - En `users.facade.ts:146`, el comentario pasa a decir: «Un fallo de infraestructura (la base caída, o una fila corrupta que `failClosed` convierte en `Error`) NO es un rechazo de negocio: sube.»

  Después, `pnpm typecheck`, `pnpm lint:check` y `pnpm format:check` en verde.

- [ ] **Verificación de cierre**, con Docker arriba y el prefijo `DB_PORT=5434` en cada comando que toca la base:
  - `pnpm typecheck` → sin errores.
  - `pnpm test` → toda la suite unitaria en verde, incluido `module-contract.spec.ts`, cuyo `PENDING_VIOLATIONS` queda en seis líneas, ninguna de users.
  - `DB_PORT=5434 pnpm test:e2e src/modules/users`, `DB_PORT=5434 pnpm test:e2e src/modules/auth` y `DB_PORT=5434 pnpm test:e2e src/modules/orders` → en verde. `orders` entra porque consume `UsersLookup` sobre el `User` nuevo.
  - Deriva de esquema contra la base de E2E, que la Preparación dejó limpia: `TEST_DB=$(sed -nE 's/^CREATE DATABASE ([a-z_]+);$/\1/p' docker/initdb/01-create-test-database.sql) && DB_PORT=5434 DB_DATABASE="$TEST_DB" pnpm migration:generate src/database/migrations/DriftCheck --check` → imprime `No changes in database schema were found`, sale con 0 y no crea ningún archivo en `src/database/migrations/`. Contra la de desarrollo, el mismo comando sin `DB_DATABASE` da lo mismo, salvo que la Preparación (paso 11.3) anotara deriva en ella: entonces su salida tiene que coincidir con la anotada, y su comprobación limpia llega tras el `db:reset` de la Task 8.
  - `pnpm lint:check` y `pnpm format:check` → sin errores.
  - `grep -rn "UserDomainExceptionFilter\|user-domain-exception" src test` → sin resultados.
  - Si `pnpm-lock.yaml` aparece modificado solo por `@pnpm/exe`, quítalo con Edit antes de la sugerencia de commit.
- [ ] _"Te sugiero hacer un commit de los cambios por llevar `users` al contrato de módulo: kernel en el dominio, `UsersDomainExceptionFilter` sobre la base, `failClosed` en el mapper y el dominio como dueño de las fechas"_

### Task 8: `orders` al contrato — `AggregateRoot` sobre `Entity` y `createdAt`/`updatedAt` en lugar de `placedAt`

**Layer:** domain (kernel `src/shared/domain/` y `orders`) + application + infrastructure (persistencia, migración y HTTP)

**Files:**

- Modify: `src/shared/domain/aggregate-root.ts`
- Test: `src/shared/__tests__/domain/aggregate-root.spec.ts` (se adapta)
- Modify: `src/modules/orders/domain/errors/order.errors.ts`
- Test: `src/modules/orders/__tests__/domain/errors/order.errors.spec.ts`
- Modify: `src/modules/orders/domain/value-objects/order-id.vo.ts`
- Test: `src/modules/orders/__tests__/domain/value-objects/order-id.vo.spec.ts`
- Modify: `src/modules/orders/domain/entities/order.entity.ts`
- Test: `src/modules/orders/__tests__/domain/entities/order.entity.spec.ts`
- Modify (solo el docstring): `src/modules/orders/domain/ports/order.repository.ts`
- Modify: `src/modules/orders/application/use-cases/cancel-order.use-case.ts`
- Test: `src/modules/orders/__tests__/application/use-cases/cancel-order.use-case.spec.ts`
- Test: `src/modules/orders/__tests__/application/use-cases/place-order.use-case.spec.ts`
- Modify: `src/modules/orders/infrastructure/persistence/order.mapper.ts`
- Test: `src/modules/orders/__tests__/infrastructure/persistence/order.mapper.spec.ts`
- Modify: `src/modules/orders/infrastructure/persistence/order.orm-entity.ts`
- Modify: `src/modules/orders/infrastructure/persistence/order.typeorm.repository.ts`
- Test: `src/modules/orders/__tests__/infrastructure/persistence/order.typeorm.repository.e2e-spec.ts`
- Modify: `src/modules/orders/infrastructure/http/dto/order-response.dto.ts`
- Create: `src/modules/orders/__tests__/infrastructure/http/dto/order-response.dto.spec.ts`
- Modify: `src/modules/orders/infrastructure/http/orders.controller.ts`
- Test: `src/modules/orders/__tests__/infrastructure/http/orders.controller.spec.ts`
- Modify: `src/modules/orders/infrastructure/http/orders-domain-exception.filter.ts`
- Test (sin cambios; tiene que seguir verde): `src/modules/orders/__tests__/infrastructure/http/orders-domain-exception.filter.spec.ts`
- Test: `src/modules/orders/__tests__/orders.e2e-spec.ts`
- Modify (helpers de test): `src/modules/orders/__tests__/helpers/order.factory.ts`, `src/modules/orders/__tests__/helpers/in-memory-order.repository.ts`
- Modify: `src/database/migrations/1786076763455-create-orders-and-outbox.ts`
- Modify (solo `PENDING_VIOLATIONS`): `src/__tests__/module-contract.spec.ts`
- Uses (from earlier tasks): `DomainError` (Task 1, `@shared/domain/domain-error`); `Entity` y `BaseEntityProps` (Task 2, `@shared/domain/entity.base`); `UuidIdentifier` (Task 3, `@shared/domain/uuid-identifier.base`); `DomainExceptionFilter` y `DomainErrorMapping` (Task 4, `@common/filters/domain-exception.filter`); `failClosed` (Task 5, `@common/persistence/fail-closed`) y `orders.controller.ts` ya sin sus `requestMeta`/`errorExample` locales (Task 5); `PENDING_VIOLATIONS`, la fila árbol de `module-contract.spec.ts` y `describe('sin claves foráneas')` de `migration-conventions.spec.ts` (Task 6); `users` ya al contrato (Task 7). Helpers que ya existen: `declaredResponse` y `modelPropertiesOf` (`src/common/__tests__/helpers/swagger-metadata.ts`), `captureRejection` (`test/helpers/capture-error.ts`), `timestampArb` (`src/modules/orders/__tests__/helpers/arbitraries.ts`).
- Sin cambios (comprobado): `src/database/migrations/1790796856575-add-cancellation-to-orders.ts`, `src/database/outbox/relay-orders-outbox.ts`, `src/database/__tests__/relay-orders-outbox.e2e-spec.ts`, `src/database/__tests__/migration-conventions.spec.ts`, `order-placed.event.ts`, `order-cancelled.event.ts`, `outbox-message.orm-entity.ts`, `orders.module.ts`, `place-order.use-case.ts`, `arbitraries.ts`, `fake-customer.directory.ts`.

**Interfaces** (solo declaraciones):

`src/shared/domain/aggregate-root.ts`

```ts
export abstract class AggregateRoot<TId extends ValueObject<string>, TEvent> extends Entity<TId> {
  // sin constructor propio: hereda `protected constructor(props: BaseEntityProps<TId>)`
  protected record(event: TEvent): void;
  pullEvents(): TEvent[];
}
```

`src/modules/orders/domain/errors/order.errors.ts`

```ts
export abstract class OrderDomainError extends DomainError {} // hereda el constructor protegido
// las seis clases concretas no cambian
```

`src/modules/orders/domain/value-objects/order-id.vo.ts`

```ts
export class OrderId extends UuidIdentifier<'OrderId'> {
  static from(value: string): OrderId; // InvalidOrderIdError(value) si no es v4; guarda en minúsculas
  static generate(): OrderId;
}
```

`src/modules/orders/domain/entities/order.entity.ts`

```ts
export type OrderSnapshot = {
  id: string;
  customerId: string;
  concept: string;
  amountCents: number;
  createdAt: Date;
  updatedAt: Date; // sustituyen a placedAt
  status: OrderStatus;
  cancelledAt: Date | null;
  version: number;
};
export class Order extends AggregateRoot<OrderId, OrderEvent> {
  readonly customerId: string;
  readonly concept: OrderConcept;
  readonly amount: OrderAmount;
  readonly version: number;
  private constructor(
    props: BaseEntityProps<OrderId>,
    customerId: string,
    concept: OrderConcept,
    amount: OrderAmount,
    status: OrderStatus,
    cancelledAt: Date | null,
    version: number,
  );
  static place(params: {
    id: OrderId;
    customerId: string;
    concept: OrderConcept;
    amount: OrderAmount;
    now: Date;
  }): Order; // createdAt = updatedAt = now
  static rehydrate(params: {
    id: OrderId;
    customerId: string;
    concept: OrderConcept;
    amount: OrderAmount;
    createdAt: Date;
    updatedAt: Date;
    status: OrderStatus;
    cancelledAt: Date | null;
    version: number;
  }): Order;
  get status(): OrderStatus;
  get cancelledAt(): Date | null;
  cancel(now: Date): void; // colocado: cancelled, cancelledAt = now, touch(now), OrderCancelled; cancelado: no-op
  toSnapshot(): OrderSnapshot;
}
```

`src/modules/orders/infrastructure/persistence/order.orm-entity.ts` (sustituyen a `placedAt`)

```ts
@Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
createdAt!: Date;
@Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
updatedAt!: Date;
```

`src/modules/orders/infrastructure/http/orders-domain-exception.filter.ts`

```ts
@Catch(OrderDomainError)
export class OrdersDomainExceptionFilter extends DomainExceptionFilter<OrderDomainError> {
  // CustomerGoneError → new ForbiddenException('Forbidden'); OrderNotFoundError → NotFoundException(message);
  // OrderVersionConflictError → ConflictException(message). Funciones flecha; sin constructor.
  protected readonly mappings: readonly DomainErrorMapping<OrderDomainError>[];
}
```

`src/modules/orders/infrastructure/http/dto/order-response.dto.ts`

```ts
export class OrderResponseDto {
  createdAt!: Date; // @ApiProperty({ description, example, type: String, format: 'date-time' })
  updatedAt!: Date; // ídem. Sale placedAt; id, customerId, concept, amountCents, status y cancelledAt? no cambian
  static fromDomain(order: Order): OrderResponseDto;
}
```

`src/modules/orders/__tests__/helpers/order.factory.ts` (helper de test que comparten seis specs de esta tarea)

```ts
export const DEFAULT_CREATED_AT: Date; // antes DEFAULT_PLACED_AT, mismo valor (2026-08-06T09:30:00.000Z)
export const rehydrateOrder: (overrides?: {
  id?: OrderId;
  customerId?: string;
  status?: OrderStatus;
  cancelledAt?: Date | null;
  updatedAt?: Date;
  version?: number;
}) => Order; // createdAt = DEFAULT_CREATED_AT; updatedAt por defecto DEFAULT_CREATED_AT
// buildPlacedOrder no cambia de firma
```

Sin cambio de firma: `PlaceOrderUseCase`, `CancelOrderUseCase`, `OrderRepository`, `CustomerDirectory`, `OrderMapper`, `OrderTypeOrmRepository`.

**Decisions:**

- **Dos rondas Rojo/Verde dentro de la tarea: primero el dominio, después aplicación e infraestructura.** La fila A1 (T10) solo puede fallar cuando `OrderId` ya normaliza: hoy `from()` guarda el texto tal cual (`order-id.vo.ts:19-24`) y el caso de uso cita `orderId.value` (`cancel-order.use-case.ts:64`), así que en una sola ronda A1 pasaría antes de cambiar nada.
- **`AggregateRoot` sin constructor propio**; `record`/`pullEvents` intactos (`aggregate-root.ts:16-24`). Su fila nueva (K5) queda verde en el Stub porque la herencia es la propia firma: el Guard check quita `extends Entity<TId>` y la ve fallar (comprobado en el scratchpad: sin `Entity`, el `id` del doble es `undefined`).
- **El doble del spec del kernel se construye con una factoría estática** (`RecordingAggregate.of(props)`): el constructor heredado sigue protegido y un `new` desde fuera da TS2674 (comprobado con TS 6.0.3). `TestId` se importa de `src/shared/__tests__/helpers/test-id.ts`, que creó la Task 2; no se declara otro.
- **`OrderDomainError` sin constructor**: hereda el protegido de `DomainError`. `name` sigue siendo el de la clase concreta (lo fijan `order.errors.spec.ts:15,29`; comprobado: `new.target.name` da `OrderNotFoundError`).
- **`OrderId`** usa `UuidIdentifier.isUuidV4` y el constructor base, que guarda en minúsculas. Se van la regex local con `/i` (`order-id.vo.ts:7`) y `randomUUID` (`:1,15-17`). Las tres filas de anclas (`order-id.vo.spec.ts:9-34`) se quedan, porque siguen validando el `:id` del endpoint.
- **`Order`**: `id` deja de ser parameter property (`order.entity.ts:37`) porque lo pone `Entity`. `place` pasa `{ id, createdAt: now, updatedAt: now }`. `cancel` llama a `touch(now)` después de la guarda de idempotencia (`:108-110`), así que el segundo cancel no mueve nada. No se corrige el reloj con `max(now, createdAt)`: lo deciden backlog #31 (`docs/backlog.md:1432`) y T3. `OrderPlaced` sigue construyéndose con `params.now` (`:66-68`): los eventos no cambian (`order-placed.event.ts:5-12`, `order-cancelled.event.ts:5-11`).
- **T10**: `OrderNotFoundError(input.orderId)`. La propiedad ajeno-vs-inexistente (`cancel-order.use-case.spec.ts:90-114`) no cambia: los dos caminos citan la misma entrada.
- **Mapper**: las fechas pasan tal cual en los dos sentidos, sin regla de fallo cerrado propia: son `NOT NULL` y, por #31, cualquier orden entre ellas es válido. El Refactor lo pasa a `failClosed` con un predicado local `isOrderDomainError`, por dos motivos: `OrderDomainError` tiene constructor protegido (T7) y `order.errors.ts` solo puede exportar clases (clave `errors`). El mensaje exacto no cambia (`order.mapper.spec.ts:151-153`).
- **ORM**: `@Column` con `default: () => 'now()'` en snake_case (T9, T13), nunca `CreateDateColumn`/`UpdateDateColumn` (lo vigila `orm-managed-columns`). TypeORM 1.1.2 deja `() => 'now()'` como `now()` (`PostgresDriver.js:914-924,1455-1461`), igual que el `DEFAULT now()` de la migración, así que `--check` no ve diferencias.
- **Adaptador**: el SET del UPDATE gana `updatedAt: orderRow.updatedAt`. No cambian el WHERE `{ id, version }` (`order.typeorm.repository.ts:86`) ni la transacción `'READ COMMITTED'` (`:71`). `createdAt` nunca entra en el SET.
- **Fake**: su rama de actualización (`in-memory-order.repository.ts:41-46`) copia también `updatedAt`.
- **DTO**: `createdAt`/`updatedAt` con `type: String` y `format: 'date-time'`, por el razonamiento de `user-response.dto.ts:39-63`. `cancelledAt` sigue opcional y ausente en un pedido colocado (`order-response.dto.ts:69-71`). Descripciones: `createdAt`, «momento en que se colocó el pedido, en UTC»; `updatedAt`, «última modificación, en UTC: al colocarlo coincide con `createdAt` y al cancelarlo, con `cancelledAt`».
- **Ejemplos del controller.** `ORDER_EXAMPLE` lleva `createdAt` = `updatedAt` con literales de dominio propios, no con `EXAMPLE_TIMESTAMP`, que es el `meta` del sobre. `CANCELLED_ORDER_EXAMPLE` toma el resto con spread pero sobrescribe `updatedAt` con la MISMA constante que `cancelledAt` (`'2026-08-01T12:30:00.000Z'`), con el comentario del precedente `users.controller.ts:202-204`. Ajv no ve esa diferencia porque es el mismo tipo; la ve un test unitario. La descripción de `cancelOrder` (`orders.controller.ts:145-150`) dice que `updatedAt` toma el instante de la cancelación y que el doble cancel lo conserva.
- **Migración, qué cambia:** solo la línea 13 del `CREATE TABLE "orders"`, que pasa a ser `"created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()` y `"updated_at"` igual. Es la grafía del archivo y de `1785165436853-create-users-table.ts:13-14`.
- **Migración, qué se queda igual:**
  - el nombre de clase, `name` y el timestamp;
  - `down()` (`:30-35`), que borra las tablas enteras;
  - las demás migraciones: `1790796856575` no nombra `placed_at` (`:23-39`), y el relay y su E2E solo tocan `orders_outbox` (`relay-orders-outbox.ts:27-39`, `relay-orders-outbox.e2e-spec.ts:110-114`).
- **Migración, qué no lleva:**
  - `SET LOCAL lock_timeout`: el gate solo lo exige desde `1790796856575` (`migration-conventions.spec.ts:10,125-129`) y este `up()` solo crea tablas nuevas;
  - `REFERENCES` ni `FOREIGN KEY` en el SQL (guarda de la Task 6).
- **Cabecera de la migración** (comentario TS en español). Tiene que decir:
  - que se reescribió el 2026-10-17;
  - por qué no se hizo un par expand/contract: el template no está desplegado en ningún sitio (B6); no es precedente para una migración aplicada en un entorno desplegado;
  - ⚠️ que toda base existente necesita `pnpm db:reset`, porque TypeORM la da por aplicada y las consultas de `orders` fallan por la columna `created_at`, que no existe;
  - que remite a `docs/database.md`, «Expand/contract: el ejemplo trabajado», donde está el precedente (backlog #12, `docs/database.md:63-65`).
- **Renombrado `DEFAULT_PLACED_AT` → `DEFAULT_CREATED_AT`**, y `PLACED_AT` → `CREATED_AT` en `orders.controller.spec.ts:14`. Así el grep de cierre por `placedAt|placed_at|PLACED_AT` solo encuentra la cabecera de la migración.
- **E2E del repositorio: helper nuevo `readOrderDates()`** (`SELECT created_at, updated_at FROM orders`) en vez de ensanchar `readOrderRows()` (`:365-366`). Las filas de concurrencia comparan `readOrderRows()` con `toEqual` (`:147,160-162,192-194,215-217,277,293`) y el rival de SQL crudo no escribe `updated_at` (`:399-402`).
- **El DTO gana su spec 1:1**, con `modelPropertiesOf` como en `authenticated-user.dto.spec.ts`. Solo prueba lo que el DTO publica: `fromDomain` ya lo cubren las filas de claves del controller.
- **Se deja fuera la deuda de backlog #30** (`docs/backlog.md:1405`): los `// Act + Assert` de `order-id.vo.spec.ts:10`, `place-order.use-case.spec.ts:34` y del spec del filtro (`:28`, `:54`), y los mensajes de los errores antiguos.
- **Los ids de fila (K5, E4, A1…) son del plan**: no se copian a `src/`; el caso vive en el texto del `it` (backlog #29).

**Qué lee hoy `placedAt`** (todo cambia en esta tarea):

| Archivo                                | Dónde                                                                                                                                                                      | Cómo cambia                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `order.entity.spec.ts`                 | 'debería emitir OrderPlaced al colocar una orden' (`:24`, constante en `:34`)                                                                                              | solo la constante renombrada                                 |
| `order.entity.spec.ts`                 | 'debería reconstruir sin emitir eventos' (`:126`, entrada en `:135`)                                                                                                       | la entrada pasa a `createdAt`/`updatedAt`; el caso no cambia |
| `order.entity.spec.ts`                 | 'debería reconstruir un pedido cancelado…' (`:145`, `:163`)                                                                                                                | fila E10                                                     |
| `place-order.use-case.spec.ts`         | `:26`, `:80`                                                                                                                                                               | filas PA1 y PA4                                              |
| `cancel-order.use-case.spec.ts`        | comentario `:48-49`                                                                                                                                                        | `order.placedAt` → `order.createdAt`                         |
| `order.mapper.spec.ts`                 | `:44`, `:75`, `:163-176`, `:213`                                                                                                                                           | ver **Tests**                                                |
| `order.typeorm.repository.e2e-spec.ts` | `:19`, `:101`                                                                                                                                                              | constante renombrada                                         |
| `orders.controller.spec.ts`            | `:14`, `:53`, `:79-81`, `:92`, `:111`                                                                                                                                      | ver **Tests**                                                |
| helpers                                | `order.factory.ts:18,32,63`; `in-memory-order.repository.ts:67`                                                                                                            | **Interfaces** y Stub                                        |
| producción                             | `order.entity.ts:17,41,78,88,122`; `order.mapper.ts:72,100`; `order.orm-entity.ts:5-7,27-28`; `order-response.dto.ts:29-35,67`; `orders.controller.ts:45`; migración `:13` | esta tarea                                                   |

**Casos acordados**

`aggregate-root.spec.ts` (suite existente). Sus cuatro `it` actuales no cambian de texto ni de aserción; solo construyen el doble con props, y siguen verdes porque fijan que `record`/`pullEvents` no cambian.

| #   | Caso (se vuelve el `it`)                                                              | Entrada / estado inicial                                                                   | Resultado esperado                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K5  | debería exponer el id, la fecha de creación y la de modificación con que se construyó | `RecordingAggregate.of({ id: TestId.of('agg-1'), createdAt: T0, updatedAt: T1 })`, T0 ≠ T1 | `id` es esa misma instancia (`toBe`); `createdAt` = T0; `updatedAt` = T1. Verde tras el Stub (la herencia es la firma); el Guard check demuestra que muerde |

`order.errors.spec.ts`. Las dos filas actuales no cambian y siguen verdes; fijan `name`.

| #   | Caso                                                                                                                                                                                                  | Entrada                                                   | Resultado esperado                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | debería hacer de todo error de orders un DomainError del kernel (en un `describe('OrderDomainError')` nuevo)                                                                                          | `new OrderNotFoundError(ORDER_ID)` (la raíz es abstracta) | `toBeInstanceOf(OrderDomainError)` y `toBeInstanceOf(DomainError)`. Rojo: hoy la raíz extiende `Error` (`order.errors.ts:6`)                                |
| O2  | debería identificar en su mensaje el concepto rechazado (en un `describe('InvalidOrderConceptError')` nuevo) _(añadida en la Task 12: mata el superviviente `StringLiteral`; aprobada el 2026-10-19)_ | `new InvalidOrderConceptError('   ')`                     | `message` = `"   " is not a valid order concept`; `name` = `InvalidOrderConceptError`. Verde con el código; su rojo se demuestra vaciando el literal a mano |
| O3  | debería identificar en su mensaje el cliente que ya no está (en un `describe('CustomerGoneError')` nuevo) _(añadida en la Task 12, ídem)_                                                             | `new CustomerGoneError(CUSTOMER_ID)`                      | `message` = `Customer <CUSTOMER_ID> no longer exists or is inactive`; `name` = `CustomerGoneError`. Ídem                                                    |

`order-id.vo.spec.ts`. Las tres filas de anclas no cambian.

| #   | Caso                                                                       | Entrada                                     | Resultado esperado                                            |
| --- | -------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| I1  | debería aceptar un uuid v4 escrito en mayúsculas y guardarlo en minúsculas | `OrderId.from(VALID_UUID_V4.toUpperCase())` | `value` = `VALID_UUID_V4`. Rojo: hoy guarda el texto tal cual |

`order.entity.spec.ts`. Las filas que no aparecen aquí no cambian, salvo lo dicho en «Qué lee hoy `placedAt`».

| #   | Caso                                                                                                                                                                                                                                                 | Entrada                                                                                                                    | Resultado esperado                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| E4  | debería sellar createdAt y updatedAt con el instante de la colocación                                                                                                                                                                                | `buildPlacedOrder({ now: T_PLACE })`                                                                                       | `createdAt` = `updatedAt` = T_PLACE. Rojo (Stub: epoch)                                                                                 |
| E6  | debería mover updatedAt al instante de la cancelación sin tocar createdAt                                                                                                                                                                            | colocado en `DEFAULT_CREATED_AT`; `cancel(CANCELLED_AT)`                                                                   | `updatedAt` = `CANCELLED_AT`; `createdAt` = `DEFAULT_CREATED_AT`. Rojo                                                                  |
| P2  | debería fijar updatedAt exactamente en el instante de la cancelación aunque sea anterior a la colocación _(propiedad)_                                                                                                                               | `fc.tuple(timestampArb, timestampArb)` como (colocación, cancelación), en cualquier orden                                  | `updatedAt` = `cancelledAt` = cancelación; `createdAt` = colocación; sin corregir el reloj (#31). Rojo                                  |
| E8  | hoy «debería dejar intacto un pedido ya cancelado, con su fecha de cancelación original y sin emitir evento» → debería dejar intacto un pedido ya cancelado, con su fecha de cancelación y su updatedAt originales y sin emitir evento               | `rehydrateOrder({ status: 'cancelled', cancelledAt: CANCELLED_AT, updatedAt: CANCELLED_AT, version: 3 })`; `cancel(LATER)` | `cancelled`; `cancelledAt` = `updatedAt` = `CANCELLED_AT`; `pullEvents()` = `[]`. Rojo (el `rehydrate` del Stub ignora `updatedAt`)     |
| P1  | hoy «debería emitir un único OrderCancelled y conservar la primera fecha por muchas veces que se cancele» → debería emitir un único OrderCancelled y conservar la primera fecha, también en updatedAt, por muchas veces que se cancele _(propiedad)_ | la misma arbitraria (`fc.array(timestampArb, { minLength: 1, maxLength: 10 })`)                                            | lo de hoy + `updatedAt` = `instants[0]`. Rojo                                                                                           |
| E10 | hoy «debería reconstruir un pedido cancelado con su estado, su fecha de cancelación y su versión, sin emitir eventos» → debería reconstruir un pedido cancelado con su estado, sus fechas y su versión, sin emitir eventos                           | `rehydrateOrder({ id, status: 'cancelled', cancelledAt: CANCELLED_AT, updatedAt: CANCELLED_AT, version: 3 })`              | `toSnapshot()` `toEqual` el objeto con `createdAt: DEFAULT_CREATED_AT` y `updatedAt: CANCELLED_AT`, sin `placedAt`; ningún evento. Rojo |

`cancel-order.use-case.spec.ts`. El resto no cambia; el comentario `:48-49` pasa de `order.placedAt` a `order.createdAt`.

| #   | Caso                                                                                                                                                                                                                          | Entrada                                                                                                                               | Resultado esperado                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | debería rechazar como inexistente un id escrito en mayúsculas, citándolo tal como llegó                                                                                                                                       | repositorio vacío; `orderId` = `OrderId.generate().value.toUpperCase()`                                                               | rechaza con `OrderNotFoundError` y el mensaje exacto `Order <id en mayúsculas> was not found` (`captureRejection`). Rojo en la ronda 2: tras el Verde 1, `orderId.value` ya está en minúsculas |
| A2  | hoy «debería devolver tal cual un pedido ya cancelado, con su fecha original y sin guardar nada» → debería devolver tal cual un pedido ya cancelado, con su fecha de cancelación y su updatedAt originales y sin guardar nada | `seedCancelledOrder(repository, CUSTOMER_ID, FIRST_CANCELLED_AT)`: colocado en `DEFAULT_CREATED_AT`, cancelado y guardado por el fake | `cancelledAt` = `updatedAt` = `FIRST_CANCELLED_AT`; ningún guardado nuevo. Rojo: el fake del Stub no guarda `updatedAt` al actualizar y la relectura trae `DEFAULT_CREATED_AT`                 |

`place-order.use-case.spec.ts`. Cambian dos aserciones, no los textos; el resto no cambia.

| #   | Caso                                                                  | Entrada                                                                             | Resultado esperado                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PA1 | debería colocar la orden cuando el cliente existe (texto sin cambios) | la de hoy                                                                           | el `OrderPlaced` esperado lleva `order.createdAt` (hoy `order.placedAt`, `:26`). Ya verde tras el Verde 1: fija que el evento lleva el instante de creación                                                  |
| PA4 | debería devolver la orden colocada (texto sin cambios)                | reloj fijo con `jest.useFakeTimers({ now: NOW })` y `afterEach` con `useRealTimers` | `createdAt` = `updatedAt` = `NOW`. Sustituye a `placedAt` `toBeInstanceOf(Date)` (`:80`), que dejaba pasar cualquier fecha: es la lección de `cancel-order.use-case.spec.ts:48-49`. Ya verde tras el Verde 1 |

**Tests** (infraestructura, sin tabla):

- `order.mapper.spec.ts` (el resto no cambia):
  - 'debería volcar el agregado a columnas primitivas' (`:31`): `row.createdAt` = `row.updatedAt` = `DEFAULT_CREATED_AT`, en lugar de `row.placedAt`.
  - Hoy 'debería volcar el estado, la fecha de cancelación y la versión de un pedido cancelado' (`:47`) → 'debería volcar el estado, las fechas y la versión de un pedido cancelado'. La entrada lleva `updatedAt: CANCELLED_AT`; se espera `row.updatedAt` = `CANCELLED_AT` y `row.createdAt` = `DEFAULT_CREATED_AT`. Son distintas, así que un mapper que las cruzara falla.
  - 'debería reconstruir el agregado desde la fila sin emitir eventos' (`:62`): el snapshot esperado lleva `createdAt: row.createdAt` y `updatedAt: row.updatedAt`. `buildRow` las rellena distintas (`DEFAULT_CREATED_AT` y `CANCELLED_AT`).
  - 'debería fallar cerrado ante una fila que las reglas actuales del dominio rechazan' (`:142`): sin cambios; fija el mensaje exacto a través del Refactor a `failClosed`.
  - 'debería preservar el snapshot para cualquier orden del dominio' (`:168`): `createdAt` y `updatedAt` salen de dos `timestampArb` independientes, en lugar de `placedAt`.
- `order-response.dto.spec.ts` (nuevo, `describe('OrderResponseDto')`):
  - 'debería publicar createdAt y updatedAt como cadenas date-time': en `modelPropertiesOf(OrderResponseDto)`, las dos llevan `type` = `String` y `format` = `'date-time'`.
  - 'debería publicar exactamente los campos del pedido, sin placedAt ni la versión': las claves ordenadas son `amountCents, cancelledAt, concept, createdAt, customerId, id, status, updatedAt`.
- `orders.controller.spec.ts`:
  - 'debería exponer solo los campos del DTO, nunca el agregado' (`:37`): claves `amountCents, concept, createdAt, customerId, id, status, updatedAt`.
  - Hoy 'debería cancelar el pedido del cliente del token y devolverlo con su fecha de cancelación' (`:78`) → 'debería cancelar el pedido del cliente del token y devolverlo con createdAt de la colocación y updatedAt y cancelledAt de la cancelación'. Se espera `result.createdAt` = `CREATED_AT` y `result.updatedAt` = `result.cancelledAt` = `CANCELLED_AT`; el comentario `:79-80` pasa a hablar de `createdAt`.
  - 'debería exponer cancelledAt en un pedido cancelado y nunca la versión' (`:96`): claves `amountCents, cancelledAt, concept, createdAt, customerId, id, status, updatedAt`.
  - Nuevo 'debería publicar en el ejemplo del 200 de la cancelación un updatedAt igual a cancelledAt y distinto de createdAt': lee `declaredResponse(OrdersController, 'cancel', 200)?.example` y compara las tres claves de `data`.
- `orders-domain-exception.filter.spec.ts`: sin cambios. Sus filas fijan la tabla a través del cambio de base: 403 con `Forbidden`, 400 de los `Invalid*` y 404 y 409 con el mensaje del dominio. Ya verde.
- `order.typeorm.repository.e2e-spec.ts` (el resto no cambia, salvo la constante de `:19` y `:101`):
  - Nuevo 'debería insertar createdAt y updatedAt con el instante de la colocación y no con la hora de la base': guarda un `buildPlacedOrder()` y espera `readOrderDates()` = `[{ created_at: DEFAULT_CREATED_AT, updated_at: DEFAULT_CREATED_AT }]`.
  - Nuevo 'debería guardar updatedAt con el instante de la cancelación sin tocar createdAt': coloca, relee, `cancel(CANCELLED_AT)` y guarda; espera `readOrderDates()` = `[{ created_at: DEFAULT_CREATED_AT, updated_at: CANCELLED_AT }]`. Es la guarda determinista del UPDATE.
  - 'debería reconstruir la orden guardada (round-trip)' (`:298`): sin cambio de texto ni de código; su `toEqual({ ...order.toSnapshot(), version: 1 })` pasa a cubrir las dos fechas.
  - Hoy 'debería reconstruir un pedido cancelado con su estado, su fecha y su versión' (`:310`) → 'debería reconstruir un pedido cancelado con su estado, sus fechas y su versión': además, `found.createdAt` = `DEFAULT_CREATED_AT` y `found.updatedAt` = `CANCELLED_AT`.
- `orders.e2e-spec.ts`:
  - Hoy 'debería devolver el pedido colocado con status placed y sin cancelledAt' (`:174`) → 'debería devolver el pedido colocado con status placed, createdAt igual a updatedAt y sin cancelledAt'. Comprueba las claves exactas de `data` (las siete, sin `placedAt`, `version` ni `cancelledAt`), que `data.updatedAt` = `data.createdAt` y que `data.createdAt` es ISO-8601 (`new Date(x).toISOString() === x`).
  - Hoy 'debería cancelar el pedido y devolver 200 con el envelope y el pedido cancelado' (`:188`) → '…y el pedido cancelado, con updatedAt igual a cancelledAt': además, `data.updatedAt` = `data.cancelledAt` y `data.createdAt` presente.
  - Hoy 'debería persistir la cancelación y su evento OrderCancelled en el outbox' (`:204`) → 'debería persistir la cancelación, su updated_at y su evento OrderCancelled en el outbox': `SELECT status, cancelled_at, updated_at` y `updated_at` = `new Date(data.cancelledAt)`.
  - 'debería responder 200 con el cancelledAt original y sin un segundo evento al cancelar de nuevo' (`:232`): sin cambios. Su `toEqual(first.body.data)` (`:242`) pasa a cubrir `createdAt` y `updatedAt`.

**Contrato** (no se declara ni se retira ningún status):

| Endpoint                     | Código                       | Motivo                                                                                                                                             | Camino que lo produce hoy                                                                                                                                                                                                                                                                       |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ `POST /orders`            | 201                          | El cuerpo publica `createdAt` y `updatedAt`, iguales, en lugar de `placedAt`; es incompatible (B5). `cancelledAt` sigue ausente                    | `PlaceOrderUseCase.execute` → `Order.place({ now })` (`createdAt = updatedAt = now`) → `OrderTypeOrmRepository.save` (INSERT con las fechas del dominio) → `OrderResponseDto.fromDomain`                                                                                                        |
| ⚠️ `POST /orders/:id/cancel` | 200                          | `createdAt` (la colocación) y `updatedAt` (= `cancelledAt`) en lugar de `placedAt`; el doble cancel devuelve el mismo cuerpo, `updatedAt` incluido | `CancelOrderUseCase` → `Order.cancel(now)` (`touch(now)`) → UPDATE con `updated_at` → `fromDomain`. En el doble cancel: `findByIdAndCustomer` → `OrderMapper.toDomain` (lee `updated_at`) → `cancel()` no-op → `fromDomain`                                                                     |
| `POST /orders/:id/cancel`    | 404                          | Sin cambio: el mensaje repite el id tal como llegó, también en mayúsculas (T10)                                                                    | `CancelOrderUseCase` → `findByIdAndCustomer` = `null` → `OrderNotFoundError(input.orderId)` → filtro → `NotFoundException(message)`                                                                                                                                                             |
| Los dos                      | 400, 401, 403, 408, 429, 500 | Sin cambio de código, cuerpo ni camino                                                                                                             | 400: `ValidationPipe`, `OrderConcept.from` y `OrderId.from`, que caen en el 400 por defecto del filtro. 401: `JwtAuthGuard`. 403: `CustomerGoneError` → `ForbiddenException('Forbidden')`. 408: `TimeoutInterceptor`. 429: throttler. 500: fila corrupta → `failClosed` → `AllExceptionsFilter` |

**Guard tests** (en cada uno: quitar, ver el rojo y restaurar):

| Garantía                                                                                                                         | Test                                                                                                                                                                                 | Qué se quita                                                                                                             | Rojo que se ve                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updated_at` se guarda al cancelar                                                                                               | E2E del repositorio 'debería guardar updatedAt con el instante de la cancelación sin tocar createdAt' (determinista); además `orders.e2e-spec.ts:242` y la fila HTTP de persistencia | `updatedAt` del SET de `manager.update` en `order.typeorm.repository.ts`                                                 | En el repositorio, `updated_at` = `DEFAULT_CREATED_AT` frente a `CANCELLED_AT`. En HTTP, `second.body.data.updatedAt` (la colocación) ≠ `first.body.data.updatedAt` (la cancelación), siempre que las dos peticiones caigan en milisegundos distintos: es lo normal, pero no está garantizado, y por eso la guarda determinista es la del repositorio |
| El fake cumple la misma obligación del puerto                                                                                    | A2                                                                                                                                                                                   | `updatedAt` de la rama de actualización del fake                                                                         | `updatedAt` = `DEFAULT_CREATED_AT` ≠ `FIRST_CANCELLED_AT`                                                                                                                                                                                                                                                                                             |
| Idempotencia: el segundo `cancel` no mueve `updatedAt` (spec §5; ningún mutante la cubre, porque Stryker no reordena sentencias) | E8, P1 y A2                                                                                                                                                                          | se mueve `this.touch(now)` encima de la guarda `if (this._status === 'cancelled') return` de `cancel`                    | por aserción: E8 recibe `LATER` en vez de `CANCELLED_AT`; P1 deja en `updatedAt` el último instante en vez del primero; A2 recibe el `new Date()` del caso de uso en vez de `FIRST_CANCELLED_AT`                                                                                                                                                      |
| El 404 cita el id tal como llegó (T10; ningún mutante lo cubre)                                                                  | A1                                                                                                                                                                                   | volver a `new OrderNotFoundError(orderId.value)`                                                                         | el mensaje lleva el id en minúsculas                                                                                                                                                                                                                                                                                                                  |
| `AggregateRoot` es una `Entity`                                                                                                  | K5                                                                                                                                                                                   | `extends Entity<TId>`. Solo corre el spec del kernel: SWC no comprueba tipos y el `typecheck` queda rojo hasta restaurar | `aggregate.id` es `undefined`                                                                                                                                                                                                                                                                                                                         |
| Versión optimista, `READ COMMITTED`, atomicidad del outbox, solo el `23505` es conflicto                                         | E2E del repositorio `:115`, `:178`, `:198`, `:221`, `:246`, `:265`, `:280`; caso de uso `:142`, `:163`, `:179`                                                                       | nada: el UPDATE solo gana una columna en el SET, y el WHERE y el aislamiento no cambian                                  | tienen que seguir verdes                                                                                                                                                                                                                                                                                                                              |

**Rule codes:**

- `db-use-transactions`: `updated_at` va en el mismo UPDATE, dentro de la transacción del outbox; no hay ninguna escritura fuera.
- `di-liskov-substitution`: el fake replica la obligación nueva del puerto.
- `db-use-migrations`: la reescritura se valida con `--check` después de `db:reset`.
- `error-use-exception-filters`: la base no lleva `@Catch`; la subclase lleva `@Catch(OrderDomainError)`.

- [ ] **Trinquete (primer rojo).** En `src/__tests__/module-contract.spec.ts`, borra de `PENDING_VIOLATIONS` estas dos líneas; quedan las de `auth`:
  - `errors src/modules/orders/domain/errors/order.errors.ts`
  - `filter src/modules/orders/infrastructure/http/orders-domain-exception.filter.ts`

  `pnpm test src/__tests__/module-contract.spec.ts` → la fila árbol falla por aserción, y el diff muestra exactamente esas dos líneas como recibidas de más. Las filas detector siguen verdes.

- [ ] **Stub** (sin lógica nueva):
  1. `aggregate-root.ts` con la firma de **Interfaces**. Es todo su cambio: una herencia no tiene valor neutro. En su spec, solo el doble (`TestId`, `RecordingAggregate.of(props)`); los cuatro `it` construyen con props.
  2. `order.entity.ts` con la interfaz nueva y fechas neutras:
     - `place` y `rehydrate` pasan `createdAt`/`updatedAt` = `new Date(0)`, ignorando `now` y los parámetros;
     - `toSnapshot` vuelca `this.createdAt`/`this.updatedAt`;
     - `cancel` queda sin `touch`.
  3. Consumidores, para compilar:
     - `order.orm-entity.ts`: las dos columnas de **Interfaces** en lugar de `placedAt`;
     - `order.mapper.ts`: sin mapear fechas (`toDomain` pasa `new Date(0)`; `toPersistence` no las asigna);
     - `order-response.dto.ts`: sin `placedAt`, con `createdAt!`/`updatedAt!` sin decorador y sin asignarlas en `fromDomain`;
     - `in-memory-order.repository.ts`: su `rehydrate` toma `createdAt`/`updatedAt` del snapshot; la rama de actualización no se toca;
     - `order.factory.ts`: `DEFAULT_CREATED_AT` y el override `updatedAt`.
  4. Specs, solo para que compilen; las aserciones nuevas van en el Rojo:
     - `DEFAULT_PLACED_AT` → `DEFAULT_CREATED_AT` y `PLACED_AT` → `CREATED_AT`;
     - `.placedAt` → `.createdAt` en `place-order.use-case.spec.ts:26,80` y `orders.controller.spec.ts:92`;
     - `order.mapper.spec.ts:44,75,213` y la arbitraria de `:163-176`;
     - la entrada de `Order.rehydrate` en `order.entity.spec.ts:135`.
  5. Migración reescrita: columnas y cabecera (ver Decisions).
  6. ⚠️ `pnpm db:reset` borra el volumen local, con las dos bases, y no se puede deshacer. El usuario lo aprobó en la spec (B6), pero confírmaselo justo antes de ejecutarlo. Después, cada comando con su prefijo:
     - `DB_PORT=5434 pnpm db:reset`;
     - `DB_PORT=5434 pnpm migration:generate src/database/migrations/DriftCheck --check` (desarrollo) y el mismo `--check` contra la base de E2E, con `TEST_DB=$(sed -nE 's/^CREATE DATABASE ([a-z_]+);$/\1/p' docker/initdb/01-create-test-database.sql) && DB_PORT=5434 DB_DATABASE="$TEST_DB" pnpm migration:generate src/database/migrations/DriftCheck --check` → los dos salen con 0 y no crean ningún archivo;
     - recuérdale al usuario que, si necesita el admin, lo restaure él desde su terminal (ver la Preparación).
  7. `pnpm typecheck` → 0 errores.
- [ ] **Rojo 1 (dominio).** Escribe K5, O1, I1, E4, E6 y P2, y cambia E8, P1 y E10. `pnpm test src/shared/__tests__/domain/aggregate-root.spec.ts src/modules/orders/__tests__/domain` → O1, I1, E4, E6, P2, E8, P1 y E10 fallan por aserción. Pasan los cuatro `it` actuales del kernel, K5 (por la herencia) y el resto.
- [ ] **Verde 1 (dominio).** `OrderDomainError extends DomainError`, sin constructor. `OrderId extends UuidIdentifier<'OrderId'>`. `Order` con las fechas reales (`now` en `place`; los parámetros en `rehydrate`) y `touch(now)` en `cancel`.
  - Mismo comando → verde.
  - `pnpm test src/__tests__/module-contract.spec.ts` → sigue rojo, ahora con una sola línea de más (`filter …`).
- [ ] **Rojo 2 (aplicación e infraestructura).** Escribe A1, A2, PA1, PA4, las filas de **Tests**, `readOrderDates()` y el spec del DTO.
  - `pnpm test src/modules/orders/__tests__/application src/modules/orders/__tests__/infrastructure`:
    - fallan por aserción A1, A2, las cuatro filas del mapper que cambian, las dos del DTO y las cuatro del controller;
    - pasan PA1, PA4, el filtro y la fila de fallo cerrado.
  - `DB_PORT=5434 pnpm test:e2e src/modules/orders/__tests__`:
    - fallan por aserción las dos filas nuevas del repositorio, el round-trip, la del pedido cancelado reconstruido y las tres de HTTP que cambian;
    - el doble cancel (`:232`) sigue verde, porque el DTO del Stub no publica fechas en ninguna de las dos respuestas.
- [ ] **Verde 2.**
  - `CancelOrderUseCase` construye `OrderNotFoundError(input.orderId)`.
  - El fake guarda `updatedAt` en su rama de actualización y actualiza su docstring (`:21-22`).
  - El mapper lleva las fechas en los dos sentidos.
  - El UPDATE escribe `updatedAt`.
  - El DTO lleva los decoradores y asigna las fechas.
  - El controller cambia sus ejemplos y la descripción de `cancelOrder`.
  - El filtro pasa a `DomainExceptionFilter`, con su tabla y sus comentarios de decisión: el 403 se construye con string y mensaje canónico; el catch es la raíz por el concepto de solo espacios y el `:id`; el 404 publica el mensaje del dominio; el 409 es defensa no publicada.

  `pnpm test` → todo verde, también la fila árbol. `DB_PORT=5434 pnpm test:e2e src/modules/orders/__tests__` → verde.

- [ ] **Guard check:** los cinco de la tabla, con `pnpm test src/shared/__tests__/domain/aggregate-root.spec.ts`, `pnpm test src/modules/orders/__tests__/domain/entities/order.entity.spec.ts`, `pnpm test src/modules/orders/__tests__/application/use-cases/cancel-order.use-case.spec.ts` y `DB_PORT=5434 pnpm test:e2e src/modules/orders/__tests__`. Cada protección se restaura antes de pasar a la siguiente.
- [ ] **Refactor.**
  - `OrderMapper.toDomain` pasa a `failClosed(rebuild, isOrderDomainError, describe)`, con el mismo mensaje.
  - Docstrings:
    - `aggregate-root.ts`: es una `Entity` que además emite eventos; el ejemplo pasa a `AggregateRoot<OrderId, OrderEvent>`;
    - `order.entity.ts`: las fechas vienen de `Entity`, `cancel` llama a `touch` y no se corrige el reloj (#31);
    - `order-id.vo.ts`;
    - la cabecera de `order.orm-entity.ts`: el dominio sella `created_at`/`updated_at`, y `DEFAULT now()` solo cubre un INSERT que no las nombre;
    - el puerto `order.repository.ts`: persistir `updatedAt` también al actualizar;
    - el comentario «Solo lo mutable» del adaptador (`:83`).

  `pnpm typecheck` y `pnpm test src/modules/orders src/shared` → verdes.

- [ ] **Verificación de cierre** (los comandos que tocan la base, con el prefijo `DB_PORT=5434`):
  - `pnpm typecheck` → 0 errores.
  - `pnpm lint:check` → sin problemas.
  - `pnpm format:check` → todos los archivos con el estilo de Prettier.
  - `pnpm test` → verde; la fila árbol compara contra las cuatro líneas de `auth`.
  - `DB_PORT=5434 pnpm test:e2e` → verde, incluida `src/bootstrap/__tests__/openapi-contract.e2e-spec.ts`, cuyo Ajv valida los ejemplos 201 y 200 con `createdAt`/`updatedAt`.
  - `DB_PORT=5434 pnpm migration:generate src/database/migrations/DriftCheck --check` → sale con 0; `git status --short` no lista ningún `DriftCheck`.
  - `grep -rnE "placedAt|placed_at|PLACED_AT" src test` → solo dos menciones deliberadas: la cabecera de `1786076763455-create-orders-and-outbox.ts` y el texto del `it` «debería publicar exactamente los campos del pedido, sin placedAt ni la versión» de `order-response.dto.spec.ts`. La Task 11 las admite en su grep final.
  - Si `pnpm-lock.yaml` aparece modificado solo por `@pnpm/exe`, quítalo con Edit antes de la sugerencia de commit.
- [ ] _"Te sugiero hacer un commit de los cambios por llevar `orders` al contrato de módulo: `AggregateRoot` sobre `Entity`, `createdAt`/`updatedAt` en lugar de `placedAt` y la migración original reescrita"_. ⚠️ Recuerda al usuario que toda base local que no haya pasado por este `db:reset` lo necesita.

### Task 9: `auth` al contrato de módulo y cierre del trinquete

**Layer:** domain + infrastructure (y el cierre del test de arquitectura)

**Files:**

- Create: `src/modules/auth/domain/value-objects/credential-id.vo.ts`
- Modify: `src/modules/auth/domain/errors/auth.errors.ts`: raíz sobre `DomainError` e `InvalidCredentialIdError` nuevo
- Modify: `src/modules/auth/domain/entities/credential.entity.ts`: sobre `Entity<CredentialId>`
- Modify: `src/modules/auth/infrastructure/persistence/credential.mapper.ts`: `CredentialId.from(row.id)`, sin `failClosed`
- Modify: `src/modules/auth/infrastructure/persistence/credential.orm-entity.ts`: fechas con `@Column`
- Modify: `src/modules/auth/infrastructure/http/auth-domain-exception.filter.ts`: sobre `DomainExceptionFilter`, con una entrada nueva
- Modify: `src/__tests__/module-contract.spec.ts`: cierre del trinquete
- Test (nuevo): `src/modules/auth/__tests__/domain/errors/auth.errors.spec.ts`
- Test (nuevo): `src/modules/auth/__tests__/domain/value-objects/credential-id.vo.spec.ts`
- Test (se adapta): `src/modules/auth/__tests__/domain/entities/credential.entity.spec.ts`
- Test (se adapta): `src/modules/auth/__tests__/infrastructure/persistence/credential.mapper.spec.ts`
- Test (se adapta): `src/modules/auth/__tests__/infrastructure/http/auth-domain-exception.filter.spec.ts`
- Test (se adapta): `src/modules/auth/__tests__/infrastructure/persistence/credential.typeorm.repository.e2e-spec.ts`
- Test (se adapta): `src/modules/auth/__tests__/auth.e2e-spec.ts`: una fila nueva y el comentario de `:271`, que hoy dice que el id lo acuña `randomUUID()`
- Modify: `src/database/seeds/seed-admin.ts`: el upsert de la credencial renueva también su id (decisión B9 del usuario)
- Test (se adapta): `src/database/__tests__/seed-admin.e2e-spec.ts`: una fila nueva
- Uses (from earlier tasks):
  - `DomainError` (Task 1, `src/shared/domain/domain-error.ts`);
  - `Entity` y `BaseEntityProps` (Task 2, `src/shared/domain/entity.base.ts`);
  - `UuidIdentifier` (Task 3, `src/shared/domain/uuid-identifier.base.ts`);
  - `DomainExceptionFilter` y `DomainErrorMapping` (Task 4, `src/common/filters/domain-exception.filter.ts`);
  - el checker y la constante `PENDING_VIOLATIONS` de `module-contract.spec.ts` (Task 6);
  - helpers que ya existen: `captureError` (`test/helpers/capture-error.ts`) y `expectDocumentedError` (`test/helpers/documented-error.ts`).
  - **No usa `failClosed`** (T8).
- Sin cambios, y la guarda lo comprueba: `src/modules/auth/application/**`, `src/modules/auth/__tests__/application/**` (L9, R10, R11) y `src/modules/auth/__tests__/helpers/**`. Tampoco cambian `auth.controller.ts` (más allá de la Task 5) ni ninguna migración.

**Interfaces**

`src/modules/auth/domain/errors/auth.errors.ts`

```ts
export abstract class AuthDomainError extends DomainError {} // sin constructor propio
export class InvalidCredentialIdError extends AuthDomainError {
  constructor(readonly value: string); // mensaje: `"${value}" is not a valid credential id`
}
// InvalidCredentialsError, InvalidPasswordHashError, EmailAlreadyRegisteredError e InvalidProfileError: sin cambios
```

`src/modules/auth/domain/value-objects/credential-id.vo.ts`

```ts
export class CredentialId extends UuidIdentifier<'CredentialId'> {
  static from(value: string): CredentialId; // lanza InvalidCredentialIdError(value) si no es uuid v4
  static generate(): CredentialId; // UuidIdentifier.newUuid()
}
```

`src/modules/auth/domain/entities/credential.entity.ts`

```ts
export type CredentialSnapshot = { id: string; userId: string; passwordHash: string; createdAt: Date; updatedAt: Date }; // sin cambios
export class Credential extends Entity<CredentialId> {
  // la forma común: base delante, estado propio como parameter properties, super(base)
  private constructor(base: BaseEntityProps<CredentialId>, readonly userId: string, readonly passwordHash: PasswordHash);
  static create(params: { userId: string; passwordHash: PasswordHash; now: Date }): Credential; // MISMA firma; id = CredentialId.generate(); createdAt = updatedAt = now
  static rehydrate(params: { id: CredentialId; userId: string; passwordHash: PasswordHash; createdAt: Date; updatedAt: Date }): Credential;
  toSnapshot(): CredentialSnapshot; // id: this.id.value
}
```

`src/modules/auth/infrastructure/http/auth-domain-exception.filter.ts`

```ts
@Catch(AuthDomainError)
export class AuthDomainExceptionFilter extends DomainExceptionFilter<AuthDomainError> {
  protected readonly mappings: readonly DomainErrorMapping<AuthDomainError>[];
}
```

`CredentialMapper` y `CredentialOrmEntity` no cambian de firma.

**Decisions:**

- **Dos pasadas dentro de la tarea: dominio y después infraestructura.** Con `CredentialId.generate()` en stub, `Credential.create()` acuña `''`. Un E2E que da de alta una cuenta insertaría `''` en `auth_credentials.id` (`uuid`), y fallaría por excepción, no por aserción. Por eso los rojos E2E se ven después del Green del dominio, contra el filtro de hoy, que aún no tiene la entrada nueva.
- **La raíz `AuthDomainError` queda vacía sobre `DomainError`.**
  - El `this.name = new.target.name` de hoy (`auth.errors.ts:11-16`) pasa a la base, y `login.use-case.spec.ts:175` sigue viendo `InvalidCredentialsError`.
  - Hereda el constructor protegido de la base, así que las subclases y el `UnmappedDomainError` del spec del filtro (`:136-140`) siguen llamando a `super(message)`.
  - Ni `no-useless-constructor` ni `no-extraneous-class` están activos (`eslint.config.mjs:31-32`: `recommendedTypeChecked` + `stylisticTypeChecked`). Compilado con TS 6.0.3 y `--noUnusedParameters`.
- **El mensaje de `InvalidCredentialIdError` lleva el valor**, como `InvalidUserIdError` (`user.errors.ts:18-22`), y ese valor solo llega al log:
  - el filtro responde el 500 saneado y guarda el error como `cause`;
  - `AllExceptionsFilter` loguea a nivel `error` con `err` (`all-exceptions.filter.ts:106-107`);
  - el serializador `err` de pino añade el mensaje y la pila del `cause` (`pino-std-serializers@7.1.0`, `lib/err.js:19-20`), y `pino-options.ts:153-156` no lo sustituye.

  Un id de credencial no es un secreto. `InvalidPasswordHashError` sí omite el valor, porque podría ser una contraseña en claro (`auth.errors.ts:28-29`).

- **La marca `'CredentialId'` se fija en Interfaces, no con una fila del spec del VO.**
  - La marca es solo de tipos. Jest corre con SWC, que no comprueba tipos, así que un `it` sobre ella no puede fallar por aserción.
  - Que la marca sea el nombre de la clase lo verifica la clave `value-objects` del test de contrato (Task 6). Que dos ids no sean intercambiables lo verifica el `@ts-expect-error` del kernel (Task 3).
  - Medido: con `UuidIdentifier<'UserId'>`, `pnpm typecheck` no se queja, porque nada en auth compara con otra marca. La guarda se demuestra en **Guard check**.
- **`Credential` no redeclara `id`, `createdAt` ni `updatedAt`.** Vienen de `Entity<CredentialId>`, y redeclararlos da TS2612 con los campos de clase de ES2023 que usa tsc (medido). Además, `.swcrc:14` usa `useDefineForClassFields: false`, así que el runtime de SWC no coincidiría con la semántica que comprueba tsc.
  - `userId` y `passwordHash` siguen siendo `readonly` públicos: los leen `login.use-case.ts:51` y `in-memory-credential.repository.ts:25,36`.
  - No hay transiciones, así que no hay `touch()`.
- **`create` conserva su firma**: la usan `register-account.use-case.ts:84`, `login.use-case.spec.ts:214-219` y `auth.controller.spec.ts:65,89`. Solo cambia de dónde sale el id.
- **El mapper lee `CredentialId.from(row.id)` y NO usa `failClosed` (T8).**
  - Con `failClosed`, el `Error` con `cause` no es una `HttpException`, y `AllExceptionsFilter` publicaría su mensaje, con el id dentro, fuera de producción (`all-exceptions.filter.ts:163-167`). Con el filtro de auth, el 500 sale saneado en todos los entornos.
  - El id se valida antes que el hash, por el orden del literal. Con los dos corruptos el 500 es el mismo; solo cambia lo que va al log.
- **La tabla del filtro lleva la anotación `readonly DomainErrorMapping<AuthDomainError>[]`.**
  - Sin ella, las funciones flecha dan TS7006 (`error` es `any` implícito): TS no tipa por contexto el inicializador de una propiedad a partir del miembro abstracto de la base. Medido con TS 6.0.3.
  - Las dos entradas del 500 (`InvalidPasswordHashError` e `InvalidCredentialIdError`) comparten una función local del archivo. Esa función construye exactamente el cuerpo de hoy (`auth-domain-exception.filter.ts:75-78`): `new InternalServerErrorException('Internal server error', { description: 'InternalServerError', cause })`. Así el cuerpo saneado tiene una sola definición.
  - El comentario de hoy recoge cuatro decisiones, y se conservan reescritas sobre la tabla: excepciones construidas con un string, el mensaje del 401, el catch ancho al 400 y el 500 de una fila corrupta.
  - La entrada nueva añade tres cosas a ese comentario: por qué 500 y no el 400 por defecto (publicaría el valor), por qué no `failClosed` (T8) y el remedio operativo, `UPDATE auth_credentials SET id = gen_random_uuid() WHERE id = '<id>'`. Ese remedio es seguro porque nada referencia ese id: no hay FKs y el JWT lleva el id del usuario.
- **Fechas de `auth_credentials` con `@Column({ type: 'timestamptz', default: () => 'now()' })`, sin `name`**, para conservar `"createdAt"`/`"updatedAt"` (T13).
  - No hay diff de esquema: la tabla nació con `TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()` (`1786210289581-move-credentials-to-auth-expand.ts:53-54`). TypeORM da a `@CreateDateColumn`/`@UpdateDateColumn` el mismo default `now()`, y en Postgres ninguna precisión (`ColumnMetadata.js:225-243`, `PostgresDriver.js:196-199`). `findChangedColumns` no compara `onUpdate` (`PostgresDriver.js:1143-1170`).
  - Tampoco cambia el comportamiento. La credencial solo se inserta: el puerto no tiene actualización (`credential.repository.ts:17-26`). En un INSERT, TypeORM ya escribe el valor dado y solo usa `DEFAULT` con `undefined` (`InsertQueryBuilder.js:1124-1146`).
  - La guarda es la clave `orm-managed-columns`.
- **El E2E del repositorio pasa `credential.id.value` a su SQL crudo** (`credential.typeorm.repository.e2e-spec.ts:49`). `pg` serializa un objeto sin `toPostgres` con `JSON.stringify` (`pg/lib/utils.js:82-92`), y PostgreSQL rechaza `{"value":…}` como uuid. `pnpm typecheck` no lo ve, porque el parámetro admite cualquier cosa: `parameters?: any[] | ObjectLiteral` (`DataSource.d.ts:214`).
- **Se añade una fila E2E HTTP para el 500 del login, por encima del mínimo de §12.** Es la única prueba que recorre todo el camino: fila corrupta → mapper → caso de uso → `@UseFilters(AuthDomainExceptionFilter)` (`auth.controller.ts:63`) → `AllExceptionsFilter`. El spec unitario del filtro no ve ese cableado. La fila comprueba con `expectDocumentedError` el cuerpo exacto del 500 documentado.
- **AAA.**
  - Las filas nuevas y las que cambian llevan `// Arrange`, `// Act` y `// Assert` por separado, aunque alguno quede vacío.
  - Las de rechazo usan `const act = () => …` y `expect(act).toThrow(<Clase>)`. Nunca `captureError`: si no hay throw, lanza su centinela y el test falla por excepción (`test/helpers/capture-error.ts:18`).
  - Las filas que no cambian conservan su `// Act + Assert`. Es deuda del backlog #30, que no se paga dentro de una feature (`docs/backlog.md:1405`).
- **`auth.errors.spec.ts` paga la deuda 1:1 de auth** (backlog #30, `docs/backlog.md:1389`). E2-E5 fijan mensajes que hoy ya matan otros specs, así que quedan «ya verde».
- **El seed del admin renueva el id de la credencial (B9, decisión del usuario del 2026-10-17).**
  - Tras esta tarea, una credencial con un id uuid válido pero no v4 da un 500 en el login. Sin el cambio, `pnpm seed:admin`, que es el rescate documentado del admin (`CLAUDE.md`, «Auth»), imprimiría `promoted` y dejaría el login en 500: la misma respuesta engañosa que su propio comentario combate para el admin desactivado (`seed-admin.ts:56-62`).
  - El cambio es una cláusula: el `ON CONFLICT (user_id) DO UPDATE SET` de `upsertCredential` (`seed-admin.ts:95-101`) gana `id = EXCLUDED.id`. `EXCLUDED.id` es el `randomUUID()` del `VALUES` (`:100`), siempre v4.
  - Renueva el id en cada promoción, no solo cuando es inválido. Es seguro porque nada referencia ese id: no hay FKs (regla de `CLAUDE.md`) y el JWT lleva el id del usuario, no el de la credencial. Un `CASE` que solo lo cambiara si no es v4 metería en el SQL una copia de la regex del dominio.
  - Va al final de la tarea, después del Green B: solo con el mapper sobre `CredentialId` existe el 500 que el seed tiene que arreglar, y su fila no puede ponerse roja antes.

**Casos acordados**

Tabla E: `auth.errors.spec.ts` (nuevo, un `describe` por clase, como `order.errors.spec.ts`).

| #   | Caso (se vuelve el `it`)                                          | Entrada / estado inicial                                               | Resultado esperado                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | debería ser un DomainError del kernel a través de la raíz de auth | `new InvalidCredentialsError()`                                        | es `AuthDomainError` y es `DomainError`. Rojo en el Red A: la raíz aún extiende `Error`                                                                                                                                       |
| E2  | debería llevar el mensaje único de credenciales inválidas         | `new InvalidCredentialsError()`                                        | `message` = `Invalid credentials`; `name` = `InvalidCredentialsError`. Ya verde: fija el comportamiento                                                                                                                       |
| E3  | debería llevar un mensaje fijo que no incluye el valor rechazado  | `new InvalidPasswordHashError()`                                       | `message` = `Value is not a valid argon2id hash`; `name` = `InvalidPasswordHashError`. Ya verde                                                                                                                               |
| E4  | debería identificar en su mensaje el email ya registrado          | `new EmailAlreadyRegisteredError('taken@example.com')`                 | `message` = `Email taken@example.com is already registered`; `email` = la entrada; `name` = `EmailAlreadyRegisteredError`. Ya verde                                                                                           |
| E5  | debería conservar tal cual el mensaje que llega del directorio    | `new InvalidProfileError('"x" is not a valid email address')`          | `message` = la entrada; `name` = `InvalidProfileError`. Ya verde                                                                                                                                                              |
| E6  | debería identificar en su mensaje el id de credencial rechazado   | `new InvalidCredentialIdError('3f2504e0-4f89-11d3-9a0c-0305e82c3301')` | `message` = `"3f2504e0-4f89-11d3-9a0c-0305e82c3301" is not a valid credential id`; `value` = la entrada; `name` = `InvalidCredentialIdError`; es `AuthDomainError` (lo atrapa el filtro). Rojo: el stub deja el mensaje vacío |

Tabla I: `credential-id.vo.spec.ts` (nuevo). Todas las filas en rojo en el Red A: el stub devuelve `''` y no lanza.

| #   | Caso (se vuelve el `it`)                                                                  | Entrada / estado inicial                                                                        | Resultado esperado                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | debería aceptar un uuid v4 y conservarlo como valor                                       | `CredentialId.from('7c9e6679-7425-40de-944b-e07fc1f90ae7')`                                     | `value` = la entrada                                                                                                                                                                                                                                                   |
| I2  | debería guardar en minúsculas un uuid v4 escrito en mayúsculas                            | `CredentialId.from('7C9E6679-7425-40DE-944B-E07FC1F90AE7')`                                     | `value` = `7c9e6679-7425-40de-944b-e07fc1f90ae7`                                                                                                                                                                                                                       |
| I3  | debería rechazar un uuid válido que no es de la versión 4                                 | `CredentialId.from('3f2504e0-4f89-11d3-9a0c-0305e82c3301')` (v1: el caso del SQL externo de §9) | lanza `InvalidCredentialIdError`                                                                                                                                                                                                                                       |
| I4  | debería rechazar un texto que no es un uuid                                               | `CredentialId.from('not-a-uuid')`                                                               | lanza `InvalidCredentialIdError`                                                                                                                                                                                                                                       |
| P1  | debería generar siempre un uuid v4 en minúsculas y distinto en cada llamada _(propiedad)_ | `fc.integer({ min: 1, max: 20 })`: n llamadas seguidas a `CredentialId.generate()`              | Cada `value` tiene 36 caracteres, un `4` en la posición 14 y uno de `89ab` en la 19, y es igual a su `toLowerCase()`; los n valores son distintos. El formato se comprueba contra la especificación, no contra la regex de `from()`, como en `user-id.vo.spec.ts:8-11` |

Las anclas y el resto de formas que rechaza `isUuidV4` son de la spec del kernel (Task 3). Aquí basta un rechazo de cada clase para matar los mutantes de `from()`.

Tabla C: `credential.entity.spec.ts`, solo las filas que cambian. `:18`, `:27` y el resto de la suite no cambian.

| #   | Caso (se vuelve el `it`)                                                                                                                              | Entrada / estado inicial                                                                                             | Resultado esperado                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C3  | debería acuñar un CredentialId propio y distinto en cada alta. Texto actual: «debería acuñar un identificador propio y distinto en cada alta» (`:38`) | dos `Credential.create` con el mismo `userId`, hash y `now`                                                          | los dos `id` son `CredentialId` y `first.id.equals(second.id)` es `false`. Rojo: con `generate()` en stub los dos valen `''`. Su comentario (`:36-37`, «no hay VO de identidad») se reescribe  |
| C4  | debería reconstruir el agregado conservando su id y sus marcas de tiempo (mismo texto, `:50`)                                                         | `rehydrate` con `id: CredentialId.from('7c9e6679-7425-40de-944b-e07fc1f90ae7')`, `createdAt` NOW y `updatedAt` LATER | `credential.id.value` = ese uuid; `createdAt` NOW; `updatedAt` LATER. Rojo: con `from()` en stub, `value` es `''`                                                                              |
| C5  | debería exponer valores primitivos en lugar de value objects (mismo texto, `:71`)                                                                     | `Credential.create(…)`                                                                                               | `toSnapshot()` = `{ id: credential.id.value, userId, passwordHash: HASH.value, createdAt: NOW, updatedAt: NOW }`. Ya verde: el snapshot ya era de primitivos; solo cambia cómo se espera el id |
| C6  | debería sobrevivir al round-trip snapshot→rehydrate (mismo texto, `:88`)                                                                              | `rehydrate` con el snapshot, `id: CredentialId.from(snapshot.id)` y `PasswordHash.from(snapshot.passwordHash)`       | snapshot igual al original. Ya verde                                                                                                                                                           |

**Tests** (infraestructura y arquitectura, exentos de tabla; cada viñeta es un `it`)

`credential.mapper.spec.ts`:

- **M1** «debería volcar el agregado a columnas primitivas» (`:14`, cambia): `row.id` es `credential.id.value`; hoy compara con el VO (`:23`). Ya verde tras adaptarla.
- **M2** «debería reconstruir el agregado desde la fila conservando su id» (`:31`, cambia): `credential.id` es un `CredentialId` y su `value` es `row.id`; hoy compara con `toBe` contra el string (`:39`). Rojo en el Red A.
- **M4** (nueva) «debería propagar InvalidCredentialIdError sin envolverlo cuando el id de la fila no es un uuid v4»: una fila con `id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'` y `expect(act).toThrow(InvalidCredentialIdError)`. Un `Error` envuelto por `failClosed` no es instancia de esa clase, así que la fila fija T8. Rojo en el Red A: el stub no lanza.
- `:47` (hash que no es argon2id) y `:57` (round-trip) no cambian.

`auth-domain-exception.filter.spec.ts`:

- **F8** (nueva) «debería traducir InvalidCredentialIdError al 500 saneado, sin el id y con el cause intacto». Se captura con `captureError`, que funciona porque el filtro de hoy también lanza (el 400). Comprueba:
  - lo lanzado es un `InternalServerErrorException`;
  - `getResponse()` es `{ statusCode: 500, message: 'Internal server error', error: 'InternalServerError' }`;
  - su `JSON.stringify` no contiene el id;
  - `cause` es la misma referencia del error de dominio.

  Rojo en el Red B.

- Las siete filas actuales (`:21`, `:29`, `:43`, `:54`, `:71`, `:93` y `:107`) no cambian y son la red del cambio de base.

`credential.typeorm.repository.e2e-spec.ts`:

- **RE1** «debería persistir la credencial en la columna snake_case de la tabla» (`:39`, cambia): el parámetro de la consulta cruda pasa a `credential.id.value` (`:49`). Ya verde tras adaptarla.
- **RE3** «debería reconstruir el agregado desde la fila» (`:69`, cambia): `found?.id` es un `CredentialId` y `found?.id.equals(credential.id)` es `true`. El `toBe` de hoy (`:78`) compararía dos instancias distintas. Ya verde: el id se lee con `CredentialId.from` desde el Stub A, y su rojo lo dio M2.
- **RE5** (nueva) «debería guardar y devolver las fechas que fija el dominio»: se guarda la credencial de `buildCredential`, con su fecha fija (`:130`). Un `SELECT "createdAt", "updatedAt"` crudo por `id` y `findByUserId` devuelven esa fecha en las dos columnas. Ya verde: fija T9 en auth (§12, «repositorios con `createdAt` y `updatedAt`»).

`auth.e2e-spec.ts`, dentro de `describe('POST /auth/login')` (`:352`):

- **AE** (nueva) «debería responder el 500 documentado sin publicar el id cuando la credencial tiene un id que no es uuid v4».
  - Arrange: un alta por HTTP con `.expect(201)` y un `UPDATE auth_credentials SET id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301' WHERE user_id = $1` con el id del alta.
  - Act: un login con la contraseña correcta.
  - Assert: status 500; `expectDocumentedError(response.body, 500, …)` con `message` = `'Internal server error'` y `path` = la ruta de login con el prefijo de la suite (el mismo patrón que `:355-364`); `JSON.stringify(response.body)` no contiene el id.
  - Rojo en el Red B: el login responde 400 con el id en el mensaje.

`src/database/__tests__/seed-admin.e2e-spec.ts` (B9):

- **SE1** (nueva) «debería renovar con un uuid v4 la credencial del admin cuyo id no es v4 y dejarlo entrar». Sigue el patrón de «debería reactivar al admin desactivado y dejarlo entrar» (`:167-186`).
  - Arrange: `setEnv(ADMIN_EMAIL, ADMIN_PASSWORD)`, `await seedAdmin(dataSource)` y después `UPDATE auth_credentials SET id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301' WHERE user_id = (SELECT id FROM users WHERE email = $1)`.
  - Act: `await seedAdmin(dataSource)`.
  - Assert: devuelve `'promoted'`; el login con `ADMIN_PASSWORD` responde 200; y el `id` de `auth_credentials` de ese usuario es distinto del v1 y cumple la forma de un v4. La forma se comprueba con una expresión escrita en el propio spec, nunca con `isUuidV4`, como en `user-id.vo.spec.ts:8-11`.
  - Rojo antes del cambio, por aserción: el login responde 500, por el mapper sobre `CredentialId` del Green A y el filtro del Green B.

`src/__tests__/module-contract.spec.ts`:

- La fila «árbol» está en rojo desde el primer paso, con las cuatro líneas de auth. Al final queda en verde, con `toEqual([])` y sin `PENDING_VIOLATIONS`.

**Contrato**

| Endpoint              | Código                 | Motivo                                                                                                                                                                                                                                                                                                     | Camino que lo produce hoy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ `POST /auth/login` | 500 (antes, 200 o 401) | la credencial del usuario tiene un `id` uuid válido pero no v4; solo se alcanza con SQL externo                                                                                                                                                                                                            | `LoginUseCase.execute` (`login.use-case.ts:40`) → `CredentialTypeOrmRepository.findByUserId` (`credential.typeorm.repository.ts:33-36`) → `CredentialMapper.toDomain` → `CredentialId.from(row.id)` lanza `InvalidCredentialIdError` → `@UseFilters(AuthDomainExceptionFilter)` (`auth.controller.ts:63`) → `InternalServerErrorException('Internal server error', { description: 'InternalServerError', cause })` → `AllExceptionsFilter`. El cuerpo es el del 500 que ya declara `@ApiStandardErrors()` (`auth.controller.ts:211`, `api-standard-errors.decorator.ts:79-86`), y el log es de nivel `error`, con el `err` y su `cause` (`all-exceptions.filter.ts:106-107`) |
| `POST /auth/login`    | 200                    | credenciales válidas. Toda credencial que escribe el sistema es v4: el alta (`CredentialId.generate()`), `seed-admin.ts:100` (`randomUUID()`), que tras B9 también renueva el id de una credencial existente, y la copia de `1786210289581-move-credentials-to-auth-expand.ts:95-96` (`gen_random_uuid()`) | sin cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /auth/login`    | 401                    | los cuatro caminos de L9                                                                                                                                                                                                                                                                                   | sin cambio (`login.use-case.ts:46-54`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `POST /auth/login`    | 400, 408, 429          | DTO, timeout y throttler                                                                                                                                                                                                                                                                                   | sin cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /auth/register` | todos                  | —                                                                                                                                                                                                                                                                                                          | sin cambio por esta tarea, porque el alta acuña un v4. El paso de 400 a 500 con un perfil corrupto es de la Task 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

No se declara ni se retira ningún status, así que el documento OpenAPI no cambia.

**Guard tests**

| Garantía                                                             | Test                                            | Qué se quita                                                 | Rojo que se ve                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un id de credencial corrupto no se publica (§12)                     | F8 y AE                                         | la entrada de `InvalidCredentialIdError` en `mappings`       | F8 recibe `{ statusCode: 400, message: '"3f2504e0-4f89-11d3-9a0c-0305e82c3301" is not a valid credential id', error: 'Bad Request' }` y falla también su `not.toContain` del id; AE recibe un 400 |
| Anti-enumeración (L9), compensación (R10) y un solo hash (R11)       | los existentes, sin tocarlos                    | nada                                                         | `git diff --exit-code` sin salida, y la suite en verde                                                                                                                                            |
| La marca de `CredentialId` es el nombre de la clase                  | fila árbol del contrato (clave `value-objects`) | la marca pasa a `'UserId'`                                   | la línea `value-objects src/modules/auth/domain/value-objects/credential-id.vo.ts`, con `pnpm typecheck` en verde                                                                                 |
| El contrato detecta un módulo real roto (prueba final del trinquete) | fila árbol con `toEqual([])`                    | la raíz de `order.errors.ts` pasa a `extends Error`          | la línea `errors src/modules/orders/domain/errors/order.errors.ts`                                                                                                                                |
| El seed deja operativo a un admin con id de credencial no v4 (B9)    | SE1                                             | `id = EXCLUDED.id` del `DO UPDATE SET` de `upsertCredential` | el login de SE1 responde 500 en vez de 200                                                                                                                                                        |

Cada rotura se deshace con Edit, sin comandos git, y la suite vuelve a verde.

**Rule codes:**

- `error-use-exception-filters`: la subclase lleva `@Catch(AuthDomainError)` y la base no.

- [ ] **Trinquete: el rojo del contrato.**
  - Precondición: `PENDING_VIOLATIONS` en `src/__tests__/module-contract.spec.ts` contiene exactamente estas cuatro líneas, porque las de users y orders las quitaron las Tasks 7 y 8. Si contiene otra cosa, PARAR y consultar.
  - Borrar las cuatro:

    ```text
    entities src/modules/auth/domain/entities/credential.entity.ts
    errors src/modules/auth/domain/errors/auth.errors.ts
    filter src/modules/auth/infrastructure/http/auth-domain-exception.filter.ts
    orm-managed-columns src/modules/auth/infrastructure/persistence/credential.orm-entity.ts
    ```

  - `pnpm test src/__tests__/module-contract.spec.ts` → la fila «árbol» falla por aserción con esas cuatro líneas de más, y el resto del spec sigue en verde.
- [ ] **Stub A** (el dominio, más lo imprescindible para compilar):
  - `auth.errors.ts`: añadir `InvalidCredentialIdError` con `constructor(readonly value: string)` y `super('')`. La raíz todavía no se toca (sigue `extends Error`): cambiarla es comportamiento y tiene su fila (E1).
  - Crear `credential-id.vo.ts` según **Interfaces**. `static from(_value: string)` y `static generate()` devuelven `new CredentialId('')`. El `_` solo vive en el stub: con `noUnusedParameters` (`tsconfig.json:28`), un parámetro sin usar rompe `pnpm typecheck`.
  - `credential.entity.ts`: pasar a la forma de **Interfaces** (`create` toma el id de `CredentialId.generate()`, `rehydrate` recibe un `CredentialId` y `toSnapshot()` devuelve `id: this.id.value`) y quitar el `import { randomUUID }` (`:1`). Mientras `generate()` sea un stub, el id que acuña es el valor neutro `''`.
  - `credential.mapper.ts`: `toDomain` pasa `id: CredentialId.from(row.id)` a `rehydrate`. Es la única forma de obtener un `CredentialId` de la fila, y ya es su forma final.
  - `credential.entity.spec.ts`: los dos Arrange que pasan un `string` a `rehydrate` (`:52-58` y `:93-96`) envuelven el id en `CredentialId.from(…)`. Sin eso, `pnpm typecheck` no compila.
  - → `pnpm typecheck`: 0 errores.
  - ⚠️ No se ejecuta ningún E2E hasta el Green A: con `generate()` en stub, el alta inserta `''` en una columna `uuid`, y ese fallo es por excepción y ajeno a las filas.
- [ ] **Red A:** escribir las tablas E, I y C y los tests M1, M2 y M4.
  - `pnpm typecheck` sigue en verde.
  - `pnpm test src/modules/auth/__tests__/domain src/modules/auth/__tests__/infrastructure/persistence/credential.mapper.spec.ts`:
    - fallan por aserción E1, E6, I1-I4, P1, C3, C4, M2 y M4;
    - ya están en verde E2-E5, C5, C6, M1 y las filas que no cambian.
  - Si alguna falla por excepción o por «Cannot find module», revisar el stub antes de seguir.
- [ ] **Green A:**
  - Escribir el mensaje de `InvalidCredentialIdError`.
  - Dejar la raíz en `export abstract class AuthDomainError extends DomainError {}`, importando `DomainError` de `@shared/domain/domain-error`, sin constructor propio. Su cabecera deja de decir que copia el contrato de los otros dos archivos: ahora es la base del kernel.
  - `CredentialId.from` lanza `InvalidCredentialIdError(value)` si `UuidIdentifier.isUuidV4(value)` es falso; `generate()` usa `UuidIdentifier.newUuid()`.
  - Reescribir el comentario de `credential.entity.ts:36`, que dice «no hay VO de identidad».
  - Comprobar:
    - `pnpm test src/modules/auth/__tests__/domain src/modules/auth/__tests__/infrastructure/persistence/credential.mapper.spec.ts` → verde;
    - `pnpm test src/modules/auth/__tests__/application src/modules/auth/__tests__/infrastructure/http/auth.controller.spec.ts` → verde sin tocar nada (L9, R10, R11);
    - `pnpm test src/__tests__/module-contract.spec.ts` → la fila árbol sigue en rojo, ya solo con las líneas `filter` y `orm-managed-columns` de auth. Es una comprobación de rumbo: `entities` desaparece en el Stub A y `errors` en este paso.
- [ ] **Red B** (infraestructura):
  - Fila F8: `pnpm test src/modules/auth/__tests__/infrastructure/http/auth-domain-exception.filter.spec.ts` → F8 falla por aserción, porque recibe el 400 con el id; F1-F7 siguen en verde.
  - Adaptar RE1 y RE3 y escribir RE5. Con Docker arriba (ver Preparación): `DB_PORT=5434 pnpm test:e2e src/modules/auth/__tests__/infrastructure/persistence/credential.typeorm.repository.e2e-spec.ts` → verde, porque las tres están ya en verde, como dicen sus filas.
  - Escribir AE y corregir el comentario de `auth.e2e-spec.ts:271`, que pasa a decir que el id lo acuña `Credential.create()` con `CredentialId.generate()`. `DB_PORT=5434 pnpm test:e2e src/modules/auth/__tests__/auth.e2e-spec.ts` → AE falla por aserción (400 en vez de 500) y el resto sigue en verde.
- [ ] **Green B:**
  - El filtro, según **Interfaces** y **Decisions**: la tabla de cuatro entradas, la función local del 500 y el comentario.
  - En `credential.orm-entity.ts`, las dos fechas con `@Column({ type: 'timestamptz', default: () => 'now()' })`, sin `CreateDateColumn` ni `UpdateDateColumn` en el import (`:1`), y una línea en la cabecera que diga que las fechas las fija el dominio.
  - Comprobar:
    - `pnpm test src/modules/auth` y `DB_PORT=5434 pnpm test:e2e src/modules/auth` → verde;
    - `pnpm test src/__tests__/module-contract.spec.ts` → la fila árbol, en verde con `PENDING_VIOLATIONS` vacía;
    - `DB_PORT=5434 pnpm migration:generate src/database/migrations/DriftCheck --check` → `No changes in database schema were found` y salida 0 (`MigrationGenerateCommand.js:119-121`). Si informa cambios, PARAR: no se genera ninguna migración, porque contradiría T9.
  - **Cerrar el trinquete.**
    - En la fila árbol, `toEqual(PENDING_VIOLATIONS)` pasa a `toEqual([])`, y se borran la constante y su comentario.
    - Si el texto del `it` nombra los pendientes, pasa a «debería cumplir el contrato en todos los contextos del repo».
    - → `pnpm test src/__tests__/module-contract.spec.ts` en verde.
- [ ] **Seed del admin (B9): rojo y verde.**
  - Red: escribe SE1. `DB_PORT=5434 pnpm test:e2e src/database/__tests__/seed-admin.e2e-spec.ts` → SE1 falla por aserción (login 500 en vez de 200); las demás filas del spec siguen en verde.
  - Green: añade `id = EXCLUDED.id` al `DO UPDATE SET` de `upsertCredential`, y actualiza los comentarios de `seedAdmin` (`seed-admin.ts:15-18`) y de `upsertCredential` (`:85-89`): el rescate también renueva el id de la credencial, y es seguro porque nada lo referencia. El mismo comando → todo en verde.
- [ ] **Guard check** (cada rotura se deshace con Edit):
  1. Quitar de `mappings` la entrada de `InvalidCredentialIdError`.
     - `pnpm test src/modules/auth/__tests__/infrastructure/http/auth-domain-exception.filter.spec.ts` → F8 en rojo por aserción, con el cuerpo 400 que lleva el id.
     - `DB_PORT=5434 pnpm test:e2e src/modules/auth/__tests__/auth.e2e-spec.ts` → AE en rojo, con un 400.
     - Restaurar → verde.
  2. Cambiar la marca de `credential-id.vo.ts` a `UuidIdentifier<'UserId'>`.
     - `pnpm typecheck` sigue en verde: el compilador no lo detecta.
     - `pnpm test src/__tests__/module-contract.spec.ts` → rojo, con la línea `value-objects src/modules/auth/domain/value-objects/credential-id.vo.ts`.
     - Restaurar → verde.
  3. Prueba de guarda final del trinquete: en `src/modules/orders/domain/errors/order.errors.ts`, cambiar el `extends DomainError` de `OrderDomainError` por `extends Error`. No hace falta tocar el import: el test lee el texto.
     - `pnpm test src/__tests__/module-contract.spec.ts` → la fila árbol falla por aserción y muestra la línea `errors src/modules/orders/domain/errors/order.errors.ts`.
     - Restaurar → verde.
  4. L9, R10 y R11 sin tocar:
     - `git diff --exit-code 32ade98 -- src/modules/auth/application src/modules/auth/__tests__/application src/modules/auth/__tests__/helpers` → sin salida y con código 0 (es de solo lectura);
     - `pnpm test src/modules/auth/__tests__/application` → verde.
  5. Seed (B9): quitar `id = EXCLUDED.id` de `upsertCredential`.
     - `DB_PORT=5434 pnpm test:e2e src/database/__tests__/seed-admin.e2e-spec.ts` → SE1 en rojo por aserción, con el login en 500.
     - Restaurar → verde.
- [ ] **Refactor:**
  - La cabecera de `credential.mapper.ts` añade la red del id y por qué no usa `failClosed`.
  - Las de `credential.entity.ts` y `auth.errors.ts` quedan coherentes con el código, y `Credential` no redeclara campos de `Entity`.
  - → `pnpm typecheck`.
- [ ] **Verificación de cierre:**
  - `pnpm typecheck` → 0 errores;
  - `pnpm lint:check` → 0 problemas;
  - `pnpm format:check` → sin diferencias;
  - `pnpm test` → toda la suite unitaria en verde, con la fila árbol en `toEqual([])`;
  - `DB_PORT=5434 pnpm test:e2e src/modules/auth src/database/__tests__/seed-admin.e2e-spec.ts` → verde. El seed escribe ids `randomUUID()`, que son v4 (`seed-admin.ts:100`), y desde B9 también los renueva en cada promoción, así que su login sigue en 200;
  - la mutación de lo cambiado la mide la Task 12 (`pnpm test:mutation:changed 32ade98`);
  - quitar con Edit las líneas `@pnpm/exe` que `pnpm` añade a `pnpm-lock.yaml` (ver Preparación).
- [ ] _"Te sugiero hacer un commit de los cambios por llevar `auth` al contrato de módulo (raíz sobre `DomainError`, `CredentialId`, `Credential` sobre `Entity`, filtro sobre la base con el 500 saneado del id corrupto y fechas del dominio) y cerrar el trinquete del test de contrato"_

### Task 10: Paso «Schema drift» en la CI

**Layer:** ci

**Files:**

- Modify: `.github/workflows/ci.yml`, en el job `quality`: un paso nuevo entre «Run migrations» (`:170-174`) y «E2E tests» (`:176-177`).
- Test: ningún spec lee los pasos de `ci.yml` (el único que lo nombra, `src/__tests__/toolchain-pins.spec.ts:226`, lo hace en un comentario). La prueba es ejecutar el mismo comando en local, en positivo y en negativo.
- Uses (from earlier tasks):
  - las entidades ORM finales de las Tasks 7, 8 y 9;
  - la migración reescrita de la Task 8;
  - las bases que recreó su `pnpm db:reset`.

**Interfaces:** ninguna, porque es configuración YAML. Abajo va la forma exacta del paso. El comentario puede redactarse de otra manera, pero tiene que decir lo mismo.

`.github/workflows/ci.yml`, justo después del paso «Run migrations». El valor de `DB_DATABASE` se
copia literal de ese paso (`ci.yml:173-174`); aquí no se escribe porque es una marca del template
(ver «Sin marcas del template en documentos nuevos»):

```yaml
# Deriva de esquema: compara las entidades ORM con el esquema que acaban de construir las
# migraciones y sale con 1, imprimiendo el SQL que faltaría, si no coinciden. `--check` no
# escribe ningún archivo; un fallo de conexión también sale con 1, y el log lo distingue.
# Apunta a la base de E2E porque es la única que migra este job: la base del `env:` del job
# no la migra nadie y daría todas las tablas por ausentes.
- name: Schema drift
  run: pnpm migration:generate src/database/migrations/DriftCheck --check
  env:
    DB_DATABASE: <el mismo valor que en «Run migrations»>
```

**Decisions:**

- **Nombre «Schema drift».** Es el del plan aprobado. El archivo ya mezcla nombres de paso en inglés y en español (`ci.yml:123`, `:153`, `:205`).
- **Va después de «Run migrations» y antes de «E2E tests».** Necesita el esquema recién migrado (`ci.yml:170-174`), falla antes de gastar minutos en los E2E y compara un esquema que ningún test ha tocado.
- **`env: DB_DATABASE` con el mismo valor que «Run migrations»** (`ci.yml:173-174`): la base de E2E.
  - El `env:` del job apunta a la base de desarrollo (`ci.yml:87`), y en CI nadie la migra. Sin esta sobrescritura, el paso compararía contra una base vacía y fallaría siempre.
  - Host, puerto, usuario, contraseña, schema y SSL ya vienen del `env:` del job (`ci.yml:82-89`). No hace falta nada más.
- **Solo en el job `quality`:** el job `mutation` no tiene PostgreSQL (`ci.yml:295-321`). `ci.yml` está en `replace` de `scripts/init-project.targets.json`, así que el nombre de la base del paso nuevo se renombra con el resto al inicializar un proyecto.
- **Qué hace `--check` en TypeORM 1.1.2** (`node_modules/typeorm/commands/MigrationGenerateCommand.js`):
  - sale con 0 y «No changes in database schema were found» si no hay diferencias (`:118-122`);
  - sale con 1 y «Unexpected changes in database schema were found in check mode», más el cuerpo de la migración que faltaría, si las hay (`:135-138`);
  - sale con 1 también ante cualquier error, con «Error during migration generation» (`:151-153`);
  - nunca escribe un archivo. La ruta `src/database/migrations/DriftCheck` es un posicional obligatorio (`:22-26`) que, en modo check, solo pone nombre a esa migración.
- **El negativo se hace sobre `outbox-message.orm-entity.ts:14`** (`event_type`, `varchar(120)` NOT NULL).
  - Ninguna tarea toca ese archivo (spec §8, «Mensajería: sin cambios»), así que `git diff --exit-code` demuestra que quedó restaurado.
  - Volverla anulable produce una sola sentencia, `ALTER TABLE … ALTER COLUMN "event_type" DROP NOT NULL` (`PostgresQueryRunner.js:1062-1065`). Cambiar la longitud borraría y recrearía la columna (`:852-862`), una salida más ruidosa.
- ⚠️ **Hecho no es en efecto.** No hay runner local de Actions: el paso queda probado en local, y en la CI solo con el primer push del PR. La Task 12 lo dice así en el informe.

**Tests** (exenta de tabla; qué comprueba cada verificación):

- debería salir con 1 y mostrar el `ALTER … "event_type" DROP NOT NULL` cuando la entidad del outbox no coincide con su migración;
- debería salir con 0 y decir «No changes in database schema were found» con las entidades y las migraciones finales;
- debería dejar `outbox-message.orm-entity.ts` idéntico a `HEAD` y ningún `*-DriftCheck.ts` en `src/database/migrations/`;
- debería pasar `pnpm format:check`, que incluye `.github/**/*.yml` (`package.json:28`).

**Guard tests:** la garantía es que las entidades ORM y las migraciones coinciden, y la protección es el propio paso. Su rojo es el negativo de abajo: con la entidad desincronizada, el comando sale con 1. Se restaura antes del verde.

**Rule codes:** `db-use-migrations`: el paso convierte en build rojo un cambio de entidad sin su migración.

- [ ] **Stub:** no aplica. No hay código TypeScript y el «SUT» es un comando que ya existe (`package.json:44`). `pnpm typecheck` sigue en verde.
- [ ] **Red:**
  - añade temporalmente `nullable: true` a la columna `event_type` de `src/modules/orders/infrastructure/persistence/outbox-message.orm-entity.ts:14`;
  - ejecuta `TEST_DB=$(sed -nE 's/^CREATE DATABASE ([a-z_]+);$/\1/p' docker/initdb/01-create-test-database.sql) && DB_PORT=5434 DB_DATABASE="$TEST_DB" pnpm migration:generate src/database/migrations/DriftCheck --check; echo "exit=$?"` → «Unexpected changes in database schema were found in check mode», un `ALTER TABLE … ALTER COLUMN "event_type" DROP NOT NULL` y `exit=1`.

  Un exit 1 sin ese texto (por ejemplo, `ECONNREFUSED`) es un problema de entorno, no el rojo que se busca.

- [ ] **Green:**
  - quita el `nullable: true`; `git diff --exit-code -- src/modules/orders/infrastructure/persistence/outbox-message.orm-entity.ts` → exit 0;
  - repite el mismo comando → «No changes in database schema were found» y `exit=0`;
  - `ls src/database/migrations/` → ningún `*-DriftCheck.ts`;
  - solo entonces, añade el paso a `ci.yml`.

  Si el positivo diera diferencias, no se toca `ci.yml`. El desfase viene de las Tasks 7, 8 o 9 (sus columnas de fecha o la migración reescrita): se corrige allí, en su entidad o su migración, y se repite.

- [ ] **Guard check:** ya hecho en el Red y el Green: con la entidad desincronizada el comando da 1, y restaurada da 0.
- [ ] **Refactor:** el paso nuevo tiene la sangría de sus vecinos (seis espacios antes de `- name:`) y el comentario está en español. `pnpm format:check` → «All matched files use Prettier code style!».
- [ ] **Cierre de la tarea:** `pnpm typecheck` y `pnpm format:check` en verde. `git diff -- .github/workflows/ci.yml` muestra solo el paso nuevo con su comentario.
- [ ] Si `pnpm-lock.yaml` aparece modificado solo por `@pnpm/exe`, quítalo con Edit.
- [ ] _"Te sugiero hacer un commit de los cambios por añadir a la CI el paso «Schema drift», que rompe el build si las entidades ORM y las migraciones dejan de coincidir"_. Mensaje validado con el commitlint del repo: `ci: comprobar la deriva de esquema tras las migraciones`.

### Task 11: Documentación del contrato de módulo

**Layer:** docs, más tres comentarios de código y el texto de un mensaje de ESLint.

**Files:**

- Modify:
  - documentación: `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `docs/architecture.md`, `docs/database.md`, `docs/testing.md`, `docs/development-workflows.md`, `docs/backlog.md`;
  - skills: `.claude/skills/clean-ddd-hexagonal/references/NESTJS-MAPPING.md`, `.claude/skills/clean-ddd-hexagonal/SKILL.md`, `.claude/skills/writing-plans/SKILL.md`;
  - código: `src/modules/auth/auth.module.ts`, `src/modules/orders/orders.module.ts`, `src/modules/users/infrastructure/http/users.controller.ts`, `eslint.config.mjs`.
- Test: ningún spec nuevo. Las verificaciones están en **Tests**.
- Uses (from earlier tasks): los nombres finales de las Tasks 1-10.
  - Kernel: `DomainError`, `Entity`/`BaseEntityProps`, `AggregateRoot<TId, TEvent>`, `UuidIdentifier`.
  - Bases de `common/`: `DomainExceptionFilter`/`DomainErrorMapping`, `failClosed`, `buildRequestMetaExample`.
  - Contrato: `checkModuleContract`/`FLAT_MODULES`.
  - Contextos: `UsersDomainExceptionFilter`, `CredentialId`/`InvalidCredentialIdError`.
  - CI: el paso «Schema drift».

**Interfaces:** ninguna cambia.

**Contrato:** esta tarea no cambia ninguna respuesta. Documenta en el CHANGELOG las de la spec §9.

**Decisions:**

- **Los documentos describen el código tal como quedó tras las Tasks 1-10.** Cada «Calca:» de NESTJS-MAPPING apunta a un archivo real, cuyo nombre fijan las Tasks 7, 8 y 9.
- **Cada archivo conserva su idioma.** Las secciones de reglas de `CLAUDE.md` están en inglés; `docs/`, README, CHANGELOG, el backlog y NESTJS-MAPPING, en español. `CLAUDE.md` no guarda historia (`CLAUDE.md:5`): el nombre `placedAt` no entra en él.
- **No se tocan los registros históricos:**
  - `docs/specs/**` y `docs/plans/**`;
  - las entradas antiguas del CHANGELOG (`:296` nombra `UsersFacade`);
  - la entrada #13 del backlog y `docs/architecture.md:351`, que cuentan la historia de `UsersFacade`;
  - la nota histórica de `users.facade.ts:59`.
- **Tampoco las referencias que no son fuente de verdad:**
  - `.claude/skills/nestjs-best-practices/**` es una skill externa, fijada en `skills-lock.json:24-28`. Enseña `@CreateDateColumn` (`rules/api-use-dto-serialization.md:74`, `rules/perf-optimize-database.md:106`) y un `DomainExceptionFilter` homónimo que `implements ExceptionFilter` (`rules/error-use-exception-filters.md:68`). Manda `CLAUDE.md` (spec T9).
  - `LAYERS.md:64`, `DDD-TACTICAL.md:230` y `CHEATSHEET.md:166` usan `AggregateRoot<OrderId>` como pseudocódigo, que la propia skill declara agnóstico del lenguaje (`SKILL.md:13`).
- **Ninguna marca del template en documentos no declarados.** `scripts/init-project.targets.json` declara `CLAUDE.md`, `README.md` y `SECURITY.md` (`replace`), y `CHANGELOG.md` y `docs/backlog.md` (`handled`). No declara `docs/architecture.md`, `docs/database.md`, `docs/testing.md`, `docs/development-workflows.md` ni las skills. En esos archivos no se escribe el nombre de la base de E2E ni el del contenedor: se dice «la base de E2E» o «el contenedor de la base», o `init-project.spec.ts:85` se pone rojo.
- **Qué sustituye a `UsersFacade`:**
  - `auth` inyecta `UsersLookup` y `UsersProvisioning` (`users-user.directory.ts:3,39-40`);
  - `orders` solo inyecta `UsersLookup` (`users-customer.directory.ts:3,25`);
  - el único consumidor de `CreateUserUseCase` es `UsersFacadeImpl` (`users.facade.ts:112-115`), publicado como `UsersProvisioning.createProfile`.

  Ningún spec fija el texto del mensaje de `eslint.config.mjs:208`, y `eslint-config.spec.ts:129` carga la configuración real.

- **Numeración del backlog.** La última entrada es la #36 (`docs/backlog.md:1630`), así que las nuevas son #37, #38 y #39. Van antes de «## Cerrado al verificarlo» (`:1659`), separadas con `---` y con las tres secciones que pide la cabecera (`:7-8`).
- **CHANGELOG:** una sola entrada al principio de `### Changed` (`CHANGELOG.md:110-112`), como la de la cancelación (`:59-80`), que agrupa una feature en una entrada con sus ⚠️ dentro. Lleva los dos ⚠️ de la spec §13.
- **Prettier no lo ve todo.** `pnpm format:check` solo cubre los `.md` de la raíz (`package.json:28`), y `.prettierignore:6` excluye `.claude/`.
  - Los `docs/*.md` editados se comprueban explícitamente con `pnpm exec prettier --check`; hoy pasan.
  - Las skills se revisan leyendo el diff, y NESTJS-MAPPING además se pasa por el checker del contrato.
- **Celda de `docs/development-workflows.md:89`:** su columna mide 118 caracteres y la celda 72. Un añadido de hasta 46 cabe sin que Prettier recoloque toda la tabla.
- **Añadidos al inventario de la spec §14,** marcados «(añadido)». Van porque sin ellos un documento quedaría falso o incompleto, y el informe de la Task 12 los declara.

**Inventario:**

`CLAUDE.md`

- [ ] `:31` (Commands): el comentario de `pnpm test:mutation` dice que el alcance incluye el kernel, `src/shared/domain/` (`stryker.config.mjs:247-256`).
- [ ] «Architecture rules», viñeta nueva tras `:137`: cada contexto hereda del kernel y cumple el contrato.
  - La raíz de errores hace `extends DomainError`.
  - Los agregados extienden `Entity<TId>`, o `AggregateRoot<TId, TEvent>` si emiten eventos. Llevan constructor privado, `static rehydrate`, `toSnapshot()` y `touch(now)` llamado solo desde los métodos de intención.
  - Los ids son `UuidIdentifier<'<ClassName>'>`, con su propio `from()` y `generate()`. El id de otro contexto sigue siendo `string` (regla 3).
  - Lo verifica `src/__tests__/module-contract.spec.ts` sobre todo `src/modules/*`, salvo la lista cerrada `FLAT_MODULES` (`health`).
  - Enlace al porqué: `docs/architecture.md#el-contrato-de-módulo`.
- [ ] `:138`:
  - el filtro es `users-domain-exception.filter.ts`, una subclase de `DomainExceptionFilter` (`src/common/filters/`) con `@Catch(<root>)` y una tabla `mappings`: gana la primera coincidencia y lo no mapeado es un 400;
  - una fila corrupta es un 500 a través de `failClosed` (`src/common/persistence/`), nunca un 400 con el valor dentro. `auth` la sanea en su propio filtro (T8).
- [ ] (añadido) `:147`: la frase «Zero foreign keys…» nombra sus guardas, `migration-conventions.spec.ts` (`describe('sin claves foráneas')`) y la clave `orm-relations` del contrato.
- [ ] (B9) «Auth», viñeta de `pnpm seed:admin` (`:153`): «fresh hash» pasa a «fresh hash and a fresh v4 credential id», y se añade que así rescata también una credencial cuyo id no es v4, que el login rechaza con el 500 saneado. Es seguro porque nada referencia ese id.
- [ ] «Orders» (`:158-168`):
  - el pedido publica el `createdAt`/`updatedAt` del kernel (colocar es crear, B4);
  - `cancel(now)` mueve `updatedAt`, y el segundo cancel no mueve nada;
  - el `UPDATE … WHERE version = v` de `:166` escribe también `updated_at`;
  - «The mapper fails closed» (`:167`) pasa a decir que lo hace con `failClosed` y conserva su mensaje.
- [ ] «Database» (`:197-205`), viñeta nueva con la regla de T9.
  - El dominio es el dueño de las fechas: la columna es `@Column({ type: 'timestamptz', default: () => 'now()' })`.
  - Ninguna entidad ORM usa `CreateDateColumn`, `UpdateDateColumn`, `DeleteDateColumn` ni `VersionColumn`; lo comprueba la clave `orm-managed-columns`.
  - `nestjs-best-practices` enseña `@CreateDateColumn`, pero aquí manda esta regla.
  - Enlace al porqué en `docs/database.md`.
- [ ] (añadido) `:202`: el paso «Schema drift» de la CI rompe el build si las entidades y el esquema migrado no coinciden.
- [ ] `:237`: los alias se mantienen en cuatro sitios; el cuarto es `scripts/mutation-targets.mjs` (`ALIASES`, `:72-80`).

`README.md`

- [ ] Árbol (`:417-443`):
  - una línea `shared/domain/` con el kernel (`DomainError`, `Entity`, `AggregateRoot`, `ValueObject`, `UuidIdentifier`);
  - el comentario de `common/` (`:422`) añade la base de filtros y `persistence/` (`failClosed`);
  - en `users`, `http/` (`:440`) nombra `users-domain-exception.filter.ts`.
- [ ] `:451`: el filtro es uno por contexto (`users-domain-exception.filter.ts`), sobre la base `DomainExceptionFilter`.
- [ ] `:472`: hoy afirma «solo hay tres sitios…, no cuatro». Pasa a cuatro: `tsconfig.json`, `.swcrc`, `jest.config.mjs` y `scripts/mutation-targets.mjs`, con el que `test:mutation:changed` resuelve qué specs importan un helper.
- [ ] «Quitar los módulos de ejemplo» (`:313-332`), paso nuevo antes de la DoD (`:332`):
  - el test de contrato no se edita, porque descubre `src/modules/*` menos `FLAT_MODULES`;
  - si se quitan los tres contextos, su fila de descubrimiento se pone roja hasta que exista uno propio;
  - un módulo plano nuevo entra en `FLAT_MODULES` con su porqué.
- [ ] (añadido) «Problemas frecuentes», tras `:301`: un error de columna inexistente (código `42703`) que nombra `created_at` en cualquier consulta de `orders` indica una base con la versión anterior de `1786076763455`. El texto exacto depende de la sentencia, porque TypeORM pone alias a las columnas en los `SELECT`. Se arregla con `pnpm db:reset`, que borra los datos locales, y después `pnpm seed:admin`.
- [ ] (añadido) «Lo que este template ya te resolvió» (`:695-720`):
  - en «Seguridad», que una fila corrupta ya no publica su valor en un 400;
  - en «Operación», que cada contexto cumple el contrato y un test lo verifica.

`CHANGELOG.md`

- [ ] Entrada nueva al principio de `### Changed` (antes de `:112`), con la fecha del día. Subviñetas:
  - lo que entra: el kernel, las bases de `common/`, los tres contextos al contrato, el filtro renombrado y `CredentialId`;
  - las guardas: el contrato con sus diez claves, cero FKs y el paso «Schema drift»;
  - ⚠️ API de `orders`: `POST /orders` (201) y `POST /orders/:id/cancel` (200) publican `createdAt` y `updatedAt` en lugar de `placedAt`. Es un cambio incompatible, y hoy no lo consume nadie (B5);
  - ⚠️ toda base existente necesita `pnpm db:reset` y después `pnpm seed:admin`. Sin el reset, las consultas de `orders` fallan con un error de columna inexistente (`42703`) sobre `created_at`;
  - las filas corruptas pasan a 500 (spec §9): `users` en `GET` y `DELETE` y en la comprobación previa del registro, y el login con un id de credencial que no es v4, que solo se alcanza con SQL externo. Va como subviñeta normal, sin ⚠️: ningún cliente puede provocarlo ni depender del 400 anterior;
  - `pnpm seed:admin` renueva también el id de la credencial del admin, lo que rescata una credencial con id no v4 (B9);
  - el ejemplo OpenAPI del `timestamp` de `RequestMetaDto` usa el literal común (B10);
  - lo que queda fuera: las entradas #37, #38 y #39 del backlog;
  - las rutas de la spec y del plan.

`docs/architecture.md`

- [ ] Entradilla (`:3-6`): añade que el documento guarda también la guía para extraer un módulo a un servicio.
- [ ] «Errores y modelos» (`:130-143`):
  - `:141-143`: el filtro renombrado, la base y el 400 por defecto;
  - «Dos modelos» (`:137-140`): la entidad de dominio extiende `Entity<UserId>` y sigue sin decoradores.
- [ ] `:416-417`, «El mapper falla cerrado»: lo hace con `failClosed` y conserva su mensaje exacto.
- [ ] Sección nueva `## El contrato de módulo`, entre «Errores y modelos» y `## Auth` (`:145`):
  - las tres piezas: el kernel, las bases de `common/` y el test;
  - por qué el kernel vive en `src/shared/domain/` (T1) y por qué `common/` no lo importa (T6, T7);
  - el porqué de cada una de las diez claves, una línea por clave y sin códigos `R…`;
  - lo que el análisis sintáctico no ve:
    - los tipos;
    - que una entidad redeclare `id`, `createdAt` o `updatedAt` como parameter property: compila sin aviso con TS 6.0.3 y deja dos fuentes de verdad;
    - que se llame a `touch(now)`;
    - que los mappers usen `failClosed` (y que `auth` no lo usa a propósito);
    - la semántica de la tabla del filtro;
    - y dos límites: la exención es de todo o nada (`FLAT_MODULES`), y `filter` exige un filtro aunque no haya controllers;
  - cómo se prueba (detector, árbol y rotura puntual), con enlace a `docs/testing.md`;
  - la historia: diez violaciones al empezar, y el trinquete `PENDING_VIOLATIONS` que se vació al llevar los tres contextos al contrato, uno por uno.
- [ ] Sección nueva `## Extraer un módulo a un servicio`, al final, tras «Outbox transaccional» (`:425-433`) y antes de las referencias (`:435`). Lleva los cinco puntos de la spec §14:
  1. la puerta ajena se sustituye por un adaptador HTTP o RPC detrás del puerto que el consumidor ya tiene (`CustomerDirectory`, `UserDirectory`), sin tocar dominio ni aplicación. Los ids ajenos ya son `string` (T5);
  2. las tablas se van con el módulo: no hay FKs (está verificado) y las entidades ORM ya están separadas. Las migraciones se separan;
  3. el relay del outbox pasa a publicar en un broker;
  4. con HS256, cada servicio necesitaría el secreto; pasar a RS256/JWKS es otro cambio;
  5. `common/` pasa a ser un paquete compartido.

  La sección termina diciendo que nada de esto está hecho (spec §15).

- [ ] Referencias (`:435-466`):
  - `:450` apunta a `users-domain-exception.filter.ts`, con el identificador de la referencia renombrado a juego;
  - referencias nuevas para `module-contract.spec.ts`, el checker, `domain-exception.filter.ts`, `fail-closed.ts` y `src/shared/domain/`.

`docs/database.md`

- [ ] Tras el precedente (`:63-65`), la reescritura de `1786076763455-create-orders-and-outbox.ts` (B6):
  - por qué: el template no está desplegado en ningún sitio;
  - qué cambió: `placed_at` pasa a `created_at` y `updated_at`, `timestamptz NOT NULL DEFAULT now()`;
  - qué cuesta: `pnpm db:reset` en toda base existente, con el síntoma que da si no se hace;
  - que la cabecera de la migración remite aquí;
  - el límite: en cuanto el template esté desplegado en cualquier sitio, se acaban las reescrituras y se usa expand/contract.
- [ ] «Configuración» (`:10-36`), viñeta nueva: cero FKs, ya verificado.
  - `migration-conventions.spec.ts` busca en los literales SQL y en la API de esquema. Un comentario SQL dentro de una consulta también cuenta: falla en cerrado.
  - La clave `orm-relations` lo prohíbe en las entidades ORM.
- [ ] Subsección nueva «Nombres de columna».
  - `users` y `auth_credentials` usan camelCase entre comillas (`"createdAt"`), porque no hay `NamingStrategy` (`1786210289581-move-credentials-to-auth-expand.ts:36`).
  - `orders` y `orders_outbox` usan snake_case con `name:`.
  - Unificarlo es la entrada #39 del backlog.
- [ ] (añadido) El porqué de T9, «El dominio es el dueño de las fechas»:
  - `@UpdateDateColumn` añade `CURRENT_TIMESTAMP` a todo UPDATE (`UpdateQueryBuilder.js:442-445`) y taparía un `touch()` olvidado;
  - el cambio no genera diferencias de esquema (`PostgresDriver.js:914-958`), confirmado con `--check` antes y después;
  - sus guardas: `orm-managed-columns`, el E2E de users que guarda con T0 y el paso «Schema drift».

`docs/testing.md`

- [ ] Subsección nueva `### Guardas de arquitectura: detector, árbol y rotura puntual`, tras «Tests de guarda» (`:79-86`):
  - las filas detector usan un fixture sintético; con el checker como stub (`() => []`), todas fallan por aserción;
  - la fila árbol compara el repo real con igualdad exacta, y una fila de no vacuidad comprueba que hay algo que mirar sin nombrar los módulos de ejemplo;
  - romper un módulo real demuestra que la fila árbol lee el repo de verdad;
  - los precedentes: `language-convention.spec.ts:46,144` y `migration-conventions.spec.ts:25,73-74`;
  - el trinquete `PENDING_VIOLATIONS` como técnica para migraciones largas.

`docs/development-workflows.md`

- [ ] `:89`, fila «Bounded context nuevo»: añade «, y el test de contrato en verde» o un texto equivalente de 46 caracteres como mucho.

`docs/backlog.md`

- [ ] #19 (`:803-840`):
  - (a) `:813`: no hay ningún `.gitkeep`; `src/shared/` solo contiene `domain/` y su `__tests__/`;
  - (b) `:827`: el kernel ya no son dos archivos sino cinco, y uno importa un builtin (`node:crypto`, en `uuid-identifier.base.ts`) que la futura lista blanca tendrá que permitir. La decisión no cambia (spec §15).
- [ ] (añadido) #30 (`:1380-1419`): una actualización fechada.
  - `user.errors.spec.ts` y `auth.errors.spec.ts` ya existen.
  - Queda `order-placed.event.ts`, fuera del alcance (spec §15).
  - Si la Task 7 quitó el `.filter()` de `user-id.vo.spec.ts:103`, cae la línea «De paso». Compruébalo con `grep -n "\.filter(" src/modules/users/__tests__/domain/value-objects/user-id.vo.spec.ts`.
  - Lo que diga de supervivientes lo completa la Task 12 con el censo.
- [ ] #31 (`:1423-1443`): `placedAt` pasa a `createdAt` en `:1428` y `:1432`. Añade una frase: el mismo criterio vale para `updatedAt`, porque `touch(now)` la fija en `now` aunque retroceda (T3).
- [ ] **#37: `errorCode` aplazado.**
  - Qué pasa: ningún error lo emite (`docs/api-contract.md:64-70`; B8).
  - Criterio propuesto, pendiente de decisión: el código viaja en la tabla de mapeo del filtro de cada contexto, así que el dominio sigue sin conocer HTTP.
  - Cómo se sabrá que está hecho: un error mapeado lo emite, su ejemplo lo publica y pasa las tres comprobaciones, y `ErrorResponseDto.errorCode` deja de decir que no se usa todavía.
- [ ] **#38: el generador `pnpm module:new`.**
  - Criterio ya decidido (B7): es un sub-proyecto aparte; sus plantillas son NESTJS-MAPPING y su guarda es el test de contrato.
  - Cómo se sabrá que está hecho: un módulo generado pasa typecheck, lint, el test de contrato y sus propios specs sin editarlo.
- [ ] **#39: unificar los nombres de columna.**
  - Criterio propuesto, pendiente de decisión (T13): una sola convención. Los renombrados son destructivos, así que van en expand/contract.
  - Cómo se sabrá que está hecho: la convención está escrita en «Database», `--check` sale limpio y «Schema drift» está en verde.

`.claude/skills/clean-ddd-hexagonal/references/NESTJS-MAPPING.md`

- [ ] §1 (`:17-62`):
  - `:26`: `common/` añade `persistence` y la base de filtros;
  - `:29`: el kernel completo;
  - `:43`: `http/<context>-domain-exception.filter.ts`;
  - en las reglas (`:55-62`), que el contrato lo verifica `src/__tests__/module-contract.spec.ts`;
  - (añadido) una línea `__tests__/` para los tests de arquitectura de `src/`.
- [ ] §3 (`:125-212`):
  - `:127`: los ids extienden `UuidIdentifier<'<Clase>'>` y la marca es el nombre de la clase. Cada id tiene su `from()`, que lanza el error de su contexto, y su `generate()`, los dos sobre `isUuidV4`/`newUuid`. Ningún VO declara un constructor público;
  - `:149`: `Entity<TId>`, con `BaseEntityProps`, `touch(now)` protegido y `equals` por clase e id; o `AggregateRoot<TId, TEvent>` si el agregado emite eventos;
  - el ejemplo `Invoice` (`:151-212`) pasa a `extends AggregateRoot<InvoiceId, InvoiceIssued>` con la forma común, la misma de `Order` tras la Task 8:
    - `private constructor(base: BaseEntityProps<InvoiceId>, …estado propio)` con `super(base)`; pierde el `readonly id: InvoiceId` que hoy lleva como parameter property (`:172`), y su `super()` (`:178`) pasa a `super(base)`;
    - `draft` y `rehydrate` construyen el `{ id, createdAt, updatedAt }` que reciben como `base`;
    - `draft({ id, amount, now })` fija `createdAt = updatedAt = now`;
    - `rehydrate` recibe las dos fechas;
    - `issue(now)` llama a `touch(now)` después de su guarda;
    - el snapshot lleva las fechas;
  - bloque nuevo `invoice-id.vo.ts`, «Calca: `src/modules/orders/domain/value-objects/order-id.vo.ts`».
- [ ] §5 (`:258-293`):
  - `:273` y `:277`: `BillingDomainExceptionFilter`, importado de `./billing-domain-exception.filter`;
  - (añadido) `:293`: el `meta` del sobre se construye con `buildRequestMetaExample(path)` (`@common/dto/example-meta.factory`).
- [ ] §6 (`:295-388`):
  - `:297`: el mapper envuelve `rehydrate` en `failClosed`, salvo en un contexto cuyo filtro ya sanea el error (`auth`, T8);
  - la regla de T9 y la prohibición de decoradores de relación;
  - (añadido) bloque corto `invoice.orm-entity.ts` con las fechas según T9, «Calca: `order.orm-entity.ts`»;
  - el `UPDATE` del ejemplo (`:367-371`) escribe también `updatedAt`.
- [ ] §8 (`:413-493`):
  - la raíz pasa a `extends DomainError`, con la forma exacta que deje `user.errors.ts` tras la Task 7;
  - el filtro pasa a `BillingDomainExceptionFilter`, en `billing-domain-exception.filter.ts`:
    - extiende `DomainExceptionFilter<InvoiceDomainError>` y lleva `@Catch(InvoiceDomainError)`;
    - declara `protected readonly mappings` con funciones flecha y no tiene constructor;
    - lo no mapeado es el 400 de la base;
  - por qué cada subclase lleva su propio `@Catch` (T6);
  - `:457`: «Calca: …/users-domain-exception.filter.ts».
- [ ] §9 (`:495-528`):
  - en la tabla, el kernel entra en la fila Domain, y hay una fila nueva «Arquitectura» (contrato, fronteras, cero FKs);
  - `:507` se reescribe sin cifras: dice 18 specs (3 + 15), y en la base hay 20 (3 + 17);
  - `:518`: `users-domain-exception.filter.spec.ts`;
  - `:528`: la mutación del kernel, `--mutate "src/shared/domain/**/*.ts"`, con objetivo del 100 %.
- [ ] §10 (`:530-539`):
  - los ids de otro contexto viajan como `string` (regla 3);
  - el puerto del consumidor es la costura para extraer al proveedor, con enlace a la sección nueva de `docs/architecture.md`.
- [ ] §11 (`:541-553`): casillas nuevas para:
  - las bases del kernel;
  - el filtro sobre la base;
  - `failClosed`;
  - las fechas y las relaciones de las entidades ORM;
  - «`pnpm test src/__tests__/module-contract.spec.ts` en verde, sin añadir el contexto a `FLAT_MODULES`».

`.claude/skills/clean-ddd-hexagonal/SKILL.md`

- [ ] `:98`: el kernel completo.
- [ ] `:112`: `<context>-domain-exception.filter.ts`.
- [ ] (añadido) `:95`: `common/` con `persistence`.

`.claude/skills/writing-plans/SKILL.md`

- [ ] `:144-145`: `export class Invoice extends AggregateRoot<InvoiceId, InvoiceIssued>` y `static draft(params: { id: InvoiceId; amount: InvoiceAmount; now: Date }): Invoice;`.

Código: menciones obsoletas de `UsersFacade`. Se localizan por texto, porque las Tasks 5, 7 y 9 pueden haber movido las líneas.

- [ ] `src/modules/auth/auth.module.ts:27-28`: el módulo consume `UsersLookup` y `UsersProvisioning`, inyectadas en `UsersUserDirectory`.
- [ ] `src/modules/orders/orders.module.ts:18-19`: solo consume `UsersLookup`; `UsersProvisioning` queda fuera por tipo (backlog #13).
- [ ] `src/modules/users/infrastructure/http/users.controller.ts`, el comentario que en la base está en `:72` («su único consumidor es ahora `UsersFacade`»): el consumidor es `UsersFacadeImpl`, detrás de `UsersProvisioning.createProfile`.
- [ ] `eslint.config.mjs:177-179`: `UsersLookup` y `UsersProvisioning` son puertos (`abstract class` que se inyectan desde `users.module`) cuya ruta no contiene `ports/`.
- [ ] `eslint.config.mjs:208`, en el mensaje: `UsersFacade` pasa a `UsersLookup`.

**Tests** (exenta de tabla; qué comprueba cada verificación):

- debería quedar `placedAt`, `placed_at`, `UserDomainExceptionFilter` o `user-domain-exception` solo en `docs/specs/`, `docs/plans/`, `CHANGELOG.md`, en el párrafo de la reescritura de `docs/database.md` y en las dos menciones deliberadas de la Task 8: la cabecera de `1786076763455-create-orders-and-outbox.ts` y el texto del `it` «…sin placedAt ni la versión» de `order-response.dto.spec.ts`;
- debería no tocar nada de `.tmp/`, `.temp/` ni `logs/`: son borradores locales ignorados por git, y el grep los excluye como `init-project.spec.ts:57-72`;
- debería no quedar en el ejemplo `Invoice` de NESTJS-MAPPING ningún `readonly id` como parameter property (se comprueba leyendo su diff);
- debería quedar `UsersFacade`, como nombre en código, solo en la nota histórica de `users.facade.ts`;
- debería no quedar en los documentos vivos ningún `AggregateRoot<X>` de un solo argumento, ningún `<aggregate>-domain-exception`, la descripción vieja del kernel ni «solo hay tres sitios»;
- debería mencionar `CreateDateColumn` y `UpdateDateColumn` en los `.md` vivos solo como prohibición;
- debería pasar el ejemplo `billing` de NESTJS-MAPPING por `checkModuleContract` sin ninguna violación;
- debería no romper ningún enlace relativo: solo siguen los dos rotos de antes, `docs/backlog.md:1531-1532`, que apuntan a una spec y un plan del 2026-10-01 que no están en el repo;
- debería pasar Prettier en los `.md` de la raíz y en los de `docs/` editados;
- debería seguir en verde la suite unitaria completa: `toolchain-pins.spec.ts:29-31` lee README y `CLAUDE.md`, `init-project.spec.ts:85` vigila las marcas del template y `eslint-config.spec.ts:129` carga la configuración real.

El grep final. Se probó sobre el árbol de hoy y funciona con el `grep` de Git Bash:

```bash
X='--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.stryker-tmp --exclude-dir=dist --exclude-dir=coverage --exclude-dir=coverage-e2e --exclude-dir=reports --exclude-dir=public --exclude-dir=.tmp --exclude-dir=.temp --exclude-dir=logs'
grep -rnI $X -E 'placedAt|placed_at|UserDomainExceptionFilter|user-domain-exception' . | grep -v -E '^\./(docs/specs|docs/plans)/|^\./CHANGELOG\.md:'
grep -rnwI 'UsersFacade' src eslint.config.mjs
grep -nI -E 'AggregateRoot<[A-Za-z]+>|<aggregate>-domain-exception|AggregateRoot, ValueObject|solo hay tres sitios' CLAUDE.md README.md docs/*.md .claude/skills/clean-ddd-hexagonal/SKILL.md .claude/skills/clean-ddd-hexagonal/references/NESTJS-MAPPING.md .claude/skills/writing-plans/SKILL.md
grep -rnI $X -E 'CreateDateColumn|UpdateDateColumn' --include='*.md' . | grep -v -E '^\./(docs/specs|docs/plans|\.claude/skills/nestjs-best-practices)/'
```

`.stryker-tmp` se excluye porque hay un sandbox viejo (`sandbox-dafVrm`) con copias de `docs/`. `.tmp`, `.temp` y `logs` se excluyen porque están ignorados por git y guardan borradores locales del usuario (hoy, `.tmp/pr-slim-claude-md-v2-comentario-1.md:286` nombra el filtro viejo): nunca se editan para dejar limpio el grep. Para las entidades ORM no hay grep: la clave `orm-managed-columns` del contrato las mira por AST, y un grep confundiría los comentarios que nombran la prohibición (`order.orm-entity.ts:5,9`).

**Comprobación de la referencia contra el contrato:** un script de un solo uso en el scratchpad, nunca en el repo. Escríbelo con Write y no con un heredoc, porque la memoria registra que los heredocs colapsan `\\`.

- El script lee NESTJS-MAPPING y toma cada bloque `ts` cuya primera línea es `// src/modules/billing/<ruta>.ts`. Con ellos arma un `Map<ruta, fuente>`.
- Añade `src/modules/billing/__tests__/placeholder.spec.ts` con la fuente vacía: la referencia no tiene bloque de tests, y `structure` exige la carpeta.
- Imprime `checkModuleContract(map)`. Importa el checker por su ruta absoluta, con `/`.
- Se ejecuta desde la raíz del repo con `node node_modules/ts-node/dist/bin.js --transpile-only --project tsconfig.json <script>`. Se probó el 2026-10-17 con `language-scanner.ts`: sin `--project`, ts-node cae en opciones que TS 6 rechaza (TS5107 y TS5109).

- [ ] **Stub:** no aplica.
- [ ] **Red** (antes de editar nada; las Tasks 1-10 ya están hechas):
  - el grep final lista las menciones de hoy:
    - grupo 1: `CLAUDE.md:138`, `docs/architecture.md:142,450`, NESTJS-MAPPING `:457,518` y `docs/backlog.md:1428,1432`, más las dos menciones deliberadas de la Task 8 (la cabecera de la migración `1786076763455` y el `it` de `order-response.dto.spec.ts`), que siguen ahí tras el Green;
    - grupo 2: las cinco líneas de `UsersFacade`, más `users.facade.ts`;
    - grupo 3: `README.md:472`, `clean-ddd-hexagonal/SKILL.md:98,112`, NESTJS-MAPPING `:29,43,149,170` y `writing-plans/SKILL.md:144`;
  - la comprobación de la referencia devuelve al menos `errors` (la raíz extiende `Error`) y `filter` (el archivo se llama `invoice-domain-exception.filter.ts`).
- [ ] **Green:** aplica el inventario entero. Después:
  - el grep final devuelve solo lo que **Tests** permite;
  - la comprobación de la referencia devuelve `[]`.
- [ ] **Guard check:** no aplica.
- [ ] **Refactor:** lee el diff de cada archivo buscando coherencia: los mismos nombres, las mismas diez claves y los mismos cinco puntos en `CLAUDE.md`, README, NESTJS-MAPPING y `docs/architecture.md`.
- [ ] **Cierre de la tarea:**
  - `pnpm format:check` → «All matched files use Prettier code style!»;
  - `pnpm exec prettier --check docs/architecture.md docs/database.md docs/testing.md docs/development-workflows.md docs/backlog.md` → lo mismo;
  - la comprobación de enlaces relativos de abajo → solo las dos líneas rotas de antes en `docs/backlog.md`;
  - `pnpm lint:check` → sin errores;
  - `pnpm typecheck` → exit 0;
  - `pnpm test` → todo en verde.

  Comprobación de enlaces relativos (la misma con la que se midió la línea base del 2026-10-17):

```bash
for f in README.md CLAUDE.md CHANGELOG.md docs/*.md .claude/skills/clean-ddd-hexagonal/SKILL.md .claude/skills/clean-ddd-hexagonal/references/NESTJS-MAPPING.md .claude/skills/writing-plans/SKILL.md; do d=$(dirname "$f"); { grep -oE '\]\([^) ]+\)' "$f" | sed -E 's/^\]\(//; s/\)$//'; grep -oE '^\[[^]]+\]: [^ ]+' "$f" | sed -E 's/^\[[^]]+\]: //'; } | grep -v -E '^(https?|mailto):|^#' | sed 's/#.*//' | while read -r p; do [ -e "$d/$p" ] || echo "ROTO $f -> $p"; done; done
```

- [ ] Si `pnpm-lock.yaml` aparece modificado solo por `@pnpm/exe`, quítalo con Edit.
- [ ] _"Te sugiero hacer un commit de los cambios por documentar el contrato base de módulo y retirar las menciones obsoletas de UsersFacade"_. Mensaje validado con el commitlint del repo: `docs: documentar el contrato base de módulo y retirar las menciones a UsersFacade`.

### Task 12: Cierre: mutación, censo, revisión adversarial y DoD

**Layer:** auditoría, sin capa propia.

**Files:**

- Modify: `stryker.config.mjs`, solo la cabecera: la entrada «Remedición del …» antes del `*/`, que en la base está en `:212`.
- Modify: `pnpm-lock.yaml`, solo para quitar el ruido. Al acabar debe quedar idéntico a la base.
- Modify, si hace falta:
  - los archivos que corrijan hallazgos críticos o importantes de la revisión, con su test primero;
  - el #30 de `docs/backlog.md`, si el censo cambia lo que dice;
  - la spec y el plan, si cambió alguna decisión.
- Test: ningún spec nuevo por defecto. Los casos que salgan de la mutación o de la revisión van a la tabla de la tarea dueña, aprobados por el usuario.
- Uses (from earlier tasks): todo lo anterior, la base `32ade98` (o la que anotó la Preparación), la spec y el plan.

**Interfaces:** ninguna.

**Decisions:**

- **Orden:** código nuevo → kernel → revisión y correcciones → pasada completa con censo → DoD.
  - El censo va después de las correcciones, para que describa el código final.
  - La revisión va antes de la DoD (executing-plans, Step 3) y después de la Task 11, para que vea también los documentos.
- **Pasada 1, el código nuevo: `pnpm test:mutation:changed 32ade98`.**
  - Muta los archivos enteros y puntúa solo los mutantes que tocan el cambio, también en archivos sin confirmar (`scripts/mutation-targets.mjs:119-199`).
  - Sale con 1 por debajo de `break: 85` (`scripts/mutate-changed.mjs:207-210`). El umbral es el gate; la norma del flujo es que ningún superviviente quede sin explicar (executing-plans, Step 3).
- **Pasada 2, el kernel: `pnpm test:mutation --mutate "src/shared/domain/**/*.ts"`**, sin llaves. El objetivo es el 100 % (spec §12). Se repite aunque la Task 3 ya lo midiera, porque la Task 8 cambió `aggregate-root.ts`.
- **Pasada 3, la completa: `pnpm test:mutation`.** Es la que ejecuta el job `mutation` de la CI (`ci.yml:320-321`), y la única que da el censo.
- **Nada más corriendo durante las pasadas.** Con la suite unitaria en paralelo, los timeouts suben y Stryker cuenta como detectados mutantes que en realidad sobreviven (`stryker.config.mjs:152-155`).
- **La cifra por módulo sale de la tabla `clear-text`.** Imprime una fila por carpeta bajo «All files» (`clear-text-score-table.js:4,99,174`). Detectados son `killed + timeout`; válidos, los detectados más `survived + no cov`; los `errors` quedan fuera.
- **El umbral se queda en 85.** La cabecera aplaza subirlo hasta que los supervivientes conocidos tengan casos aprobados (`stryker.config.mjs:209-211`). Si el censo da cero supervivientes, se plantea en el informe y lo decide el usuario.
- **La revisión recibe la base `32ade98`, y `<SPEC_O_PLAN>` es la spec y el plan:** la spec dice qué se decidió, y el plan, qué casos se acordaron.
- **Nota de entorno para el revisor, añadida al final de su prompt.** La skill solo prohíbe decir quién escribió el código o qué se revisó ya, y esta nota no lo hace.
  - En esta máquina, la receta de copia del prompt (`reviewer-prompt.md:79-87`) no funciona: no hay `rsync`, y el `ln -s` de Git Bash copia en vez de enlazar (`MSYS` vacío), así que metería `node_modules` entero en la copia.
  - La alternativa se midió el 2026-10-17: dio 4,0 MB con los archivos sin confirmar incluidos, `tsc` funcionó a través de la unión y `rm -rf` borró la unión sin tocar el `node_modules` real.

```bash
REPO="$(pwd)"   # se lanza desde la raíz del repo
copia=$(mktemp -d) && tar -C "$REPO" --exclude=./node_modules --exclude=./.git --exclude=./.stryker-tmp --exclude=./dist --exclude=./coverage --exclude=./coverage-e2e --exclude=./reports --exclude=./public --exclude=./logs -cf - . | tar -C "$copia" -xf -
(cd "$copia" && MSYS_NO_PATHCONV=1 cmd /c mklink /J node_modules "$(cygpath -w "$REPO/node_modules")")
# Al terminar: primero se deshace la unión, que no toca su destino, y después se borra la copia.
# Sin MSYS_NO_PATHCONV=1, Git Bash convierte `/c` en una ruta y el `rmdir` no llega a ejecutarse
# (medido por el revisor de la Task 12 el 2026-10-19).
(cd "$copia" && MSYS_NO_PATHCONV=1 cmd /c rmdir node_modules) && rm -rf "$copia"
```

- **El ruido de `@pnpm/exe` se quita aquí dos veces más:** antes de la revisión, para que el revisor no lo persiga, y al final, porque la DoD lo vuelve a escribir. Se quita con Edit y se comprueba con `git diff --exit-code 32ade98 -- pnpm-lock.yaml`, contra la base y no contra el índice, para que valga igual si las tareas ya se confirmaron una a una.
- **Paridad con la CI.** Además de la DoD de `CLAUDE.md`, se ejecuta lo que la CI añade:
  - los umbrales de cobertura: `pnpm test:cov` (`jest.config.mjs:127-129`) y `pnpm test:e2e:ci` (`test/jest-e2e.config.mjs:66-68`);
  - el paso «Schema drift».
- **Mensajes de commit comprobados con el commitlint del repo.** El repo no tiene ningún commit con varios scopes ni con `!`, así que se probaron todos: el `scope-enum` de commitlint 21.2.3 parte el scope por `/`, `\` y `,`.
  - Pasan `feat(shared,common,users,orders,auth)!:` con el pie `BREAKING CHANGE:` y las alternativas de abajo.
  - El control `feat(kernel):` falla por `scope-enum`.
  - Los commits que redacta Claude en este repo acaban con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (por ejemplo, `5acfba0`).

**Casos acordados:** ninguno propio. Un superviviente o un hallazgo que pida un caso nuevo se consulta agrupado, y su fila va a la tabla de la tarea dueña del archivo antes de escribir el test.

**Guard tests:** esta tarea no añade ninguno. La revisión comprueba que cada guarda de la spec §12 se pone roja sin su protección, y el informe dice en qué tarea se vio cada rojo.

- [ ] **Pre-vuelo:** `git status --porcelain --untracked-files=all` coincide con el mapa de archivos del plan, más el ruido del lockfile. `pnpm typecheck` y `pnpm test` en verde.
- [ ] **Pasada 1, código nuevo.** Sin nada más corriendo, ejecuta `pnpm test:mutation:changed 32ade98`. Esperado:
  - «[test:mutation:changed] base 32ade98 — N archivos:» y la lista;
  - «mutantes del cambio: V válidos, D detectados — S % (umbral 85).»;
  - exit 0.

  Por cada superviviente:
  - propón el caso que lo mata, con todos en una sola pregunta y tu recomendación. El caso aprobado lleva su fila y su test; su rojo se demuestra aplicando el mutante a mano, viendo fallar el test por aserción y restaurando;
  - un mutante equivalente se marca con `// Stryker disable next-line <Mutador>: <motivo>` y se cita en el informe;
  - repite la pasada hasta que no quede ninguno sin explicar.

- [ ] **Pasada 2, kernel:** `pnpm test:mutation --mutate "src/shared/domain/**/*.ts"` → «All files» al 100.00 %, con 0 survived y 0 no cov. Un superviviente se trata igual que en la pasada 1.
- [ ] **Lockfile:** quita con Edit las líneas de `@pnpm/exe`. `git diff --exit-code 32ade98 -- pnpm-lock.yaml` → exit 0.
- [ ] **Revisión adversarial.** Invoca la skill `adversarial-review` con:
  - base `32ade98`;
  - `<SPEC_O_PLAN>` = `docs/specs/2026-10-17-module-contract-kernel-design.md` (la spec) y `docs/plans/2026-10-17-module-contract-kernel.md` (el plan);
  - `<ALCANCE>` vacío;
  - la nota de entorno de **Decisions**, al final del prompt.

  Mientras revisa, no edites el árbol ni ejecutes `pnpm test:e2e` ni Stryker.

- [ ] **Triage** (adversarial-review, §3):
  - comprueba tú cada hallazgo y clasifícalo como real o falso positivo, con su motivo;
  - crítico o importante, y real: primero el test, con rojo por aserción, y después el arreglo. Si exige decidir un comportamiento nuevo, haz una sola pregunta con tu recomendación;
  - menor: va al informe. Solo se corrige si es trivial y está dentro del alcance; si no, se propone una entrada de backlog, y la decide el usuario;
  - después de corregir:
    - si se tocó `domain/` o `application/`, repite la pasada 1, y también la 2 si el cambio cae en `src/shared/domain/`;
    - si cambió el comportamiento de producción, pide una segunda pasada del revisor con `<ALCANCE>` = «Limítate a estos archivos: …»;
    - si se tocó un documento, repite el grep de la Task 11.
- [ ] **Pasada 3, completa y censo.** Sin nada más corriendo, ejecuta `pnpm test:mutation`. Con su salida, escribe la entrada «Remedición del <fecha de la medición> (contrato base de módulo: …)» al final de la cabecera de `stryker.config.mjs`: antes del `*/` (en la base, `:212`) y tras una línea separadora como la de `:185`. La entrada lleva:
  - el evento que obliga a remedir: el kernel nuevo y los tres contextos al contrato;
  - «**S %** global — K killed, T timeout, V survived, N sin cobertura, E error (detectados/válidos)», copiado de la salida;
  - la tabla por módulo, como las anteriores: `auth`, `users`, `orders` y `shared`, con su %, detectados/válidos y su peso en el censo;
  - los supervivientes por archivo, frente a los 11 del 2026-10-01 (`stryker.config.mjs:199-204`);
  - de dónde vienen los movimientos, cada uno medido o marcado como hipótesis (el precedente es `:94-97`): la regex de `UserId` y `OrderId` pasa a `UuidIdentifier`, el `this.name = new.target.name` de las tres raíces pasa a `DomainError`, y `placedAt` desaparece;
  - la aritmética del umbral (precedente: `:173-180`):
    - mínimo = ⌈0,85 × válidos⌉;
    - holgura = detectados − mínimo;
    - para cada módulo, el score al que tendría que caer para tumbar el global él solo: (detectados del módulo − holgura − 1) / válidos del módulo, o «ya no puede» si sale negativo;
  - que el umbral se queda en `break: 85`, con su porqué.

  Si el censo cambia lo que el #30 del backlog dice de los supervivientes de los archivos de errores, actualízalo. `pnpm format:check` en verde (cubre los `*.mjs` de la raíz).

- [ ] **Si cambió alguna decisión** durante la ejecución, actualiza la spec y el plan (fila nueva o decisión corregida) antes del informe.
- [ ] **DoD, en este orden** (`CLAUDE.md`, «Definition of Done»):
  1. `pnpm typecheck` → exit 0;
  2. `pnpm lint:check` → sin errores;
  3. `pnpm format:check` → «All matched files use Prettier code style!»;
  4. `pnpm test` → todas las suites en verde: los totales de la Preparación más las suites nuevas;
  5. `DB_PORT=5434 pnpm test:e2e` → todas en verde;
  6. `pnpm build` → exit 0.

  Corrige cualquier fallo. Si alguno revela un hueco del plan, para y díselo al usuario.

- [ ] **Paridad con la CI** (no es DoD, pero la CI lo ejecuta):
  - `pnpm test:cov` → cumple los umbrales globales 50/88/85/85;
  - `DB_PORT=5434 pnpm test:e2e:ci` → cumple los umbrales 30/80/80/80;
  - `TEST_DB=$(sed -nE 's/^CREATE DATABASE ([a-z_]+);$/\1/p' docker/initdb/01-create-test-database.sql) && DB_PORT=5434 DB_DATABASE="$TEST_DB" pnpm migration:generate src/database/migrations/DriftCheck --check; echo "exit=$?"` → `exit=0`.
- [ ] **Limpieza:**
  - quita otra vez el ruido del lockfile; `git diff --exit-code 32ade98 -- pnpm-lock.yaml` → exit 0;
  - `git status --porcelain --untracked-files=all` es exactamente el mapa del plan: ningún `*-DriftCheck.ts`, ningún `.js` suelto y ningún script temporal;
  - restaura el entorno según lo que anotó la Preparación: si el contenedor estaba parado, `pnpm db:down` (nunca con `-v`). Docker Desktop no lo apagues tú: díselo al usuario.
- [ ] **Informe final**, con el formato de `CLAUDE.md`: secciones numeradas con título en mayúsculas, la respuesta directa primero, tablas, ⚠️ y una sección de estado al final.
  1. RESULTADO.
  2. TAREAS Y DESVÍOS DEL PLAN, cada desvío con su motivo.
  3. CASOS ↔ TESTS Y ROJOS POR ASERCIÓN.
  4. TESTS DE GUARDA: cada garantía de la spec §12, qué se quitó y en qué tarea se vio el rojo.
  5. MUTACIÓN: las tres pasadas, la última tras las correcciones, con cada superviviente explicado.
  6. REVISIÓN ADVERSARIAL: el veredicto y una tabla con la severidad, el `archivo:línea`, si es real o falso positivo y qué se hizo.
  7. DEFINITION OF DONE Y PARIDAD CON LA CI: cada comando con su resultado.
  8. ⚠️ CAMBIOS DE CONTRATO Y LO QUE TE TOCA:
     - la API de `orders` sin `placedAt`;
     - los 500 ante filas corruptas;
     - `pnpm db:reset` y `pnpm seed:admin` en cada base existente;
     - «Schema drift», probado en local y todavía no en la CI;
     - que el pre-commit (`pnpm exec lint-staged`) puede volver a escribir el ruido del lockfile.
  9. LO QUE NO SE HIZO O NO FUNCIONA: lo que deja fuera la spec §15 y los añadidos de la Task 11 al inventario de la §14.
  10. COMMIT SUGERIDO.
  11. ESTADO: ¿bloqueado?, ¿necesito algo de ti?, ¿de un tercero?
- [ ] _"Te sugiero hacer un commit de los cambios por implementar el plan `docs/plans/2026-10-17-module-contract-kernel.md`. Avísame y lo redacto."_ Mensajes propuestos, todos validados con `commitlint.config.cjs`:
  - **Si no se confirmó nada desde la base** (un solo commit, con la spec y el plan mejor antes, en su propio `docs:`): `feat(shared,common,users,orders,auth)!: contrato base de módulo con kernel y guardas verificadas`. Lleva:
    - un cuerpo que resume el kernel, las bases, los contextos y las guardas;
    - el pie `BREAKING CHANGE: POST /orders y POST /orders/:id/cancel publican createdAt y updatedAt en lugar de placedAt; la migración 1786076763455 se reescribió y toda base existente necesita pnpm db:reset.`;
    - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - **Si las tareas ya se confirmaron una a una:**
    - el censo, con `docs(test): remedir la mutación tras el contrato base de módulo`;
    - las correcciones de la revisión, en su propio `fix(<scopes tocados>): cerrar los hallazgos de la revisión adversarial`. La cabecera de commitlint admite 100 caracteres (`header-max-length`), y con este asunto caben hasta 46 de scopes (medido: pasa con seis). Mide la cabecera con los scopes reales antes de proponerla.

### Execution handoff

**Recomendación: `executing-plans` en una sesión nueva** (`/clear` o una terminal nueva), con `/executing-plans docs/plans/2026-10-17-module-contract-kernel.md`, empezando por la Preparación. El plan y la spec en disco son todo el traspaso, y el contexto del diseño solo encarece cada turno.

`subagent-driven-development` exige que se cumplan tres condiciones a la vez (`.claude/skills/subagent-driven-development/SKILL.md:17-21`), y aquí solo se cumple la primera:

| Condición                                                   | Aquí                                               |
| ----------------------------------------------------------- | -------------------------------------------------- |
| ~10 tareas o más                                            | Sí: son 12.                                        |
| La mayoría no toca los mismos archivos                      | No: ver la tabla de abajo.                         |
| El contexto de una sesión no aguantaría la ejecución inline | Dudoso, y tiene una salida más barata (ver abajo). |

| Archivo o recurso compartido                                        | Tareas                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/__tests__/module-contract.spec.ts` (`PENDING_VIOLATIONS`)      | 6, 7, 8 y 9. El trinquete las hace estrictamente secuenciales.                  |
| `src/modules/users/infrastructure/http/users.controller.ts`         | 5, 7 y 11                                                                       |
| `orders.controller.ts` y `auth.controller.ts`                       | La 5 y la tarea de su contexto                                                  |
| `src/common/dto/error-example.factory.ts` y `error-response.dto.ts` | 5 y 7                                                                           |
| `src/shared/domain/*`                                               | Las 1-3 lo crean, la 8 cambia `aggregate-root.ts` y las 7, 8 y 9 heredan de él. |
| `src/common/filters/` y `src/common/persistence/`                   | La 4 y la 5 los crean; la 7, la 8 y la 9 los usan.                              |
| Las dos bases locales                                               | La 8 las recrea con `pnpm db:reset`, y la 9, la 10 y la 12 dependen de eso.     |
| Las entidades ORM finales                                           | La 7, la 8 y la 9 las escriben; la 10 las verifica.                             |
| Los nombres finales de todo                                         | La 11 los documenta y la 12 los audita.                                         |

Con subagentes, cada implementer tendría que volver a leer el kernel y las bases de `common/`. Además, la comprobación mecánica por huella (`subagent-driven-development/SKILL.md:70-80,116-118`) marcaría como ajenos los archivos que otra tarea ya cambió.

Hay una medición con un plan acoplado de 11 tareas: con subagentes costó 36,01 USD y unos 129 min; inline, 6,66 USD y unos 17 min, para el mismo código. Los 16 revisores por tarea encontraron 0 defectos (`docs/development-workflows.md:249-251`).

**Si el contexto se agota a mitad del plan:** para en un límite de tarea, después de su sugerencia de commit, y abre otra sesión con `executing-plans` indicando «continúa desde la Task N». Las casillas del plan y `git status` dicen dónde se quedó, y la base sigue siendo `32ade98`.
