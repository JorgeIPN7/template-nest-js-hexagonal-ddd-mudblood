# Backlog técnico

Trabajo aplazado **con criterio**, no olvidado. Cada entrada dice qué se decidió, por qué se
aplazó y cuál es el camino ya elegido, para que quien lo retome no vuelva a abrir la discusión
desde cero.

El repositorio no tiene remoto, así que este archivo hace de gestor de incidencias. Al añadir uno,
mantén las tres secciones: **Qué pasa**, **Criterio ya decidido** y **Cómo se sabrá que está hecho**.

---

## 1. El 503 de `/health` sale con el sobre estándar, no con el formato de Terminus

**Qué pasa.** `HealthCheckService.check()` lanza una `ServiceUnavailableException` cuando un
indicador falla, y `AllExceptionsFilter` la captura y reescribe el cuerpo al sobre estándar del
repositorio. El resultado es que un 200 de health sale en formato nativo de Terminus (sin envelope,
porque el controller lleva `@SkipTransform()`) mientras que el 503 sale envuelto. Dos formatos para
el mismo endpoint según el resultado.

Hoy el contrato publicado **documenta lo que de verdad se envía** —el sobre— así que no hay mentira
en la documentación. Lo que hay es una asimetría que sorprende a quien consume el endpoint.

**Criterio ya decidido.** Reutilizar el mecanismo de `@SkipTransform()`
(`src/common/decorators/skip-transform.decorator.ts`, un `Reflector.createDecorator<boolean>`) en el
filtro de excepciones, en lugar de inventar un segundo mecanismo paralelo. Ya existe, ya está
probado y ya expresa exactamente esta idea: «este handler no pasa por el tratamiento estándar».
Añadir un `@SkipErrorEnvelope` independiente duplicaría el concepto.

**Ahora sí se autoprotege — pero no lo hacía cuando se escribió este ticket.** Al redactarlo se
comprobó que no existía ningún test que fijara el formato del 503: el único `503` de la suite era un
`HttpException('Boom', 503)` genérico, sin relación con health ni con Terminus. El guardián del
contrato tampoco tapaba el hueco, porque compara el ejemplo con el esquema y ambos se declaran en el
mismo controller: cambiar el comportamiento sin tocar el controller lo dejaba **verde publicando algo
falso**.

Ese hueco ya está cubierto. `all-exceptions.filter.spec.ts` tiene un bloque
`catch() with a Terminus health failure` que fija el sobre actual. Está verificado por mutación:
sustituyendo el `reply` del filtro por uno que devuelve el cuerpo de Terminus crudo, tres de sus
cuatro tests se ponen rojos. El cuarto documenta el tipo de `error` y pasa en ambos mundos — está
anotado en el propio archivo para que nadie lo confunda con la red.

Al cerrar este ticket, por tanto, se romperán a propósito. Eso es la señal, no un daño colateral:
obligan a actualizar los ejemplos del 503 en `health.controller.ts` en el mismo cambio.

**Cómo se sabrá que está hecho.** Un 200 y un 503 del mismo endpoint salen con el mismo formato, y
los ejemplos del 503 en `health.controller.ts` —que hoy describen el sobre— se actualizan en el
mismo cambio.

---

## 2. Validar el documento contra el meta-esquema de OpenAPI

**Qué pasa.** El guardián comprueba tres cosas —ejemplo ↔ factoría, factoría ↔ filtro, y ejemplo ↔
esquema con Ajv— pero ninguna valida el **documento entero** contra el meta-esquema oficial de
OpenAPI. Un documento puede tener todas sus operaciones bien formadas y aun así ser inválido como
documento: `components` mal referenciados, un `$ref` roto, un `servers` con forma incorrecta.

Se midió durante la migración que Ajv en `strict: true` no sirve para esto tal cual: rompe con
`components` y con `example`, y en ninguno de los dos modos honra `nullable`. Es decir, el control
actual no cubre lo que este ticket pide, y no se puede conseguir subiéndole el rigor al que ya hay.

**Criterio ya decidido.** Es el **requisito previo** para subir el documento a OpenAPI 3.1. Migrar
sin este control es cambiar de versión a ciegas: 3.1 alinea el esquema con JSON Schema 2020-12 y
cambia el tratamiento de `nullable`, `exclusiveMinimum` y los `example`. Sin validación del
documento completo, la migración se descubriría rota en el cliente de alguien.

**Cómo se sabrá que está hecho.** El guardián valida el documento generado contra el meta-esquema
publicado de la versión que declare `openapi:`, y falla con la ruta JSON del nodo inválido. Una vez
verde, subir a 3.1 pasa a ser una tarea acotada en vez de una apuesta.

---

## 3. El limitador de intentos comparte contador cuando hay un proxy delante

**Qué pasa.** `AttemptLimiter` (Basic Auth de la documentación) cuenta intentos por `req.ip`. Con un
reverse proxy delante y `TRUST_PROXY=0`, `req.ip` es la IP del proxy: todos los clientes caen en el
mismo contador. Lo que se degrada es la **disponibilidad** —cualquiera puede dejar sin documentación
al resto quemando el contador— no la protección, porque quien ataca se auto-limita.

Esto ya lo sufre el `ThrottlerGuard`, que también trackea por `req.ip`. La Basic Auth no crea el
problema: lo extiende a una superficie sensible.

Hay un aviso observable al arrancar
([`openapi.ts`](../src/bootstrap/openapi.ts)) cuando se combinan Basic Auth y `TRUST_PROXY=0`. Es un
`warn` y no un error a propósito: la combinación es perfectamente legítima en local. **El aviso no
arregla nada** — sirve para que quien despliegue detrás de un proxy lo note al arrancar en vez de
seis meses después.

Hay un segundo frente, independiente del proxy: el contador vive en un `Map` en memoria del proceso.
Con más de una instancia, cada réplica cuenta por su cuenta y el límite efectivo se multiplica por el
número de réplicas.

**Criterio ya decidido.** Se aplazó porque atacar solo la Basic Auth sería incoherente: el
`ThrottlerGuard` tiene exactamente el mismo defecto sobre una superficie mayor. La decisión correcta
es tratar los dos a la vez, con un almacenamiento compartido (`ThrottlerStorageService` respaldado
por Redis) y una política de `trust proxy` documentada para el despliegue real. Resolver medio
problema aquí crearía la ilusión de que está cubierto.

**Trigger decidido (2026-08-04, spec del roadmap).** Se ejecuta cuando cualquier entorno pase de
una réplica. En el mismo movimiento entra la caché (`@nestjs/cache-manager` v6 + Keyv sobre
Redis, rule `perf-use-caching`) para no hacer dos oleadas de infraestructura.

**Cómo se sabrá que está hecho.** Con dos instancias detrás de un proxy, el contador es común y
`req.ip` refleja al cliente y no al balanceador.

---

## 4. Las fronteras de módulo y de capa son convención: nada las verifica

**Resuelto (2026-08-04, plan `2026-08-04-module-boundaries.md`).** Las cinco reglas corren en
`pnpm lint:check` vía `eslint-plugin-boundaries` 7.1.0 + un bloque nativo que prohíbe barrels
en `src/`; la matriz vive en `eslint.boundaries.js` y su suite de 23 casos + 1 propiedad en
`src/__tests__/eslint-boundaries.spec.ts` (contrato acordado en el plan). El criterio de cierre
se cumplió tal como estaba escrito: un `@nestjs/common` en `domain/` y un internal ajeno rompen
el lint — demostrado por la suite con la config real. El número se conserva porque otras
entradas y `stryker.config.mjs` referencian esta numeración.

---

## 5. El template no trae autenticación

**Resuelto (2026-08-05, plan `2026-08-05-auth-roles.md`).** El alcance creció sobre el criterio
original por decisión del usuario en la ronda de diseño: el «sin roles» quedó **superado** —
entraron roles `admin`/`user` con `@Auth()` (patrón de su referencia bridge-fital adaptado a
seguro-por-defecto). Guard JWT global registrado desde `users.module` (la matriz de boundaries
impide hacerlo desde app.module), `@Public()` en health/login/registro, login anti-enumeración
con hash dummy del puerto, argon2id con parámetros en config, `JWT_SECRET` sin default fuera de
development/test, y primer admin por `pnpm seed:admin` idempotente. Contrato: 25 casos en tres
tablas (spec `docs/specs/2026-08-05-auth-minimal-design.md`); el contract guard ahora verifica
401/403/bearer contra la metadata real, y el gate de boundaries ganó 4 filas (argon2/@nestjs/jwt
fuera de domain y application).

**Actualización (2026-08-07, ciclo 4 del refactor de arquitectura): `auth` dejó de vivir dentro
de `users` y es un bounded context propio que POSEE la credencial.** El «login es un caso de uso
de users» de la entrada original queda superado por decisión del usuario. El hash se mudó de la
columna `users.password_hash` a la tabla `auth_credentials` (par de migraciones
`MoveCredentialsToAuthExpand` + `MoveCredentialsToAuthContract` desde que la #12 lo partió; una
sola migración `MoveCredentialsToAuth` hasta entonces), el alta pública pasó de `POST /users` —que
desaparece— a `POST /auth/register`, y el `APP_GUARD` lo registra ahora `auth.module`. La
consistencia entre los dos contextos NO es transaccional: el registro compensa borrando el
perfil si la credencial no puede escribirse, y hay un E2E que lo fuerza con un trigger. La
`UsersFacade` creció a cuatro métodos (`userExists`, `createProfile`, `findByEmail`,
`deleteProfile`) y devuelve resultados —nunca excepciones— para los rechazos de negocio, porque
`auth` no puede importar los errores de `users`. El gate de boundaries siguió verde **sin
enmiendas**: los wildcards de `eslint.boundaries.js` ya cubrían un módulo nuevo, tal y como
prometía su comentario de cabecera.

---

## 6. Ni la CI ni el pre-commit tienen gates de seguridad

**Resuelto (2026-08-06, plan `2026-08-06-supply-chain.md`).** Las tres piezas del criterio:
secretlint 13.0.4 (preset recommend con `enableIDScanRule: true` — los access key IDs `AKIA…`
no se detectan de serie, decisión JIT tras el spike de la Task 1) como entrada catch-all `"*"`
del lint-staged existente, con `--maskSecrets` para no imprimir el secreto al rechazarlo y suite
gate `src/__tests__/secretlint.spec.ts` (Tabla S: 5 rechazos + 3 anti-falso-positivo, 1:1
caso↔`it`, ejercitando la config real igual que `eslint-boundaries.spec.ts`); `pnpm audit --prod
--audit-level=high` tras el install de CI; `trivy-action@v0.36.0` sobre `nest-base-template:ci`
con `severity: HIGH,CRITICAL` + `ignore-unfixed` + `exit-code: 1` tras el build de Docker. El
bloqueo local se verificó sin commitear (Task 3): con una AWS access key sintética staged,
`pnpm exec lint-staged` falla nombrando secretlint. Los steps de CI quedan config-ready como el
resto de `ci.yml`: corren —y el DoD «un CVE high o una imagen vulnerable los pone rojos» se
ejercita— cuando el repo tenga remoto, igual que la entrada de gitleaks (historial completo,
descartado en local por ser binario Go que cada dev instalaría aparte — y que además hará de
red bajo el bypass local: `git commit --no-verify` salta el hook, gitleaks en CI no) y
Renovate, que siguen esperando ese trigger.

**El gate de audit cazó un CVE real al primer disparo en local, antes de que exista CI que lo
ejecute.** `pnpm audit --prod --audit-level=high` salió con exit 1: `js-yaml@5.2.1` (High, ReDoS,
GHSA-pm4m-ph32-ghv5) vía `@nestjs/swagger@11.4.6` en dependencias de producción, upstream sin
parche — 11.4.6 es la última versión de `@nestjs/swagger` a esta fecha y sigue declarando
`js-yaml@5.2.1`; el fix vive en `js-yaml>=5.2.2`. Remediado con un override **scoped al path y con
techo de caret**, `'@nestjs/swagger>js-yaml': '^5.2.2'` en `pnpm-workspace.yaml` — el porqué de
ambas decisiones (por qué no global, por qué el caret no es decorativo) vive en el comentario de
ese mismo override, no se repite aquí. Con el override aplicado, `pnpm audit --prod
--audit-level=high` vuelve a exit 0. Es la mejor evidencia posible de que el gate funciona: no se
quedó config-ready para un CVE hipotético, encontró uno real en el propio árbol el primer día que
corrió.

**Actualización (2026-08-06) — piezas de archivo dejadas config-ready antes de que exista
remoto**, adelantándose al día en que se cree el repositorio en GitHub (paso humano aparte):

- **Pin por SHA de las actions de `ci.yml`: HECHO.** `checkout@v5`, `pnpm/action-setup@v4`,
  `setup-node@v5`, `upload-artifact@v4` y `trivy-action@v0.36.0` pasaron de tag a
  `owner/repo@<sha> # v<tag>`, con los cinco SHA verificados contra la API de GitHub el
  2026-08-06. La política completa (por qué un SHA y no un tag, cómo bumpear) queda
  documentada una sola vez, en el propio `ci.yml` junto a `permissions:` — `security.yml` la
  referencia con un puntero en vez de repetirla. El orden de los steps de `ci.yml` no cambió
  — solo las líneas `uses:` y los comentarios nuevos.
- **`.github/workflows/security.yml`: CREADO, config-ready.** Gitleaks sobre el **historial
  completo** (`fetch-depth: 0`), la pieza que sí necesitaba remoto de verdad: un hook local
  solo puede ver lo que está `staged`, nunca el pasado del repositorio, y además
  `git commit --no-verify` lo salta — el workflow no tiene ese atajo. Corre en push/PR a
  `main` y semanalmente (`cron: '17 4 * * 1'`), para cazar secretos que entraron antes de que
  existiera el gate local de secretlint. Licencia: gratuito en repos personales; uno de
  organización necesitaría `GITLEAKS_LICENSE` en secrets — documentado en el propio workflow,
  sin configurar todavía porque depende de bajo qué cuenta nazca el remoto.
- **`renovate.json`: CREADO, config-ready.** `extends: ["config:recommended", ":semanticCommits",
":pinAllExceptPeerDependencies"]` — semantic commits produce `chore(deps): …`/`fix(deps): …`,
  ambos válidos contra `commitlint.config.cjs` (tipos `chore`/`fix`, scope `deps`, ya en la
  lista cerrada). `:pinAllExceptPeerDependencies` fija `rangeStrategy: "pin"` para **todo**
  `matchPackageNames: ["*"]` salvo `engines`/`peerDependencies`, que quedan en `"auto"` — cubre
  cada dependencia de cada manager, `Dockerfile` incluido: `FROM node:22.22.1-alpine` pasará a
  fijarse por digest en la primera PR de Renovate, mismo espíritu que el pin por SHA de arriba.
  Por esa cobertura total, un `rangeStrategy` propio a nivel raíz del archivo sería config
  muerta — cualquier `packageRule` que matchee (y esta matchea todo) siempre gana sobre el
  default raíz — así que no se añadió uno. `labels: ["dependencies"]` clasifica cada PR para
  triage; `lockFileMaintenance.enabled` añade una PR periódica que solo refresca las
  transitivas de `pnpm-lock.yaml`, sin tocar ningún rango declarado — eso ya lo decide el resto
  de la config.
  **Guardado de `pnpm-workspace.yaml`:** ese archivo no se deja en manos de Renovate
  (`packageRules` con `matchFileNames: ["pnpm-workspace.yaml"]` y `enabled: false`). Se
  verificó (2026-08-06, no un supuesto) que Renovate **sí** sabe extraer `overrides` de
  `pnpm-workspace.yaml` desde una release reciente (PR `renovatebot/renovate#42247`, cerrando
  el issue #36834) — la vieja certeza de que "no toca overrides de pnpm" ya no aplica tal
  cual. Cada entrada de ese archivo — el pin de `typescript`, el retiro de `swagger-ui-dist`,
  y sobre todo el override scoped `'@nestjs/swagger>js-yaml': '^5.2.2'` que cerró el CVE de
  este mismo ticket — es una decisión curada a mano con su razonamiento en el comentario; una
  PR automática que la reescribiera sin ese contexto sería peor que no tener Renovate ahí. Se
  desactiva el archivo entero, no solo la fila de `js-yaml`, porque las tres entradas
  comparten el mismo criterio. Ese guardado tapa además un acoplamiento que no es específico
  de Renovate: el override de `typescript` no lleva scope, así que congela también la copia
  que ve `pnpm typecheck` por encima de la `devDependency typescript` de `package.json` —
  esa sí la gestiona Renovate. Sin el guardado, una PR que bumpeara solo la `devDependency`
  quedaría inerte en silencio; la advertencia completa vive ahora en el comentario del propio
  override, en `pnpm-workspace.yaml`.
  `config:recommended` añade un Dependency Dashboard (issue de GitHub) — informativo, no
  requiere acción hoy.
- **Retiro del override de `js-yaml`:** sigue pendiente de que `@nestjs/swagger` publique una
  versión que ya traiga el fix — sin cambios sobre lo ya registrado arriba.
- **SARIF de trivy → pestaña Security/code-scanning: sigue diferido, con condición nueva
  además del trigger de remoto.** Esa pestaña requiere repo **público** o GitHub Advanced
  Security — el repo nacerá **privado**, así que subir el SARIF no serviría de nada hasta que
  (si alguna vez) se haga público. `trivy-action` sigue fallando la build por su cuenta
  (`exit-code: 1`) sin necesidad de la pestaña; lo que se pierde mientras tanto es solo el
  historial navegable de hallazgos, no el gate.
- Dos falsos rojos operacionales a vigilar el primer día de CI real (sin cambios): `pnpm audit`
  depende del endpoint de audit del registry (caída → rojo sin CVE) y trivy descarga su DB de
  `ghcr.io`, donde el `TOOMANYREQUESTS` en runners compartidos es notorio — v0.36.0 trae
  mitigaciones (`cache`, `TRIVY_DB_REPOSITORY`).

Lo único que de verdad espera al remoto ahora es **activar** lo ya escrito: crear el
repositorio, instalar la app de Renovate, y confirmar que `security.yml` corre en el primer
push. Cierra el Tier 1 del roadmap.

---

## 7. Métricas: `prom-client` con `/metrics`

**Qué pasa.** No hay series temporales — request-id y Pino cubren los logs, pero latencia,
throughput y heap a lo largo del tiempo no se pueden consultar.

**Criterio ya decidido.** `prom-client` con endpoint `/metrics`. Su spec decidirá la exposición
(¿fuera del prefijo global? ¿protegido?) — la misma familia de decisiones ya tomada con
`/health`. **Trigger: el primer entorno observado con Prometheus/Grafana.** Sin ese trigger el
endpoint es código muerto. OpenTelemetry completo quedó descartado (ver «Cerrado al
verificarlo»); esta pieza cubre lo observable de un monolito.

**Cómo se sabrá que está hecho.** `curl /metrics` responde en formato Prometheus y un dashboard
del entorno que activó el trigger lo consume.

---

## 8. BullMQ para trabajo en background

**Qué pasa.** No hay mecanismo de jobs — y hoy tampoco hay ningún caso que lo necesite.

**Criterio ya decidido.** BullMQ (rule `micro-use-queues`) cuando aparezca el **primer caso real**
de trabajo en background (emails, reportes, imports pesados). Depende de Redis (entrada #3).
No se adelanta: YAGNI.

**Cómo se sabrá que está hecho.** El primer job real corre sobre BullMQ con su E2E propio, en
vez de un `setTimeout` artesanal.

---

## 9. Stryker en CI incremental, cuando haya remoto

**Resuelto (2026-08-06, sin plan propio — cambio de config + CI + docs, sin lógica de negocio;
es la excepción explícita a la cadena `brainstorming → writing-plans` que las entradas #4, #5 y
#6 sí siguieron, porque el criterio de esta entrada ya estaba cerrado y solo faltaba el dato).**
La mutación deja de ser una corrida manual por ciclo y pasa a ser gate:
`thresholds.break: 85` en `stryker.config.mjs` y un job propio `mutation` en `ci.yml`
(config-ready como el resto; sin PostgreSQL —`mutate` cubre solo `domain/` y `application/`,
que se ejercitan con la config unitaria— y con su propio `timeout-minutes`, para no retrasar el
feedback de lint/typecheck). El reporte HTML sube como artifact con `if: always()`: es lo único
que hace accionable un rojo, y el momento en que más se necesita es justo cuando el step falló.

**El umbral se fijó con datos, como decía el criterio.** Baseline del 2026-08-06 sobre el scope
completo (ambos contextos), copiado de la salida de Stryker: **90.14 %** global — 192 killed,
0 timeout, 19 survived, 2 sin cobertura, 5 error (score = detectados/válidos = 192/213);
`users` 92.11 % (140/152), `orders` 85.25 % (52/61). El margen de `break: 85` no se lee de la
lista de porcentajes: cada módulo pesa por su número de mutantes, no por su score. `users`
aporta el 71 % de los mutantes válidos, así que le bastaría caer a ~84.9 % para tumbar el
global él solo, mientras que `orders` —el de score más bajo hoy— tendría que desplomarse a
~67 %. La amenaza más cercana al umbral es una regresión en el módulo grande, y 85 la deja a
7 puntos: suficiente para no dar rojos por ruido, poco para que un módulo nuevo sin casos entre
sin romper nada. Los 19 supervivientes están analizados con sus casos **propuestos** en los
planes de auth y orders, nunca añadidos en silencio: al aprobarse esas filas el score sube, el
margen crece, y entonces —solo entonces— tiene sentido subir el umbral.

El baseline anterior (2026-08-04, spike, 91.89 % con solo `users`) queda como referencia
histórica: sus hallazgos —`user.errors.ts` al 20 % porque los tests verifican el tipo del error
y no el mensaje, las dos regex que sobreviven al quitar el ancla `$`, los `toString()` sin
cobertura— siguen vivos y son parte de esos 19.

**Diferido al remoto (lo único que queda):** el modo `--incremental` sobre los módulos tocados
por el PR. Hoy el job muta el scope completo, que con dos contextos tarda ~1 min; cuando el
árbol crezca lo suficiente para que eso moleste, `--incremental` es la salida ya identificada.
Se sabrá que está hecho cuando un PR que solo toca un módulo no pague el coste de mutar los
demás.

---

## 10. Dispatcher residente para el outbox de `orders`

**Qué pasa.** El relay del outbox es una CLI manual (`pnpm outbox:relay`,
`src/database/outbox/relay-orders-outbox.ts`): publica en stdout las filas con
`processed_at IS NULL` y las marca, at-least-once, sin `FOR UPDATE SKIP LOCKED` porque es un
proceso único que un humano lanza. En cuanto haya un consumidor real, ese modelo se queda
corto: nadie ejecuta CLIs cada minuto en producción.

**Criterio ya decidido.** El dispatcher residente llega con BullMQ (#8), no antes — un daemon
propio sería un background job y BullMQ está condicionado al trigger de Tier 2 que el usuario
ordenó no adelantar. El diseño del relay ya lo anticipa: la publicación es una línea (el
`console.log`), así que el cambio es sustituir el publicador y mover la ejecución a un worker;
la tabla, la transacción del `save` y la semántica at-least-once no se tocan. Si el dispatcher
pasa a ser concurrente, ahí sí entra `FOR UPDATE SKIP LOCKED`.

**Cómo se sabrá que está hecho.** Los eventos de `orders_outbox` se publican sin intervención
humana, el relay CLI queda como herramienta de operación (reprocesos), y un E2E demuestra que
un evento insertado acaba consumido sin ejecutar `pnpm outbox:relay` a mano.

---

## 11. Un token sobrevive a la desactivación de su dueño

**Qué pasa.** `JwtAuthGuard` verifica firma, expiración y el `role` **acuñado en el token**;
nunca comprueba que el sujeto siga vigente. Con `JWT_EXPIRES_IN_S` en 3600, un admin desactivado
a las 10:00 con un token emitido a las 09:30 sigue pudiendo `GET /users` y `DELETE /users/:id`
hasta las 10:30. El ciclo de `orders` (2026-08-06) hizo el hueco visible al resolverlo **solo
para su contexto**: `POST /orders` re-consulta el directorio en cada orden y devuelve 403
(`CustomerGoneError`), así que hoy la misma pregunta —«¿este usuario sigue activo?»— tiene dos
respuestas distintas en el mismo repo, y la correcta la da el contexto que no es dueño del
concepto de usuario. Como plantilla, publica un guard que parece completo y no lo es.

**Criterio ya decidido.** Ninguno todavía — **es la decisión que hay que tomar**, y es del
usuario porque las dos salidas tienen costes de naturaleza distinta: (a) comprobar vigencia en
el guard reintroduce un golpe a base por request (lo que el JWT stateless vino a evitar; se
mitigaría con caché, que arrastra Redis y su trigger de Tier 2); (b) TTL corto + refresh token
acota la ventana sin coste por request, pero es un ciclo de auth completo (rotación, revocación,
almacenamiento). La tercera opción honesta es **no cambiarlo** y documentar la ventana como
característica aceptada, que es lo que hacen muchos sistemas con JWT.

**Actualización (2026-08-07, ciclo 4).** El hueco sigue abierto y la decisión sigue siendo del
usuario, pero el ciclo 4 cambió DÓNDE se implementaría y aclaró una de las tres salidas:

- El guard vive ahora en `auth/infrastructure/http/jwt-auth.guard.ts`, así que la opción (a)
  —comprobar vigencia en cada petición— se implementaría en `auth`, y ya tiene el puerto que
  necesita: `UserDirectory.findByEmail` devuelve `active`. Le faltaría un `existsAndIsActive(id)`
  o equivalente por `sub`, que es un método más en la fachada, no una pieza nueva.
- La asimetría que la entrada denuncia se agravó ligeramente y a la vez se explicó mejor: ahora
  son DOS contextos (`orders` y `auth`) los que consultan el directorio de `users` por su
  fachada, y solo uno de ellos (`orders`) revalida vigencia. El login SÍ comprueba `active`
  —un usuario desactivado no puede obtener token nuevo—, así que la ventana es exactamente la
  vida del token ya emitido, ni más ni menos.
- La opción (b) —TTL corto + refresh token— es ahora un ciclo **acotado a un solo módulo**:
  toda la superficie que tocaría (credencial, firma, verificación, endpoints) está dentro de
  `src/modules/auth/`. Antes cruzaba `users` entero.

**Cómo se sabrá que está hecho.** Existe una decisión escrita con su racional, y —si se elige
(a) o (b)— un E2E que desactiva a un admin con token vivo y demuestra que su siguiente petición
a un endpoint de `users` ya no pasa.

---

## 12. Un despliegue rodante con `DB_MIGRATIONS_RUN=true` tumba a las réplicas viejas

**Resuelto (2026-08-08, sin plan propio — regla de despliegue + reescritura de una migración
que nunca se ha desplegado; misma excepción explícita a la cadena
`brainstorming → writing-plans` que se aplicó en #9, #13, #14 y #15).**

**El criterio original decía que la migración NO se partía a posteriori. El usuario lo cambió
en esta tanda, y esa es la parte que hay que leer antes de reabrir nada.** El razonamiento
viejo —los tres pasos juntos para no dejar el hash duplicado sin dueño— seguía siendo válido
para un despliegue con parada, pero dejaba al template publicando una regla que su único
ejemplo incumplía. Partirla era gratis exactamente ahora: la migración jamás salió de `dev` y
`test`, así que no hay ninguna base desplegada que reconciliar. En un mes no lo habría sido.
La duplicación del hash durante la ventana se acepta y queda **con dueño escrito**:
`auth_credentials` manda desde el instante del expand, y `users.password_hash` es una copia de
compatibilidad que solo el código viejo lee.

**Lo que entró, en tres piezas.**

1. **La regla, en `CLAUDE.md` §«Destructive migrations: expand/contract»**, junto a §Database
   —fuente única; `README.md` §Migraciones y §Deploy notes solo la apuntan, que es el patrón
   del repo—. Dice qué va en cada mitad, qué hacer con `DB_MIGRATIONS_RUN=true` en un rodado
   (contract en un release posterior, recomendado; o mismo release con
   `DB_MIGRATIONS_RUN=false` y `pnpm migration:run` a mano al terminar el rodado) y el dato de
   TypeORM que agrava el DROP: enumera las columnas en **cada** `SELECT`, así que se rompe
   TODA lectura de la tabla en el código viejo, no solo la que usaba la columna. Ese dato ya no
   es una cita: está medido con `DB_LOGGING=true` y la consulta real está copiada en la
   sección.
2. **La migración partida en dos**, con timestamps nuevos y consecutivos:
   [`1786210289581-move-credentials-to-auth-expand.ts`](../src/database/migrations/1786210289581-move-credentials-to-auth-expand.ts)
   (CREATE TABLE + índice único + copia de hashes con `createdAt`/`updatedAt` del perfil —el
   arreglo A1, conservado con su comentario sobre la cota superior— + `DROP NOT NULL`) y
   [`1786210349581-move-credentials-to-auth-contract.ts`](../src/database/migrations/1786210349581-move-credentials-to-auth-contract.ts)
   (una sola sentencia: el `DROP COLUMN`). La de una sola pieza, `1786117503416`, desaparece.
3. **Los dos `down()` simétricos.** El del contract recrea la columna **nullable** y la rellena
   desde `auth_credentials`; el del expand rellena lo que falte, restaura el `NOT NULL` y borra
   la tabla.

**El `DROP NOT NULL` es la pieza que hace que el patrón funcione aquí, y está verificado
empíricamente, no razonado.** Durante la ventana el código nuevo inserta perfiles sin nombrar
`password_hash`. Con el esquema en estado expand (expand aplicado, contract pendiente) las 23
pruebas de `auth.e2e-spec.ts` pasan y `POST /auth/register` devuelve 201; volviendo a poner el
`NOT NULL` a mano sobre ese mismo esquema, ese registro responde 500 con `null value in column
"password_hash" of relation "users" violates not-null constraint`. La fila que queda tras el
alta en estado expand lo enseña de un vistazo: `users.password_hash` a NULL y el hash en
`auth_credentials`.

**Dónde vive la comprobación de huérfanos del arreglo A5, y por qué.** En el `down()` del
**expand**, porque lo que la obliga es el `NOT NULL` y el único de los dos que lo restaura es
ese. En el `down()` del contract la columna vuelve nullable, así que un perfil sin credencial
se queda con NULL y no rompe nada. La comprobación además cambió de pregunta: ya no busca
«perfiles sin fila en `auth_credentials`» sino «perfiles que se quedan con `password_hash` a
NULL después del relleno», que es la condición real del `SET NOT NULL`. Es más preciso y más
permisivo por el mismo motivo — un perfil sin credencial que conserve su hash de antes del
expand ya no aborta la reversión, que era un falso positivo. El caso que A5 vino a cubrir (base
de test con `users` poblada y `auth_credentials` vaciada por el TRUNCATE) sigue disparando, y
se comprobó disparándolo: la reversión de la migración vieja sobre `nest_base_template_test`
listó los tres ids con el mensaje propio antes de sustituir los archivos.

**Las dos bases quedaron migradas y revertibles, demostrado y no supuesto.** Se revirtió la
migración vieja en `nest_base_template` y `nest_base_template_test`, se sustituyeron los
archivos y se aplicaron las dos nuevas; después se hizo un ciclo completo `up → down → down →
up → up` en ambas. En la de desarrollo, que tiene una cuenta real, el hash sobrevivió idéntico
(mismo `md5`) y los dos timestamps también. `pnpm migration:show` termina con las cinco en `[X]`
en las dos bases.

**Lo que sigue siendo del operador, y no lo cubre ninguna regla:** elegir en qué release corre
el contract y confirmar que no queda ninguna réplica vieja antes de lanzarlo. El repo puede
obligar a que la migración esté partida y puede decir qué pasa si se ignora; no puede saber
cuándo termina un rodado. La entrada #17 (ninguna prueba ejercita estas migraciones) sigue
abierta y ahora tiene dos archivos que cubrir en vez de uno.

---

## 13. `UsersFacade` entrega el borrado duro a todo el que la inyecte

**Resuelto (2026-08-08, sin plan propio — es una segregación de superficie publicada, sin
lógica de negocio nueva: la misma excepción explícita a la cadena
`brainstorming → writing-plans` que se aplicó en la #9).** `users.module.ts` publica ahora
**dos** tokens en vez de uno: `UsersLookup` (`userExists`, `findByEmail`) para quien pregunta
y `UsersProvisioning` (`createProfile`, `deleteProfile`) para quien mantiene el perfil. Ambos
son `abstract class` —token y tipo en la misma referencia, como el resto de puertos del repo—
y ambos se re-exportan por el module file, que sigue siendo la única superficie cross-módulo.

Detrás hay **una sola** `UsersFacadeImpl`, registrada por su clase y aliada con `useExisting`
en los dos tokens. Partir también la implementación habría duplicado `parseUserId` y el acceso
al repositorio sin ganar nada: lo que la entrada pedía es que se segregue lo PUBLICADO, no que
el contexto se parta por dentro. Con dos `useClass` Nest habría construido dos instancias de la
misma cosa. `UsersFacadeImpl` no se exporta — publicarla anularía la segregación, porque su
tipo declara los cuatro métodos.

El nombre `UsersFacade` desaparece. Los nuevos van en **plural** para no chocar con
`UserDirectory` —el puerto que `auth` define sobre `users`, que no cambia— ni con
`CustomerDirectory`: el singular queda para los puertos que hablan de UN usuario, el plural
para las puertas del contexto.

**El criterio de cierre se cumplió literalmente.** `UsersCustomerDirectory` inyecta solo
`UsersLookup`, así que `deleteProfile` no está en el tipo que recibe y llamarlo no compila. El
fake por objeto literal de su spec bajó de cuatro métodos a dos, y eso es la prueba mecánica:
si el adaptador volviera a inyectar la superficie completa, ese objeto dejaría de compilar
(`TS2739`) en vez de seguir en verde. `UsersUserDirectory` de `auth` inyecta las dos puertas
porque de verdad usa las dos, y que en un constructor haya un parámetro y en el otro dos es
exactamente la señal que la segregación existe para dar. El gate de boundaries siguió verde
**sin filas nuevas**, como predecía la entrada: cambió qué se publica, no dónde están las
fronteras — los dos casos de `eslint-boundaries.spec.ts` que nombraban `UsersFacade` en su
archivo virtual solo cambiaron de nombre.

**La lista blanca de nombres de dato de `eslint.config.mjs` no necesitó ajuste**, comprobado y
no supuesto: `UsersLookup` y `UsersProvisioning` son puertos, así que NO entran en ella —entrar
sería justo el fallo que la lista existe para cazar— y los siete nombres de dato siguen siendo
los mismos. Los dos consumidores los importan como valor y `lint:check` queda verde.

No se esperó al trigger («el tercer consumidor, o antes si alguien añade un segundo método
destructivo»): lo adelantó el usuario en la misma tanda que cerró #14 y #15, que tocan el mismo
camino y se benefician de tener la superficie ya partida.

---

## 14. La credencial sobrevive al borrado del perfil

**Resuelto (2026-08-08, misma tanda que #13 y #15).** El puerto
[`credential.repository.ts`](../src/modules/auth/domain/ports/credential.repository.ts) gana
`deleteByUserId(userId)` —no `deleteCredentialsOf`, que era el nombre propuesto: `findByUserId`
ya existía al lado y la simetría vale más que la propuesta— y la compensación de
[`register-account.use-case.ts`](../src/modules/auth/application/use-cases/register-account.use-case.ts)
lo llama. Por `userId` y no por `id` porque al compensar el caso de uso tiene el id del PERFIL:
el de la credencial lo acuñó `Credential.create()` dentro de la llamada que acaba de fallar y
puede no haber vuelto nunca. La operación es idempotente —borrar lo que no existe devuelve
`affected: 0` y no lanza—, que es el caso NORMAL: casi siempre el INSERT falló de verdad y no
hay fila.

**Orden razonado: el perfil primero, la credencial después.** Es la garantía prioritaria la que
va delante y la que no depende de que la otra funcione. Un perfil huérfano bloquea su propio
email por el índice único y su dueño no puede registrarse nunca más; una credencial huérfana es
basura silenciosa que no colisiona con nada. Con este orden, si falla el primer borrado quedan
las dos filas (el estado ruidoso que ya existía y que cubre #16), y si falla el segundo queda
solo la basura. Con el orden inverso, un fallo del borrado de la credencial impediría el del
perfil, que es el que importa. **No se reintrodujo ningún FK cross-contexto**, tal y como
mandaba el criterio.

**No hay E2E del camino real, y no es por pereza: es inalcanzable sin trucos.** El fallo que
deja la credencial huérfana necesita que el INSERT quede COMMITEADO y que aun así la llamada
rechace (timeout, pod muerto entre el COMMIT y la respuesta). Desde PostgreSQL eso no se puede
provocar: un `RAISE` en un trigger `BEFORE INSERT`, en uno `AFTER INSERT` o en un
`CONSTRAINT TRIGGER` diferido aborta la transacción y se lleva la fila por delante, y un
trigger que devuelve `NULL` no produce error. Solo un commit fuera de banda —`dblink`,
`pg_background`— lo lograría, y eso es una dependencia frágil de contrib a cambio de nada. El
caso vive en unitario, R10 de la Tabla R, con un fake que sí puede separar «escribió» de
«respondió» (`failNextSaveAfterWritingWith`); verificado en rojo sin el arreglo. Lo que sí
entró en la suite E2E es el método nuevo del adaptador —`deleteByUserId()` contra PostgreSQL
real: borra su fila y no toca las demás, y no lanza cuando no hay ninguna—, que es lo que exige
la convención de probar repositorios contra la base y lo que mide el umbral propio de
`test/jest-e2e.config.mjs`.

El «cómo se sabrá» de la entrada pedía además un `LEFT JOIN` sin huérfanos tras la suite. No se
añadió: con la compensación arreglada pasa igual antes que después del cambio —porque el E2E
nunca llega a escribir la credencial— y un test que no puede ponerse rojo es ruido, no red.

---

## 15. `POST /auth/register` es un oráculo de enumeración, dentro del módulo que la prohíbe

**Resuelto (2026-08-08, misma tanda que #13 y #14). La decisión, escrita para que nadie la
reabra: se ACEPTA el 409 y se CIERRA la fuga de tiempo.**

**Lo aceptado.** El 409 con mensaje explícito se queda. Es la opción (a) del criterio: un
compromiso de producto extendido y defendible —sin él, quien ya tiene cuenta no sabe por qué no
puede darse de alta— y equivalente a lo que revela el «¿olvidaste tu contraseña?» de casi
cualquier producto. No es una regresión ni un descuido: el antiguo `POST /users` publicaba el
mismo 409 palabra por palabra. Queda escrito en los dos sitios que la entrada pedía y que ahora
se referencian mutuamente: el `description` de `registerAccount` en `auth.controller.ts` y el
comentario de L9 en `login.use-case.spec.ts`.

**Lo cerrado.** La segunda señal —la de tiempo— era lo indefendible, porque delataba la cuenta
aunque el cliente ignorase el código de estado. `RegisterAccountUseCase` hashea la contraseña
**antes** de comprobar la unicidad, así que los dos caminos pagan el argon2id y el hash se tira
cuando el alta se rechaza.

**Medido antes y después**, mismo método y misma máquina (2026-08-08): 20 muestras por camino
INTERCALADAS —tomado, libre, tomado, libre…— sobre HTTP contra PostgreSQL real, con la app real
montada por `createTestApp()` y los `ARGON2_PARAMS` del repo. Medianas y rangos en ms:

| Orden   | 409 email tomado      | 201 email libre        | Ratio  |
| ------- | --------------------- | ---------------------- | ------ |
| Antes   | 7.52 (6.35 – 10.93)   | 91.47 (85.82 – 101.04) | 12.2 × |
| Después | 79.61 (71.74 – 85.52) | 90.82 (82.23 – 128.48) | 1.14 × |

Lo decisivo no es el ratio, es el **solape**. Antes el 409 más lento seguía siendo ocho veces
más rápido que el 201 más rápido: una sola petición bastaba para clasificar un email. Ahora los
rangos se pisan y una muestra suelta no dice nada. Las dos filas se reprodujeron en una segunda
corrida (7.76/92.61 y 79.43/90.78). El arnés fue un `*.e2e-spec.ts` temporal, borrado tras
medir; para repetirlo basta con volver a montar `createTestApp()`, resetear el throttler entre
peticiones y alternar los dos cuerpos.

**Lo que NO se cerró, dicho sin adornos:** quedan ~11 ms de diferencia en la mediana. No es el
hash —los dos caminos lo pagan entero— sino los viajes a la base que solo hace el alta correcta
(INSERT del perfil e INSERT de la credencial frente al SELECT del pre-check). Igualarlos
exigiría escribir y deshacer en el camino rechazado, un coste sin contrapartida: con el solape
actual, distinguir los caminos ya requiere un ataque estadístico con muchas muestras por email,
y ese volumen es lo que frena el `@Throttle` de 10/min por handler del controller. El precio del
cambio —un hash de 64 MiB que se tira en cada rechazo— lo acota ese mismo límite.

**El caso que lo fija es estructural, no temporal.** R11 de la Tabla R afirma que `hash()` se
llama exactamente una vez en los DOS caminos, que es el mismo patrón con el que L9 fija
`verify()` para el login. Se descartó a propósito un test que midiera milisegundos: sería
inestable en CI y la medición vive donde no puede dar rojos por ruido — en la cabecera del caso
de uso, en esta entrada y en el reporte.

**Efecto colateral, registrado porque cambia un caso existente:** con el hash delante, un fallo
del hasher ya no puede dejar un perfil a medias. R7 pasó de «compensa borrando el perfil cuando
el hasher falla» a «no llega a crear el perfil», y el texto de su `it` cambió con ella. El caso
viejo dejó de ser alcanzable, no de importar.

---

## 16. Si la compensación del registro falla, su error sustituye al original — y el id del huérfano ya no está en el log

**Qué pasa.** En [`register-account.use-case.ts`](../src/modules/auth/application/use-cases/register-account.use-case.ts)
el `catch` hace `await this.users.deleteProfile(...)` y después `throw error`. Si el borrado también
falla, su excepción sale del `catch` y el error original —el que dice **por qué** falló la
credencial— se pierde. Hacen falta dos fallos de base consecutivos, así que es improbable.

Lo que sí cambió hoy es la recuperabilidad, y en dirección contraria a la que suponía la revisión.
El comentario del `catch` dice «ruidoso a propósito: hay un perfil huérfano que alguien debe mirar»,
y hasta esta misma tanda el ruido incluía el id: `AllExceptionsFilter` loguea `{ err }`, pino copia
toda propiedad enumerable del `QueryFailedError` y el uuid viajaba en `err.parameters`. **El arreglo
A4 añadió `err.parameters[*]` a `DEFAULT_REDACT_PATHS`** ([`pino-options.ts`](../src/common/logger/pino-options.ts))
para tapar un hash argon2id que salía en claro, y esa redacción es por POSICIÓN, no por nombre: hoy
el id sale `[REDACTED]`. `err.query` sigue sin redactarse a propósito, pero solo lleva SQL y
placeholders `$1`. Es decir, **el arreglo correcto de A4 cerró de paso la única vía por la que el
operador tenía el id del huérfano**. Sigue quedando el `LEFT JOIN`, pero eso es una investigación,
no una alerta — y desde que la #12 partió la migración de credenciales **ya no hay una copia de esa
consulta en el repo**: el `down()` del expand pregunta ahora por `users."password_hash" IS NULL`, no
por «sin fila en `auth_credentials`», así que quien la necesite la escribe a mano.

No hay fila de caso ni E2E para «la compensación falla». La Tabla R de
[`register-account.use-case.spec.ts`](../src/modules/auth/__tests__/application/use-cases/register-account.use-case.spec.ts)
cubre R8-R10, que son la compensación **funcionando**, y el E2E de `auth.e2e-spec.ts` fuerza el fallo
de la credencial con un trigger `BEFORE INSERT` y comprueba que el perfil desaparece. El segundo
fallo no lo ejercita nadie.

**Actualización (2026-08-08, al cerrar #14 y #15): la entrada sigue abierta y su superficie
CRECIÓ.** Dos cambios de esa tanda la tocan. (1) El `catch` hace ahora **dos** borrados
—`deleteProfile` y `credentials.deleteByUserId`— así que hay dos formas de que el error original
se pierda en vez de una, y si es el primero el que falla el segundo ni siquiera llega a
ejecutarse. (2) R7 ya no forma parte del bloque de compensación: con el hash calculado antes del
alta, un hasher caído no deja perfil que compensar, así que las filas que ejercitan la
compensación funcionando son R8, R9 y R10. El arreglo decidido —`cause: error` y el id del
huérfano en un campo propio— no cambia; ahora tiene que envolver los dos borrados.

**Criterio ya decidido.** Fila de caso nueva (la compensación falla: el 500 llega, el perfil queda,
y el operador tiene con qué encontrarlo) más su E2E, por el modelo de colaboración — un caso nuevo
se consulta, no se añade en silencio. En esa misma tarea se decide lo otro: **envolver el fallo de
la compensación con `cause: error`** para no tener que elegir entre los dos errores (Node lo soporta
de serie y pino lo serializa), y **loguear el id del huérfano en un campo propio** del caso de uso,
que la redacción por nombre no toca — que es lo que el comentario del `catch` ya prometía y hoy no
cumple.

**Cómo se sabrá que está hecho.** Existe un `it` cuyo texto es el caso «la compensación falla», y
falla sin el arreglo. Y el log de ese 500 lleva el id del perfil huérfano legible y los dos errores
encadenados, verificado sobre la línea real —como se verificó la fuga que A4 tapó—, no sobre la
suposición de que pino lo serializa.

---

## 17. La primera migración que mueve datos y suelta una columna no la ejercita ninguna prueba

**Qué pasa.** `src/database/migrations/**` está excluido de la cobertura unitaria
([`jest.config.mjs`](../jest.config.mjs), `collectCoverageFrom`) con su motivo escrito: «los ejecuta
la CLI». La suite E2E mide exactamente lo que la unitaria excluye —pero solo `*.module.ts` y
`*.typeorm.repository.ts`: su `collectCoverageFrom` son esas dos líneas y nada más—, así que las
migraciones no las mide **ninguna** de las dos. Tampoco las ejecutan: en E2E `resolveMigrationsRun()`
sale `false` con el `DB_MIGRATIONS_RUN=false` por defecto, y aunque saliera `true` el esquema ya
está migrado en ambas bases, así que el `up()` no volvería a correr.

La exclusión es convención documentada y no ha cambiado. **Lo que cambió es el riesgo de lo
excluido.** Hasta el ciclo 4 las tres migraciones eran `CREATE TABLE` y `ADD COLUMN`: su fallo es
inmediato y ruidoso, y el `down()` es un `DROP`. `MoveCredentialsToAuthExpand` copia datos entre
tablas y `MoveCredentialsToAuthContract` suelta una columna — un `SELECT` mal escrito ahí no falla,
migra mal, y la columna de origen ya no está para comparar. El `down()` del expand es además el más
complejo del repo: relleno desde la tabla nueva, detección de perfiles irrecuperables y
`SET NOT NULL`.

**Actualización (2026-08-08, al cerrar #12): la entrada sigue abierta, con una pieza menos y una
más.** El ciclo `up → down → down → up → up` **sí** se ejecutó a mano sobre las dos bases al partir
la migración, con datos dentro, y el hash y los dos timestamps sobrevivieron idénticos — así que la
frase «nunca se ha ejecutado» ya no es cierta. Lo que no existe sigue siendo la **prueba**: una
comprobación manual de un día no impide la regresión del día siguiente. Y ahora hay **dos** archivos
que cubrir, con un estado intermedio propio que la prueba debería fijar: expand aplicado y contract
pendiente, con `users.password_hash` nullable y un alta nueva dejándolo a NULL.

**Criterio ya decidido.** No se generaliza a todas las migraciones —la regla es: **la que mueve
datos o suelta algo lleva prueba; la que solo añade, no**—, y no se toca la exclusión de cobertura,
que sigue siendo correcta. Lo que entra es un E2E dedicado, con el mismo patrón que
`seed-admin.e2e-spec.ts` usa para el seed: `DataSource` programático sobre una base desechable,
sembrar filas, `up()`, comprobar el traslado (conteos, hash idéntico, `createdAt` copiado del perfil
y no estampado con `now()` — el defecto A1, que hoy nada impide que vuelva), `down()`, comprobar la
restauración, y `up()` otra vez. Que sea base propia y no `nest_base_template_test` es parte del
criterio: una suite que revierte el esquema no puede correr contra la base que el resto de E2E dan
por migrada.

**Cómo se sabrá que está hecho.** Un `it` recorre up→down→up con filas dentro y se pone rojo si la
copia pierde una columna o si el `down()` no restaura lo que había. Verificado como exige el repo:
volviendo a poner `now(), now()` en el `INSERT` y comprobando que la prueba lo caza.

---

## 18. Nada documenta que la base de test hay que migrarla

**Qué pasa.** [`docker/initdb/01-create-test-database.sql`](../docker/initdb/01-create-test-database.sql)
**crea** `nest_base_template_test` y ahí acaba: no aplica migraciones. `pnpm migration:run` lee
`DB_DATABASE` del `.env`, que apunta a la base de desarrollo, y `test/setup-env.ts` redirige a la de
test **dentro del proceso de Jest**, no en la CLI de TypeORM. La suite tampoco migra sola:
`DB_SYNCHRONIZE=false` explícito y `DB_MIGRATIONS_RUN` en `false` por defecto. El único sitio del
repo que hace lo correcto es [`ci.yml`](../.github/workflows/ci.yml), con un step propio que ejecuta
`pnpm migration:run` con `DB_DATABASE: nest_base_template_test`.

El README describe la base de test (§«Base de datos de los tests»), dice que la crea el init script
y explica cómo crearla a mano si el volumen ya existía. De migrarla no dice nada. Un clon nuevo que
siga la DoD al pie de la letra —`pnpm db:up`, `pnpm migration:run`, `pnpm test:e2e`— revienta con
`relation "users" does not exist`, que el README sí documenta… en la sección de problemas
frecuentes, y respondiendo «falta `pnpm migration:run`» — que es justo lo que esa persona acaba de
hacer.

**Es preexistente, pero esta rama subió su coste.** Antes, una base de test rezagada fallaba con un
error de esquema reconocible sobre la tabla que ya conocías. Ahora una base que se quedó antes de
`MoveCredentialsToAuthExpand` falla en el `beforeEach` de cinco suites con `relation "auth_credentials"
does not exist`: un TRUNCATE sobre una tabla que el código nuevo da por hecha. Parece un fallo del
ciclo 4 y es un esquema viejo.

Una nota que explica por qué a unos les funciona y a otros no, y que no es el camino documentado:
`resolveMigrationsRun()` solo veta `development`, así que un `.env` con `DB_MIGRATIONS_RUN=true`
hace que el `AppModule` de la suite E2E migre la base de test él solo al arrancar. Es un accidente
afortunado, no una garantía.

**Criterio ya decidido.** Un script `db:migrate:test` explícito y que `db:reset` deje **las dos**
bases listas, más una línea en el README §«Base de datos de los tests» y una fila en la tabla «Qué
pasa si te saltas un paso». La única sutileza de implementación ya está identificada: en Windows el
prefijo `VAR=valor pnpm …` no funciona en los scripts de `package.json` y el repo no tiene
`cross-env`, así que el script es un `.mjs` de dos líneas o entra esa dependencia — decisión de
quien lo haga, no vale dejar un script que solo corre en Linux cuando el entorno de referencia es
Windows.

**Cómo se sabrá que está hecho.** Un clon nuevo que ejecute lo que dice el README llega a
`pnpm test:e2e` en verde sin ningún paso adicional que no esté escrito, y `pnpm db:reset` seguido de
`pnpm test:e2e` funciona sin tocar nada más.

---

## 19. Dos huecos de la matriz de boundaries, ambos latentes y ninguno una regresión

**Qué pasa.** Se registran aquí para que nadie los levante como defectos del refactor ni los
reinvestigue desde cero. Los dos viven en [`eslint.boundaries.js`](../eslint.boundaries.js).

**(a) `shared/` se quedó sin acceso a `shared/domain/`.** La enmienda del ciclo 1 partió el element
type `shared` en dos y añadió la policy `shared-domain → shared-domain` —necesaria, porque
`aggregate-root.ts` importa `value-object.base.ts`— pero no reabrió `shared → shared-domain`. La
policy `from: shared` sigue permitiendo solo `to: shared`, y como `shared-domain` se clasifica
ANTES, un archivo de `src/shared/` que importara del kernel caería en `default: 'disallow'`. Impacto
hoy: **cero**. `src/shared/` no contiene nada fuera de `domain/` salvo un `.gitkeep`. Y el día que
alguien añada algo, el fallo es ruidoso —lint rojo con el mensaje de frontera violada—, no
silencioso. Tampoco hay caso en la suite: los cuatro casos de la Tabla K cubren
`domain → shared-domain`, `shared-domain → shared-domain` y las dos prohibiciones, ninguno el origen
`shared`.

**(b) La lista negra de externals del kernel deja pasar más de lo que parece.** `shared-domain`
prohíbe `['@nestjs/*', 'typeorm', 'pino', 'class-validator', 'axios', 'argon2']`, así que `rxjs`,
`express` y `class-transformer` —los tres, dependencias de producción reales de este repo— entran
sin protestar, y los builtins de Node también: la prohibición filtra por `origin: 'external'`
mientras que los builtins llegan como `origin: 'core'` y los cubre la policy base que los permite en
bloque. **No es una regresión:** el hueco es idéntico en `module-domain` y ya existía antes del
refactor; la enmienda replicó la lista tal cual, que era lo correcto —divergir habría creado dos
definiciones de pureza—. El delta honesto es el **radio**: una fuga en el kernel contamina los tres
contextos a la vez, no uno. Compensado porque el kernel son dos archivos y ningún import nuevo entra
ahí sin que alguien lo escriba a mano.

**Criterio ya decidido.** (a) se arregla **en el mismo cambio que añada el primer archivo a
`src/shared/` fuera de `domain/`**, con su caso en `eslint-boundaries.spec.ts` — no antes: una
policy sin ningún archivo que la ejercite es config muerta, y la suite no puede fijar un permiso que
hoy nada usa. (b) se arregla cambiando la lista negra por **lista blanca** (qué puede importar el
dominio, en vez de qué no), y no se hace en esta rama porque el cambio afecta por igual a
`module-domain` —los tres contextos— y merece su propia ronda de casos, no un apaño sobre el kernel
que dejaría las dos definiciones divergiendo, que es justo lo que la enmienda evitó.

**Cómo se sabrá que está hecho.** (a) un caso «shared importa shared-domain» pasa en verde con la
config real. (b) un caso «`rxjs` en `src/shared/domain`» y su gemelo en `module-domain` se ponen
rojos, y la lista blanca está escrita una sola vez y compartida por ambos.

---

## 20. La lista cerrada de nombres que blinda los puertos es mantenimiento nuevo

**Qué pasa.** El arreglo de esta tanda cerró el hueco del `import { VALOR, type Puerto }` inline en
[`eslint.config.mjs`](../eslint.config.mjs) — el `type` inline borra ese specifier del emit igual
que un `import type`, así que un puerto marcado así deja a Nest sin token y revienta EN RUNTIME con
lint y typecheck en verde. El selector no puede distinguir un puerto de un dato que viaja con él:
sintácticamente son el mismo `ImportSpecifier` sobre la misma ruta. La solución fue una **lista
blanca cerrada de 7 nombres de dato** (`CreateProfileResult`, `DirectoryUser`,
`FindUsersCriteria`, `SignedToken`, `TokenClaims`, `UserPage`, `UserSummary`); todo lo demás
importado con `type` desde `ports/` o un `*.module` es rojo.

**Falla en cerrado, que es lo correcto**: un puerto marcado `type` por descuido se pone rojo solo, y
un dato nuevo cuesta una línea revisada. Pero es mantenimiento que antes no existía, y una lista que
crece pierde su capacidad de ser leída de un vistazo.

Queda además **un tercer hueco sin cerrar**: `eslint-disable-next-line no-restricted-syntax` apaga
la regla para la línea entera. Hay tres usos hoy, los tres legítimos y comentados
(`jwt-auth.guard.ts` y dos DTOs de `auth`, que importan el `type` de datos y no el puerto), y los
tres obligados porque `no-import-type-side-effects` rechaza la forma inline en esos archivos. El
hueco es que un disable futuro puesto por la razón equivocada no lo distingue nadie.

**Criterio ya decidido.** Se revisa si la lista pasa de ~10 nombres. La salida ya identificada es
una **convención de nombres** que permita un selector genérico —los datos que acompañan a un puerto
con un sufijo reconocible, o viviendo en un archivo aparte del puerto— para sustituir la
enumeración por una regla. No se adelanta: con 7 nombres la lista se lee de un vistazo y la
convención obligaría a renombrar tipos publicados por dos módulos.

**Cómo se sabrá que está hecho.** El selector no enumera nombres, y un puerto nuevo queda protegido
sin editar `eslint.config.mjs` — que es el mantenimiento que esta entrada existe para eliminar.

---

## 21. `DOCS_PATH` vacío monta Scalar en `/api` y tapa la API entera

**Qué pasa.** [`env.schema.ts`](../src/config/env.schema.ts) declara `DOCS_PATH: z.string().default('docs')`
— sin `.min(1)`, sin regex, sin comprobación de barras. Y
[`openapi.ts`](../src/bootstrap/openapi.ts) lo concatena en crudo:

```ts
const path = `${appCfg.globalPrefix}/${docsCfg.path}`;
const base = `/${path}`;
```

Con `DOCS_PATH=` el punto de montaje sale `/api/`, y el catch-all de Scalar (el quinto `app.use`,
que responde a **cualquier** ruta bajo su base) queda montado sobre toda la API. Como `setupOpenApi`
corre en `main.ts` **antes** de `app.listen()` —y por tanto antes de que `init()` registre el router
de Nest—, gana el middleware.

**Reproducido**, no razonado: con un Express montado igual que el del bootstrap, `GET /api/v1/users`
devuelve `200 <html>SCALAR</html>` en vez del JSON del controller. Es un fallo silencioso y total —
200 en todas partes, ningún error en el log— y solo se manifiesta con `DOCS_ENABLED=true`.

**El mismo hueco existe por el otro lado.** `GLOBAL_PREFIX` es también `z.string().default('api')`
sin `.min(1)`, así que un prefijo vacío deja `base` en `//docs`. Menos grave, pero mismo origen: dos
variables que construyen rutas y no validan que produzcan una ruta.

Nada de esto está cubierto: no hay test que pase un `DOCS_PATH` vacío por el schema ni por
`setupOpenApi`.

**Criterio ya decidido.** `.min(1)` en ambas, en el schema y no en el factory —mismo argumento que
el par `DOCS_USERNAME`/`DOCS_PASSWORD`: `registerAs` es perezoso y el fallo aparecería en la primera
petición a la documentación en vez de al arrancar—. No se añade regex de formato: la subruta
(`DOCS_PATH=internal/openapi`) funciona hoy y es legítima, y una regex que la permitiera tendría que
razonar sobre barras iniciales y finales sin ganar nada frente al `.min(1)`, que es lo que cierra el
caso destructivo. La barra inicial (`DOCS_PATH=/docs` → `/api//docs`) se deja fuera a propósito: es
cosmética, Express la normaliza y no rompe nada.

**Cómo se sabrá que está hecho.** Dos casos en `env.schema.spec.ts` —`DOCS_PATH=''` y
`GLOBAL_PREFIX=''` rechazados— y la verificación que el repo exige: quitar el `.min(1)` y comprobar
que se ponen rojos.

---

## 22. `BODY_LIMIT` no valida formato y falla fuera del canal de errores de configuración

**Qué pasa.** [`env.schema.ts`](../src/config/env.schema.ts) declara `BODY_LIMIT: z.string().default('1mb')`,
sin regex y sin `rejectEmpty`. Acepta `''`, `potato` y `-5mb`.

No se degrada en silencio, que sería peor: `body-parser` llama a `bytes.parse()` al construir el
middleware y, si el resultado es `null`, lanza `TypeError: option limit "potato" is invalid`. El
proceso muere. Pero muere **dentro de `applyGlobals`**, con un `TypeError` de una dependencia, en
vez de con el error de Zod que nombra la variable y el motivo — que es lo que el README promete de
toda la configuración («un error detallado al arrancar si algo no encaja»).

Es la única variable que rompe esa promesa: el resto de las que no son numéricas o bien tienen
`.min(1)`, o bien son enums, o bien su formato no puede ser inválido.

**Criterio ya decidido.** Una regex en el schema con el formato que acepta `bytes`
(`/^\d+(\.\d+)?\s?(b|kb|mb|gb|tb|pb)?$/i`), con mensaje propio. No se añade `rejectEmpty`: es para
numéricas, y aquí la cadena vacía la rechaza ya la regex. No se cambia a un número de bytes —
`1mb` se lee mejor que `1048576` y es el formato que documenta Express.

**Cómo se sabrá que está hecho.** Un caso por cada forma inválida (`''`, `potato`, `-5mb`) rechazada
por el schema y un `it.each` con las válidas (`1mb`, `500kb`, `2gb`, `1024`) aceptadas, y el
arranque de un `BODY_LIMIT` malo falla con el mensaje de Zod y no con el `TypeError`.

---

## 23. Superar `BODY_LIMIT` devuelve 500 en vez de 413

**Qué pasa.** `body-parser` lanza un `PayloadTooLargeError` con `statusCode: 413`. No es una
`HttpException` de `@nestjs/common`, y `mapExternalException` de Nest
(`routes-resolver.js`) solo reescribe `SyntaxError`, `URIError` y errores de Fastify — el resto cae
en `default: return err`. Llega entonces a
[`AllExceptionsFilter`](../src/common/filters/all-exceptions.filter.ts), cuyo `normalizeException`
no mira `err.statusCode`, así que el error entra en la rama genérica `exception instanceof Error` y
sale como 500.

**Medido**, con el error real que produce `body-parser` y el filtro real del repo instanciado con
dobles mínimos:

```text
name              : PayloadTooLargeError
statusCode        : 413
--- lo que responde el filtro ---
status: 500
body  : {"statusCode":500,"message":"request entity too large","error":"PayloadTooLargeError"}
```

Y en `staging`/`production` es peor: `hidesErrorDetails` sustituye el mensaje por
`Internal server error`, así que el cliente que subió un fichero grande no tiene forma de saber que
el problema es suyo y reintentará igual. Además se loguea como `fatal` —la rama
`isServerError && !(exception instanceof HttpException)`—, así que un cliente puede llenar el log de
fatales mandando cuerpos grandes.

Lo que **falta** por comprobar es solo el último tramo: que la app completa enruta ese error hasta
este filtro y no hasta otro handler. El razonamiento está cerrado (`APP_FILTER` es global y
`mapExternalException` no lo intercepta), pero no se ha ejercitado con un POST real contra la app en
marcha.

El `BaseExceptionFilter` de Nest sí lo habría resuelto bien: tiene un `isHttpError(err)` que
comprueba `err.statusCode && err.message` y respeta el status. La divergencia nació al escribir un
filtro propio sin replicar esa rama.

Alcance real: no es solo el 413. Afecta a todo error de `http-errors` que no sea `SyntaxError` ni
`URIError` — el 415 `unsupported charset` y el 403 de `read.js` entre ellos.

**Criterio ya decidido.** Añadir la rama en `normalizeException`, **antes** de
`exception instanceof Error` y **después** de `HttpException`, con la misma comprobación estructural
que usa Nest (`statusCode` numérico y `message` string) en lugar de un `instanceof` contra
`http-errors`, que no es dependencia directa del repo. El mensaje se mantiene bajo la misma regla de
`hidesErrorDetails` que el resto: un 4xx no filtra topología, así que puede viajar en claro, pero se
decide en el mismo sitio y no con una excepción nueva.

**Cómo se sabrá que está hecho.** Un E2E que hace POST con un cuerpo por encima de `BODY_LIMIT` y
recibe **413** con el sobre estándar, más un caso en `all-exceptions.filter.spec.ts` con un error de
forma `http-errors`. Verificado como exige el repo: quitando la rama nueva y comprobando que ambos
se ponen rojos. El E2E es además lo que cierra el tramo no comprobado de arriba.

---

## 24. `container_name` fijo impide tener dos clones del repo a la vez

**Qué pasa.** [`docker-compose.yml`](../docker-compose.yml) declara
`container_name: nest-base-template-db`. Ese nombre es **global en el daemon de Docker**: no lleva
prefijo de proyecto, a diferencia de los contenedores que Compose nombra solo
(`<proyecto>-<servicio>-<n>`). Dos clones del repo —un `main` y una rama larga, o el template y un
proyecto derivado de él— no pueden tener la base levantada a la vez: el segundo `pnpm db:up` falla
con `Conflict. The container name "/nest-base-template-db" is already in use`.

**No es teórico, ya ocurrió aquí** (2026-08-09), aunque por otra vía: el clon vivía en un directorio
con distinto nombre, Compose derivaba el proyecto de la carpeta y el contenedor pertenecía a otro
proyecto. `db:up` fallaba con ese mismo error y —peor— `db:down` y `db:reset` operaban sobre un
proyecto vacío y **no hacían nada sin decirlo**: `docker compose ps` no listaba un contenedor que sí
estaba corriendo.

Esa mitad **ya está cerrada**: el compose declara `name: nest-base-template`, así que el proyecto
deja de depender del nombre de la carpeta. Lo que esta entrada deja abierto es la otra mitad, que
`name:` no toca: con el nombre de contenedor fijo, **dos clones siguen sin poder coexistir**, porque
ahora comparten también el nombre de proyecto y, con él, el volumen.

**Criterio ya decidido.** Quitar `container_name` y dejar que Compose lo derive del proyecto. El
coste es que el nombre pasa a ser `nest-base-template-postgres-1`, y hay **dos sitios que lo citan
literalmente** y habría que actualizar en el mismo cambio:

- `README.md`, en la receta de crear la base de tests a mano
  (`docker exec nest-base-template-db psql …`)
- cualquier `docker exec` de la documentación o de scripts locales

La alternativa —parametrizarlo con `${COMPOSE_PROJECT_NAME}-db`— se descarta: reintroduce por la
puerta de atrás la dependencia de una variable de entorno que `name:` acaba de eliminar, y deja el
nombre a merced de un `.env` que no se versiona.

No se hace ya porque el beneficio es condicional —hoy nadie mantiene dos clones simultáneos— y el
cambio rompe recetas publicadas. El disparador es concreto: **la primera vez que alguien necesite dos
clones del repo con la base levantada a la vez.**

**Cómo se sabrá que está hecho.** Dos clones del repo en directorios distintos levantan su base
simultáneamente sin conflicto, y ningún `docker exec` de la documentación cita un nombre de
contenedor que ya no existe.

---

## Cerrado al verificarlo

- **`operationIdFactory` colisionando entre controllers con métodos homónimos.** No estaba latente:
  `openapi-document.ts` configura `` (controllerKey, methodKey) => `${controllerKey}_${methodKey}` ``,
  con la clave del controller delante. Un segundo `findOne` no colisiona. Se comprobó leyendo el
  código antes de abrir el ticket.
- **OpenTelemetry completo (2026-08-04).** Descartado para el perfil decidido —monolito
  modular—: sin malla de servicios no hay trazas distribuidas que justifiquen su peso.
  Request-id + Pino + las métricas de la entrada #7 cubren lo observable. Se reevalúa solo si
  el monolito se parte en servicios.
- **Circuit breakers y feature flags (2026-08-04).** YAGNI en un template base: ninguno tiene
  consumidor hoy. Se reabren solo con un caso concreto delante.
- **Testcontainers (2026-08-04).** docker-compose en local y el service container de `ci.yml`
  ya dan PostgreSQL real a los E2E; migrar costaría sin ganar nada.
