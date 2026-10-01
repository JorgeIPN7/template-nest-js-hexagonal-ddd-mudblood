---
name: adversarial-review
description: 'Revisión adversarial de un cambio antes de darlo por terminado. Un único subagente general-purpose revisa el diff contra CLAUDE.md buscando defectos reales: fallos de corrección con escenario concreto, respuestas del contrato que hoy no se pueden producir, tests de guarda que no fallarían sin su protección, huecos de test y convenciones. Después, la sesión verifica y corrige lo crítico y lo importante. Es el paso final de express, executing-plans y subagent-driven-development, y sirve también sola antes de abrir un PR.'
argument-hint: '[base]'
---

# Revisión adversarial

**Una sola revisión, al final, hecha por alguien que busca fallos y no aprobar.** Sustituye a los
revisores por tarea. En el experimento del 2026-09-30 (`docs/development-workflows.md`):

- 16 revisores de spec y de calidad, uno por tarea, encontraron 0 defectos;
- una revisión adversarial sobre el diff completo encontró en cada rama el defecto importante que
  se había escapado;
- sobre el flujo exprés, encontró los dos que ahora vigilan las comprobaciones 2 y 3 del prompt.

## Cuándo

- Paso final de `express`, `executing-plans` y `subagent-driven-development`, antes de la DoD.
- Sola, antes de abrir un PR de algo que no pasó por un flujo, si el cambio toca comportamiento.
  Un cambio trivial (errata, config que no es de seguridad, bump) no la necesita.
- **No revisa el PR de otra persona tal cual.** Revisa el árbol actual contra una base, y ningún
  agente puede cambiar de rama. Para un PR ajeno, `/code-review <PR>`; o tú haces checkout de su
  rama en tu terminal y la invocas con su base.

## 1. Alcance

- **Base** (`<BASE>`): la que te pasa el flujo, que es el `git rev-parse HEAD` guardado al
  empezar. Si se invoca sola, `$ARGUMENTS`, o `git merge-base HEAD main` si no viene ninguna.
- **Cambios**: `git diff --stat <BASE>` más los archivos que
  `git status --porcelain --untracked-files=all` marca con `??`. Nada está confirmado mientras
  trabaja un flujo, así que el diff incluye el árbol de trabajo y los archivos nuevos no salen en
  ningún diff; sin `--untracked-files=all`, una carpeta nueva sale como una sola línea.
- **Contexto**: la spec o el plan que se implementó, si existe.

## 2. Lanzar al revisor

Lanza **un** subagente con la herramienta `Agent`, `subagent_type: "general-purpose"`, y el
prompt de `${CLAUDE_SKILL_DIR}/reviewer-prompt.md` con sus marcadores sustituidos. Tiene que ser
`general-purpose`: es el tipo que carga `CLAUDE.md`, y `Plan` y `Explore` no lo cargan (medido el
2026-09-29).

Mientras revisa, **no edites el árbol ni ejecutes `pnpm test:e2e`**. El revisor lee los archivos
que estás cambiando, y los E2E comparten la base de test.

## 3. Triage

El informe del revisor es una hipótesis, no un veredicto. Por cada hallazgo:

1. **Compruébalo tú**: lee el código y, si es barato, reprodúcelo. Clasifícalo como real o como
   falso positivo, con el motivo.
2. **Crítico o importante, y real** → se corrige. Primero el test, en rojo por aserción, y luego
   el arreglo. Si corregirlo exige decidir un comportamiento nuevo, reúne esas preguntas en una
   sola `AskUserQuestion`, con tu recomendación.
3. **Menor** → va al informe. Solo se corrige si es trivial y está dentro del alcance del cambio.
   Si no, se propone una entrada para `docs/backlog.md` y la decisión es del usuario.

**Después de corregir:**

- Si alguna corrección tocó `domain/` o `application/`, se vuelve a correr
  `pnpm test:mutation:changed <BASE>`: el score del informe es el del código final.
- **Segunda pasada** si alguna corrección cambió el comportamiento de producción, aunque sea en un
  solo archivo: el mismo prompt, acotado a los archivos que tocaste. Correcciones de tests,
  documentación o redacción no la justifican.

## 4. Qué va al informe del flujo

- El veredicto del revisor en una línea.
- Una tabla con los hallazgos: severidad, `archivo:línea`, real o falso positivo, y qué se hizo
  con cada uno.
- Lo que el revisor verificó ejecutando comandos y lo que no.

## Reglas

- **El revisor nunca edita el repo**, ni siquiera temporalmente, y nunca usa git que escriba.
  Para demostrar un hallazgo trabaja en una copia fuera del repo, como explica el prompt.
- **Tú tampoco haces commits.** La política de `CLAUDE.md` rige, y `.claude/settings.json` la
  hace cumplir.
- **Coste de referencia** para una feature de ~30 archivos (Opus 5.5, dos revisiones medidas el
  2026-09-30): de 12 a 22 minutos y de 200 000 a 330 000 tokens, según cuánto ejecute el revisor
  (la más larga corrió Stryker y mutaciones manuales). La primera costó 4,92 USD. Aun así, es el
  paso más barato de los que encuentran defectos.
