---
name: writing-plans
description: 'Use in the FULL flow, right after brainstorming produced an approved spec: turns it into a task-by-task plan in docs/plans/ WITHOUT production code — file map, public signatures, decisions, the agreed case table of each task, commands and verification. A feature inside one existing bounded context uses the express flow instead and needs no plan.'
---

# Writing Plans

## Overview

Write the plan that someone with zero context — you in a fresh session, or a subagent — needs to
implement the spec **without re-deciding anything**: which files, which public signatures, which
decisions and why, which cases each task must pass, and how to verify each step.

**The plan carries no production code and no finished tests.** It is a map and a contract, not a
draft of the diff. Measured on 2026-09-30 (`docs/development-workflows.md`), with a plan that
carried 100 % of the code (2 824 lines):

- writing it took ≈85 % of the design cost;
- the implementers transcribed it: 100 % of the production code came from the plan, and 0 of 5
  specs had a red run by assertion;
- the plan's real contributions were two cases (U9, U10), the 1:1 specs for errors and events,
  and the documentation task. A codeless plan keeps all of them.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Stack assumed:** NestJS 12, TypeScript 6.0, Node 24, pnpm, SWC, Jest, Supertest, Pino, Zod,
class-validator, TypeORM + PostgreSQL. Exact versions live in the «Stack» line of `CLAUDE.md`,
`package.json`, `.nvmrc` and `packageManager`; cite those instead of copying a version. Every test
command goes through `pnpm test` / `pnpm test:e2e` (they start Jest with
`--experimental-vm-modules`), never a bare `jest`.

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md` (user preferences override this).

## References (consult only when the task needs them)

`CLAUDE.md` is enough for conventions — a session with no skills met 100 % of them in the
experiment. Open a reference only for what it uniquely covers:

- `.claude/skills/clean-ddd-hexagonal/references/NESTJS-MAPPING.md` — when the plan creates a
  bounded context or an artifact type that no module has yet (the section for that artifact, not
  the whole file).
- `nestjs-best-practices` — rule codes for cross-cutting concerns (auth, validation, transactions,
  errors, throttling, caching). Cite a code where it changes what the implementer does; don't tag
  every task by ritual.
- `javascript-typescript-jest` — property-based testing, E2E with Supertest and mocking by layer,
  when a task needs them.

## Scope Check

If the spec covers several independent subsystems, it should have been split during brainstorming.
If it wasn't, propose one plan per subsystem. Each plan should produce working, testable software
on its own.

## File Structure

Before defining tasks, map every file that will be created or modified and what it is responsible
for. This is where decomposition gets locked in.

- Map every file to its **layer** (`domain` / `application` / `infrastructure` / `bootstrap` /
  `common`) and check the dependency rule (outer → inner only; `CLAUDE.md`, «Architecture rules»).
- One responsibility per file: one aggregate, one use case with its `…Input` type, one adapter.
- Each port: its `abstract class` name (no `Port` suffix) and its file under `domain/ports/`.
- In existing code, follow `src/modules/`. If a file you must modify has grown unwieldy, a split
  task is reasonable.

## Casos acordados (contrato de comportamiento)

Antes de redactar las tareas, el plan pasa por la **fase de contrato** del modelo de colaboración
(`CLAUDE.md`, «Modelo de colaboración»): el usuario aprueba los casos de prueba de cada tarea con
lógica de negocio. La tabla vive en la tarea del plan — artefacto versionado, no conversación
perdida.

- **Aplica a tareas que tocan `domain/` o `application/`.** Infra, config, wiring y docs quedan
  exentas.
- **Propón tú la tabla completa y pide la aprobación agrupada**: una `AskUserQuestion` por grupo
  de tareas relacionadas, con hasta 4 preguntas y solo sobre los casos dudosos o de negocio. No se
  pregunta caso a caso.
- **Dos tipos de fila:** caso puntual (un ejemplo concreto) y propiedad (prefijo `P`, un
  invariante sobre un dominio de entradas, con `@fast-check/jest`):

| #   | Caso (se vuelve el `it`)                                 | Entrada / estado inicial  | Resultado esperado              |
| --- | -------------------------------------------------------- | ------------------------- | ------------------------------- |
| 1   | debería rechazar un email sin arroba                     | `Email.from('foo')`       | lanza `InvalidEmailError`       |
| P1  | debería aceptar cualquier email RFC-válido _(propiedad)_ | arbitrario `validEmail()` | nunca lanza; round-trip estable |

- **Trazabilidad 1:1:** cada caso puntual produce exactamente un `it` cuyo texto es el caso; cada
  fila `P`, un `it` de propiedad. Ningún `it` sin fila; ninguna fila sin `it`.
- **Casos descubiertos al implementar** no se añaden en silencio: se consultan, agrupados, y la
  fila nueva se registra en el plan antes de escribir su test.

## Contract reachability (endpoint tasks)

Every task that adds or changes an endpoint carries a contract table:

| Código | Motivo | Camino que lo produce hoy |
| ------ | ------ | ------------------------- |

**Every declared response must be producible today.** The third column names the input or state
and the code path that returns it. No path → the response is not declared (`CLAUDE.md`: «a
declared-but-impossible response is the same defect as an undeclared one»). A defence for a future
state goes in a code comment, together with the condition that would make it reachable. Measured:
the express run declared a 409 that no request could produce, and only the final review caught it.

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** execute with `executing-plans` (default) in a NEW session, or
> `subagent-driven-development` if the plan says it qualifies. Steps use checkbox (`- [ ]`) syntax.
> **Never run `git commit`, `git add` or `git push`** — suggest a commit and wait.

**Spec:** `docs/specs/<spec>.md`

**Goal:** [One sentence]

**Bounded context:** [src/modules/<context>/ — new or existing]

**Architecture:** [2-3 sentences: aggregates / ports / adapters introduced]

**Execution:** executing-plans | subagent-driven-development — [one line: why]
```

## Task Structure

````markdown
### Task N: [Component Name]

**Layer:** domain | application | infrastructure | bootstrap | common

**Files:**

- Create: `src/modules/billing/domain/entities/invoice.entity.ts`
- Test: `src/modules/billing/__tests__/domain/entities/invoice.entity.spec.ts`
- Uses (from earlier tasks): `InvoiceId`, `InvoiceAmount`, `InvoiceIssued`

**Interfaces** (declarations only — what other tasks rely on):

`src/modules/billing/domain/entities/invoice.entity.ts`

```ts
export class Invoice extends AggregateRoot<InvoiceIssued> {
  static draft(params: { id: InvoiceId; amount: InvoiceAmount }): Invoice;
  issue(now: Date): void; // lanza InvoiceNotDraftError si no está en borrador
}
```

**Decisions:** one bullet per non-obvious choice, with its why.

**Casos acordados** (required when the task touches `domain/` or `application/`):

| #   | Caso (se vuelve el `it`)                              | Entrada / estado inicial | Resultado esperado           |
| --- | ----------------------------------------------------- | ------------------------ | ---------------------------- |
| 1   | debería registrar InvoiceIssued al emitir en borrador | factura en borrador      | `[InvoiceIssued(id, T)]`     |
| 2   | debería rechazar emitir una factura ya emitida        | factura emitida          | lanza `InvoiceNotDraftError` |

**Guard tests** (only if the task protects a guarantee — concurrency, ownership, authorization,
atomicity, anti-enumeration, idempotency): which test, and how to prove it fails without the
protection.

**Rule codes** (optional): only the ones that change what the implementer does.

- [ ] **Stub:** create the SUT with the interfaces above; bodies return a neutral value of the right type, never throw (a throwing stub fails value tests by exception, not by assertion, and leaves a classless `toThrow()` green) → `pnpm typecheck`
- [ ] **Red:** write one `it` per row (every `toThrow` names the error class), run `pnpm test <spec>` (`pnpm test:e2e <spec>` for an `*.e2e-spec.ts`), confirm every one fails **by assertion** (not `Cannot find module`, not a compile error)
- [ ] **Green:** implement the minimum → `pnpm test <spec>` passes
- [ ] **Guard check** (if any): remove the protection, see red, restore
- [ ] **Refactor** → `pnpm typecheck`
````

## What the plan must NOT contain

- **Production code** beyond the declarations under **Interfaces**.
- **Finished tests.** The case table already defines each `it`; the implementer writes them.
- A code fragment is acceptable only when the shape cannot be deduced from `CLAUDE.md` or the
  reference module — a delicate SQL statement, a non-obvious transaction pattern — and never more
  than ~15 lines.
- **A file path as the first line inside a code block.** Put it in the line before the block:
  implementers copied the `// src/…` line into the file.

## Guidance by layer (what each task must pin down)

- **Domain:** invariants and the errors that enforce them; events and their payload; which
  «always/never» rows become properties.
- **Application:** the `…Input` type; the ports used and the order of calls (e.g. the directory
  is checked before anything else); which domain errors reach the caller.
- **Infrastructure — persistence:** the migration, and whether it is additive or needs
  expand/contract (`CLAUDE.md`, «Destructive migrations»); transactions; driver errors translated
  in the adapter; the E2E against real PostgreSQL.
- **Infrastructure — HTTP:** the contract table (above), the OpenAPI decorators the guard demands
  (`CLAUDE.md`, «Endpoint documentation»), the filter mapping, the controller unit spec and the E2E.
- **Module wiring:** the last task of a new context — module file, `AppModule` import and the
  scope in `commitlint.config.cjs`. It is proven by the context's E2E, not by `pnpm typecheck`
  (`useClass` accepts any class).
- **Documentation:** a final task when the change alters a module's description, a public
  contract or the endpoints table in `CLAUDE.md` / `README.md`.

## No Placeholders

Every step must name exact files, commands and the expected outcome. These are plan failures:

- "TBD", "TODO", "implement later", "fill in details";
- "Add appropriate error handling" / "handle edge cases" — name the case, give it a row;
- "Similar to Task N" — repeat what the engineer needs, they may read tasks out of order;
- references to types, ports or methods not declared in any task's **Interfaces**;
- bare `git commit` instructions — see below.

## No autocommit

The plan **never instructs anyone to run `git commit`, `git add` or `git push`**. The user
controls all commits. A logical checkpoint ends with a suggestion the implementer surfaces:

> _"Te sugiero hacer un commit de los cambios por <razón>"_

## Self-Review

After writing the plan, check it against the spec. By default this is a checklist you run
yourself:

1. **Spec coverage:** every requirement has a task.
2. **No code:** no production code or finished test beyond **Interfaces** and ≤15-line fragments.
3. **Case tables:** every `domain/`/`application/` task has one, approved; no other task needs one.
4. **Contract:** every endpoint task has its table, and every row names the path that produces it.
5. **Guard tests:** every guarantee (concurrency, ownership, auth, atomicity, anti-enumeration,
   idempotency) has a test and a way to prove it fails without the protection.
6. **Type consistency:** ports, inputs and signatures match across tasks.
7. **Layer purity:** nothing in `domain/` depends on `@nestjs/*` or an ORM; controllers live in
   `infrastructure/http/`.
8. **No commits:** no task contains `git commit`, `git add` or `git push`.

Fix issues inline.

**Escalate to a reviewer subagent when the plan is large.** For plans above ~8 tasks, plans
touching more than one bounded context, or when you doubt the decomposition, dispatch an
independent reviewer with `${CLAUDE_SKILL_DIR}/plan-document-reviewer-prompt.md` (Agent tool,
`subagent_type: "general-purpose"`, read-only). Fix every blocking issue before the handoff.

## Execution Handoff

After saving the plan:

> "Plan saved to `docs/plans/<filename>.md`. I recommend executing it with **executing-plans in a
> new session** (`/clear` or a new terminal): the brainstorming context no longer helps and makes
> every turn more expensive. Subagent-driven development only pays off for large plans (~10+
> tasks) whose tasks are mostly independent — [this plan qualifies / does not qualify, because …].
> Which one?"

**subagent-driven-development qualifies only if** the plan has ~10 or more tasks, most of them do
not touch the same files, and the inline context would not survive the whole plan. Measured on an
11-task plan with coupled tasks: 5.4× the cost of inline execution for the same code.

After the user picks, invoke the corresponding skill (or tell the user which command to run in the
new session). **Do not commit the plan** — suggest it: _"Te sugiero hacer un commit del plan por
<razón>"_.
