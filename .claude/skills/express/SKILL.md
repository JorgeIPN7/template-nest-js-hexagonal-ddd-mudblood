---
name: express
description: 'Flujo por defecto para una feature o un bug con lógica dentro de UN bounded context que ya existe (hasta ~8 tareas): mini-diseño con pocas preguntas agrupadas, spec corta con la tabla de casos y el contrato, TDD con rojo por aserción sin plan escrito, mutación del código nuevo, revisión adversarial final y DoD. No es para cambios triviales (errata, config que no es de seguridad, un bump de dependencia, un bug de una línea) ni para lo que pide la cadena completa: auth, credenciales, tokens o permisos —también su configuración—, un contexto nuevo, cambios entre contextos, una migración destructiva, más de ~10 tareas o trabajo que otra persona continuará.'
argument-hint: '<qué quieres construir o arreglar>'
---

# Flujo exprés

Objetivo: la calidad de la cadena completa en una fracción del tiempo. Se conserva lo que aporta
valor —una spec con decisiones, el **contrato de casos**, el rojo por aserción y una revisión que
busca fallos reales— y se quita lo que no aportaba: el plan con el código dentro, los subagentes
por tarea y la lectura de las skills de referencia. La evidencia y el resto de flujos están en
`docs/development-workflows.md`.

## 0. ¿Es el nivel correcto?

Clasifica la petición antes de nada (tabla de niveles en `CLAUDE.md`, «Skills and development
flows»), **en este orden**: el riesgo se mira antes que el tamaño, porque un cambio de seguridad de
una línea sigue siendo un cambio de seguridad.

1. **Completo** si toca cualquiera de estas cosas: auth, credenciales, tokens o permisos —también
   su configuración: CORS, CSP, cabeceras, los costes de argon2, el `deny` de
   `.claude/settings.json`—; un bounded context nuevo; más de un contexto (fachadas, puertos entre
   módulos); una migración que borra o renombra (expand/contract); más de ~10 tareas; trabajo que
   otra persona o sesión continuará. **Para y propón `/brainstorming`** al usuario con el motivo
   en una frase: el coste de la cadena completa lo decide él.
2. **Trivial** —errata, texto, configuración que no es de seguridad, un bump, un bug de una línea
   con su test evidente—: no uses este flujo. Haz el cambio, su test si aplica y la DoD.
3. En cualquier otro caso, sigue.

## Reglas que valen durante todo el flujo

- **Nada de git que escriba** historia, mueva `HEAD` o una ref, toque el índice o descarte
  trabajo: ni `commit`, `add`, `push`, `stash`, `reset`, `checkout`, `switch`, `restore`, `merge`,
  `branch`, `mv` ni `rm`. `.claude/settings.json` los bloquea; no busques un rodeo. Al final
  sugieres el commit y lo hace el usuario.
- **Sin plan escrito ni subagentes**, salvo el revisor del paso 4.
- **`CLAUDE.md` basta para las convenciones.** No leas las skills de referencia. La excepción es
  una feature que necesite un tipo de artefacto que el módulo todavía no tiene: entonces lee solo
  la sección que toque de `.claude/skills/clean-ddd-hexagonal/references/NESTJS-MAPPING.md`. Para
  la forma de un archivo, copia el más parecido del propio módulo o de `src/modules/users/`.
- Al empezar, guarda la base con `git rev-parse HEAD`. La usan los pasos 3 y 4.

## 1. Mini-diseño y spec corta

1. Lee el código del módulo afectado: entidades, puertos, casos de uso, controller y sus tests.
2. **Pregunta solo lo que decide el usuario**: negocio, contrato público y riesgo. Como máximo
   **dos rondas** de `AskUserQuestion`, de hasta 4 preguntas cada una, con opciones y tu
   recomendación primero. Lo técnico lo decides tú y lo anotas con su porqué.
3. Escribe `docs/specs/AAAA-MM-DD-<tema>-express.md`, de **150 líneas como máximo**, con estas
   secciones:
   - **Objetivo**, en una frase.
   - **Decisiones**: las de negocio (del usuario) y las técnicas (tuyas), una línea cada una con
     su porqué.
   - **Casos acordados**: tabla `| # | Caso (se vuelve el it) | Entrada / estado | Resultado |`,
     solo para `domain/` y `application/`. Casos puntuales, más filas `P` de propiedad cuando
     haya un «siempre» o un «nunca». Cada caso empieza por «debería…» y se redacta en lenguaje de
     negocio.
   - **Contrato**: el endpoint y la tabla `| Código | Motivo | Camino que lo produce hoy |`.
     **Cada respuesta declarada tiene que poder producirse hoy**: la tercera columna nombra la
     entrada o el estado y la rama del código que la devuelven. Si no encuentras ese camino, no
     la declares. Si es una defensa para el futuro, va en un comentario del código, junto con la
     condición que la haría alcanzable. Marca con ⚠️ los cambios en respuestas que ya existen.
   - **Persistencia**: si hay migración y si es aditiva. Una destructiva no cabe en este flujo.
     Una columna `NOT NULL` añadida lleva `DEFAULT`, o el despliegue falla sobre una tabla con
     filas aunque los E2E pasen sobre la vacía (`CLAUDE.md`, «Destructive migrations»).
   - **Fuera de alcance**.
4. Presenta la spec y la tabla para **una sola aprobación**. Si cambian, corrige y sigue. Solo hay
   segunda ronda de aprobación si cambia el comportamiento.

Si el usuario ya trae la spec, complétala con lo que falte de esta lista (sobre todo la tabla y el
contrato) y pide la aprobación igualmente.

## 2. TDD capa a capa

Orden: dominio → aplicación → infraestructura (persistencia y migración, filter, DTO) → HTTP →
E2E.

- Cada fila de la tabla se convierte exactamente en un `it`, con el texto del caso como título.
  La infraestructura no lleva tabla, pero sí tests, unitarios o E2E según `CLAUDE.md`.
- **El rojo tiene que ser por aserción.** Si el SUT no existe, crea antes un _stub_ que compile y
  **devuelva un valor neutro del tipo correcto**, sin lanzar. Un stub que lanza
  `new Error('no implementado')` hace fallar los tests de valor en la línea `// Act`, por
  excepción y no por aserción, y deja en verde cualquier `toThrow()` sin clase: por eso los
  `toThrow` llevan siempre la clase del error. `pnpm test <spec>` (o `pnpm test:e2e <spec>` para un
  `*.e2e-spec.ts`) tiene que fallar **en la aserción**, no con «Cannot find module» ni con un
  error de compilación. Después implementa lo mínimo para pasar a verde, y luego refactoriza.
- **Los tests de guarda tienen que fallar sin la protección.** Un test de guarda es el que
  protege una garantía: concurrencia, propiedad o visibilidad, autorización, atomicidad,
  anti-enumeración o idempotencia.
  - Por cada uno, quita la protección un momento: la condición del `WHERE`, el guard, la
    transacción o el nivel de aislamiento.
  - Comprueba que el test se pone rojo por aserción y restaura la protección.
  - Si sigue en verde, el test no protege nada y hay que rehacerlo. Por ejemplo, un E2E de
    concurrencia determinista en vez de dos promesas lanzadas a la vez.
  - Anota cada comprobación para el informe.
- Al cerrar cada capa, pasa `pnpm typecheck` y los tests de esa capa.
- **Un caso nuevo que cambie el comportamiento** se anota y se pregunta junto con los del paso 3,
  en una sola pregunta, salvo que te bloquee.
- Migración:
  - créala con `pnpm migration:generate src/database/migrations/<Name>`;
  - empieza su `up()` y su `down()` con `SET LOCAL lock_timeout = '5s'`, que el generador no
    escribe y `migration-conventions.spec.ts` exige;
  - aplícala a desarrollo y a test con `pnpm migration:run` y `pnpm db:migrate:test`;
  - comprueba que no queda diff entre las entidades y el esquema con
    `pnpm migration:generate src/database/migrations/Check --check`.
- Endpoints: la documentación OpenAPI completa que exige `CLAUDE.md`, desde el principio, con los
  códigos de la tabla «Contrato» y ninguno más.

## 3. Mutación del código nuevo

```bash
pnpm test:mutation:changed <BASE>
```

Audita lo que añadiste o cambiaste en `domain/` y `application/` desde `<BASE>`: las líneas
cambiadas, los archivos nuevos enteros y el SUT entero de cada spec que tocaste. Qué entra y cómo
lo puntúa: `docs/development-workflows.md`, «Mutación del código nuevo».

- Por cada superviviente, propón el caso que lo mata, que será una fila más para la tabla.
  **Pregunta todos juntos en una sola `AskUserQuestion`**, con los casos que dejó el paso 2.
- Con los casos aprobados: añade las filas a la spec y escribe los tests. **Pasan en verde a la
  primera**, porque el código ya hace lo que afirman: el rojo por aserción se demuestra aplicando
  el mutante a mano (la sustitución que imprime el informe), viendo el test fallar en su
  aserción y restaurando el código. Anótalo como el rojo de ese caso y vuelve a correr la
  mutación.
- Un superviviente equivalente —ningún test puede distinguirlo— se marca en el código con
  `// Stryker disable next-line <Mutador>: <motivo>` y se cita en el informe. No se escribe un
  test que no pueda fallar, y sin la marca cuenta como superviviente.

## 4. Revisión adversarial

Invoca la skill `adversarial-review` con `<BASE>` y la ruta de la spec. Corrige lo crítico y lo
importante como ella indica; lo menor va al informe.

Si alguna corrección tocó `domain/` o `application/`, **vuelve a correr
`pnpm test:mutation:changed <BASE>`**: el score que llega al informe es el del código final, no el
de antes de la revisión.

## 5. Definition of Done y documentación

```bash
pnpm typecheck && pnpm lint:check && pnpm format:check && pnpm test && pnpm test:e2e && pnpm build
```

- Actualiza `CLAUDE.md` y `README.md` si la feature cambia la descripción de un módulo (por
  ejemplo, «one use case»), un contrato público o la tabla de endpoints.
- Si algo de la spec cambió durante la implementación, actualiza la spec: es el registro de lo que
  se decidió.

## 6. Informe final

Corto y en el formato de `CLAUDE.md`, con estos puntos:

- qué se hizo y en qué archivos;
- casos ↔ tests (ninguna fila sin `it`, ningún `it` sin fila) y el rojo por aserción de cada spec;
- los tests de guarda comprobados sin su protección;
- la mutación del código nuevo: el score de la última corrida, la de después de la revisión;
- los hallazgos de la revisión y qué se hizo con cada uno;
- la DoD, con el resultado de cada comando;
- ⚠️ los cambios de contrato;
- la sugerencia de commit, con el mensaje propuesto (Conventional Commits, con un scope de
  `commitlint.config.cjs`).

Después del informe, no toques el árbol.
