---
name: executing-plans
description: Use when executing a written implementation plan inline in the current session, step by step with review checkpoints — the no-subagent alternative to subagent-driven-development
---

# Executing Plans

## Overview

Load a plan from `docs/plans/`, review it critically, execute its tasks step by step in this session, and report when complete.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

**Stack:** NestJS 12 + TypeScript 6.0 (exact versions: the «Stack» line of `CLAUDE.md`). All commands assume `pnpm`. NestJS 12 packages are ESM-only and the repo stays CommonJS, so tests run only through `pnpm test` / `pnpm test:e2e` — a bare `jest` cannot load them.

**Note:** both this skill and `subagent-driven-development` run in the **current session**. The difference is _who does the work_: this skill executes every task inline in your own context; `subagent-driven-development` dispatches a fresh subagent per task with two-stage review. Prefer `subagent-driven-development` when subagents are available — it is generally higher quality. Use this skill for small plans, tightly coupled tasks, a tight feedback loop, or when there is no subagent budget.

## The Process

### Step 1 — Load and review the plan

1. Read the plan file under `docs/plans/`.
2. Review critically against the spec it references. Identify questions or concerns.
3. If concerns: raise them with the user before starting.
4. If no concerns: create a `TodoWrite` list with one entry per task and proceed.

### Step 2 — Execute tasks (TDD, layer-aware)

For each task:

1. Mark it `in_progress` in `TodoWrite`.
2. Re-read the task's **Layer**, **Files**, **Rule codes to honor** and **Casos acordados** subsections.
3. **Confirmación JIT** (solo tareas con tabla de casos): ask the user «¿Surgió algo que cambie estos casos?» before writing anything, and wait for the updated table if cases changed. A new case gets its row in the plan before it gets a test — never add or reword a case silently.
4. Follow each step exactly — the plan is decomposed into bite-sized steps for a reason. With a case table: write ALL its tests first (1:1 — the `it` text IS the case; `P` rows become `@fast-check/jest` properties), run them and capture the red output, then implement to green, then refactor.
5. Run the verifications specified by each step (typically `pnpm test <file>`).
6. After all steps in the task pass, run the layer-specific check before marking complete:
   - **Domain task:** `pnpm test <file>.spec.ts` passes; the file has zero `@nestjs/*` or ORM imports (`grep` to confirm).
   - **Application task:** unit test passes with hand-written port fakes (no `jest.mock`); the use case is `@Injectable()` with one public `execute()` and its `…Input` type in the same file; ports arrive by constructor as their `abstract class`, imported as a value (no `@Inject`, no `import type`).
   - **Infrastructure task:** its specs pass. Mappers, filters, controllers, guards, DTOs and ACL adapters use unit `*.spec.ts` with no database, run with `pnpm test <file>`. Only TypeORM repositories get a `*.typeorm.repository.e2e-spec.ts`, which runs against PostgreSQL with `pnpm test:e2e`. The controller routes through the use case (not the repo), and each adapter `implements` its port.
   - **Module task:** `pnpm typecheck` passes and the module binds every port to its adapter with `{ provide: Port, useClass: Adapter }`. Typecheck alone does not prove the binding — `useClass` accepts any class — so the context's E2E must boot and exercise it.
   - **Domain/application tasks additionally:** run `pnpm test:mutation --mutate "src/modules/<context>/domain/**/*.ts,src/modules/<context>/application/**/*.ts"` and record the mutation score for the report.
7. Mark the task `completed`.

### Step 3 — Definition of Done (run inline before reporting back)

After all tasks finish, run this checklist directly — **do not invoke any external "finishing" skill**:

```bash
pnpm typecheck
pnpm lint:check
pnpm format:check
pnpm test
pnpm test:e2e
pnpm build
```

This is the Definition of Done from `CLAUDE.md`, in its order. `pnpm test:e2e` needs PostgreSQL up (`pnpm db:up`) and a migrated test database (`pnpm db:migrate:test` on a fresh clone).

Address every failure before reporting. If a failure reveals a plan gap, surface it to the user and pause — do not patch silently.

### Step 4 — Report and suggest a commit (do NOT commit)

Report back with:

- Tasks completed
- Test results (`pnpm test`, `pnpm test:e2e`)
- Casos ↔ suite mapping and RED evidence (case-table tasks), plus the mutation result (domain/application tasks)
- Files created / modified (grouped by layer)
- Any deviation from the plan, with reasons
- Open questions, if any

Then **suggest** a commit so the user can decide:

> _"Te sugiero hacer un commit de los cambios por implementar el plan `<plan-file>` (Tasks 1–N). Avísame y lo redacto."_

**Never run `git commit`, `git add` for commit purposes, or `git push` without an explicit instruction in the user's next turn.** A previous authorization is not reused.

## When to Stop and Ask for Help

**STOP executing immediately when:**

- A test fails repeatedly after a focused fix attempt
- A plan instruction is unclear or contradicts the spec
- A required dependency is missing
- A task asks you to violate the layer rules from `clean-ddd-hexagonal`

**Ask for clarification rather than guessing.**

## When to Revisit Earlier Steps

Return to Step 1 (Review) when:

- The user updates the plan based on your feedback
- Fundamental approach needs rethinking

Don't force through blockers — stop and ask.

## Remember

- Review the plan critically first
- Follow plan steps exactly
- Don't skip the layer-specific checks
- Don't skip the Definition of Done
- Stop when blocked, don't guess
- Never start implementation on `main`/`master` without explicit user consent
- **Never run `git commit` or `git push` without explicit user instruction — only suggest**
- Don't skip the JIT confirmation or the captured RED run on case-table tasks.

## Integration

- **Upstream skill:** `writing-plans` produces the plan this skill executes.
- **Companion skills (read, don't invoke):** `clean-ddd-hexagonal` for layer rules, `nestjs-best-practices` for rule codes the plan references, `javascript-typescript-jest` for Jest conventions (`*.spec.ts` / `*.e2e-spec.ts`, layer-aware mocking) — apply them when the plan asks you to write or run tests.
