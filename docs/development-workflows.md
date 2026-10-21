# Flujos de desarrollo con IA

Cómo se trabaja en este repositorio con un asistente de IA (Claude Code y las skills de
[`.claude/skills/`](../.claude/skills/)): qué sigue vigente, qué se retiró y por qué, cómo
funcionan las piezas que comparten los flujos y las mediciones que lo justifican, para no tener que
repetir la discusión.

## Flujo vigente (2026-10-20)

Dos niveles: **Directo**, por defecto y sin skill, y
**[`/feature`](../.claude/skills/feature/SKILL.md)**. Cuándo va cada cambio por uno u otro y qué
se ejecuta al cerrar lo fijan [`CLAUDE.md`, «Flujo de trabajo»](../CLAUDE.md#flujo-de-trabajo) y
el propio skill; aquí no se repite, para no abrir la segunda fuente que backlog #29 decidió no
abrir. [`adversarial-review`](../.claude/skills/adversarial-review/SKILL.md) es el último paso de
`/feature` y, en Directo, va a petición.

**Qué sigue vigente de este documento:** §7 a §11 (la revisión adversarial, las dos
comprobaciones, la mutación del código nuevo, git y el entorno) y §13. §1 a §6 describen los
flujos retirados el 2026-10-20, y §12, el experimento que los midió: se quedan como historia, con
sus mediciones.

### Qué se retiró y por qué

Había nueve skills en `.claude/skills/`: se retiraron ocho y `adversarial-review` se adelgazó. Los
datos salen de la auditoría de solo lectura del 2026-10-20, sobre las mediciones de este documento
y los 91 transcripts del proyecto (del 17 al 20 de octubre):

- **Casi no se usaban:** 6 llamadas a Skill en toda la historia. `subagent-driven-development` y
  `javascript-typescript-jest` no se usaron nunca, y `nestjs-best-practices`, en una sola sesión.
- **El tiempo se iba fuera del código:** la planificación, 2,76 h activas (1,23 M tokens de salida
  y ninguna edición en `src/`); la implementación, 2,35 h; el cierre, 7,77 h, 3,3 veces la
  implementación.
- **El coste crecía con la ceremonia** (la misma feature,
  [§12](#12-de-dónde-sale-todo-esto-el-experimento-del-2026-09-30)): exprés, 41 min y 11,82 USD;
  sin skills, ~1 h y ≈8,3 USD; plan e inline, ~2 h y 23,19 USD; cadena completa, ~3 h 30 min y
  52,54 USD.
- **La carga fija por sesión era de ~44k tokens:** ~10k del `CLAUDE.md` del proyecto, ~6k del
  listado de skills y el resto, configuración global del usuario, fuera del repo.
- **Lo que sí aportó calidad sigue en `/feature`:** la tabla de casos con rojo por aserción (solo
  el exprés llegó a 5 de 5), la revisión adversarial final (encontró un defecto importante en las
  cuatro ramas) y las dos comprobaciones de la [§8](#8-las-dos-comprobaciones-que-comparten-todos-los-flujos)
  (cada una cazó un defecto real).

| Skill                         | Qué era                            | Por qué se retiró                                                                                                                                                   | Qué la sustituye                                                     |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `express`                     | El flujo exprés                    | Es la base de `/feature`: el más rápido y barato del experimento, y el único con TDD real                                                                           | `/feature`                                                           |
| `brainstorming`               | El diseño del flujo completo       | La cadena completa costó 4,4 veces el exprés (52,54 frente a 11,82 USD) y dejó pasar el oráculo de enumeración que el exprés cerró desde el diseño                  | El modo grande de `/feature`: spec con 2–3 enfoques y una aprobación |
| `writing-plans`               | El plan escrito                    | El plan de 2 824 líneas llevaba el código dentro: fue ≈85 % del coste del diseño, el 100 % del código salió literal de él y 0 de 5 specs tuvieron rojo por aserción | La lista «Estado» de la spec en el modo grande                       |
| `executing-plans`             | La ejecución del plan en la sesión | Sin plan no hay qué ejecutar; con él, ~2 h y 23,19 USD frente a los 41 min del exprés                                                                               | Los pasos 4 a 10 de `/feature`                                       |
| `subagent-driven-development` | Un implementer por tarea           | Ninguna sesión real la usó; en el experimento, 36,01 USD frente a 6,66 USD del mismo código inline, y 0 defectos en 16 revisores por tarea                          | —                                                                    |
| `javascript-typescript-jest`  | Convenciones de Jest               | No se usó nunca; la rama sin skills cumplió el 100 % de las convenciones solo con `CLAUDE.md`                                                                       | `CLAUDE.md`, «Code conventions»                                      |
| `nestjs-best-practices`       | ~119k tokens de NestJS genérico    | Se leyó en una sesión y contradice el repo: tokens `Symbol`, `@CreateDateColumn`, `jest.fn`, servicios                                                              | `CLAUDE.md` y [`nestjs-mapping.md`](nestjs-mapping.md)               |
| `clean-ddd-hexagonal`         | DDD y hexagonal genéricos          | Solo su `NESTJS-MAPPING.md` era propio del repo; las otras 7 referencias enseñan CQRS, puertos `I*Port` e `interface`, que el repo prohíbe                          | [`nestjs-mapping.md`](nestjs-mapping.md)                             |

**`adversarial-review` se adelgazó:** perdió la receta de copiar el repo al scratchpad del revisor,
cuyo propio texto avisaba de que podía vaciar `node_modules`; ahora es de solo lectura y sin
Stryker, y la segunda pasada solo se hace tras corregir un crítico.

## Contenido

- [Flujo vigente (2026-10-20)](#flujo-vigente-2026-10-20)

1. [Los tres niveles](#1-los-tres-niveles) (historia)
2. [Cómo elegir el flujo](#2-cómo-elegir-el-flujo) (historia)
3. [Nivel trivial](#3-nivel-trivial) (historia)
4. [Flujo exprés](#4-flujo-exprés) (historia)
5. [Flujo completo](#5-flujo-completo) (historia)
6. [Cuándo compensa subagent-driven-development](#6-cuándo-compensa-subagent-driven-development) (historia)
7. [La revisión adversarial](#7-la-revisión-adversarial)
8. [Las dos comprobaciones que comparten todos los flujos](#8-las-dos-comprobaciones-que-comparten-todos-los-flujos)
9. [Mutación del código nuevo](#9-mutación-del-código-nuevo)
10. [Git: quién hace los commits](#10-git-quién-hace-los-commits)
11. [Preparar el entorno](#11-preparar-el-entorno)
12. [De dónde sale todo esto: el experimento del 2026-09-30](#12-de-dónde-sale-todo-esto-el-experimento-del-2026-09-30)
13. [Mantener los flujos](#13-mantener-los-flujos)

---

## 1. Los tres niveles

> **Historia.** Estos tres niveles se retiraron el 2026-10-20; los vigentes están en
> [Flujo vigente](#flujo-vigente-2026-10-20). Se conservan por sus referencias medidas.

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

> **Historia.** El árbol y la tabla eligen entre los niveles retirados el 2026-10-20; hoy decide
> `CLAUDE.md`, «Flujo de trabajo».

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
| Bounded context nuevo                                               | Completo                     | El plan termina con el wiring: módulo, `AppModule` y scope de commitlint, y el test de contrato en verde               |
| Cambio entre contextos (fachada, puerto nuevo en `users.module.ts`) | Completo                     | Las puertas se segregan por intención (`UsersLookup`, `UsersProvisioning`)                                             |
| Auth, credenciales, tokens, permisos, guards                        | Completo                     | Tests de guarda obligatorios, con su prueba sin la protección                                                          |
| Refactor grande o transversal                                       | Completo                     | Si no cambia comportamiento, la tabla de casos se sustituye por «la suite sigue verde» y la mutación no baja           |
| Más de ~10 tareas, o trabajo que otra persona continuará            | Completo                     | La spec y el plan son el traspaso                                                                                      |
| Revisar el PR de otra persona                                       | `/code-review <PR>`          | `/adversarial-review` revisa tu árbol contra una base y no cambia de rama; para usarla, haz tú el checkout             |
| Revisar tu propio cambio antes de abrir el PR                       | `/adversarial-review` suelta | [§7](#7-la-revisión-adversarial)                                                                                       |
| Investigar sin cambiar código (¿por qué pasa X?, ¿dónde se hace Y?) | Sin flujo                    | Una pregunta directa. Si acaba en cambio, se clasifica entonces                                                        |

## 3. Nivel trivial

> **Historia.** Retirado el 2026-10-20; lo sustituye el modo Directo.

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

> **Historia.** `express` se retiró el 2026-10-20 y es la base de `/feature`. Se conserva por sus
> mediciones.

**Para qué:** una feature o un bug con lógica dentro de un contexto que ya existe. Es el flujo
por defecto.

**Cómo se invoca:**

```
/express Quiero que un cliente pueda cancelar sus pedidos.
```

La skill vivía en `.claude/skills/express/SKILL.md`. No usa
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

> **Historia.** `brainstorming`, `writing-plans` y `executing-plans` se retiraron el 2026-10-20;
> el trabajo grande va por el modo grande de `/feature`. Se conserva por sus mediciones.

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
- **`subagent-driven-development`**: retirada el 2026-10-20; ninguna sesión real la usó
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

> **Historia.** `subagent-driven-development` se retiró el 2026-10-20: ninguna sesión real la usó.
> Se conserva por su medición.

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

**Reglas del revisor:** de solo lectura y sin Stryker; qué comandos puede ejecutar sobre el árbol
lo fija su prompt. Hasta el 2026-10-20 trabajaba en una copia del árbol, y se quitó porque la
propia receta avisaba de que podía vaciar el `node_modules` real. Mientras revisa, la sesión
principal espera: los E2E comparten la base de test.

**Después:** la sesión verifica cada hallazgo y lo clasifica como real o falso positivo.

- **Crítico o importante:** lo corrige, con el test primero.
- **Menor:** va al informe.
- **Mutación otra vez** si alguna corrección tocó `domain/` o `application/`: el score del informe
  es el del código final.
- **Segunda pasada** solo tras corregir un hallazgo crítico, acotada a los archivos tocados.

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

La tabla de contrato (la de la spec o, sin spec, la aprobada en el chat) lleva la columna «Camino
que lo produce hoy»: la entrada o el estado, y la rama del código que devuelve ese código de
estado.

- Sin camino, no se declara. Una defensa para un estado futuro va en un comentario, junto con la
  condición que la haría alcanzable.
- El guard de contrato comprueba el 400, el 408 y el 429 en los dos sentidos, y exige el 401 y el 403
  donde los pone `@Auth`. Si un 404, un 409 o un 403 sin roles son alcanzables depende del código:
  eso lo responde quien escribe la tabla.
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
  primera, porque el código ya hace lo que afirma: su rojo lo demuestra la segunda corrida de
  mutación, sin reaplicar mutantes a mano (`/feature`, pasos 6 y 8).
- Un mutante equivalente —ningún test puede distinguirlo— se marca en el código con
  `// Stryker disable next-line <Mutador>: <motivo>` y se cita en el informe. Sin marcar cuenta
  como superviviente, y con pocos mutantes uno solo basta para bajar del umbral.
- El `thresholds.break: 90` de la config se aplica a los mutantes del cambio. Sin mutantes
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
- Momentos habituales de commit: en Directo y en `/feature`, uno al final; en el modo grande de
  `/feature`, uno por porción.
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

### Configuración recomendada de Claude Code

Comprobado el 2026-10-20 contra la documentación oficial y `claude --help`, con Claude Code
2.1.304. Lo que no se pudo comprobar va marcado.

- **`/autocompact 500k`, una vez.** Guarda la ventana de autocompactación en tu configuración de
  usuario, por modelo (`modelSettings`; antes de la v2.1.288 era una sola para todos), y la aplica
  a la sesión en curso. Acepta de 100K a 1M, y `/autocompact auto` vuelve a la de serie. Con una
  ventana nativa de 1M (Opus 4.7 en adelante) se compacta por defecto hacia los 967K
  ([documentación](https://code.claude.com/docs/en/model-config#set-the-auto-compact-window)).
  Los 500k (~50 % de la ventana) se propusieron el 2026-10-20 junto con «Sesiones» de
  `CLAUDE.md`. ⚠️ Que sean el umbral óptimo **no está verificado**: la documentación no recomienda
  ninguno.
- **`/context`:** qué ocupa la ventana, por categorías. La fila «Memory files» suma los `CLAUDE.md`
  y la memoria cargados: mídela antes y después de tocar `CLAUDE.md`. El 2026-10-20, el del
  proyecto ocupaba 9k tokens.
- **`/skills`:** las skills cargadas; `t` las ordena por tokens.
- **`/skill-doctor`:** cuánto cuesta en contexto cada skill y con qué frecuencia se usa (desde la
  v2.1.252).
- **Para medir un flujo:**
  - `claude --disable-slash-commands` desactiva todas las skills y los comandos de la sesión:
    sirve para comparar con y sin skills. Que siga cargando `CLAUDE.md` **no está verificado**: la
    documentación no lo dice.
  - `claude --safe-mode` arranca sin ninguna personalización: ni `CLAUDE.md`, ni skills, ni
    plugins, hooks, MCP o agentes propios. Sirve de línea base de coste, pero no para medir el
    cumplimiento de convenciones, porque tampoco carga el `CLAUDE.md` del proyecto.

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

> Estado al 2026-10-16. El 2026-10-20 se retiraron los skills donde se aplicaron
> ([Qué se retiró y por qué](#qué-se-retiró-y-por-qué)); `/feature` conserva D1, D2, D4, D12 y
> D15, y de D3, la revisión final.

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
| —   | Adelgazar `CLAUDE.md`                                          | **Aplicado** el 2026-10-16 (backlog #32)                                                                         |

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
  criterios de nivel tienen que coincidir en tres sitios: `CLAUDE.md` («Flujo de trabajo»), la
  descripción de `feature` y la tabla de niveles del README («Skills de IA y flujos de trabajo»).
  Este documento no los repite.
- **Si tocas el prompt del revisor o los pasos de un flujo**, pruébalo en una feature pequeña y
  compara con la referencia medida de la [§1](#1-los-tres-niveles): tiempo, coste, rojos por
  aserción, mutación y hallazgos de la revisión.

### Señales para revisar un flujo

- **La revisión adversarial encuentra dos veces el mismo tipo de defecto:** falta una comprobación
  en el flujo. Así nacieron las dos de la
  [§8](#8-las-dos-comprobaciones-que-comparten-todos-los-flujos).
- **Una spec de `/feature` supera a menudo las 150 líneas, o necesita más de una ronda de
  preguntas:** esa clase de tarea es de modo grande.
- **Una tarea de modo grande termina con un diseño que cabía en una sesión:** el umbral del modo
  grande está demasiado bajo.

### Siguiente paso decidido

- **Medir un cambio pequeño real en modo Directo**, con su tiempo y su coste, y anotarlo aquí: los
  cambios pequeños nunca se han medido. Si se quiere, también la prueba sin skills y la línea base
  sin personalización de la
  [configuración recomendada de Claude Code](#configuración-recomendada-de-claude-code).

### Propuestas abiertas (decisión del usuario)

- **Guarda automática de convenciones de test** (`docs/backlog.md` #30): los tres marcadores AAA
  los verifica `src/__tests__/aaa-convention.spec.ts` desde el 2026-10-20; el «debería» y el 1:1
  siguen sin script.
- **Evals de regresión de `/feature` y `adversarial-review`** con `claude plugin eval`. ⚠️ Esa herramienta publica el
  informe en claude.ai por defecto; hay que usar `--no-publish`.
