# Contrato base de módulo: kernel compartido y guardas verificadas — diseño

**Fecha:** 2026-10-17 · **Contextos:** `users`, `orders`, `auth`, más `src/shared/domain/` y
`src/common/` · **Commit base:** `32ade98` · **Flujo:** completo (kernel compartido, tres
contextos, `auth` y una migración ya aplicada)

## 1. Objetivo

Que todo bounded context de `src/modules/` cumpla un contrato base para que un módulo nuevo sea
fácil de crear, mantener y reemplazar, tanto un adaptador como el módulo entero (extraerlo a un
servicio). El contrato tiene tres piezas: un kernel de dominio del que se hereda, unas bases de
infraestructura que se reutilizan y un test que lo verifica. Se empieza migrando `users`, `orders`
y `auth`.

## 2. Antecedentes

Esto sale de comparar el template con otro proyecto del equipo. Ese proyecto define un `core` del
que heredan sus módulos:

- una entidad base con `id`, `createdAt` y `updatedAt` dentro de un objeto de props;
- un value object que valida en el constructor base;
- un único `Id` para todas las entidades.

Esto es lo que se tomó y lo que no:

| Idea del otro proyecto                                                                                      | Aquí                                                                    | Por qué                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entidad base con `id`, `createdAt` y `updatedAt`                                                            | **Se adopta** como `Entity<TId>` + `BaseEntityProps<TId>`               | Es la base común que se pedía                                                                                                                                                                               |
| El estado vive en un objeto de props mutable que escriben las subclases                                     | Se descarta                                                             | Los mutadores escribirían sin pasar por invariantes. Aquí el estado sigue en campos privados con métodos de intención                                                                                       |
| `touch()` llama a `new Date()` por dentro                                                                   | Se adapta: `touch(now)`                                                 | El dominio ya recibe la hora como parámetro y los tests siguen siendo deterministas                                                                                                                         |
| El VO llama a `validate()` desde el constructor base y compara por `constructor.name` + `JSON.stringify`    | Se descarta                                                             | Ejecuta código de la subclase antes de que esta haya inicializado sus campos, y dos clases homónimas de contextos distintos serían iguales. El `ValueObject` del kernel ya es mejor                         |
| Un `Id` único para todas las entidades                                                                      | Se adapta: base `UuidIdentifier` + un id por contexto con marca nominal | Con un id único, uno de pedido entra donde va uno de usuario. Aquí hoy pasa lo mismo por el tipado estructural: compilado en memoria con TS 6.0.3, un `OrderId` entra sin error donde se espera un `UserId` |
| Transacciones ambientales (CLS) que abarcan varios repositorios                                             | Se descarta                                                             | Invitan a atar agregados de varios módulos en una transacción, lo contrario de poder extraerlos                                                                                                             |
| Las factorías `create`/`reconstitute` se documentan con un tipo que nadie implementa                        | Se adapta: el test de contrato exige `rehydrate` y `toSnapshot`         | Un tipo no puede exigir un miembro `static`; un test sí                                                                                                                                                     |
| El contrato no se verifica: parte de las entidades y VOs no lo cumplen, y su generador de módulos no lo usa | La lección: aquí el contrato se verifica                                | Un contrato que nadie comprueba se degrada                                                                                                                                                                  |

Ya existía media base: `src/shared/domain/`, con `ValueObject` y `AggregateRoot` (commit `1ffa723`,
2026-08-09). Lo que faltaba se midió en el propio repo:

- tres bases de errores idénticas (`user.errors.ts:5`, `order.errors.ts:6`, `auth.errors.ts:11`);
- tres filtros de dominio con el mismo esqueleto;
- el uuid v4 copiado en `UserId` y en `OrderId`;
- un mapper de `users` que, ante una fila corrupta, responde 400 con el dato dentro;
- la regla «cero claves foráneas», que solo estaba escrita.

## 3. Decisiones

### Del usuario

- **B1.** Enfoque: un kernel mínimo y un contrato verificado. Se descartaron un core con props-bag,
  repositorio genérico y transacciones ambientales, y también quedarse solo en la documentación.
- **B2.** Alcance: `users`, `orders` y `auth`. `health` es plano (no tiene capas) y queda exento.
- **B3.** La base lleva solo lo que tendrá toda entidad futura: `id` tipado, `createdAt` y
  `updatedAt`. Nada de `version`, `status` ni borrado lógico: cada agregado añade lo que necesite.
- **B4.** En `Order` se elimina `placedAt` por redundante: colocar un pedido es crearlo, así que
  siempre valía lo mismo que `createdAt`. `cancelledAt` y `version` se quedan como campos propios.
- **B5.** ⚠️ La API de `orders` publica `createdAt` y `updatedAt` en lugar de `placedAt`. Es un
  cambio incompatible; hoy no lo consume nadie.
- **B6.** ⚠️ Se reescribe la migración original `1786076763455-create-orders-and-outbox.ts` en lugar
  de añadir un par expand/contract, porque el template no está desplegado en ningún sitio. Toda
  base existente necesita `pnpm db:reset`. Hay precedente: la mudanza de credenciales se partió a
  posteriori (`docs/database.md:63-65`, backlog #12). La migración reescrita lleva una cabecera
  que dice que se reescribió, por qué, y remite a `docs/database.md`.
  `docs/specs/2026-09-30-cancel-order-express.md` cita `order.placedAt`, pero es un registro
  histórico y no se toca.
- **B7.** El generador `pnpm module:new` será un sub-proyecto aparte y posterior. Sus plantillas
  son este contrato, y el test de contrato será su guarda.
- **B8.** Los códigos de error semánticos (`errorCode`) quedan fuera de este trabajo.
- **B9** (al revisar el plan, 2026-10-17). `pnpm seed:admin` rescata también una credencial cuyo id
  no es v4, que tras este trabajo hace responder 500 al login. Su upsert renueva el id con uno v4
  en cada promoción (`id = EXCLUDED.id`). Es seguro porque nada referencia ese id: no hay claves
  foráneas y el JWT lleva el id del usuario.
- **B10** (al revisar el plan, 2026-10-17). El ejemplo OpenAPI del `timestamp` de `RequestMetaDto`
  (`api-envelope.dto.ts:14`), que valía otra fecha, pasa al literal común. Es el único valor del
  documento publicado que cambia con T12, y ningún cliente depende de un valor de ejemplo.

### Técnicas

- **T1. El kernel vive en `src/shared/domain/`.** Es el único elemento de la matriz que pueden
  importar las tres capas de un módulo (`eslint.boundaries.js:140-171`). Un `src/core/` caería en
  el elemento `app`, que ningún módulo puede importar. La matriz no cambia.
- **T2. `DomainError` es una base abstracta** con `protected constructor(message)` y
  `this.name = new.target.name`. Las tres raíces de contexto pasan a extenderla; las clases
  concretas no cambian. `login.use-case.spec.ts:175` comprueba `error.name`, así que el nombre de
  la clase concreta tiene que sobrevivir.
- **T3. `Entity<TId>` sin props-bag.** El constructor protegido recibe `BaseEntityProps<TId>`. El
  resto del estado sigue en campos privados de cada entidad, con sus métodos de intención.
  `touch(now)` es `protected`, así que solo lo llaman los métodos de intención de la propia
  entidad. Fija `updatedAt` exactamente en `now`, sin impedir que retroceda: la decisión de
  backlog #31 (no falsear el instante de negocio por un desfase de relojes) vale también para
  `updatedAt`.
- **T4. `AggregateRoot<TId, TEvent> extends Entity<TId>`** queda para las entidades que emiten
  eventos. `User` y `Credential` no emiten ninguno, así que extienden `Entity`.
- **T5. `UuidIdentifier<TBrand>` lleva la marca `declare private readonly brand: TBrand;`.**
  - La forma es exacta: Prettier reescribe `private declare`. Ni tsc ni SWC emiten la marca, y una
    instancia sigue teniendo una sola clave propia, `value`.
  - La marca es el nombre de la clase (`class UserId extends UuidIdentifier<'UserId'>`). Un id
    copiado de otro que conservara la marca ajena volvería a ser intercambiable, así que el test de
    contrato lo comprueba.
  - Su `protected constructor` normaliza a minúsculas, como hace el tipo `uuid` de PostgreSQL.
  - Ofrece dos helpers `protected static`: `isUuidV4(value)`, que no distingue mayúsculas, y
    `newUuid()`, que usa `randomUUID()`. Con ellos, cada id escribe sus propias factorías `from()`
    y `generate()`, y `from()` lanza el error de su contexto. Una factoría estática polimórfica en
    la base chocaría con los constructores protegidos (TS2345/TS2684), la misma trampa que T7
    esquiva.
  - Los ids que vienen de otro contexto (`Order.customerId`, `Credential.userId`) siguen siendo
    `string`, porque la regla 3 de la matriz prohíbe importar `UserId`.
- **T6. `DomainExceptionFilter<E extends Error>` vive en `src/common/filters/`.**
  - Usa una tabla `readonly { error; toHttp }[]` con funciones flecha, por las reglas de lint
    `array-type` y `unbound-method`. Cada subclase declara su tabla en la propiedad
    `protected readonly mappings`, que en la base es un miembro abstracto, con la anotación de
    tipo explícita: sin ella, cada flecha da TS7006. La subclase no lleva constructor: Nest
    resuelve el filtro de `@UseFilters(Clase)` como injectable del módulo y, sin constructor, no
    hay nada que inyectar. Además, la base no puede leer `mappings` en un constructor propio,
    porque el campo de la subclase se asigna después de `super()`.
  - Gana la primera coincidencia. Sin coincidencia lanza `BadRequestException(message)`, igual que
    hoy, y siempre lanza para que `AllExceptionsFilter` dé forma al cuerpo.
  - La base no lleva `@Catch`, porque lo heredarían las subclases. Cada subclase lleva
    `@Catch(<raíz del contexto>)`. Sin él, Nest la trataría como catch-all y, en las rutas de su
    controller, convertiría en 400 el 401 del guard JWT, el 403 de roles, el 408 del timeout y el
    429 del throttler.
  - Es genérica sobre `Error` porque `common` no puede importar el kernel
    (`eslint.boundaries.js:215-218`).
- **T7. `failClosed(rebuild, isDomainError, describe)` vive en `src/common/persistence/`.**
  - Ejecuta `rebuild`. Si falla con un error de dominio, lanza
    `new Error(describe(error), { cause: error })`; cualquier otro error lo relanza intacto.
  - Recibe un predicado en vez de una clase porque un tipo `abstract new (...)` rechaza las clases
    con constructor protegido (TS2345).
  - La usan `users` y `orders`. `orders` conserva su mensaje exacto (`order.mapper.spec.ts:152`).
- **T8. `auth` no usa `failClosed`.** Su filtro devuelve un 500 con el mismo cuerpo que cualquier
  otro fallo del servidor y guarda el error como `cause`. Ahora cubre también el nuevo
  `InvalidCredentialIdError`.
  - Con `failClosed`, el mensaje se vería en el cuerpo en development y test, contra la decisión
    registrada en `auth-domain-exception.filter.ts` («el mensaje del dominio no viaja en el body en
    ningún entorno»).
  - Sin la entrada nueva, un id corrupto caería en el 400 por defecto y publicaría el valor.
- **T9. El dominio es el dueño de las fechas.** Las columnas pasan de
  `@CreateDateColumn`/`@UpdateDateColumn` a `@Column({ type: 'timestamptz', default: () => 'now()' })`.
  - Con `@UpdateDateColumn`, si el dominio no movió la fecha pero sí otra columna, TypeORM añade
    `"updatedAt" = CURRENT_TIMESTAMP` (`UpdateQueryBuilder.js:442-445`). Eso taparía un `touch()`
    olvidado.
  - Según el código de TypeORM 1.1.2, el cambio no genera diferencias de esquema
    (`PostgresDriver.js:914-958`). Lo confirma `migration:generate --check`, antes y después.
  - La regla se escribe en `CLAUDE.md` («Database») y la verifica la clave `orm-managed-columns`
    del test de contrato (§11): ninguna entidad ORM usa columnas que TypeORM rellene por su cuenta
    (`CreateDateColumn`, `UpdateDateColumn`, `DeleteDateColumn`, `VersionColumn`). La skill de
    referencia `nestjs-best-practices` enseña `@CreateDateColumn`, pero aquí manda `CLAUDE.md`.
- **T10. El 404 de un pedido repite el id tal como llegó** (`OrderNotFoundError(input.orderId)`),
  como ya hace `users`. Si no, la normalización a minúsculas de T5 cambiaría el mensaje. Lo fija
  un caso nuevo en la tabla de `cancel-order.use-case.spec.ts`: un id inexistente escrito en
  mayúsculas da el 404 con el id tal como llegó. Ningún mutante de Stryker cubre ese cambio. En
  `users` el comportamiento ya existe (`find-user-by-id.use-case.ts:20`,
  `deactivate-user.use-case.ts:21`), pero ningún test lo fija, así que el mismo caso entra en sus
  dos specs.
- **T11. Hay un filtro por contexto y se llama `<contexto>-domain-exception.filter.ts`.**
  `user-domain-exception.filter.ts` pasa a `users-domain-exception.filter.ts`
  (`UsersDomainExceptionFilter`). Así la implementación de referencia cumple su propio contrato y
  el test encuentra el filtro por su nombre.
- **T12. Los ejemplos OpenAPI se comparten.**
  - Un archivo nuevo, `src/common/dto/example-meta.factory.ts`, exporta los dos literales que hoy
    son privados de `error-example.factory.ts:9-10` (`TIMESTAMP`, `REQUEST_ID`) y
    `buildRequestMetaExample(path)`.
  - Esos literales pasan a tener una sola fuente. La importan `error-example.factory.ts`, los
    `@ApiProperty({ example })` de `api-envelope.dto.ts:14` (B10) y `:20` y de `error-response.dto.ts:39,46`, y el
    esquema y el ejemplo del 503 de `health.controller.ts` (`:152-154` y `:177-179`). Ese 503 no
    puede usar `buildErrorExample` porque su `error` es un objeto.
  - Los tres controllers de contexto dejan sus copias de `requestMeta` y `errorExample`: usan el
    helper y llaman a `buildErrorExample` directamente.
- **T13. Las columnas nuevas de `orders` van en snake_case** (`created_at`, `updated_at`), como el
  resto de esa tabla. `users` y `auth_credentials` conservan `"createdAt"`/`"updatedAt"`, sin
  `NamingStrategy`. Unificarlo queda en el backlog.
- **T14. Lo que se deja fuera:**
  - una base `UseCase<I, O>`: pediría un elemento nuevo en la matriz, y el test de contrato ya
    exige la forma;
  - un repositorio genérico: impondría `delete`/`findAll` a quien no los tiene
    (`di-interface-segregation`);
  - un puerto `Clock`: los fake timers ya bastan;
  - compartir `isUniqueViolation`: hay una decisión registrada en contra
    (`order.typeorm.repository.ts:19-20`);
  - una base ORM para las fechas: `typeorm` está vetado en `common` y `shared` (regla 4).

## 4. Bounded contexts y ubicación

No hay ningún contexto nuevo. Estos son los archivos nuevos:

| Ruta                                                                                         | Elemento de la matriz | Contenido                                                      |
| -------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| `src/shared/domain/domain-error.ts`                                                          | `shared-domain`       | `DomainError`                                                  |
| `src/shared/domain/entity.base.ts`                                                           | `shared-domain`       | `BaseEntityProps`, `Entity`                                    |
| `src/shared/domain/uuid-identifier.base.ts`                                                  | `shared-domain`       | `UuidIdentifier` (importa `node:crypto`, un builtin permitido) |
| `src/common/filters/domain-exception.filter.ts`                                              | `common`              | `DomainExceptionFilter`                                        |
| `src/common/persistence/fail-closed.ts`                                                      | `common`              | `failClosed` (sin `typeorm`)                                   |
| `src/common/dto/example-meta.factory.ts`                                                     | `common`              | los literales de ejemplo y `buildRequestMetaExample(path)`     |
| `src/modules/auth/domain/value-objects/credential-id.vo.ts`                                  | `module-domain`       | `CredentialId`                                                 |
| `src/__tests__/helpers/module-contract-checker.ts` y `src/__tests__/module-contract.spec.ts` | tests                 | la guarda del contrato                                         |

`src/shared/domain/aggregate-root.ts` cambia de firma. Cada archivo nuevo lleva su spec 1:1.

- **Patrones** (`clean-ddd-hexagonal`): un shared kernel mínimo («use sparingly», DDD-STRATEGIC),
  identidad de entidad y raíz de agregado (DDD-TACTICAL), y tests de arquitectura (TESTING).
- **Reglas:** `arch-feature-modules` y `arch-module-sharing`. El kernel y `common` son archivos TS,
  no módulos Nest.

## 5. Modelo de dominio

### Kernel

- `DomainError`: `name` es el de la clase concreta; conserva el mensaje y es `instanceof Error`.
- `Entity<TId extends ValueObject<string>>`:
  - `id` y `createdAt` son inmutables;
  - `updatedAt` solo cambia con `touch(now)`, que es `protected`;
  - `equals(other)` devuelve `false` con `null`, `undefined` o una entidad de otra clase, y `true`
    solo con la misma clase y `id.equals(other.id)`.
- `AggregateRoot<TId, TEvent>`: `record()` y `pullEvents()` se comportan igual que hoy.
- `UuidIdentifier<TBrand>`:
  - `isUuidV4` acepta un uuid v4 con cualquier capitalización, y el constructor lo guarda en
    minúsculas;
  - `isUuidV4` rechaza todo lo demás, también un uuid válido con texto delante o detrás (las
    anclas de la regex);
  - `newUuid()` produce siempre un v4 válido en minúsculas, y el `generate()` de cada id lo usa;
  - el compilador no permite asignar entre sí dos ids de marca distinta.

### Agregados de los contextos

| Agregado     | Base                                 | Creación                                                                                                                         | Transiciones que mueven `updatedAt`                                                                                                                         | Snapshot                                           |
| ------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `User`       | `Entity<UserId>`                     | `create({ id, email, name, now })`: `createdAt = updatedAt = now`                                                                | `rename` siempre, después de `assertName`. `changeEmail`, `deactivate`, `activate` y `promoteToAdmin` solo si cambian algo; si no hay cambio, no tocan nada | sin cambios de forma                               |
| `Order`      | `AggregateRoot<OrderId, OrderEvent>` | `place({ id, customerId, concept, amount, now })`: `createdAt = updatedAt = now`, estado `placed`, versión 0 y `OrderPlaced`     | `cancel(now)` sobre un pedido colocado. El segundo `cancel` no mueve `updatedAt`, no emite evento ni cambia `cancelledAt`                                   | pierde `placedAt` y gana `createdAt` y `updatedAt` |
| `Credential` | `Entity<CredentialId>`               | `create({ userId, passwordHash, now })`, **con la misma firma** (la usan L9, R10 y R11); el id sale de `CredentialId.generate()` | ninguna                                                                                                                                                     | `id: id.value`                                     |

El `rehydrate` de cada agregado recibe `id`, `createdAt` y `updatedAt`, además de su estado propio.
Los eventos no cambian: `OrderPlaced`, `OrderCancelled` y los `toEqual` exactos del outbox siguen
igual.

### Errores

Las raíces `UserDomainError`, `OrderDomainError` y `AuthDomainError` extienden `DomainError`.
`auth` gana `InvalidCredentialIdError(value)`, con el mensaje
`"<value>" is not a valid credential id`; ese mensaje solo llega al log.

## 6. Puertos

Ningún puerto cambia de firma: `UserRepository`, `OrderRepository`, `CustomerDirectory`,
`CredentialRepository`, `PasswordHasher`, `TokenSigner`, `UserDirectory` y las puertas
`UsersLookup`/`UsersProvisioning`.

`OrderRepository.save(order, events)` sí gana una obligación para quien lo implemente: persistir
`updatedAt` también al actualizar. La cumplen el adaptador TypeORM y el fake in-memory
(`di-liskov-substitution`).

## 7. Casos de uso

No hay casos de uso nuevos y ninguna firma cambia:

- `CancelOrderUseCase` construye `OrderNotFoundError` con `input.orderId` (T10), y su tabla de
  casos gana el del id en mayúsculas.
- Los specs que leían `order.placedAt` pasan a leer `createdAt`.

## 8. Adaptadores

### HTTP

- Los tres filtros extienden `DomainExceptionFilter` y conservan la tabla de hoy:
  - **`users`:** `UserNotFoundError` → 404 y `EmailAlreadyTakenError` → 409. Los `Invalid*` caen en
    el 400 por defecto, y desaparece la rama que lo repetía.
  - **`orders`:** `CustomerGoneError` → `ForbiddenException('Forbidden')`, `OrderNotFoundError` →
    404 y `OrderVersionConflictError` → 409.
  - **`auth`:** `InvalidCredentialsError` → 401 y `EmailAlreadyRegisteredError` → 409.
    `InvalidPasswordHashError` e `InvalidCredentialIdError` dan un 500 saneado.
- `OrderResponseDto` publica `createdAt` y `updatedAt` (`type: String`, `format: 'date-time'`).
  `cancelledAt` sigue sin aparecer en un pedido colocado. Hay que actualizar el ejemplo del
  controller y los E2E.
- En el ejemplo del 200 de la cancelación, `updatedAt` vale lo mismo que `cancelledAt`, no que
  `createdAt`, porque eso es lo que produce `cancel(now)`. Si se copiara con spread desde
  `ORDER_EXAMPLE`, saldría lo contrario sin que Ajv lo detecte. Hay precedente en el ejemplo de
  `DELETE /users/:id` (`users.controller.ts:202-204`).

### Persistencia

- **Mappers:** `UserMapper.toDomain` y `OrderMapper.toDomain` pasan a usar `failClosed`.
  `CredentialMapper.toDomain` no lo usa (T8) y lee el id con `CredentialId.from(row.id)`.
- **Entidades ORM:** las fechas se declaran como en T9. En `orders`, `created_at` y `updated_at`
  sustituyen a `placed_at`, y se reescribe el comentario de cabecera.
- **Adaptador de `orders`:** el `UPDATE … WHERE version = v` escribe también `updated_at`.
- **Seed del admin (B9):** el `ON CONFLICT (user_id) DO UPDATE` de la credencial en
  `src/database/seeds/seed-admin.ts` gana `id = EXCLUDED.id`, el `randomUUID()` de su `VALUES`.
- **Migración:** `1786076763455-create-orders-and-outbox.ts` crea `orders` con
  `"created_at" timestamptz NOT NULL DEFAULT now()` y `"updated_at" timestamptz NOT NULL DEFAULT now()`
  en lugar de `placed_at`. No se crea ninguna migración nueva, y las demás, incluida
  `1790796856575-add-cancellation-to-orders.ts`, no cambian.

### Mensajería

Sin cambios: cada contexto tiene su outbox, el relay sigue siendo un CLI y el payload sigue siendo
el evento tal cual.

## 9. Contrato

No hay endpoints nuevos, ni se declara o retira ningún status. Esto es lo que cambia:

| Endpoint                                               | Código           | Antes                                                                                                   | Después                                                                   | Camino que lo produce                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⚠️ `POST /orders`                                      | 201              | el cuerpo lleva `placedAt`                                                                              | lleva `createdAt` y `updatedAt`                                           | `OrderResponseDto.fromDomain`                                                                                                                                                                                                                                                                                                                                                      |
| ⚠️ `POST /orders/:id/cancel`                           | 200              | el cuerpo lleva `placedAt`                                                                              | lleva `createdAt` y `updatedAt`; el doble cancel devuelve el mismo cuerpo | el mismo DTO, con `updated_at` persistido en el UPDATE                                                                                                                                                                                                                                                                                                                             |
| ⚠️ `GET /users`, `GET /users/:id`, `DELETE /users/:id` | de 400 a 500     | ante una fila corrupta, 400 con el valor y log `warn`                                                   | 500 y log `fatal` con el error                                            | `UserMapper.toDomain` → `failClosed` → `AllExceptionsFilter` (`all-exceptions.filter.ts:103-108`)                                                                                                                                                                                                                                                                                  |
| ⚠️ `POST /auth/register`                               | de 400 a 500     | si el perfil existente que lee la comprobación previa está corrupto, 400 `invalid-profile` con el valor | 500                                                                       | `CreateUserUseCase` → mapper → la fachada relanza lo que no es `UserDomainError` (`users.facade.ts:146-147`)                                                                                                                                                                                                                                                                       |
| ⚠️ `POST /auth/login`                                  | de 200/401 a 500 | una credencial cuyo id es un uuid válido pero no v4 funcionaba con normalidad                           | 500 saneado                                                               | `CredentialMapper.toDomain` → `CredentialId.from` → `InvalidCredentialIdError` → filtro de `auth`. Solo se alcanza con SQL externo. Todo id que escribe el sistema es v4: el alta (`CredentialId.generate()`), el seed (`randomUUID()`) y la copia de la migración de credenciales (`gen_random_uuid()`); la columna no tiene `DEFAULT`. Además, `UserId` ya rechaza hoy los no v4 |

El resto de cada contrato no cambia, y los 400 declarados siguen siendo alcanzables:

- `GET /users/:id` y `DELETE /users/:id`, por `UserId.from` del parámetro;
- `GET /users`, por `PaginationDto`;
- `POST /auth/register`, por el DTO y por un `invalid-profile` legítimo.

Ante una fila corrupta de `users`, `POST /auth/login` y la comprobación de cliente de `orders` ya
respondían 500, porque el error de `users` escapaba al filtro global. Siguen igual. En
producción, todos esos 500 llevan el cuerpo genérico.

## 10. Aspectos transversales

- **Errores:** `error-use-exception-filters` (T6) y `error-throw-http-exceptions`: el dominio no
  conoce HTTP.
- **Saneado de salida:** T8 y `failClosed` impiden que el dato de una fila corrupta llegue al
  cliente en un 4xx. El cuerpo genérico del 500 lo pone `AllExceptionsFilter`, que en producción
  sanea los `Error` que no son HTTP. No se cita `security-sanitize-output`, porque trata de XSS.
- **Logging:** `devops-use-logging`. Una fila corrupta pasa de un `warn` sin `err` a un `fatal`
  con el error.
- **Inyección de dependencias:** `di-use-interfaces-tokens` (los puertos siguen siendo
  `abstract class`) y `di-interface-segregation` (no hay repositorio genérico).
- **Base de datos:** `db-use-migrations` (la reescritura y `--check`) y `db-use-transactions` (el
  UPDATE con `updated_at` sigue en la misma transacción que el outbox).
- **Sin cambios:** el guard JWT, argon2, la validación, el throttling, los timeouts y la caché
  (`security-use-guards`, `security-validate-all-input`). En `auth` cambian su filtro, que gana
  una entrada (T8), y el seed del admin, que renueva el id de la credencial (B9).

## 11. Guardas del contrato

### Test de contrato (`module-contract.spec.ts`)

Es una función pura sobre `{ ruta POSIX → fuente }` que usa la API de TypeScript sin type-check,
con el mismo patrón que `language-scanner.ts:73-117`.

- **Contextos:** todo `src/modules/*` menos los de la lista cerrada `FLAT_MODULES = ['health']`. Si
  se descubrieran por tener `domain/`, la regla que exige `domain/` no podría fallar nunca.
- **Cortocircuito:** un contexto que falla `structure` no recibe el resto de comprobaciones.
- **Bases:** se resuelven por los imports de cada archivo: las del kernel tienen que venir de
  `@shared/domain/*` y la del filtro de `@common/*`. Así, un `class DomainError extends Error {}`
  declarado a mano no engaña al checker.
- **Claves:** son descriptivas, sin `R…`, porque CLAUDE.md pide ignorar las citas de filas de ese
  estilo.

| Clave                 | Exige                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structure`           | `<ctx>.module.ts`, `domain/`, `application/`, `infrastructure/` y `__tests__/`, cada carpeta con al menos un archivo                                                                                                                                                                                                                                                  |
| `errors`              | una sola raíz abstracta en `domain/errors/**/*.errors.ts` que extiende `DomainError`. Las demás clases exportadas descienden de ella, y esos archivos solo exportan clases                                                                                                                                                                                            |
| `filter`              | `infrastructure/http/<ctx>-domain-exception.filter.ts`, con una clase que `extends DomainExceptionFilter<Raíz>` y lleva `@Catch(Raíz)` con exactamente un argumento                                                                                                                                                                                                   |
| `controller-filter`   | cada `infrastructure/http/*.controller.ts` lleva `@UseFilters(<filtro del contexto>)`                                                                                                                                                                                                                                                                                 |
| `entities`            | una clase por `*.entity.ts` que extiende `Entity` o `AggregateRoot`, con constructor `private`, `static rehydrate` y un `toSnapshot()` de instancia                                                                                                                                                                                                                   |
| `value-objects`       | cada `*.vo.ts` extiende `ValueObject` o `UuidIdentifier`, no declara un constructor público y tiene su propio `static from`. Si extiende `UuidIdentifier`, su marca es el nombre de la clase                                                                                                                                                                          |
| `use-cases`           | una clase por archivo, cuyo único miembro público, aparte del constructor, es el método `execute`. Una propiedad flecha no cuenta como método; los métodos `private` o `#` están permitidos. El nombre debe emparejar `<X>UseCase` ↔ `<x>.use-case.ts` ↔ `export type <X>Input` ↔ `execute(input: <X>Input)`. Las dependencias del constructor no pueden ser públicas |
| `suffixes`            | en `domain/{entities,value-objects,errors}/` y `application/use-cases/`, todo archivo que exporta una clase lleva el sufijo de su carpeta. Las uniones `user-role.ts` y `order-status.ts` no exportan clases                                                                                                                                                          |
| `orm-relations`       | ningún `*.orm-entity.ts` usa `ManyToOne`, `OneToMany`, `OneToOne`, `ManyToMany`, `JoinColumn`, `JoinTable`, `RelationId`, `ForeignKey`, `Tree`, `TreeParent` ni `TreeChildren`, tampoco con alias ni con `import * as`                                                                                                                                                |
| `orm-managed-columns` | ningún `*.orm-entity.ts` usa `CreateDateColumn`, `UpdateDateColumn`, `DeleteDateColumn` ni `VersionColumn` (T9), con la misma detección que `orm-relations`                                                                                                                                                                                                           |

Hoy el contrato falla en diez líneas, que son la lista de trabajo del refactor. Ocho las midió un
prototipo en memoria; las dos de `orm-managed-columns` salen de leer las entidades ORM:

- `errors`: 3;
- `filter`: 3, una de ellas por el nombre del archivo de `users`;
- `entities`: 2, `User` y `Credential`;
- `orm-managed-columns`: 2, `user.orm-entity.ts` y `credential.orm-entity.ts`.

Límites: un contexto queda exento del todo o de nada (`FLAT_MODULES`), y `filter` exige un filtro
incluso a un contexto sin controllers.

### Cero claves foráneas en las migraciones

`src/database/__tests__/migration-conventions.spec.ts` gana un `describe('sin claves foráneas')`
que recorre todas las migraciones, sin corte por fecha. Busca dos cosas:

- en los literales SQL, `FOREIGN KEY` o `REFERENCES`, sin distinguir mayúsculas, como palabra
  completa (una columna `preferences` no cuenta) y aunque estén partidos en dos líneas;
- en la API de esquema, `createForeignKey(s)`, `TableForeignKey` y `foreignKeys:`.

Los comentarios de TypeScript no cuentan. Un comentario SQL dentro de la consulta sí, y falla en
cerrado. Las seis migraciones actuales pasan.

### Deriva de esquema en CI

Tras «Run migrations» se añade un paso que ejecuta
`pnpm migration:generate src/database/migrations/DriftCheck --check` con el mismo `DB_DATABASE`
que ese paso: la base de E2E, recién migrada. Sale con 1 si las entidades y el esquema no
coinciden.

## 12. Estrategia de tests

| Capa                                  | Herramienta                                                                                               | Qué prueba                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Kernel                                | Jest puro sin mocks; PBT con `fast-check` y arbitrarias construidas                                       | El nombre y el mensaje de `DomainError`. La tabla completa de `equals`, con dos clases que comparten id para matar el mutante de la comprobación de clase. `touch`. Las anclas de la regex. Mayúsculas → `value` en minúsculas, comprobado sobre `value` y no solo con `equals`. La marca, con `@ts-expect-error`. Objetivo de mutación: el 100 % del kernel |
| `common`                              | Unitario                                                                                                  | El filtro base con errores reales: gana la primera coincidencia, sin coincidencia da 400 y la base no lleva catch. `failClosed`: envuelve con el mensaje y el `cause` exactos y relanza intacto lo demás. El helper de ejemplos                                                                                                                              |
| Dominio y aplicación de los contextos | Las suites existentes, adaptadas, más specs 1:1 nuevas: `user.errors`, `auth.errors` y `credential-id.vo` | Las invariantes de B3 y B4, y que los no-ops no mueven `updatedAt`                                                                                                                                                                                                                                                                                           |
| Infraestructura que traduce           | Unitario                                                                                                  | Mappers: la fila corrupta de users da un `Error` con `cause`, el mensaje de orders no cambia y un id de credencial corrupto se trata como en T8. Filtros, incluido el 500 saneado del error nuevo de `auth`. El DTO y las claves del controller de orders                                                                                                    |
| Persistencia                          | E2E contra PostgreSQL                                                                                     | Repositorios con `createdAt` y `updatedAt`, `CredentialId`, y `updated_at` después de cancelar                                                                                                                                                                                                                                                               |
| HTTP                                  | E2E con Supertest                                                                                         | El cuerpo de orders; el doble cancel devuelve el mismo cuerpo; users responde 500 ante una fila corrupta. De este último solo se comprueba el status, porque en test el cuerpo es el mensaje envuelto                                                                                                                                                        |
| Arquitectura                          | Unitario                                                                                                  | El contrato de módulo, con filas «detector» sobre un contexto sintético `billing` y filas «árbol» sobre el repo real. Cero FKs                                                                                                                                                                                                                               |

### Garantías que se demuestran fallando sin su protección

| Garantía                                                          | Test                                                                                                                                                                                                                                                                                                                                                             | Cómo se ve el rojo                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada regla del contrato                                           | Una fila «detector» por regla, con un fixture que la viola                                                                                                                                                                                                                                                                                                       | Con el checker como stub (`() => []`), todas fallan por aserción. Después se rompe un módulo real, por ejemplo poniendo la raíz de `order.errors.ts` a `extends Error`, se ve su línea y se restaura |
| El descubrimiento de contextos                                    | Fila «árbol»: descubre al menos un contexto y deja fuera `health`, sin nombrar ningún módulo de ejemplo (el README permite quitarlos)                                                                                                                                                                                                                            | Con el lector como stub vacío, falla por aserción. Un `src/modules/billing/billing.module.ts` vacío produce cuatro líneas de `structure`                                                             |
| Cero FKs                                                          | El detector y el árbol de `migration-conventions`                                                                                                                                                                                                                                                                                                                | Un `REFERENCES` añadido a `1790796856575` pone rojo el árbol con su `archivo:línea`                                                                                                                  |
| El dominio es el dueño de `updatedAt`                             | E2E del repositorio de users: guardar con T0, `rename('Nombre Cambiado', T0)` (un nombre válido: `'X'` no pasa `assertName`), volver a guardar y comprobar que `SELECT name, "updatedAt"` da el nombre nuevo y T0. El `rename` va con T0: con otra hora, TypeORM escribiría el valor del dominio también con `@UpdateDateColumn` y el test no vería la regresión | Con `@UpdateDateColumn` de vuelta, la base escribe su propia hora                                                                                                                                    |
| `updated_at` se guarda al cancelar                                | E2E del repositorio de orders con instantes fijos (colocación ≠ cancelación), que es la guarda determinista. Segunda línea: en HTTP, el doble cancel devuelve el mismo cuerpo (`orders.e2e-spec.ts:242`), más una lectura de la fila; ahí el rojo depende de que las dos peticiones caigan en milisegundos distintos                                             | Quitar `updatedAt` del UPDATE                                                                                                                                                                        |
| El segundo `cancel` no mueve `updatedAt` (idempotencia)           | Las filas del doble cancel de `order.entity.spec.ts` y de `cancel-order.use-case.spec.ts`                                                                                                                                                                                                                                                                        | Con `touch(now)` movido encima de la guarda de idempotencia de `cancel`, `updatedAt` toma la hora del segundo cancel. Ningún mutante lo cubre: Stryker no reordena sentencias                        |
| Los ids no son intercambiables                                    | `@ts-expect-error` en la spec de `UuidIdentifier`                                                                                                                                                                                                                                                                                                                | Sin la marca, `pnpm typecheck` da TS2578 en el spec y TS6133 en la base (`TBrand` queda sin usar)                                                                                                    |
| Un id de credencial corrupto no se publica                        | Spec del filtro de `auth`: 500 saneado, sin el valor                                                                                                                                                                                                                                                                                                             | Sin su entrada en la tabla, cae en el 400 por defecto con el valor dentro                                                                                                                            |
| El seed deja operativo a un admin con id de credencial no v4 (B9) | E2E de `seed-admin`: id v1 puesto por SQL, seed, login 200 y un id nuevo v4                                                                                                                                                                                                                                                                                      | Sin `id = EXCLUDED.id`, el login responde 500                                                                                                                                                        |
| Anti-enumeración (L9), compensación (R10) y un solo hash (R11)    | Los tests existentes, sin tocar                                                                                                                                                                                                                                                                                                                                  | Siguen en verde                                                                                                                                                                                      |

La mutación es gate. Se ejecuta en tres pasadas:

- `pnpm test:mutation:changed 32ade98`;
- el kernel completo, con `--mutate "src/shared/domain/**/*.ts"`;
- la suite completa, anotando el censo en la cabecera de `stryker.config.mjs`.

## 13. Despliegue y entorno

- ⚠️ Cada desarrollador tiene que ejecutar `pnpm db:reset`, que borra el volumen local y migra las
  dos bases, y después `pnpm seed:admin` si necesita el admin. Sin el reset, TypeORM da la
  migración por aplicada y toda consulta de `orders` falla con un error de columna inexistente
  (`42703`) sobre `created_at`. El texto exacto depende de la sentencia, porque TypeORM pone alias
  a las columnas en los `SELECT`.
- La CI no necesita nada más: arranca un PostgreSQL limpio en cada ejecución.
- `migration:generate --check` se ejecuta antes de empezar, como línea base, y otra vez después del
  reset.
- El CHANGELOG marca como incompatibles (⚠️) el cambio de la API de `orders` y el reset.

## 14. Documentación que cambia

- **`CLAUDE.md`:**
  - las bases del kernel y el contrato verificado, en «Architecture rules»;
  - la línea 138: el filtro sobre la base, su nuevo nombre y `failClosed`;
  - «Database»: la regla de T9, sin columnas que TypeORM rellene por su cuenta;
  - «Orders», con `createdAt`/`updatedAt`;
  - «Auth», la viñeta de `pnpm seed:admin`: el rescate renueva también el id de la credencial (B9);
  - el alcance de Stryker, que debe incluir el kernel;
  - el cuarto sitio de los alias, `scripts/mutation-targets.mjs`.
- **`.claude/skills/clean-ddd-hexagonal/references/NESTJS-MAPPING.md`:**
  - §1: el árbol de la línea 43 y la descripción del kernel;
  - §3;
  - §5: el controller de ejemplo de las líneas 273 y 277;
  - §6, con la regla de T9;
  - §8, §9, §10 y §11.

  El ejemplo `billing` pasa a `billing-domain-exception.filter.ts`. Esta referencia es la fuente de
  verdad y será la plantilla del generador (B7): si la contradijera, un módulo copiado de ella
  pondría rojo el test de contrato.

- **`.claude/skills/clean-ddd-hexagonal/SKILL.md`** (el árbol y los nombres) y
  **`writing-plans/SKILL.md:144`**.
- **`README.md`:**
  - el árbol con `shared/domain/` y `common/`;
  - el nombre del filtro y los alias en cuatro sitios;
  - en «Quitar los módulos de ejemplo», que el test de contrato no necesita edición. Si se quitan
    los tres contextos, su fila de descubrimiento se pone roja hasta que exista uno propio.
- **Comentarios de código que nombran `UserDomainExceptionFilter`:**
  `src/common/dto/error-example.factory.ts:17`, `src/common/dto/error-response.dto.ts:26` y
  `users.controller.ts:51,165`.
- **`docs/architecture.md`:** el enlace al filtro renombrado (`:142` y `:450`) y dos secciones
  nuevas:
  - «El contrato de módulo»: el porqué de cada regla y lo que el análisis sintáctico no ve.
  - «Extraer un módulo a un servicio»:
    1. La puerta ajena se sustituye por un adaptador HTTP o RPC detrás del puerto que el consumidor
       ya tiene (`CustomerDirectory`, `UserDirectory`), sin tocar dominio ni aplicación.
    2. Las tablas se van con el módulo: no hay FKs y las entidades ORM ya están separadas por
       módulo. Las migraciones se separan.
    3. El relay del outbox pasa a publicar en un broker.
    4. Con HS256, cada servicio necesitaría el secreto; pasar a RS256/JWKS es otro cambio.
    5. `common/` pasa a ser un paquete compartido.
- **`docs/database.md`:** la excepción de la reescritura (B6), junto a su precedente; que cero FKs
  ya está verificado; los nombres de columna.
- **`docs/testing.md`:** el patrón de las guardas de arquitectura (detector, árbol y la rotura
  puntual que demuestra el rojo).
- **`docs/development-workflows.md:89`** (la fila «Bounded context nuevo») y el checklist §11 de
  `NESTJS-MAPPING`: el contrato en verde como condición.
- **`docs/backlog.md`:**
  - en #19, corregir el `.gitkeep` que no existe y «el kernel son dos archivos»;
  - en #31, `placedAt` pasa a `createdAt`;
  - tres entradas nuevas: `errorCode` aplazado, el generador como sub-proyecto y la unificación de
    los nombres de columna.
- **Menciones obsoletas de `UsersFacade`:** `auth.module.ts:27`, `orders.module.ts:18`,
  `users.controller.ts:72` y `eslint.config.mjs:177,208`.

## 15. Fuera de alcance

- El generador de módulos.
- `errorCode`.
- Unificar los nombres de columna (`NamingStrategy`).
- La lista blanca de externals del kernel (backlog #19b).
- La deuda 1:1 de `order-placed.event.ts` (backlog #30).
- Extraer de verdad un módulo.
- JWT con RS256/JWKS.
