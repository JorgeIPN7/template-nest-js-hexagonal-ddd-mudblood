---
name: executing-plans
description: 'Default executor of the FULL flow: implements a plan from docs/plans/ inline in the current session — stub, red by assertion, green and refactor per task; mutation of the new code once at the end; one adversarial review; Definition of Done. Prefer a new session after writing the plan. Use subagent-driven-development instead only for large plans (~10+ tasks) of mostly independent tasks.'
---

# Executing Plans

## Overview

Load a plan from `docs/plans/`, review it critically, implement its tasks in this session, then
audit the result once — mutation, adversarial review, DoD — and report.

**This is the default way to execute a plan.** On 2026-09-30 the same 11-task plan produced the
same code inline (≈17 min of machine time, 6.66 USD) as with a subagent per task and two
reviewers per task (≈129 min, 36.01 USD) (`docs/development-workflows.md`).
`subagent-driven-development` is for large plans of independent tasks, where a fresh context per
task pays for itself.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Stack:** NestJS 12 + TypeScript 6.0 (exact versions: the «Stack» line of `CLAUDE.md`). Tests
run only through `pnpm test` / `pnpm test:e2e`; a bare `jest` cannot load the ESM-only NestJS 12
packages.

**Start in a new session** when the plan was written in this one: the brainstorming and planning
context no longer helps and makes every turn more expensive. The plan and the spec on disk are
the whole handoff.

## Step 1 — Load and review the plan

1. Read the plan and the spec it references. Save the base: `git rev-parse HEAD`.
2. Review it critically: missing cases, a declared response with no path that produces it,
   signatures that don't match across tasks, a task that violates `CLAUDE.md`.
3. Concerns → raise them all at once with the user before starting. None → create a `TodoWrite`
   list with one entry per task and proceed.

## Step 2 — Execute each task

`CLAUDE.md` governs the conventions; don't read the reference skills unless the task points you
to one.

1. Mark it `in_progress`. Re-read its **Files**, **Interfaces**, **Decisions**, **Casos
   acordados** and **Guard tests**.
2. **Stub** — create the SUT with the declared interfaces; bodies return **a neutral value of the
   right type** and never throw. A stub that throws `new Error('no implementado')` fails value
   tests on the `// Act` line, by exception and not by assertion, and leaves any classless
   `toThrow()` green — so every `toThrow` names the error class. `pnpm typecheck`.
3. **Red by assertion** — write one `it` per row (the `it` text IS the case; `P` rows are
   `@fast-check/jest` properties), run `pnpm test <spec>` (`pnpm test:e2e <spec>` for an
   `*.e2e-spec.ts`) and keep the output: every new test must fail **on an assertion**, not on
   `Cannot find module` or a compile error.
4. **Green** — implement the minimum; `pnpm test <spec>` passes.
5. **Guard check** — for each guard test the task lists (concurrency, ownership, authorization,
   atomicity, anti-enumeration, idempotency): remove the protection for a moment, see the test
   fail by assertion, restore it. A guard test that stays green protects nothing: rewrite it.
6. **Refactor**, then the layer check:
   - domain: no `@nestjs/*` or ORM import (`grep`);
   - application: hand-written port fakes, no `jest.mock`; one `execute()`; ports injected by
     their `abstract class`, imported as a value;
   - infrastructure: its unit specs pass; repositories and wiring are proven by `pnpm test:e2e`;
   - module: `pnpm typecheck` is not proof of wiring (`useClass` accepts any class) — the
     context's E2E is.
7. Mark it `completed`.

**Ask only when something changed** — never a routine «¿surgió algo?» before each task (measured:
3 such confirmations, 0 changes). Triggers:

- a case the table doesn't cover and that changes behaviour;
- a case that cannot be implemented as written;
- a deviation from the plan's interfaces or decisions.

Collect them and ask once, with `AskUserQuestion` and your recommendation, unless one blocks the
task. An approved new case gets its row in the plan before its test.

## Step 3 — Audit the result once

1. **Mutation of the new code:** `pnpm test:mutation:changed <BASE>` audits the lines of
   `domain/` and `application/` changed since the base, new files whole, and the whole SUT of
   every spec or test helper that changed (`docs/development-workflows.md`, «Mutación del código
   nuevo»). For each survivor, propose the case that kills it (all of them in one question);
   approved cases get their row and a rerun. Their test passes at once — the code already does
   what it asserts — so its red by assertion is shown by applying the mutant by hand, watching
   the test fail and restoring the code. An equivalent mutant is marked in the code with
   `// Stryker disable next-line <Mutator>: <reason>` and cited in the report, not tested.
2. **Adversarial review:** invoke the `adversarial-review` skill with `<BASE>` and the plan path.
   Fix critical and important findings (test first, red by assertion); list minor ones. If a fix
   touched `domain/` or `application/`, **rerun the mutation**: the score in the report is the
   final code's, not the pre-review one.
3. **Documentation:** update `CLAUDE.md` / `README.md` if a module's description, a public
   contract or the endpoints table changed, and the spec or plan if a decision changed.

## Step 4 — Definition of Done

```bash
pnpm typecheck
pnpm lint:check
pnpm format:check
pnpm test
pnpm test:e2e
pnpm build
```

The DoD from `CLAUDE.md`, in its order. `pnpm test:e2e` needs PostgreSQL up (`pnpm db:up`) and a
migrated test database (`pnpm db:migrate:test`). Fix every failure before reporting; if one
reveals a plan gap, stop and tell the user — don't patch around the plan silently.

## Step 5 — Report and suggest a commit (do NOT commit)

Report, in the format of `CLAUDE.md`:

- tasks completed, and any deviation from the plan with its reason;
- cases ↔ tests (no row without an `it`, no `it` without a row) and the red-by-assertion evidence;
- guard tests proven to fail without their protection;
- mutation of the new code: the score of the last run, after the review's fixes;
- review findings and what was done with each;
- DoD results;
- ⚠️ contract changes;
- the suggested commit message (Conventional Commits, a scope from `commitlint.config.cjs`):

> _"Te sugiero hacer un commit de los cambios por implementar el plan `<plan-file>`. Avísame y lo
> redacto."_

**Never run a git command that writes history, moves `HEAD` or a ref, touches the index or
discards work.** `.claude/settings.json` denies them, whatever options go in front; the user
commits.

## When to stop and ask

- A test keeps failing after a focused fix attempt.
- A plan instruction is unclear or contradicts the spec or `CLAUDE.md`.
- A required dependency is missing.
- The plan asks for something that breaks the layer rules.

Ask rather than guess; don't force through blockers.

## Integration

- **Upstream:** `writing-plans` produces the plan; `brainstorming` produced its spec.
- **Final review:** `adversarial-review`.
- **Sister skill:** `subagent-driven-development` — same audit at the end, but one subagent per
  task; only for large plans of independent tasks.
