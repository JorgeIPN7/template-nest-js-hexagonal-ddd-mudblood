# Base de datos y migraciones

Este documento guarda el porqué, las mediciones, la historia y el ejemplo trabajado de las reglas
de base de datos y migraciones de `CLAUDE.md`, las de sus secciones
[«Database»](../CLAUDE.md#database) y
[«Destructive migrations: expand/contract»](../CLAUDE.md#destructive-migrations-expandcontract).
La regla vigente está en `CLAUDE.md`: si este documento y `CLAUDE.md` discrepan, gana
`CLAUDE.md`.

## Configuración

Las reglas de esta sección están en `CLAUDE.md`, «Database»; aquí va cada una con su porqué.
PostgreSQL a través de TypeORM: la configuración vive en
[`src/config/database.config.ts`](../src/config/database.config.ts) y el cableado, en
[`src/database/`](../src/database/).

- **`synchronize` se resuelve en código, no se toma del entorno.** `DB_SYNCHRONIZE` solo puede
  _apagarlo_; _encenderlo_ exige además `NODE_ENV=development`. Fuera de `development` se fuerza
  a `false` diga lo que diga el `.env`, porque `synchronize` puede borrar columnas y datos. Ver
  `resolveSynchronize()`.
- **Los cambios de esquema pasan por migraciones.** Después de cambiar una entidad ORM se ejecuta
  `pnpm migration:generate src/database/migrations/<Name>` y luego `pnpm migration:run`. En
  producción, `DB_MIGRATIONS_RUN=true` las aplica al arrancar: antes de escribir una que **borre
  o renombre** algo, lee
  [«Destructive migrations: expand/contract»](../CLAUDE.md#destructive-migrations-expandcontract)
  en `CLAUDE.md`; el porqué está en las secciones siguientes.
- **Las entidades ORM se descubren por glob** (`*.orm-entity.ts` en cualquier punto bajo
  `src/modules/`), así que un módulo nuevo se registra solo, sin una lista central que editar.
- **TLS:** `DB_SSL=false` en local, `true` contra RDS. `DB_SSL_REJECT_UNAUTHORIZED=false` cifra
  pero **no** verifica la identidad del servidor: es preferible apuntar `DB_SSL_CA` al bundle de
  AWS.
- **Los errores del driver se traducen en el adaptador.**
  [`UserTypeOrmRepository.save()`](../src/modules/users/infrastructure/persistence/user.typeorm.repository.ts)
  convierte el `23505` de PostgreSQL en `EmailAlreadyTakenError`, así que una inserción
  concurrente sale como 409 y no como 500. La comprobación previa del handler es una cortesía, no
  la defensa.

## Expand/contract: el ejemplo trabajado

Regla (CLAUDE.md, «Destructive migrations: expand/contract»): toda migración que borra o
renombra una columna o una tabla se parte en dos —expand y contract— con el despliegue del
código en medio. Nunca en el mismo release.

### Qué contiene cada paso

| Paso           | Contiene                                                                                                                           | Seguro mientras las réplicas viejas sirven tráfico |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Expand**     | `CREATE TABLE` / `ADD COLUMN`, índices, la copia de los datos y `DROP NOT NULL` sobre todo lo que el código nuevo deja de escribir | Sí — de eso se trata                               |
| _(despliegue)_ | La versión nueva se despliega hasta que no queda **ninguna** réplica de la vieja                                                   | —                                                  |
| **Contract**   | La sentencia destructiva sola: `DROP COLUMN`, `DROP TABLE`, la segunda mitad de un renombrado                                      | **No**                                             |

### Las dos migraciones reales

Sacar el hash de la contraseña de `users` (ciclo 4) es el ejemplo trabajado, y son dos archivos
reales:

- [`src/database/migrations/1786210289581-move-credentials-to-auth-expand.ts`](../src/database/migrations/1786210289581-move-credentials-to-auth-expand.ts):
  crea `auth_credentials` y su índice único, copia cada hash **con el `createdAt`/`updatedAt` del
  perfil** y quita el `NOT NULL`.
- [`src/database/migrations/1786210349581-move-credentials-to-auth-contract.ts`](../src/database/migrations/1786210349581-move-credentials-to-auth-contract.ts):
  todo su `up()` es un único `ALTER TABLE "users" DROP COLUMN "password_hash"`.

Fue **una sola** migración hasta el 2026-08-08 y se partió a posteriori (backlog #12): un
template no puede publicar una regla que su único ejemplo incumple, y partirla salió gratis
porque nunca se había desplegado en ningún sitio.

### El `DROP NOT NULL` del expand es parte del patrón

No es limpieza. Durante la ventana, el código nuevo inserta perfiles sin nombrar nunca
`password_hash`, así que la columna no recibe valor y el `NOT NULL` rechaza la fila.

Verificado midiendo, no razonando (backlog #12): con la restricción repuesta a mano sobre el
esquema en estado expand, `POST /auth/register` respondió 500 con
`null value in column "password_hash" of relation "users" violates not-null constraint`; sin
ella, los 23 tests que tenía entonces
[`auth.e2e-spec.ts`](../src/modules/auth/__tests__/auth.e2e-spec.ts) pasaron contra ese mismo
esquema.

Simétricamente, el código viejo sigue leyendo y escribiendo la columna, que todavía conserva sus
datos. **Una columna que el código nuevo deja de escribir tiene que perder su `NOT NULL` en el
expand, o el expand tampoco es sobrevivible.**

### El par de `down()` refleja la partición

El `down()` del contract vuelve a añadir la columna como **nullable** y la rellena desde la tabla
nueva; el `down()` del expand rellena lo que todavía falte, restaura el `NOT NULL` y borra la
tabla nueva.

La comprobación de precondición que nombra los perfiles que no se pueden restaurar, en vez de
dejar que PostgreSQL diga `contains null values`, vive en el `down()` del **expand**, porque el
único de los dos que restaura un `NOT NULL` es ese. En el `down()` del contract, un perfil sin
credencial queda simplemente a NULL, que ahí es legal.

### Lo que el patrón no arregla aquí, dicho sin adornos

Regla (CLAUDE.md, «Destructive migrations: expand/contract»): durante la ventana, cada versión no
ve lo que escribe la otra; cuando eso no es asumible, se añade un trigger de doble escritura
(dual-write). En este ejemplo, lo que cada versión no ve son las altas de la otra.

Durante la ventana, una cuenta creada por el código nuevo no tiene `users.password_hash`, así que
el código viejo no puede autenticarla (y al revés con las cuentas creadas por las réplicas
viejas). Cerrar eso necesita un trigger de doble escritura (dual-write), que es lo que se añade
cuando la ventana no puede permitirse perder altas. Aquí la ventana es un despliegue y el coste
es un reintento.

### Migraciones aditivas

Las migraciones aditivas (`CREATE TABLE`, `ADD COLUMN`) no necesitan expand/contract: el código
viejo ignora lo que no conoce. Aun así, dos reglas siguen valiendo para ellas, y ninguna de las
dos se ve en la suite de tests — las dos rompen el despliegue:

- **Una columna `NOT NULL` añadida lleva `DEFAULT`** (se desarrolla justo debajo).
- **Cada `up()` y `down()` empieza con `SET LOCAL lock_timeout = '5s'`** (se desarrolla en
  [«El límite de espera de los locks»](#el-límite-de-espera-de-los-locks)).

#### Una columna `NOT NULL` añadida lleva `DEFAULT`

En una tabla con filas, `ADD COLUMN … NOT NULL` a secas falla con `contains null values`; en una
vacía funciona, y entonces falla cada `INSERT` de las réplicas viejas, que no nombran la columna.
La base de E2E queda vacía tras cada `TRUNCATE`, así que la suite no ve ninguno de los dos
fallos. El ejemplo es
[`1790796856575-add-cancellation-to-orders.ts`](../src/database/migrations/1790796856575-add-cancellation-to-orders.ts).

## Migraciones al arrancar

Regla (CLAUDE.md, «Destructive migrations: expand/contract»): elige una de las dos salidas de
abajo y escribe en la cabecera de la migración cuál elegiste.

**⚠️ `DB_MIGRATIONS_RUN=true` ejecuta las migraciones pendientes cuando arranca el proceso — es
decir, en el primer pod nuevo, con todas las réplicas viejas todavía sirviendo.** Un expand ahí
no da problemas; un contract en ese modo borra la columna en el peor instante posible y tumba
las réplicas viejas (ver
[«Por qué un `DROP COLUMN` rompe todas las lecturas»](#por-qué-un-drop-column-rompe-todas-las-lecturas)).

Las dos salidas:

1. **Publicar el contract en un release posterior** (recomendada). Nada que operar, ningún humano
   en el bucle, y el despliegue del release del expand está terminado, de forma demostrable,
   antes de que empiece el siguiente.
2. **Mismo release con `DB_MIGRATIONS_RUN=false`**, y después `pnpm migration:run` a mano cuando
   termine el despliegue. Más barata en tiempo de calendario; necesita a alguien al teclado en el
   momento justo. Una ventana de mantenimiento programada es esta misma opción con el tráfico
   cortado.

## Por qué un DROP COLUMN rompe todas las lecturas

**Un `DROP COLUMN` es peor de lo que parece: TypeORM enumera cada columna mapeada en cada
`SELECT` — nunca emite `SELECT *`.** Medido en este repositorio con `DB_LOGGING=true`:

```sql
SELECT "UserOrmEntity"."id" …, "UserOrmEntity"."updatedAt" … FROM "public"."users"
```

Así que, desde el instante en que la columna desaparece, **toda lectura de esa tabla** falla en
el código viejo, no solo los caminos que la usaban. Para `users` eso es:

- `POST /auth/login`
- `GET /users`
- `GET /users/:id`
- `DELETE /users/:id`
- `POST /orders`, que consulta el directorio de clientes en cada pedido.

El `INSERT` también enumera, que es el mismo hecho visto desde el otro lado y la razón por la que
el `DROP NOT NULL` del expand es obligatorio (ver
[«El `DROP NOT NULL` del expand es parte del patrón»](#el-drop-not-null-del-expand-es-parte-del-patrón)).

## El límite de espera de los locks

Regla (CLAUDE.md, «Destructive migrations: expand/contract»): cada `up()` y cada `down()` empieza
con `SET LOCAL lock_timeout = '5s'`. Es la segunda de las dos reglas que siguen valiendo para las
migraciones aditivas (ver [«Migraciones aditivas»](#migraciones-aditivas)).

`ALTER TABLE` toma `ACCESS EXCLUSIVE`. Con `DB_MIGRATIONS_RUN=true`, una espera sin límite detrás
de cualquier sesión que tenga la tabla (`idle in transaction`, un informe largo, `pg_dump`)
impide que el pod nuevo arranque y deja encoladas detrás de ella todas las consultas de las
réplicas viejas sobre esa tabla. Con el límite, falla con `55P03` y el arranque reintenta
(`@nestjs/typeorm` reintenta `initialize()` 9 veces, con 3 s de separación).

Medido el 2026-10-01 contra la base de test: con otra sesión que retiene `orders`,
`migration:run` aborta con `canceling statement due to lock timeout` al cabo de ~5 s, en vez de
quedarse esperándola.

`migration:generate` no escribe esa sentencia, así que
[`src/database/__tests__/migration-conventions.spec.ts`](../src/database/__tests__/migration-conventions.spec.ts)
falla con una migración que la olvide (las anteriores a la cancelación son de antes de la regla).
