---
name: feature
description: 'Flujo para un cambio con lógica o con riesgo: un endpoint o un caso de uso nuevo, una migración, lógica en domain/ o application/, o algo de la lista de riesgo (auth, credenciales, tokens o permisos —también su configuración—, un cambio entre contextos, una migración destructiva, un contexto nuevo). Tabla de casos aprobada en el chat, TDD con rojo por aserción, mutación del código nuevo, revisión adversarial y DoD; modo grande por porciones para más de ~8 tareas, un contexto nuevo o trabajo que otra persona continuará. No se usa para lo demás (errata, docs, config que no es de seguridad, un bump, un bug con su test evidente): eso es modo Directo, sin skill.'
argument-hint: '<qué quieres construir o arreglar> | continuar docs/specs/<archivo>.md'
---

# /feature

Conserva lo que aportó calidad en las mediciones de `docs/development-workflows.md` —la tabla de
casos con rojo por aserción, las dos comprobaciones y una revisión que busca fallos— y deja fuera
lo que no la aportó: el plan escrito, las specs largas, los revisores por tarea y la mutación en
bucle.

## Reglas de todo el flujo

- **Nada de git que escriba** historia, mueva `HEAD` o una ref, toque el índice o descarte trabajo.
  `.claude/settings.json` lo bloquea; no busques un rodeo. Al final sugieres el commit y lo hace el
  usuario.
- **Sin subagentes**, salvo el revisor del paso 7.
- **`CLAUDE.md` basta para las convenciones.** Si la feature crea un tipo de artefacto que su
  módulo aún no tiene, lee solo esa sección de `docs/nestjs-mapping.md`. Para la forma de un
  archivo, copia el más parecido del propio módulo o de `src/modules/users/`.

## Pasos

1. **Base.** Guarda `git rev-parse HEAD` como `<BASE>`: la usan los pasos 6 a 8. Lee el módulo
   afectado: entidades, puertos, casos de uso, controller y sus tests.
2. **Preguntas**, solo si hay decisiones abiertas de negocio, contrato público o riesgo: **una
   ronda** de `AskUserQuestion` con hasta 4 preguntas y tu recomendación primero. Lo técnico lo
   decides tú y lo anotas con su porqué.
3. **Tablas en el chat, con una sola aprobación.**
   - **Casos acordados**, solo de `domain/` y `application/`:
     `| # | Caso (se vuelve el it) | Entrada / estado | Resultado |`. Cada caso empieza por
     «debería…», en lenguaje de negocio, más filas `P` de propiedad (`fast-check`) cuando haya un
     «siempre» o un «nunca».
   - **Contrato**, si hay endpoint: `| Código | Motivo | Camino que lo produce hoy |`. Sin camino,
     no se declara; una defensa para el futuro va en un comentario, con la condición que la haría
     alcanzable. Marca con ⚠️ los cambios en respuestas que ya existen.
   - **Persistencia**, en una línea: si hay migración y si es aditiva. Una destructiva sigue
     «Destructive migrations» de `CLAUDE.md`.
   - **El archivo de spec** (`docs/specs/AAAA-MM-DD-<tema>.md`, ≤ 150 líneas: objetivo, decisiones,
     las tablas y lo que queda fuera) se escribe solo si el trabajo ocupa más de una sesión, toca la
     lista de riesgo o el usuario lo pide. Si el usuario trae una spec, complétala y pide la
     aprobación igualmente.
4. **TDD capa a capa:** dominio → aplicación → infraestructura → HTTP → E2E.
   - Un `it` por fila, con el texto del caso como título. La infraestructura lleva tests, sin tabla.
   - **Rojo por aserción:** si el SUT no existe, primero un stub que compile y devuelva un valor
     neutro del tipo correcto, sin lanzar. Un `throw` falla en `// Act` y deja en verde un
     `toThrow()` sin clase, así que los `toThrow` llevan siempre la clase. `pnpm test <spec>` (o
     `pnpm test:e2e <spec>`) falla en la aserción, nunca con «Cannot find module». Luego verde y
     refactor.
   - Al cerrar cada capa, `pnpm typecheck` y sus tests. Un caso nuevo que cambie el comportamiento
     se pregunta junto con los supervivientes del paso 6, salvo que te bloquee.
   - Migración: `pnpm migration:generate src/database/migrations/<Name>`;
     `SET LOCAL lock_timeout = '5s'` al empezar `up()` y `down()`; `pnpm migration:run` y
     `pnpm db:migrate:test`; y ningún diff con `pnpm migration:generate src/database/migrations/Check --check`.
   - Endpoint: la documentación OpenAPI completa desde el principio, con los códigos de la tabla
     «Contrato» y ninguno más.
5. **Las dos comprobaciones**, anotadas para el informe:
   - **cada test de guarda falla sin su protección** (concurrencia, propiedad, autorización,
     atomicidad, anti-enumeración, idempotencia): quita la protección un momento, mira el rojo por
     aserción y restáurala; si sigue en verde, rehaz el test;
   - **cada estado declarado tiene un camino que hoy lo produce:** repasa la tabla «Contrato»
     contra el código final.
6. **Mutación**, solo si cambió `domain/` o `application/`: `pnpm test:mutation:changed <BASE>`.
   Por cada superviviente, propón el caso que lo mata y pregúntalos todos en **una sola**
   `AskUserQuestion`. Los aprobados son filas nuevas con su test, que pasa en verde a la primera:
   su rojo lo demuestra la segunda corrida del paso 8, no reaplicar mutantes a mano. Un
   equivalente se marca con `// Stryker disable next-line <Mutador>: <motivo>`.
7. **Revisión:** `adversarial-review` con `<BASE>` y la spec, o con las tablas aprobadas si no hay
   spec. Corrige lo crítico y lo importante, cada arreglo con su test en rojo por aserción; lo
   menor va al informe.
8. **Cierre.** Si el paso 6 dejó supervivientes o una corrección de la revisión tocó `domain/` o
   `application/`, una segunda y última `pnpm test:mutation:changed <BASE>`: lo que siga vivo va
   al informe, sin tercera corrida. Después, la DoD una vez:
   `pnpm typecheck && pnpm lint:check && pnpm format:check && pnpm test && pnpm test:e2e && pnpm build`.
9. **Docs**, solo si cambió el comportamiento público: README, tabla de endpoints y la spec si
   existe. `CLAUDE.md` solo recibe gotchas nuevos.
10. **Informe de ≤ 5 puntos**, en el formato de `CLAUDE.md`:
    1. qué se hizo y en qué archivos;
    2. casos ↔ tests (ninguna fila sin `it` ni `it` sin fila) y las dos comprobaciones;
    3. el score de la última corrida de mutación y los hallazgos de la revisión, con lo que se hizo
       con cada uno;
    4. la DoD, con el resultado de cada comando;
    5. ⚠️ los cambios de contrato y el commit sugerido (Conventional Commits, scope de
       `commitlint.config.cjs`).

    Después del informe, no toques el árbol.

## Modo grande

Para más de ~8 tareas, un contexto nuevo o trabajo que otra persona continuará.

- **Spec obligatoria**, con 2–3 enfoques y tu recomendación, y **una sola aprobación de diseño**.
  Las tablas del paso 3 van dentro.
- **Porciones de ~400 líneas, una por sesión**, cada una con un diff revisable: los pasos 1 y 4–10
  sobre la porción, con `<BASE>` en el commit con que empieza la sesión.
- La spec lleva una lista **«Estado»** de porciones (`- [ ] P1 — …`), que sustituye al plan. Al
  cerrar una porción, márcala con su resultado, sugiere el commit y para.
- **Para retomar:** `/feature continuar docs/specs/<archivo>.md`. Lee la spec, toma la primera
  porción sin marcar y sigue sin preguntas ni aprobación nuevas, salvo que algo haya cambiado.
