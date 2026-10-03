# Arquitectura: el porqué de las reglas

Este documento guarda el porqué, las mediciones, los ejemplos y la historia de las reglas de tres
secciones de `CLAUDE.md`: [«Architecture rules»][claude-arch], [«Auth»][claude-auth] y
[«Orders»][claude-orders]. La regla vigente está en [`CLAUDE.md`][claude]: si este documento y
`CLAUDE.md` discrepan, gana `CLAUDE.md`.

## Rutas que colisionan

Regla ([CLAUDE.md, «Architecture rules»][claude-arch]): dos rutas que pueden coincidir con la
misma petición abortan el arranque.

`NEST_APP_OPTIONS`, en [`src/main.ts`][main] y compartido con `createTestApp()`, fija
`routeConflictPolicy: { duplicate: 'error', shadow: 'error' }`, así que cada E2E lo comprueba
también.

`shadow` es simétrico: `users/me` junto a `users/:id` falla en **cualquiera** de los dos órdenes,
incluido el que Express resolvería correctamente ([`src/__tests__/main.spec.ts`][main-spec] fija
los dos). Bajar `shadow` a `'warn'` es una decisión que se toma a sabiendas, no un arreglo.

## Puertos como clase abstracta

Regla ([CLAUDE.md, «Architecture rules»][claude-arch]): los puertos son `abstract class`, nunca
`type` + token `Symbol`.

Una clase sobrevive a la compilación, así que una sola referencia es a la vez el tipo del
contrato y su token de inyección: Nest acepta `Abstract<T>` como `InjectionToken` y SWC lo emite
en `design:paramtypes`.

El módulo cablea `{ provide: UserRepository, useClass: UserTypeOrmRepository }` y **ningún
consumidor necesita `@Inject`**. Sin sufijo `Port`: `UserRepository` no colisiona, y el
`Repository` de TypeORM solo aparece dentro del adaptador, con su propio import.

### Tres consecuencias, las tres muros de carga

#### Un puerto declara solo miembros `abstract` públicos

Ni campos, ni `protected`/`private`, ni constructor. Son dos prohibiciones con dos causas
distintas, ambas medidas con `tsc 6.0.3 --noEmit --strict`:

- Un **campo** (público, `protected` o `private`) o una **parameter property** hace que los fakes
  por objeto literal dejen de compilar (`TS2741`; hay un fake real en
  [`orders/__tests__/infrastructure/users-customer.directory.spec.ts`][customer-directory-spec]).
- Un **`protected constructor()` vacío compila sin problemas**: está prohibido por otro motivo.
  Los adaptadores hacen `implements` y nunca `extends`, así que el puerto nunca entra en su
  cadena de prototipos y ese constructor nunca se ejecuta. Es código muerto que promete una
  inicialización que nadie ejecuta, y la puerta por la que entran las parameter properties.

#### Los adaptadores hacen `implements`, nunca `extends`

`extends` gastaría el único hueco de herencia y exigiría un `super()` vacío para nada, y
`useClass` funciona exactamente igual de una forma que de la otra. `implements` es además lo
_único_ que comprueba la conformidad: `ClassProvider` no relaciona sus dos campos
(`provide: InjectionToken`, `useClass: Type<T>` con `T = any`), así que el archivo del módulo no
verifica nada: `{ provide: Port, useClass: ClassWithoutItsMethods }` compila.

#### Nunca `import type` de un puerto en un archivo con decoradores

Si un archivo con decoradores (casos de uso, adaptadores, módulos) importa un puerto con
`import type`, la referencia se elide, los metadatos no se emiten nunca y falla **en runtime**,
con `lint:check` **y** `typecheck` en verde:
`Nest can't resolve dependencies of the CreateUserUseCase (?, PasswordHasher)`.

Por eso [`eslint.config.mjs`][eslint-config] lo prohíbe bajo
`src/modules/*/{application,infrastructure}/**` en **las dos** formas que toma el borrado —la
declaración `import type { … }` _y_ el especificador mixto `import { VALUE, type Port }`, cuya
declaración tiene `importKind` igual a `"value"` y por eso necesita su propio selector—, desde
cualquier archivo de `ports/` **o** desde un `*.module` ajeno (que es donde viven `UsersLookup` y
`UsersProvisioning`, los únicos puertos entre módulos).

En los fakes de test es al revés: sin decoradores, `consistent-type-imports` _exige_
`import type`. La asimetría es real; el discriminante es «¿contiene este archivo un decorador?»:
con `emitDecoratorMetadata` activado, `consistent-type-imports` se salta esos archivos por
completo.

### Los controladores no tocan el repositorio

Regla ([CLAUDE.md, «Architecture rules»][claude-arch]): los controladores son adaptadores de
entrada (driver adapters), viven en `infrastructure/http/` y llaman a un caso de uso, nunca a un
repositorio.

La regla 6 de boundaries impide que `infrastructure/http/` importe un
`domain/ports/*.repository.ts`, cualquier cosa bajo `infrastructure/persistence/`, `typeorm` o
`@nestjs/typeorm` (desde el 2026-10-01; antes, solo lo decía la checklist de un revisor). La
raíz del módulo sigue cableando puerto y adaptador.

## Datos que viajan con un puerto

Regla ([CLAUDE.md, «Architecture rules»][claude-arch]): el `type` inline sigue siendo legal para
los datos que viajan con un puerto.

`UserPage`, `FindUsersCriteria`, `SignedToken`, `TokenClaims`, `DirectoryUser`,
`CreateProfileResult` y `UserSummary` no son inyectables, así que
`import { UserRepository, type UserPage } from '…'` es la forma correcta.

Esos siete nombres son una **lista cerrada dentro de la regla de lint**, porque nada en el punto
de importación distingue un puerto de sus datos: el selector de especificadores falla cerrado,
así que un puerto marcado `type` por accidente se pone rojo él solo, y un tipo de datos nuevo de
verdad cuesta una línea revisada en [`eslint.config.mjs`][eslint-config].

Tres archivos importan _solo_ datos de este tipo desde un archivo de `ports/` y no pueden usar la
forma inline (`no-import-type-side-effects` la rechaza): [`jwt-auth.guard.ts`][jwt-guard],
[`authenticated-user.dto.ts`][authenticated-user-dto] y
[`registered-account-response.dto.ts`][registered-account-dto]. Los tres llevan un
`eslint-disable-next-line` justificado que lo dice. El discriminante es real, no un resquicio:
ninguno de ellos inyecta un puerto.

## Un caso de uso por archivo

Regla ([CLAUDE.md, «Architecture rules»][claude-arch]): un caso de uso por archivo, entrada
incluida. [`application/use-cases/create-user.use-case.ts`][create-user] contiene
`CreateUserUseCase` **y** su `export type CreateUserInput`.

No hay `commands/`, ni `queries/`, ni `handlers/`: una clase comando cuyo único trabajo era
llevar tres posicionales a `execute()` aportaba un archivo, un import y un `new` por cada punto
de llamada, y ningún invariante. La entrada es la firma del caso de uso, no una pieza
reutilizable.

Las entradas son `type` planos, **nunca** clases con `class-validator`: la regla 2 de boundaries
prohíbe esa librería en `application/`, y la validación del transporte es trabajo del DTO HTTP.
El controlador llama a `execute({ email: dto.email, … })`, lo que además elimina la clase de bugs
de los argumentos posicionales.

- **El método sigue siendo `execute()`**: una sola operación pública, con el mismo nombre en
  todos los casos de uso.
- **[`users.facade.ts`][users-facade] se queda suelto en `application/`**, fuera de
  `use-cases/`: es la puerta pública del contexto para los demás módulos, no una intención de un
  usuario del sistema. Su superficie crece por método, no por archivo.

## Errores y modelos

Reglas ([CLAUDE.md, «Architecture rules»][claude-arch]): la validación vive en los DTO HTTP,
nunca en las entidades de dominio; dos modelos, nunca uno; los errores de dominio no son errores
HTTP.

- **Validación.** El dominio impone sus invariantes mediante constructores y value objects.
- **Dos modelos.** La entidad de dominio ([`user.entity.ts`][user-entity]) es una clase plana
  con invariantes; la entidad ORM ([`user.orm-entity.ts`][user-orm-entity]) lleva los
  decoradores de TypeORM. Un mapper es el único puente. No se decora la entidad de dominio con
  `@Entity` para ahorrarse un archivo: eso acopla el dominio a la base de datos.
- **Errores de dominio.** El dominio lanza `UserNotFoundError`, y
  [`infrastructure/http/user-domain-exception.filter.ts`][user-exception-filter] decide que es
  un 404. `HttpException` no se importa nunca en `domain/` ni en `application/`.

## Auth

Reglas en [CLAUDE.md, «Auth»][claude-auth].

### Un contexto propio, dueño de la credencial

**Regla:** `auth` es un bounded context propio ([`src/modules/auth/`][auth-dir]) y es dueño de
la credencial.

Lo es desde el refactor del ciclo 4: el hash de la contraseña vive en `auth_credentials`, su
propia tabla, y `users` ya no sabe qué es una contraseña. JWT HS256 vía `@nestjs/jwt`; argon2id
vía `argon2` con parámetros de coste explícitos (`ARGON2_PARAMS` en
[`src/config/auth.config.ts`][auth-config], una sola fuente compartida por el hasher y el seed
del admin).

La separación es lo que hace real la costura entre los dos contextos: `users` es dueño del
**perfil** (identidad, nombre, rol, si está activo) y `auth`, de la **credencial** y del token.
La dependencia va `auth → users`, y solo en ese sentido: `auth` consume `UsersLookup` y
`UsersProvisioning` a través de [`users.module.ts`][users-module], como cualquier otro módulo.
Si `users` importara alguna vez `auth.module`, el repo tendría su único ciclo módulo↔módulo
posible, y esa es exactamente la razón por la que `@Public`, `@Auth`, `@CurrentUser` y
`AuthenticatedUser` se quedan en `common/`, donde los ven los dos.

### El registro es `POST /auth/register`

**Regla:** el registro es `POST /auth/register`, no `POST /users`.

Lo que nace en un alta es una **cuenta** —perfil _y_ credencial—, así que el endpoint pertenece
al contexto dueño de la credencial. `POST /users` ya no existe; `CreateUserUseCase` sobrevive con
`{ email, name }` y su único consumidor es la fachada.

### Dos escrituras sin transacción distribuida: compensación

**Regla:** el registro hace dos escrituras sin transacción distribuida, así que compensa.

`RegisterAccountUseCase` hashea la contraseña, crea el perfil a través de `UsersProvisioning` y
después escribe la credencial. Si la escritura de la credencial falla, borra **las dos** filas
—primero `deleteProfile`, después `credentials.deleteByUserId`— y relanza el error.

El perfil va primero porque es la garantía prioritaria: un perfil huérfano nunca podría iniciar
sesión _y_ bloquearía su propio email a través del índice único, mientras que una credencial
huérfana es basura silenciosa que no choca con nada.

Borrar también la credencial es el backlog #14. Antes del ciclo 4 el hash era una
columna de `users` y se iba con la fila; con una tabla aparte y **cero claves foráneas en todo
el esquema** (a propósito no se reintroducen: los dos contextos pueden dejar de compartir base de
datos), una credencial cuyo INSERT se confirmó mientras la respuesta se perdía se quedaba para
siempre.

Ese camino necesita un commit que el llamante nunca ve, así que **ningún E2E puede alcanzarlo**
sin un commit fuera de banda (`dblink`): un `RAISE` en cualquier trigger aborta la transacción y
se lleva la fila con ella. Lo cubre R10 en
[`register-account.use-case.spec.ts`][register-account-spec] con el fake, que puede separar
«escribió» de «respondió». [`auth.e2e-spec.ts`][auth-e2e] sigue forzando el fallo de la segunda
escritura con un trigger `BEFORE INSERT` que lanza un error, y comprueba que las dos tablas
terminan vacías.

### `POST /auth/register` revela si un email está ocupado

**Regla:** `POST /auth/register` revela si un email está ocupado, y es una decisión escrita
(backlog #15, cerrado el 2026-08-08).

El 409 **se queda**: sin él, quien ya tiene una cuenta no puede saber por qué falla el alta. Lo
que se cerró es la fuga por **tiempo**, que era indefendible porque delataba la cuenta incluso a
un cliente que ignorase el código de estado.

La contraseña se hashea ahora **antes** de la comprobación de unicidad, así que los dos caminos
pagan argon2id. Medido por HTTP contra PostgreSQL real, las medianas de 409 frente a 201 pasaron
de 7.52 ms / 91.47 ms (rangos disjuntos, 12.2×) a 79.61 ms / 90.82 ms (solapados, 1.14×).
Los ~11 ms residuales son los INSERT extra del camino de éxito, no el hash.

La fila R11 lo fija estructuralmente —`hash()` exactamente una vez en los dos caminos—, igual
que L9 fija `verify()` en el login, y los dos comentarios se referencian entre sí.

### La puerta de aprovisionamiento devuelve resultados

**Regla:** la puerta de aprovisionamiento devuelve resultados, nunca excepciones, para los
rechazos de negocio.

`createProfile` responde `{ ok: false, reason: 'email-taken' | 'invalid-profile' }` porque `auth`
no puede importar las clases de error de `users`. `invalid-profile` lleva el mensaje del dominio:
`@IsEmail` acepta cadenas que `Email.from()` rechaza, y `@MinLength(2)` mide el nombre sin
recortar. Sin esa rama, esas entradas, que hoy son un 400, se habrían convertido en un 500 en
cuanto el alta salió de `users`.

### Guard global, seguro por defecto

**Regla:** `JwtAuthGuard` ([`src/modules/auth/infrastructure/http/jwt-auth.guard.ts`][jwt-guard])
se registra como `APP_GUARD` desde `auth.module`, no desde `app.module`.

La regla 3 de boundaries prohíbe que la raíz de la app importe las partes internas de un módulo,
y `APP_GUARD` es un multi-provider: registrarlo desde cualquier módulo lo hace global. Un
endpoint nuevo sin `@Public()` exige un JWT válido sin que su autor tenga que hacer nada.

### `@Public()` y el límite de peticiones de auth

**Regla:** `@Public()` ([`src/common/decorators/public.decorator.ts`][public-decorator]) se salta
el guard por completo.

Se usa en health, `POST /auth/register` y `POST /auth/login`, y ninguno de los tres puede exigir
un token que todavía no hay forma de obtener. Los dos endpoints de auth llevan el mismo
`@Throttle` de 10/min (declarado en la clase); `ThrottlerGuard` construye la clave por clase **y
por handler**, así que tienen contadores separados.

### `@Auth(...roles)`, el único decorador de roles

**Regla:** `@Auth(...roles)` ([`src/common/decorators/auth.decorator.ts`][auth-decorator]) es el
único decorador de roles: `@Auth()` significa cualquier usuario autenticado; `@Auth('admin')`,
solo ese rol (403 en otro caso).

También adjunta la documentación OpenAPI que el guard de contrato exige en los endpoints
protegidos —bearer + 401, más 403 cuando se dan roles—, así que la protección y su documentación
no pueden desalinearse.

### `@CurrentUser()` y `AuthenticatedUser`

**Regla:** `@CurrentUser()`
([`src/common/decorators/current-user.decorator.ts`][current-user-decorator]) inyecta los claims
que `JwtAuthGuard` adjuntó a `request.user`, tipados como `AuthenticatedUser`
([`src/common/auth/authenticated-user.ts`][authenticated-user]).

`AuthenticatedUser` es un tipo suelto que se puede compartir entre módulos sin violar la matriz
de boundaries. `@CurrentUser()` lanza si la ruta es `@Public()`.

### `JWT_SECRET` sin valor por defecto en un despliegue real

**Regla:** `JWT_SECRET` no tiene valor por defecto fuera de `development`/`test`.

Un `refine()` en [`env.schema.ts`][env-schema] impide que staging/production arranquen sin él,
así que un token nunca puede firmarse con el valor por defecto público de desarrollo en un
despliegue real.

### Primer admin: `pnpm seed:admin`

**Regla:** `pnpm seed:admin` ([`src/database/seeds/seed-admin.ts`][seed-admin]) es idempotente:
crea el admin si `ADMIN_EMAIL` todavía no existe y, si existe, lo deja **operativo**: rol
`admin`, `active = true` y un hash nuevo.

Reactivarlo no es un detalle: este seed es el rescate documentado para cuando la única cuenta de
admin se desactiva por error, y `LoginUseCase` rechaza a un usuario inactivo con el mismo
`InvalidCredentialsError` que una contraseña errónea. Sin reactivarlo, el seed imprimiría
`promoted` y el login seguiría respondiendo 401, de forma indistinguible.

Escribe **las dos tablas dentro de un único `dataSource.transaction`**, con
`ON CONFLICT (user_id) DO UPDATE` en la credencial para que promover un perfil que ya existía le
dé una.

Necesita `ADMIN_EMAIL` y `ADMIN_PASSWORD`, las dos o ninguna, cosa que impone otro `refine()`.
Las dos aceptan solo lo que acepta `POST /auth/login` (backlog #34): los límites de
la contraseña viven en [`src/config/password-policy.ts`][password-policy], `env.schema.ts`
comprueba `ADMIN_*` con las mismas funciones de class-validator que `LoginDto`, y ningún otro
archivo de producción escribe 12 o 128 a mano.

### Login anti-enumeración

**Regla:** `LoginUseCase` lanza el mismo `InvalidCredentialsError` para un email inexistente, un
**perfil sin credencial**, una contraseña errónea y un usuario inactivo, y siempre llama a
`hasher.verify()` exactamente una vez.

Cuando no hay credencial real que comprobar, la llamada va contra un hash ficticio pregenerado,
así que los cuatro caminos cuestan el mismo tiempo. El cuarto camino es nuevo: con dos dueños, un
perfil sin credencial es un estado alcanzable.

Es un requisito **medido**: una fila de propiedad en [`login.use-case.spec.ts`][login-spec]
comprueba error indistinguible _y_ exactamente un `verify` en los cuatro.

### La normalización del email vive en `users`

**Regla:** la normalización vive en `users`, una sola vez; `auth` pasa la cadena en bruto.

`findByEmail` pasa el email por el mismo `Email.from` que usa el alta y devuelve `null` (nunca
lanza) para uno mal formado, así que una errata es un 401, no un 400 que distinguiría «mal
escrito» de «desconocido».

### `AuthenticatedUserDto`, gemelo de `UserResponseDto`

**Regla:** `AuthenticatedUserDto` es un gemelo deliberado de `UserResponseDto`.

Ningún contexto puede importar el DTO del otro, y el contrato publicado no debe cambiar porque el
login haya cambiado de módulo. [`authenticated-user.dto.spec.ts`][authenticated-user-dto-spec]
sella la paridad comparando los metadatos `@ApiProperty` reales de las dos clases, incluidos los
valores del enum `role` que `users` deriva de `USER_ROLES` y `auth` escribe a mano.

## Orders

Reglas en [CLAUDE.md, «Orders»][claude-orders].

`orders` es el segundo bounded context ([`src/modules/orders/`][orders-dir]), con dos casos de
uso: hacer un pedido (`POST /orders`, `@Auth()`; es el primer consumidor real de
`@CurrentUser()`: `customerId` sale del `sub` del token, nunca del body) y cancelarlo
(`POST /orders/:id/cancel`, `@Auth()`, 200 con el pedido). Ejercita las tres costuras que un solo
contexto no puede ejercitar.

### Entre módulos, por la puerta pública segregada por intención

**Regla:** entre módulos, solo por las puertas de [`users.module.ts`][users-module], segregadas
por intención: el adaptador de `CustomerDirectory` inyecta `UsersLookup`, y es el tipo —no la
matriz de boundaries, que razona por ruta— lo que deja `deleteProfile` fuera de `orders`.

`orders` define el puerto `CustomerDirectory`; su adaptador inyecta `UsersLookup`, que
`users.module.ts` registra, exporta al contenedor de DI y **re-exporta como símbolo TS**. El
archivo del módulo es la única superficie legal entre módulos, y como la puerta es una
`abstract class`, esa única re-exportación publica a la vez el token y el tipo.

Hay **dos** puertas así desde el backlog #13: `UsersLookup` (`userExists`,
`findByEmail`) y `UsersProvisioning` (`createProfile`, `deleteProfile`), con un único
`UsersFacadeImpl` detrás de las dos vía `useExisting`. La `UsersFacade` única, de cuatro
métodos, le entregaba a `orders` un `DELETE` físico que nunca pidió, sobre un esquema con cero
claves foráneas. La matriz de boundaries no puede ver eso —razona por ruta, y este import es
exactamente el que legalizó la enmienda G2—, así que el tipo es el único control que lo ve, y lo
hace en tiempo de compilación: `orders` no puede escribir `deleteProfile` porque lo que inyecta
no lo declara.

La matriz permite `module-infrastructure`/raíz del módulo → `*.module.ts` ajeno desde la
enmienda de orders (casos G1-G4 en la suite del gate). `auth` se convirtió en el segundo
consumidor de esa misma puerta en el ciclo 4, con `UserDirectory`, y necesitó **cero** reglas
nuevas: los comodines ya lo cubrían, cosa verificada volviendo a ejecutar sin cambios la suite
del gate. La separación del #13 tampoco necesitó reglas nuevas, por la misma razón: cambia la
superficie publicada, no las fronteras.

Un usuario desactivado conserva un JWT válido hasta que caduca: `orders` vuelve a consultar el
directorio en cada pedido nuevo y en cada cancelación, y traduce `CustomerGoneError` a 403 en su
propio filtro, con la excepción construida con una cadena (mensaje canónico).

### Eventos de dominio

**Regla:** `Order.place()` emite `OrderPlaced` y `Order.cancel()` emite `OrderCancelled`; los dos
se acumulan y `pullEvents()` los vacía.

El caso de uso entrega los eventos al repositorio **en la misma llamada `save(order, events)`**:
la firma del puerto los lleva para que la atomicidad sea trabajo del adaptador. El payload del
outbox es el evento tal cual, expandido con un spread, así que un campo nuevo en un evento llega
a los consumidores: el E2E del adaptador fija los dos payloads con un `toEqual` exacto.

### Cancelación: idempotente, solo del dueño, con versión optimista

**Regla:** la cancelación es idempotente y solo del dueño, con versión optimista.

Dos estados, `placed` → `cancelled`, sin ventana de tiempo.

**Idempotente.** `cancel()` sobre un pedido cancelado es un no-op en el dominio —200 con el
`cancelledAt` original, sin segundo evento— y el caso de uso solo guarda cuando el agregado
produjo eventos.

**Solo del dueño.** El pedido de otro cliente lanza el mismo `OrderNotFoundError`, con el mismo
mensaje, que uno inexistente: 404 en los dos casos. El dueño entra **en la lectura**
(`findByIdAndCustomer`), no en una comparación posterior: una fila ajena nunca llega al mapper
que falla cerrado, cuyo 500 ante una fila corrupta delataría, si no, que el pedido existe.

**Versión optimista.** El agregado lleva la `version` con la que se **leyó** (0 = nunca
guardado); el adaptador inserta las filas nuevas con versión 1 y escribe el resto con
`UPDATE … WHERE version = v`, y 0 filas afectadas lanza `OrderVersionConflictError` dentro de la
transacción, así que el outbox también hace rollback. Un INSERT cuyo id ya existe (`23505`) es el
mismo conflicto, y solo ese código: cualquier otro fallo del INSERT se propaga sin traducir, cosa
que un E2E fija forzando un `22021`.

**Un solo reintento, y ningún 409 publicado.** `CancelOrderUseCase` reintenta **una vez**, y solo
ante `OrderVersionConflictError`: el perdedor de un doble clic vuelve a leer un pedido cancelado y
recibe 200 con el `cancelledAt` del ganador. Con dos estados no puede darse un segundo conflicto
—la única escritura sobre un pedido existente es una cancelación—, así que **el contrato no
publica ningún 409**; el filtro lo sigue mapeando, como defensa que un tercer estado haría
alcanzable (y entonces se declara).

**READ COMMITTED, pedido de forma explícita.** Ese reintento necesita READ COMMITTED —bajo
REPEATABLE READ o SERIALIZABLE, el perdedor bloqueado recibe un `40001` que nadie reintenta—,
así que el adaptador **lo pide explícitamente** (`transaction('READ COMMITTED', …)`) en vez de
heredar lo que tengan por defecto el servidor, la base de datos o el rol. El E2E del adaptador
lo demuestra de forma determinista: otra conexión retiene el bloqueo de la fila, se ve el save
esperando en `pg_blocking_pids` y solo entonces el rival hace commit; repite el entrelazado a
través de una conexión cuyo valor por defecto es SERIALIZABLE.

**El mapper falla cerrado.** Un `status` desconocido, un status que no concuerda con
`cancelled_at` o una `version` menor que 1 lanzan al leer.

**`cancelledAt` se omite.** En un pedido `placed`, `cancelledAt` se **omite**, no vale `null`:
una elección de diseño, no una restricción. Medido con el Ajv del guard de contrato (8.20.0):
`nullable: true` junto a un `type` explícito sí acepta `null`; lo que rompe el build es
`nullable` junto a un `$ref` sin `type` (un DTO anidado), que Ajv se niega a compilar. Solo ahí
es obligatorio omitir la clave.

### Outbox transaccional

**Regla:** `OrderTypeOrmRepository.save` escribe el pedido y sus filas de `orders_outbox` dentro
de un único `dataSource.transaction`.

El relay es un CLI (`pnpm outbox:relay`, [`src/database/outbox/`][outbox-dir]; un módulo no
puede importar `database`, la misma razón por la que el seed vive ahí): publica las filas
pendientes (hoy, un log estructurado) y las marca, con semántica at-least-once (al menos una vez).
Cuando llegue BullMQ (Tier 2), solo cambia el publicador.

[claude]: ../CLAUDE.md
[claude-arch]: ../CLAUDE.md#architecture-rules
[claude-auth]: ../CLAUDE.md#auth
[claude-orders]: ../CLAUDE.md#orders
[main]: ../src/main.ts
[main-spec]: ../src/__tests__/main.spec.ts
[customer-directory-spec]: ../src/modules/orders/__tests__/infrastructure/users-customer.directory.spec.ts
[eslint-config]: ../eslint.config.mjs
[jwt-guard]: ../src/modules/auth/infrastructure/http/jwt-auth.guard.ts
[authenticated-user-dto]: ../src/modules/auth/infrastructure/http/dto/authenticated-user.dto.ts
[registered-account-dto]: ../src/modules/auth/infrastructure/http/dto/registered-account-response.dto.ts
[create-user]: ../src/modules/users/application/use-cases/create-user.use-case.ts
[users-facade]: ../src/modules/users/application/users.facade.ts
[user-entity]: ../src/modules/users/domain/entities/user.entity.ts
[user-orm-entity]: ../src/modules/users/infrastructure/persistence/user.orm-entity.ts
[user-exception-filter]: ../src/modules/users/infrastructure/http/user-domain-exception.filter.ts
[auth-dir]: ../src/modules/auth/
[auth-config]: ../src/config/auth.config.ts
[users-module]: ../src/modules/users/users.module.ts
[register-account-spec]: ../src/modules/auth/__tests__/application/use-cases/register-account.use-case.spec.ts
[auth-e2e]: ../src/modules/auth/__tests__/auth.e2e-spec.ts
[public-decorator]: ../src/common/decorators/public.decorator.ts
[auth-decorator]: ../src/common/decorators/auth.decorator.ts
[current-user-decorator]: ../src/common/decorators/current-user.decorator.ts
[authenticated-user]: ../src/common/auth/authenticated-user.ts
[env-schema]: ../src/config/env.schema.ts
[seed-admin]: ../src/database/seeds/seed-admin.ts
[password-policy]: ../src/config/password-policy.ts
[login-spec]: ../src/modules/auth/__tests__/application/use-cases/login.use-case.spec.ts
[authenticated-user-dto-spec]: ../src/modules/auth/__tests__/infrastructure/http/dto/authenticated-user.dto.spec.ts
[orders-dir]: ../src/modules/orders/
[outbox-dir]: ../src/database/outbox/
