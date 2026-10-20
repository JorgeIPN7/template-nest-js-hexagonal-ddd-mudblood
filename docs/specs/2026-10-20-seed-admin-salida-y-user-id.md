# La salida de `seed:admin` y el `users.id` que no es v4 — spec exprés

**Fecha:** 2026-10-20 · **Contexto:** `database` (seed del admin, de `auth`) · **Commit base:** `89d65c3`
· **Backlog:** #40 y #41, con su criterio del 2026-10-19, que no se reabre.

## Objetivo

Que `pnpm seed:admin` no imprima nunca el hash del admin cuando falla, que `DB_LOGGING=true` no
imprima los parámetros de ninguna consulta, y que el seed no declare `promoted` a un admin cuyo
`users.id` no es v4, porque ese admin sigue sin poder entrar.

## Decisiones

### Del usuario (2026-10-20)

- **U1. #41 comprueba el v4 con la regex en el seed, no con `UserId.from`.** El criterio pedía
  `UserId.from`, pero el seed no puede importarlo: la frontera solo deja a `database` importar
  `database` y `config` (eslint: `boundaries/dependencies`), y `pnpm seed:admin` corre con ts-node
  sin alias (`Cannot find module '@shared/domain/uuid-identifier.base'`). La regex es la de
  `UuidIdentifier`, copiada con un comentario que explica por qué no se importa. Si el dominio
  cambiara de versión de uuid, el seed fallaría con su mensaje, nunca en silencio.
- **U2. `DB_LOGGING` se resuelve con un logger de TypeORM que nunca imprime parámetros**, no con
  un aviso: también cubre `POST /auth/register`, que inserta un hash por cada alta.
- **U3. Un PR con dos commits,** uno por entrada y verde cada uno: una sola pasada de paridad con
  la CI.

### Técnicas (mías)

- **T1. El formateo vive en su propio archivo,** `src/database/seeds/format-seed-error.ts`, y no
  en `seed-admin.ts`: importar el seed carga `data-source.ts`, que lee el `.env` y valida el
  entorno al importarse, y el test unitario no debe depender de eso.
- **T2. Formato:** el mensaje y, si existe, `(código <code>)`. Solo se acepta un `code` de texto,
  porque los dos emisores reales usan texto: PostgreSQL (SQLSTATE) y Node (`ECONNREFUSED`). Un
  valor lanzado que no es un `Error` se convierte con `String()`, que nunca vuelca sus propiedades.
  Que el `message` de un `ZodError` del entorno no repite la contraseña se comprobó el 2026-10-20
  con el esquema real.
- **T3. El E2E de #40 lanza el CLI real** con ts-node (en modo `transpileOnly`) como proceso hijo y
  lee su salida. Probar solo la función no demostraría que el bloque CLI la usa. La escritura se
  fuerza a fallar con un `CHECK … NOT VALID` temporal sobre `auth_credentials` que rechaza los
  hashes argon2id: así el error lleva el hash a la vez en `detail` («Failing row contains…») y en
  `parameters`. Se puede hacer DDL porque los E2E corren con `maxWorkers: 1`.
- **T4. La comprobación de #41 va justo después del `SELECT`, antes de cualquier escritura,** y
  lanza un `Error` con un mensaje explícito. La transacción no llega a escribir nada.
- **T5. El logger es una subclase de `AdvancedConsoleLogger`** que pasa `undefined` como
  parámetros a `logQuery`, `logQueryError` y `logQuerySlow`, y el error como `String(error)`, sin
  `detail`. TypeORM devuelve tal cual una instancia en `logger` (`LoggerFactory.create`), así que
  el logger lee `logging` del objeto de opciones en cada llamada. _Corrección tras la revisión:_
  con el valor del constructor, `pnpm migration:show` salía con 0 sin listar nada, porque cada
  comando de la CLI fija su `logging` con `setOptions` (un `Object.assign` sobre ese objeto). Solo
  adopta valores verdaderos, como `setOptions`, para que `migration:generate` y `schema:log` sigan
  imprimiendo con `DB_LOGGING=true`. Por eso `data-source.ts` usa `Object.assign` y no un spread.
- **T6. `.env.example` lo edita el usuario:** el `settings.json` global deniega a los agentes
  `Read(.env.*)` y `Edit(.env.*)`.

## Casos acordados

No hay `domain/` ni `application/`: los casos son del seed (de `auth`) y del formateo.

### `formatSeedError` (unitario)

| #   | Caso (se vuelve el it)                                                                            | Entrada / estado                                               | Resultado                          |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| F1  | debería devolver solo el mensaje y el código de un error de la base                               | `Error` con `message`, `code: '23514'`, `detail`, `parameters` | `'<message> (código 23514)'`       |
| F2  | debería no dejar el hash argon2id en la salida aunque el error lo lleve en detail y en parameters | el error de F1, con `$argon2id$…` en `detail` y `parameters`   | la salida no contiene `$argon2id$` |
| F3  | debería devolver solo el mensaje cuando el error no trae código                                   | `new Error('sin conexión')`                                    | `'sin conexión'`                   |
| F4  | debería convertir a texto un valor lanzado que no es un Error, sin volcar sus propiedades         | `{ detail: '$argon2id$…' }`                                    | `'[object Object]'`                |
| P1  | debería devolver siempre exactamente el mensaje y el código, sea cual sea el resto del error      | mensaje, código y propiedades extra construidos                | `'<message> (código <code>)'`      |

### `seedAdmin` (E2E)

| #   | Caso (se vuelve el it)                                                                                                  | Entrada / estado                                                           | Resultado                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| E1  | debería terminar con código 1 y sin el hash en la salida cuando falla la escritura de la credencial                     | CLI real con `DB_LOGGING=true`; `CHECK` temporal que rechaza `$argon2id$%` | salida 1; stderr con `[seed:admin] failed:` y `(código 23514)`; stdout con el INSERT; ni stdout ni stderr con `$argon2id$` |
| E2  | debería fallar con un mensaje explícito, sin tocar auth_credentials ni el perfil, cuando el users.id del admin no es v4 | perfil con id v1 `3f2504e0-…`, rol `user`, inactivo y con credencial       | rechaza con el mensaje de abajo; perfil y credencial idénticos a antes                                                     |

Mensaje de E2: `seed:admin: el users.id del admin (<id>) no es un uuid v4 y el login respondería
500. No se renueva como el de la credencial porque orders.customer_id lo referencia por valor:
corrígelo con SQL. No se ha escrito nada.`

### Logger e infraestructura (tests, sin tabla)

- `parameter-free-logger.spec.ts`: `logQuery`, `logQueryError` y `logQuerySlow` con un hash en los
  parámetros (y en el `detail` del error) imprimen la consulta y no el hash. Con `logging: false`,
  `logQuery` y `logQueryError` no imprimen nada; `logQuerySlow` imprime siempre, porque TypeORM no
  lo condiciona a `logging`. Sigue un `logging` que cambia tras construirlo, salvo a `false`.
- `typeorm-options.spec.ts`: `logger` es un `ParameterFreeLogger` y respeta `config.logging`.
- `data-source.spec.ts`: tras el `setOptions({ logging: ['schema'] })` de `migration:show`, el
  logger del `DataSource` de la CLI imprime.

## Contrato y persistencia

- **Contrato:** sin endpoints nuevos ni cambiados; el documento OpenAPI no cambia.
- **Persistencia:** sin migración.

## Fuera

- **`outbox:relay` también imprime el error entero** con `console.error`. Sus parámetros son ids y
  payloads de pedidos, no credenciales: si se quisiera tapar, iría en una entrada aparte.
- **Un `message` de PostgreSQL puede citar un valor**, como el de `invalid input syntax for type
uuid`. El criterio del 2026-10-19 imprime el `message` igualmente, y la columna del hash es de
  texto, así que ese error nunca lo lleva.
- **Con la base parada, la salida pierde el host y el puerto.** Node lanza un `AggregateError` con
  el `message` vacío, y el CLI imprime `[seed:admin] failed:  (código ECONNREFUSED)` (medido el
  2026-10-20). Imprimir los mensajes de sus `errors` se sale del «solo `message` y `code`» del
  criterio: queda como propuesta en el backlog, #42.

## Estado

- [x] Commit 1 — #40: `formatSeedError`, el CLI y `ParameterFreeLogger`.
- [x] Commit 2 — #41: la comprobación del v4.
