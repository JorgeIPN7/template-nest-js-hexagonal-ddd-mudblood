# Flujos de desarrollo con IA

Cómo se trabaja en este repositorio con un asistente de IA (Claude Code y las skills de
[`.claude/skills/`](../.claude/skills/)): qué flujo usar según la tarea, cómo se invoca, qué
hace el asistente, qué te toca a ti y qué deja escrito cada uno. Al final están las mediciones que
justifican cada decisión, para no tener que repetir la discusión.

> **En una frase:** los cambios triviales van sin skills; una feature dentro de un contexto que ya
> existe va por **`/express`**; y la cadena completa (`/brainstorming` → plan → ejecución) queda
> para contextos nuevos, cambios entre contextos, migraciones destructivas, seguridad y trabajos
> grandes.

## Contenido

1. [Los tres niveles](#1-los-tres-niveles)
2. [Cómo elegir el flujo](#2-cómo-elegir-el-flujo)
3. [Nivel trivial](#3-nivel-trivial)
4. [Flujo exprés](#4-flujo-exprés)
5. [Flujo completo](#5-flujo-completo)
6. [Cuándo compensa subagent-driven-development](#6-cuándo-compensa-subagent-driven-development)
7. [La revisión adversarial](#7-la-revisión-adversarial)
8. [Las dos comprobaciones que comparten todos los flujos](#8-las-dos-comprobaciones-que-comparten-todos-los-flujos)
9. [Mutación del código nuevo](#9-mutación-del-código-nuevo)
10. [Git: quién hace los commits](#10-git-quién-hace-los-commits)
11. [Preparar el entorno](#11-preparar-el-entorno)
12. [De dónde sale todo esto: el experimento del 2026-09-30](#12-de-dónde-sale-todo-esto-el-experimento-del-2026-09-30)
13. [Mantener los flujos](#13-mantener-los-flujos)

---

## 1. Los tres niveles

| Nivel                           | Para qué                                                                                                                                                                                                                    | Cómo se arranca                                                             | Qué haces tú                                                                                                                                        | Referencia medida                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Trivial**                     | Errata, documentación, configuración que no es de seguridad, bump de dependencia, bug de una línea con su test evidente                                                                                                     | Pídelo tal cual, sin skill                                                  | Revisar el resultado y hacer el commit                                                                                                              | —                                                            |
| **Exprés** (por defecto)        | Una feature o un bug con lógica dentro de **un** bounded context que ya existe: hasta ~8 tareas y, como mucho, una migración aditiva                                                                                        | `/express <qué quieres>`                                                    | Contestar 1 o 2 rondas de preguntas agrupadas, aprobar la spec y su tabla de casos, decidir sobre los casos nuevos que aparezcan, hacer el commit   | 41 min y 11,82 USD con 4 intervenciones (cancelar pedido)    |
| **Completo** (casos especiales) | Seguridad (auth, credenciales, tokens, permisos y su configuración), contexto nuevo, cambios entre contextos (fachadas, puertos compartidos), migración destructiva, más de ~10 tareas, trabajo que continuará otra persona | `/brainstorming <idea>` y, tras el plan, `/executing-plans` en sesión nueva | Diseñar con el asistente, aprobar la spec y el plan con sus tablas, abrir la sesión de ejecución, decidir sobre los casos nuevos, hacer los commits | ~3 h 30 min y 52,54 USD antes de los ajustes (misma feature) |

**Lo que comparten los tres:** la Definition of Done de `CLAUDE.md` (`typecheck` → `lint:check`
→ `format:check` → `test` → `test:e2e` → `build`), las convenciones de `CLAUDE.md` y la política
de git. El asistente **nunca** hace commits: el `.claude/settings.json` del repo se lo impide (ver
[§10](#10-git-quién-hace-los-commits)).

## 2. Cómo elegir el flujo

### Árbol de decisión

```
¿Toca alguno de estos, aunque sea en una línea?
· auth, credenciales, tokens o permisos, o su configuración
  (CORS, CSP, cabeceras, costes de argon2, el deny de .claude/settings.json)
· un bounded context nuevo
· más de un contexto (fachada, puerto entre módulos)
· una migración que borra o renombra (expand/contract)
· más de ~10 tareas, o trabajo que otra persona continuará
├─ Sí ────────────────────────────────────────────────────────────────────► COMPLETO
└─ No
   ├─ ¿Cambia comportamiento?
   │  └─ No (texto, docs, config que no es de seguridad, bump) ────────────► TRIVIAL
   ├─ ¿Es un bug de una línea con un test evidente? ──────────────────────► TRIVIAL
   └─ En otro caso ───────────────────────────────────────────────────────► EXPRÉS
```

El riesgo se pregunta **antes** que el tamaño: bajar los costes de argon2 para que los E2E vayan
más rápido es una línea de configuración y también un cambio de seguridad, porque la misma
constante usa el hasher de producción.

- **Si dudas entre trivial y exprés, elige exprés.** Cuesta poco más y deja spec y casos.
- **Si dudas entre exprés y completo, que lo decida el usuario.** El asistente lo pregunta con su
  recomendación, porque el coste del flujo completo es una decisión suya. `/express` hace esta
  clasificación como primer paso, y `/brainstorming` redirige al exprés si la tarea no necesita la
  cadena completa.

### Por tipo de tarea

| Tarea                                                               | Nivel                        | Notas                                                                                                                  |
| ------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Errata, texto, comentario, README                                   | Trivial                      | Sin tests nuevos si no cambia comportamiento                                                                           |
| Variable de entorno, ajuste de config que no es de seguridad        | Trivial                      | Si cambia el esquema de `env.schema.ts`, su test; ojo al «Config gotcha» de `CLAUDE.md`                                |
| Config de seguridad (CORS, CSP, `ARGON2_PARAMS`, `JWT_*`, el deny)  | Completo                     | Una línea, pero la revisión adversarial y sus tests de guarda no sobran                                                |
| Bump de dependencia (Renovate o manual)                             | Trivial                      | La DoD es el test. Una major con cambios de API puede subir a exprés                                                   |
| Bug de una línea con causa clara                                    | Trivial                      | Test que falle sin el arreglo (regla de `CLAUDE.md`)                                                                   |
| Bug con lógica (varios casos, una regla de negocio mal aplicada)    | Exprés                       | La spec puede ser muy corta: objetivo, casos y fuera de alcance                                                        |
| Endpoint nuevo en un contexto que ya existe                         | Exprés                       | Contrato OpenAPI completo, con cada código alcanzable ([§8](#8-las-dos-comprobaciones-que-comparten-todos-los-flujos)) |
| Regla de negocio nueva o cambiada dentro de un contexto             | Exprés                       | Tabla de casos con filas `P` si hay un «siempre» o un «nunca»                                                          |
| Cambio en una respuesta que ya existe (campo nuevo, código nuevo)   | Exprés                       | ⚠️ en la sección «Contrato» de la spec; actualiza README y `CLAUDE.md`                                                 |
| Migración aditiva (`ADD COLUMN`, tabla nueva) dentro de una feature | Exprés                       | Con `DEFAULT` si la columna es `NOT NULL`: las réplicas viejas siguen insertando                                       |
| Migración que borra o renombra                                      | Completo                     | Expand/contract obligatorio (`CLAUDE.md`, «Destructive migrations»)                                                    |
| Bounded context nuevo                                               | Completo                     | El plan termina con el wiring: módulo, `AppModule` y scope de commitlint                                               |
| Cambio entre contextos (fachada, puerto nuevo en `users.module.ts`) | Completo                     | Las puertas se segregan por intención (`UsersLookup`, `UsersProvisioning`)                                             |
| Auth, credenciales, tokens, permisos, guards                        | Completo                     | Tests de guarda obligatorios, con su prueba sin la protección                                                          |
| Refactor grande o transversal                                       | Completo                     | Si no cambia comportamiento, la tabla de casos se sustituye por «la suite sigue verde» y la mutación no baja           |
| Más de ~10 tareas, o trabajo que otra persona continuará            | Completo                     | La spec y el plan son el traspaso                                                                                      |
| Revisar el PR de otra persona                                       | `/code-review <PR>`          | `/adversarial-review` revisa tu árbol contra una base y no cambia de rama; para usarla, haz tú el checkout             |
| Revisar tu propio cambio antes de abrir el PR                       | `/adversarial-review` suelta | [§7](#7-la-revisión-adversarial)                                                                                       |
| Investigar sin cambiar código (¿por qué pasa X?, ¿dónde se hace Y?) | Sin flujo                    | Una pregunta directa. Si acaba en cambio, se clasifica entonces                                                        |

## 3. Nivel trivial

**Para qué:** cambios en los que diseñar sería más caro que hacer. Ejemplos: una errata, una
variable de entorno, un bump o un bug de una línea con causa clara.

**Cómo se pide:** en lenguaje normal, sin skill. Por ejemplo: «Corrige la errata del mensaje de
arranque» o «Sube `REQUEST_TIMEOUT_MS` por defecto a 20 s y ajusta su test».

En el experimento se comprobó que «Sube la longitud máxima de `OrderConcept` de 140 a 160» no
dispara `brainstorming`, pero esa petición **no es trivial**: toca también el DTO (`@Length(1, 140)`)
y la columna `varchar(140)`, así que lleva una migración y es exprés.

**Qué hace el asistente:**

1. El cambio.
2. Si cambia comportamiento, el test, que tiene que fallar sin el arreglo.
3. La DoD completa.
4. Un informe corto con la sugerencia de commit.

**Qué haces tú:** revisar el diff y hacer el commit desde tu terminal.

## 4. Flujo exprés

**Para qué:** una feature o un bug con lógica dentro de un contexto que ya existe. Es el flujo
por defecto.

**Cómo se invoca:**

```
/express Quiero que un cliente pueda cancelar sus pedidos.
```

La skill vive en [`.claude/skills/express/SKILL.md`](../.claude/skills/express/SKILL.md). No usa
plan escrito ni subagentes, salvo el revisor final.

### Pasos

| Paso                         | Qué hace el asistente                                                                                                                                                                                                                                                                       | Qué haces tú                                                                 | Qué queda escrito                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| 0. Nivel                     | Comprueba que la tarea es exprés. Si es trivial, la hace sin el flujo; si es de flujo completo, para y te lo propone con el motivo                                                                                                                                                          | Nada, o decidir si subir al flujo completo                                   | —                                         |
| 1. Mini-diseño               | Lee el módulo y te pregunta solo lo que decides tú (negocio, contrato público, riesgo): como mucho 2 rondas de hasta 4 preguntas, con opciones y su recomendación. Lo técnico lo decide él y lo anota. Escribe la spec (≤ 150 líneas) con la tabla «Casos acordados» y la tabla de contrato | Contestar las rondas y dar **una** aprobación a la spec y a su tabla         | `docs/specs/AAAA-MM-DD-<tema>-express.md` |
| 2. TDD capa a capa           | Dominio → aplicación → infraestructura → HTTP → E2E. Primero un stub, para que cada test falle **por aserción**; después verde y refactor. Prueba cada test de guarda sin su protección. Hace la migración si hace falta y la documentación OpenAPI completa                                | Nada, salvo que surja un caso nuevo: se pregunta agrupado con los del paso 3 | Código y tests                            |
| 3. Mutación del código nuevo | `pnpm test:mutation:changed <base>`. Por cada superviviente propone el caso que lo mata                                                                                                                                                                                                     | Aprobar (o no) los casos nuevos, todos en una sola pregunta                  | Filas nuevas en la spec                   |
| 4. Revisión adversarial      | Lanza un revisor `general-purpose` con un prompt fijo ([§7](#7-la-revisión-adversarial)), verifica cada hallazgo y corrige lo crítico y lo importante. El test va primero                                                                                                                   | Decidir si un arreglo exige un comportamiento nuevo (una pregunta)           | Correcciones                              |
| 5. DoD y documentación       | Pasa la DoD completa y actualiza `CLAUDE.md` y README si cambia la descripción de un módulo, un contrato o la tabla de endpoints                                                                                                                                                            | —                                                                            | Docs al día                               |
| 6. Informe                   | Resume qué hizo; casos ↔ tests; rojos por aserción; tests de guarda; mutación; hallazgos de la revisión; DoD; ⚠️ cambios de contrato; mensaje de commit propuesto                                                                                                                           | Revisar y hacer el commit                                                    | —                                         |

**Qué esperar:** en el experimento, con la cancelación de pedidos (≈30 archivos, 43 tests nuevos,
una migración aditiva):

- 41 minutos de reloj y 11,82 USD, incluida la revisión final;
- 4 intervenciones tuyas: el comando, una ronda de respuestas, la aprobación de la spec y la de un
  caso que añadió la revisión;
- spec de 108 líneas; 5 de 5 specs con rojo por aserción; mutación del código nuevo al 100 %.

La spec de ese brazo es [`docs/specs/2026-09-30-cancel-order-express.md`](specs/2026-09-30-cancel-order-express.md)
y sirve de ejemplo del formato. Llega con la rama de la feature.

**Si ya tienes la spec:** pásasela al invocar (`/express implementa docs/specs/<spec>.md`). El
asistente completa lo que falte, sobre todo la tabla y el contrato, y pide la aprobación igual.

## 5. Flujo completo

**Para qué:** los casos en los que un error de diseño sale caro, o en los que el trabajo no cabe
en una sesión:

- un contexto nuevo;
- cambios entre contextos;
- una migración destructiva;
- seguridad;
- más de ~10 tareas;
- un traspaso a otra persona.

### Paso 1 — Diseño: `/brainstorming`

```
/brainstorming Quiero un contexto de facturación que emita una factura por cada pedido.
```

- Explora el código, pregunta en rondas agrupadas (hasta 4 preguntas, con opciones y
  recomendación) y propone 2 o 3 enfoques con su recomendación.
- Presenta el diseño en uno o pocos bloques. Tú lo apruebas.
- Escribe la spec en `docs/specs/AAAA-MM-DD-<tema>-design.md`, con contrato alcanzable y
  garantías con su test de guarda, y te la pasa para revisarla.
- Si la tarea no necesitaba el flujo completo, lo dice y propone `/express`.

### Paso 2 — Plan: `writing-plans` (lo invoca brainstorming)

- **El plan no lleva código de producción ni tests terminados.** Lleva:
  - el mapa de archivos;
  - las firmas públicas de cada tarea (bajo «Interfaces»);
  - las decisiones con su porqué;
  - la tabla «Casos acordados» de cada tarea con lógica;
  - la tabla de contrato de cada endpoint;
  - los tests de guarda;
  - los comandos y lo que se espera de cada uno.
- **Contrato de casos:** el asistente propone las tablas y tú las apruebas en bloque, con
  preguntas agrupadas.
- Con más de ~8 tareas o varios contextos, un revisor independiente comprueba el plan.
- Guarda `docs/plans/AAAA-MM-DD-<tema>.md` y te recomienda cómo ejecutarlo.
- **Te toca:** aprobar las tablas y, si quieres, hacer el commit de la spec y el plan (el
  asistente te lo sugiere).

### Paso 3 — Ejecución, en una sesión nueva

Abre una sesión nueva (`/clear` o una terminal nueva). El contexto del diseño ya no ayuda y
encarece cada turno: el plan y la spec en disco son todo el traspaso.

```
/executing-plans docs/plans/AAAA-MM-DD-<tema>.md
```

- **`executing-plans`** (por defecto): tarea a tarea en la propia sesión, con este ciclo:
  1. stub;
  2. rojo por aserción;
  3. verde;
  4. prueba de cada test de guarda sin su protección;
  5. refactor.
     Solo pregunta si algo cambió: un caso que la tabla no cubre, un caso que no se puede implementar
     tal como está escrito, o un desvío del plan. Lo hace una vez y agrupado.
- **`subagent-driven-development`**: solo para planes grandes de tareas independientes
  ([§6](#6-cuándo-compensa-subagent-driven-development)).

### Paso 4 — Auditoría, una sola vez al final

1. Mutación del código nuevo: `pnpm test:mutation:changed <base>`
   ([§9](#9-mutación-del-código-nuevo)).
2. Revisión adversarial con `adversarial-review` ([§7](#7-la-revisión-adversarial)).
3. Documentación: `CLAUDE.md`, README, y la spec o el plan si cambió una decisión.
4. DoD completa.
5. Informe con la sugerencia de commit.

**Qué esperar:** la cadena completa se midió **antes** de estos ajustes, con la misma feature del
exprés:

- ~3 h 30 min y 52,54 USD con subagentes;
- ~2 h y 23,19 USD ejecutando el mismo plan inline.

Los ajustes eliminan justo lo que el experimento señaló como coste sin retorno: el código en el
plan (≈85 % del coste de diseño), los subagentes por tarea (5,4× el coste de la ejecución inline)
y las confirmaciones rutinarias. **Todavía no se ha medido la cadena ajustada**; la estimación es
de 1 h 30 min a 2 h para una feature de ese tamaño.

## 6. Cuándo compensa subagent-driven-development

**Solo cuando se cumple todo esto:**

- el plan tiene ~10 tareas o más;
- la mayoría no toca los mismos archivos;
- el contexto de una sesión no aguantaría la ejecución inline completa.

**Por qué es la excepción:** con un plan de 11 tareas acopladas costó 36,01 USD y ~129 min de
máquina. `executing-plans` produjo el mismo código en ~17 min por 6,66 USD. Los 16 revisores por
tarea (8 de spec y 8 de calidad) encontraron 0 defectos.

**Cómo funciona ahora:**

- Un implementer `general-purpose` por tarea. Lee su tarea del archivo del plan, en vez de recibirla
  pegada: el 38 % de lo que escribía el controlador era texto de tareas pegado.
- Tras cada tarea, el controlador hace una **comprobación mecánica**, sin subagente:
  - la lista de `it` coincide con la tabla, leída con `pnpm test <specs> --reporters=default --verbose`
    (dentro de Claude Code, sin `--reporters=default` Jest no imprime ningún título);
  - hay rojo por aserción;
  - hay prueba de cada guarda;
  - `typecheck` pasa;
  - no hay imports prohibidos en `domain/`;
  - los archivos que tocó la tarea son los que declaraba, comparando una huella del árbol tomada
    antes de lanzarla: sin commits entre tareas, `git status` las acumula todas.
- Una tarea de riesgo no lleva revisión propia: sus guardas se prueban en la comprobación mecánica
  y la auditoría se queda al final, que es donde encontró lo que los 16 revisores por tarea no
  vieron.
- Al final: mutación del código nuevo, revisión adversarial del diff completo, la mutación otra vez
  si la revisión tocó `domain/` o `application/`, DoD e informe.

## 7. La revisión adversarial

**Qué es:** un único subagente `general-purpose` que carga `CLAUDE.md` y recibe un prompt fijo,
[`.claude/skills/adversarial-review/reviewer-prompt.md`](../.claude/skills/adversarial-review/reviewer-prompt.md).
Busca defectos reales en el diff respecto a la base:

1. fallos de corrección, con un escenario concreto;
2. respuestas del contrato que hoy no se pueden producir, y respuestas producibles que no están
   declaradas;
3. tests de guarda que seguirían en verde sin su protección;
4. huecos de test;
5. convenciones de `CLAUDE.md`.

**Reglas del revisor:**

- No edita el repo, ni siquiera temporalmente.
- Para demostrar un hallazgo trabaja en una copia nueva del árbol en su scratchpad, sin artefactos
  (unos 4 MB) y con `node_modules` enlazado. Ejecuta las herramientas con `node`, nunca con
  `pnpm <script>`: la verificación de dependencias de pnpm reescribiría el `node_modules` real a
  través del enlace.
- La copia aísla archivos, no bases de datos: nunca ejecuta `migration:*`, `db:*` ni `seed:*`, que
  apuntan a la base de desarrollo, y una protección de esquema no se quita editando la copia.
- Mientras revisa, la sesión principal espera: los E2E comparten la base de test.

**Después:** la sesión verifica cada hallazgo y lo clasifica como real o falso positivo.

- **Crítico o importante:** lo corrige, con el test primero.
- **Menor:** va al informe.
- **Mutación otra vez** si alguna corrección tocó `domain/` o `application/`: el score del informe
  es el del código final.
- **Segunda pasada** si alguna corrección cambió el comportamiento de producción, aunque sea en un
  solo archivo, acotada a los archivos tocados.

**Uso suelto:** `/adversarial-review` (base opcional; por defecto, la bifurcación con `main`), o
«revisa esta rama antes del PR». Revisa **tu árbol** contra esa base: no recibe la rama de otro ni
puede cambiar de rama. Para el PR de otra persona, `/code-review <PR>`.

**Por qué sustituye a los revisores por tarea:**

- Los revisores por tarea no encontraron nada.
- La revisión adversarial encontró, en cada una de las cuatro ramas del experimento, el defecto
  importante que se había escapado, incluido un oráculo de enumeración que la cadena completa había
  dejado pasar.

**Coste:** de 12 a 22 minutos y de 200 000 a 330 000 tokens por revisión de una feature de ~30
archivos, según cuánto ejecute el revisor. La primera revisión de la rama exprés costó 4,92 USD.

## 8. Las dos comprobaciones que comparten todos los flujos

Las dos nacieron de defectos reales que la revisión encontró en la rama exprés. Las dos ya eran
reglas de `CLAUDE.md`, pero ningún paso del flujo las ejecutaba.

**1. Cada respuesta declarada tiene que poder producirse hoy.**

La tabla de contrato de la spec (o de la tarea del plan) lleva la columna «Camino que lo produce
hoy»: la entrada o el estado, y la rama del código que devuelve ese código de estado.

- Sin camino, no se declara. Una defensa para un estado futuro va en un comentario, junto con la
  condición que la haría alcanzable.
- El guard de contrato comprueba el 400, el 408 y el 429 en los dos sentidos, y exige el 401 y el 403
  donde los pone `@Auth`. Si un 404, un 409 o un 403 sin roles son alcanzables depende del código:
  eso lo responde quien escribe la spec.
- Caso real: la rama exprés publicó un 409 «si el reintento también choca». Con dos estados (y un
  único cambio posible, colocado → cancelado), el reintento siempre relee un pedido ya cancelado y
  responde 200. Era imposible de producir.

**2. Cada test de guarda tiene que fallar sin su protección.**

Un test de guarda protege una garantía: concurrencia, propiedad o visibilidad, autorización,
atomicidad, anti-enumeración o idempotencia.

- Para cada uno: quita un momento la protección (la condición del `WHERE`, el guard, la
  transacción o el nivel de aislamiento), comprueba que el test se pone rojo por aserción y
  restaura.
- Caso real: el E2E de «dos cancelaciones simultáneas» seguía en verde con el adaptador en
  `REPEATABLE READ`, justo la regresión que su comentario decía vigilar. Las dos transacciones se
  serializaban y nunca llegaban a intercalarse.
- La versión corregida bloquea la fila desde otra conexión, lanza el guardado y espera a que quede
  bloqueado de verdad (`pg_blocking_pids`) antes de liberar la fila. Así el intercalado deja de
  depender de la suerte.

**Resultado al aplicarlas.** Las correcciones de la rama exprés se hicieron ya con estas dos
comprobaciones. Los tests de guarda del adaptador se ejecutaron sin su protección (sin la versión
en el `WHERE`, con `REPEATABLE READ` y sin traducir el `23505`), y el contrato se contrastó código
a código con un test que fija los códigos declarados. La segunda revisión adversarial de la
feature no encontró defectos críticos ni importantes. Comprobó con Stryker las guardas de dominio
y aplicación y razonó las del adaptador. Es la misma feature revisada dos veces, no una medición
independiente.

## 9. Mutación del código nuevo

```bash
pnpm test:mutation:changed              # desde la bifurcación con main
pnpm test:mutation:changed <commit>     # desde una base concreta (la que guardó el flujo al empezar)
pnpm test:mutation:changed -- <commit>  # igual: el `--` que reenvía pnpm se ignora
pnpm test:mutation:changed <commit> --concurrency 2   # flags extra, tal cual a Stryker
```

**Qué audita** ([`scripts/mutation-targets.mjs`](../scripts/mutation-targets.mjs)), siempre
dentro del alcance de `stryker.config.mjs` (`domain/` y `application/` de cada módulo, más
`src/shared/domain/`), que el script lee de la propia config:

- las líneas añadidas o cambiadas desde la base. Re-indentar no cuenta (`git diff -w`), y un
  archivo movido o renombrado solo aporta lo que cambió respecto al original, también si el
  movimiento aún no está confirmado;
- los archivos nuevos enteros, incluidos los que aún no están en git;
- **el archivo que prueba cada spec o helper de test que haya cambiado, entero**. Un test
  debilitado puede dejar vivo cualquier mutante de su SUT, y hasta el 2026-10-01 un cambio que solo
  tocaba tests salía con «nada que mutar».

**Cómo lo calcula:** Stryker muta los archivos enteros y el script puntúa solo los mutantes que
TOCAN esas líneas. Antes se le pasaban rangos `archivo:ini-fin` y Stryker solo muta lo que el
rango contiene entero: un `&&` añadido a una condición de dos líneas o el cuerpo de un método nuevo
quedaban fuera, y un cambio así podía dar cero mutantes y salir en verde.

**Cómo leer el resultado:**

- La lista de supervivientes que imprime es la del cambio; no hay que cruzarla a mano con el diff.
- Por cada superviviente, el flujo propone el caso que lo mata. Ese test pasa en verde a la
  primera, porque el código ya hace lo que afirma: el rojo se demuestra aplicando el mutante a
  mano, viendo el test fallar por aserción y restaurando (ver la skill `express`, paso 3).
- Un mutante equivalente —ningún test puede distinguirlo— se marca en el código con
  `// Stryker disable next-line <Mutador>: <motivo>` y se cita en el informe. Sin marcar cuenta
  como superviviente, y con pocos mutantes uno solo basta para bajar del umbral.
- El `thresholds.break: 85` de la config se aplica a los mutantes del cambio. Sin mutantes
  válidos el script lo dice y sale con 0: no hay nada que auditar, que no es un 100 %.
- Las filas `P` (propiedad, `@fast-check/jest`) matan mutantes bajo Stryker porque
  `test/stryker-setup.ts` fija la semilla de fast-check en esas corridas. Sin ella, el título del
  test cambiaba de una corrida a otra, Stryker no lo encontraba y daba por vivo lo que la
  propiedad mataba.

**Y el gate global:** `pnpm test:mutation` sigue mutando todo el alcance, y el job `mutation` de la
CI es el que protege `main`. Para un módulo entero, con los dos globs separados por coma y **sin
llaves** —Stryker parte `--mutate` por comas antes de expandirlas, y `{domain,application}` daba
cero mutantes, score `NaN` y salida 0—:

```bash
pnpm test:mutation --mutate "src/modules/<context>/domain/**/*.ts,src/modules/<context>/application/**/*.ts"
```

## 10. Git: quién hace los commits

**El asistente nunca hace commits.** Es una regla de `CLAUDE.md` que desde el 2026-09-30 también
impone el repo. [`.claude/settings.json`](../.claude/settings.json) deniega a todos los agentes
(sesión principal, subagentes y agentes de un Workflow) los subcomandos de git que escriben
historia, mueven `HEAD` o una ref, tocan el índice o descartan trabajo:

- `add` y su sinónimo `stage`, `apply`, `commit`, `push`, `pull`, `tag`, `rebase`, `merge`,
  `cherry-pick`, `revert`, `am`;
- `branch` entero, `update-ref`, `symbolic-ref`, `notes`, `replace`, `bisect`, `worktree`;
- `stash` entero, `reset`, `checkout`, `switch`, `restore`, `clean`, `mv`, `rm`, `checkout-index`,
  `read-tree`, `update-index`;
- `filter-branch`, `gc`, `prune`, `reflog expire` y `reflog delete`, que borran lo que permitiría
  recuperar trabajo.

Cada uno va en tres formas —`git <sub> *`, `git * <sub> *` y `git * <sub>`—, así que cubren el
subcomando a secas y cualquier opción global delante (`-C <dir>`, `-c k=v`, `--no-pager`,
`--git-dir=…`). La tercera hace falta porque el ` *` final solo casa con nada cuando es el único
comodín de la regla (medido con Claude Code 2.1.283). Hasta el 2026-10-01 la lista tenía solo dos
formas y dejaba pasar `git -C <dir> stash`, `git -c k=v commit` y `git branch -q -D x`.
[`src/__tests__/claude-settings.spec.ts`](../src/__tests__/claude-settings.spec.ts) fija la lista y
modela esa semántica del comodín. Los comandos compuestos se comprueban parte a parte, y por eso
`cd <dir> && git commit` también queda bloqueado; `show` y `rev-parse` siguen permitidos, igual que
las lecturas de la tabla.

| Comando                                                                                                              | Resultado medido (Claude Code 2.1.283) |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `git commit …`, `git -C <dir> commit …`, `git -c k=v -C <dir> commit …`, `cd <dir> && git commit …`                  | Denegado; ningún commit en el repo     |
| `git -C <dir> stash`, `git -C <dir> branch -q -D x`, `git -C <dir> mv a b`, `git -C <dir> read-tree -u --reset HEAD` | Denegado                               |
| `git status`, `git log`, `git diff`, `git merge-base`, `git reflog`, `git --no-pager -C <dir> log`                   | Permitido                              |

**Lo que cuesta y lo que no cubre:**

- `git branch` y `git stash` se deniegan enteros, también para leer. En su lugar:
  `git rev-parse --abbrev-ref HEAD` y `git log -g refs/stash`.
- Una búsqueda cuyo término es un subcomando (`git log -S reset`) da un falso positivo; el Grep de
  la sesión no tiene ese problema.
- Es una barandilla, no un sandbox: solo ve comandos que empiezan por `git`, y un `git fetch` con
  refspec local (`git fetch . a:b`) sigue moviendo una ref. La norma sigue siendo
  la de `CLAUDE.md`.
- No está documentado si el prefijo `!` dentro de una sesión se somete a estas reglas, y no se
  midió.

**Cómo haces tú los commits:**

- Desde **tu propia terminal**, como en todo el experimento.
- Cada flujo termina con un mensaje propuesto en Conventional Commits, con un scope de la lista
  cerrada de `commitlint.config.cjs`.
- Momentos habituales de commit:
  - flujo completo: la spec, el plan y la implementación;
  - exprés: una sola vez al final.
- Trabaja en una rama propia, creada con `git switch --no-track -c <rama>`: `main` exige PR y
  checks en verde.

## 11. Preparar el entorno

Para que un flujo corra sin rescates:

- **Node y pnpm de `.nvmrc` y `packageManager`.** Comprueba qué `node` ve la herramienta de
  terminal del asistente: si el primero del `PATH` es otro, `pnpm` falla antes de ejecutar nada.
  La solución que se midió es un hook `SessionStart` en tu `.claude/settings.local.json`, que no se
  versiona. Resuelve UNA vez, al arrancar la sesión, la versión de `.nvmrc`, y escribe en
  `$CLAUDE_ENV_FILE` solo el `PATH` resultante; la sesión y sus subagentes lo heredan:

  ```json
  {
    "hooks": {
      "SessionStart": [
        {
          "hooks": [
            {
              "type": "command",
              "command": "source ~/.nvm/nvm.sh && nvm use >/dev/null && echo \"export PATH=\\\"$(dirname \"$(nvm which current)\")\\\":\\\"\\$PATH\\\"\" >> \"$CLAUDE_ENV_FILE\""
            }
          ]
        }
      ]
    }
  }
  ```

  Escribir en `$CLAUDE_ENV_FILE` el propio `source ~/.nvm/nvm.sh && nvm use`, como hacía la receta
  anterior, también funciona, pero ese archivo se ejecuta antes de **cada** comando: medido, 0,19 s
  por comando, frente a 0,016 s con el `PATH` ya resuelto. Si tu PostgreSQL de Docker no usa el
  puerto por defecto, añade también `export DB_PORT=…` al archivo desde el mismo hook.

- **Base de datos:** `pnpm db:up` y, en un clon nuevo, `pnpm db:migrate:test` (o `pnpm db:reset`,
  que migra las dos). Los E2E y la revisión adversarial la necesitan.
- **Modo de permisos:** si tu configuración global arranca las sesiones en modo plan, pasa a un
  modo que ejecute (`--permission-mode` al lanzar `claude`, o `Shift+Tab`) antes de invocar un
  flujo.

## 12. De dónde sale todo esto: el experimento del 2026-09-30

### Qué se comparó

La misma feature se implementó en cuatro ramas desde el mismo commit: cancelar un pedido
(`POST /orders/:id/cancel`, idempotente, con concurrencia optimista, el evento por el outbox y una
migración aditiva).

- **Todas las ramas usaron el mismo arnés:**
  - mismo modelo: Opus 5.5 con esfuerzo `xhigh`;
  - misma versión de Claude Code: 2.1.283;
  - git mutante denegado;
  - sin acceso a los materiales del experimento.
- **Después, a ciegas:** un revisor adversarial revisó cada rama sin saber de dónde venía.

| Rama | Qué hizo                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------ |
| A    | Cadena completa original: brainstorming → writing-plans (plan con código) → subagentes por tarea |
| C    | El mismo plan de A, ejecutado inline con executing-plans                                         |
| B    | Control: solo la spec de A, sin acceso a ninguna skill                                           |
| E    | Flujo exprés, desde cero                                                                         |

### Resultados

|                                              | A (completo)                 | C (plan + inline) | B (solo spec)            | **E (exprés)**                                      |
| -------------------------------------------- | ---------------------------- | ----------------- | ------------------------ | --------------------------------------------------- |
| Tiempo total                                 | ~3 h 30 min                  | ~2 h              | ~1 h                     | **41 min**                                          |
| Coste total                                  | 52,54 USD                    | 23,19 USD         | ≈8,3 USD                 | **11,82 USD**                                       |
| Intervenciones humanas                       | 14                           | 17                | ~11                      | **4**                                               |
| Documentos                                   | spec 320 + plan 2 824 líneas | los mismos        | spec 320                 | **spec 108**                                        |
| Tests nuevos                                 | 42                           | 42                | 37                       | 43                                                  |
| Specs con rojo por aserción (TDD real)       | 0 de 5                       | 0 de 5            | 0 de 5                   | **5 de 5**                                          |
| Mutación del código nuevo                    | 100 %                        | 100 %             | 95,2 %                   | 100 %                                               |
| «debería», AAA, idioma, 1:1                  | 100 %                        | 100 %             | 100 %                    | 100 %                                               |
| Documentación actualizada                    | sí                           | sí                | no                       | sí                                                  |
| Defectos importantes en la revisión a ciegas | 1: oráculo de enumeración    | 1: el mismo       | 1: el mismo, más 2 casos | 2 propios (409 inalcanzable, E2E que no discrimina) |

El oráculo de enumeración era un 404 que debía ser indistinguible entre un pedido ajeno y uno
inexistente, y que se distinguía por las mayúsculas del UUID. E lo cerró desde el diseño.

### Qué se aprendió

- **La spec y su tabla de casos son lo que aporta calidad.** B, con la spec pero sin el contrato
  de casos, perdió dos casos, sus dos mutantes vivos y la documentación.
- **El plan con el código dentro convierte el TDD en ceremonia.**
  - El 100 % del código de producción salió literal del plan, y ningún test falló por aserción.
  - Escribir ese plan fue ≈85 % del coste del diseño.
- **Los subagentes por tarea multiplican el coste sin mejorar el resultado.**
  - A y C escribieron prácticamente el mismo código, con 5,4× de diferencia de coste en la
    ejecución.
  - Los 16 revisores por tarea encontraron 0 defectos.
- **La revisión adversarial final sí encuentra defectos reales**, en cada una de las ramas.
- **`CLAUDE.md` basta para las convenciones.**
  - B, sin acceso a ninguna skill, cumplió el 100 %.
  - `CLAUDE.md` es el 7,7–12,6 % del contexto de cada sesión; las skills, ~1 %.
- **El exprés fue el más rápido y barato, y el único con TDD real.** Cerró el defecto de
  seguridad que compartían las otras tres ramas. Sus dos defectos propios los previenen ahora las
  dos comprobaciones de la [§8](#8-las-dos-comprobaciones-que-comparten-todos-los-flujos).

### Decisiones

Las reglas de decisión se fijaron (y se sellaron con un hash) antes de ejecutar la primera rama.

| #   | Ajuste                                                         | Estado                                                                                                           |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| —   | Flujo exprés por defecto para features dentro de un contexto   | **Aplicado**: skill `express`                                                                                    |
| D1  | Confirmación de casos solo cuando algo cambió                  | **Aplicado** (3 confirmaciones medidas, 0 cambios)                                                               |
| D2  | Plan sin código de producción; stub primero; rojo por aserción | **Aplicado** en `writing-plans` y en los ejecutores                                                              |
| D3  | Sustituir los revisores por tarea                              | **Aplicado**: comprobación mecánica y una revisión final                                                         |
| D4  | Mutación una vez por plan, del código nuevo                    | **Aplicado**: `pnpm test:mutation:changed`                                                                       |
| D5  | Quitar el «cita las tres skills» de los prompts                | **Aplicado**: las referencias son a demanda (no saltaba la regla, pero lo pedía D14)                             |
| D6  | El implementer lee su tarea del plan                           | **Aplicado** en `subagent-driven-development` (el 38 % de lo que escribía el controlador era texto pegado)       |
| D7  | Correcciones por mensaje al mismo implementer                  | No aplicado: 0 re-despachos medidos                                                                              |
| D8  | Ejecutar en sesión nueva tras el plan                          | **Aplicado** como recomendación en `writing-plans` y `executing-plans`                                           |
| D9  | `executing-plans` por defecto                                  | **Aplicado**                                                                                                     |
| D10 | Brainstorming alineado con «no trivial» y preguntas agrupadas  | **Aplicado**: solo para el flujo completo, rondas de hasta 4 preguntas (no saltaba por umbral, sí por el exprés) |
| D11 | Plantillas de spec y plan en español                           | No aplicado: no saltó ninguna regla                                                                              |
| D12 | Plantilla propia para el revisor final                         | **Aplicado**: skill `adversarial-review`                                                                         |
| D13 | El revisor del plan comprueba tablas de casos y contrato       | **Aplicado**                                                                                                     |
| D14 | Quitar de las skills lo que ya dice `CLAUDE.md`                | **Aplicado** en `javascript-typescript-jest` y en los prompts                                                    |
| D15 | Git mutante bloqueado por configuración                        | **Aplicado**: `.claude/settings.json` más su spec                                                                |
| —   | Adelgazar `CLAUDE.md`                                          | **Aplicado** el 2026-10-02 (backlog #32)                                                                         |

### Límites

- **Una sola ejecución por rama.** Los resultados indican; no son estadística. La variación entre
  revisores a ciegas se ve.
- **El orden de las ramas (A → C → B → E) mete aprendizaje humano.** El usuario respondió menos y
  más rápido en las últimas.
- **La cadena completa ajustada no se ha medido.** Su tiempo es una estimación.

## 13. Mantener los flujos

### Cambiar una skill

- **Las skills son documentación del repo.** Lint y Prettier ignoran `.claude/`, así que ninguna
  herramienta verifica su formato. Revisa el diff a mano.
- **Si tocas el `description` de una skill**, recuerda que decide cuándo se activa sola. Los
  criterios de nivel tienen que coincidir en tres sitios: `CLAUDE.md` («Skills and development
  flows»), las descripciones de `express`, `brainstorming` y `writing-plans`, y este documento.
- **Si tocas el prompt del revisor o los pasos de un flujo**, pruébalo en una feature pequeña y
  compara con la referencia medida de la [§1](#1-los-tres-niveles): tiempo, coste, rojos por
  aserción, mutación y hallazgos de la revisión.
- **`skills-lock.json`** fija el origen externo de las siete skills adaptadas. `express` y
  `adversarial-review` son propias del repo y no tienen entrada.

### Señales para revisar un flujo

- **La revisión adversarial encuentra dos veces el mismo tipo de defecto:** falta una comprobación
  en el flujo. Así nacieron las dos de la
  [§8](#8-las-dos-comprobaciones-que-comparten-todos-los-flujos).
- **Una spec exprés supera a menudo las 150 líneas, o necesita más de dos rondas:** esa clase de
  tarea es de flujo completo.
- **Una tarea de flujo completo termina con un diseño que cabía en una spec exprés:** el criterio
  de nivel está demasiado alto.
- **`executing-plans` agota el contexto en planes medianos:** revisa el umbral de
  `subagent-driven-development`.

### Siguiente paso decidido

- **Adelgazar `CLAUDE.md`** (`docs/backlog.md` #32): **hecho el 2026-10-02.** Pasó de 64 510 a
  34 476 bytes (−46,6 %): cada regla conserva su porqué en una cláusula o, si el largo salió, tras
  un enlace, y el historial y las mediciones se fueron a `docs/` (`toolchain.md`, `architecture.md`, `api-contract.md`,
  `database.md` y `testing.md`). Por qué no llegó a la mitad: ver el cierre del #32.

### Propuestas abiertas (decisión del usuario)

- **Guarda automática de convenciones de test** (`docs/backlog.md` #30): hoy nada verifica por
  script el «debería», los tres marcadores AAA ni el 1:1.
- **Evals de regresión de los flujos** con `claude plugin eval`. ⚠️ Esa herramienta publica el
  informe en claude.ai por defecto; hay que usar `--no-publish`.
