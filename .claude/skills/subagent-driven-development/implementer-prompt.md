# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent. Fill in the `[…]` markers. Don't paste
the task: the implementer reads it from the plan file.

**Tool:** `Agent` · **`subagent_type`:** `general-purpose` (it loads `CLAUDE.md`).

```
Agent({
  subagent_type: "general-purpose",
  description: "Implement Task N: [task name]",
  prompt: |
    You are implementing one task of a plan in this repository (NestJS 12, hexagonal/DDD).
    CLAUDE.md is already in your context and governs every convention: layers, ports, language,
    tests, OpenAPI, migrations. Don't read the reference skills unless the task points you to one.

    ## Your task

    - Plan: [docs/plans/<plan>.md]. Read its header and the section "### Task N: [name]" — only
      that section, nothing else from the plan.
    - Spec, for the why behind the decisions: [docs/specs/<spec>.md]
    - Context the plan doesn't give: [what earlier tasks produced; anything that changed from the
      plan; or "none"]
    - Work from: [absolute project directory]

    Run tests ONLY through `pnpm test <path>` / `pnpm test:e2e` (they add
    `--experimental-vm-modules`); a bare `jest` cannot load the ESM-only NestJS 12 packages.

    ## The cycle

    1. **Stub:** create the SUT with the task's **Interfaces**; bodies
       `throw new Error('no implementado')` or a neutral value. Run `pnpm typecheck`.
    2. **Red by assertion:** write one `it` per row of «Casos acordados» (the `it` text IS the
       case; `P` rows are `@fast-check/jest` properties). Run `pnpm test <spec>` and keep the
       output. Every new test must fail ON AN ASSERTION, not on `Cannot find module` or a compile
       error.
    3. **Green:** implement the minimum that passes.
    4. **Guard check:** for each guard test the task lists, remove the protection for a moment
       (the WHERE condition, the guard, the transaction), see the test fail by assertion, restore
       it. If it stays green, rewrite the test until it discriminates.
    5. **Refactor**, then `pnpm typecheck` and the task's tests again.

    Tasks without a case table (infrastructure, wiring, docs) still get their tests, per CLAUDE.md.

    ## When something doesn't fit

    You cannot ask and wait mid-task. Stop and report:

    - **NEEDS_CONTEXT**, with the exact question, if the task is ambiguous, a case is missing and
      it changes behaviour, or a case cannot be implemented as written.
    - **BLOCKED** if you are stuck after a focused attempt, or the task needs an architectural
      decision the plan didn't make.

    Never add or reword a case on your own, and never restructure code outside your task. It is
    always fine to stop and escalate: bad work is worse than no work.

    ## Git policy (NON-NEGOTIABLE)

    Never run `git commit`, `git add`, `git push`, `git tag`, `git rebase`, `git stash`,
    `git reset`, `git checkout`, `git switch` or `git restore` (the project settings deny them).
    Read-only git (`status`, `diff`, `log`) is fine. If you think a commit is due, write in your
    report: *Suggested commit:* "Te sugiero hacer un commit de los cambios por <razón>".

    ## Report

    - **Status:** DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
    - **Implemented:** what you built, and the files, grouped by layer
    - **Casos ↔ tests:** confirmation that every row has its `it` with identical text, and no
      extra `it`
    - **Red run:** the failing output from step 2 (the assertion lines)
    - **Guard checks:** which protection you removed and what failed
    - **Green run:** the final `Tests: …` line of each suite you ran
    - **Concerns or questions**, if any
    - **Suggested commit** (optional)
})
```
