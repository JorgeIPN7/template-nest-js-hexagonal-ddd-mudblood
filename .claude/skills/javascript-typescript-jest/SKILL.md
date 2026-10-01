---
name: javascript-typescript-jest
description: What Jest in this NestJS 12 repo needs beyond the conventions CLAUDE.md already fixes — runner and configuration facts, mocking by hexagonal layer with examples, property-based testing with fast-check (arbitraries, fc.scheduler, Faker), async patterns, Supertest E2E and test-design guidelines. Consult it when a test needs one of those; naming, AAA, describe/it language, 1:1 and fixtures live in CLAUDE.md.
allowed-tools: Read, Grep, Glob
---

# Jest Testing for NestJS 12 + TS 6.0

What this repository's tests need **beyond** `CLAUDE.md`. Adapted from the upstream `javascript-typescript-jest` skill (github/awesome-copilot) to this project's `jest.config.mjs` and hexagonal layout.

**The conventions every test follows live in `CLAUDE.md` («Code conventions») and are not repeated here:** `*.spec.ts` / `*.e2e-spec.ts`; a `__tests__/` folder that mirrors the module 1:1 (ports exempt, errors and events included); `describe` with the code identifier and nested `describe` per method; `it` in Spanish starting with «debería…»; the three AAA markers in every `it`, with `const act = () => …` for throws; comments in Spanish; file-local helpers at the bottom under `// Helpers`; shared fixtures in `<module>/__tests__/helpers/` or `test/helpers/`. Measured on 2026-09-30: a session with no access to any skill met 100 % of them from `CLAUDE.md` alone. The case table ↔ `it` mapping and the red-by-assertion rule belong to the flows (`CLAUDE.md`, «Modelo de colaboración»).

## Project Jest configuration (factual baseline)

These are the rules the test runner enforces — match them or your tests won't be discovered:

| Concern            | This repo                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Unit test regex    | `*.spec.ts` (anywhere under `src/`)                                                              |
| E2E test regex     | `*.e2e-spec.ts` (also under `src/`, next to the module it exercises)                             |
| Test location      | `__tests__/` folder at the root of each module, mirroring the module's structure                 |
| Transform          | `@swc/jest` (decorators + decorator metadata enabled)                                            |
| Auto reset         | `clearMocks: true`, `restoreMocks: true` (no need to reset manually)                             |
| Coverage threshold | branches 50, statements/lines 85, functions 88                                                   |
| Timeouts           | 15 s unit (`jest.config.mjs`), 30 s E2E (`test/jest-e2e.config.mjs`, one worker)                 |
| Path aliases       | `@/` → `src/`, `@common/`, `@config/`, `@database/`, `@modules/`, `@shared/`, `@test/` → `test/` |
| Test runner        | `pnpm test <file>` (unit), `pnpm test:e2e` (E2E) — never a bare `jest` / `npx jest`              |

**Naming consequence:** never name a test file `*.test.ts`. The runner won't pick it up. Always `*.spec.ts` or `*.e2e-spec.ts`.

**Runner consequence (NestJS 12):** every `@nestjs/*` 12.x package is ESM-only and this repo stays CommonJS. Jest can only load those packages with Node's `--experimental-vm-modules`, so the `test*` scripts in `package.json` run `node --experimental-vm-modules node_modules/jest/bin/jest.js` (the rationale lives in `jest.config.mjs`). A bare `npx jest` dies with `Must use import to load ES Module: …/@nestjs/…`. The official migration guide adds the Node floor for Jest itself: the ESM-only v12 packages load only on Node 24.9+ (https://docs.nestjs.com/migration-guide) — the repo's Node is pinned in `.nvmrc`. Pass paths and Jest flags straight after the script, **without** `--`: `pnpm test src/modules/users --verbose`. With `pnpm test -- …`, pnpm forwards a literal `--` (measured with pnpm 11; not re-measured on 12) and Jest reads every flag after it as one more path pattern (measured: `pnpm test -- src/shared --listTests` runs the suites instead of listing them).

**Why the branches threshold is lower:** SWC instruments the code it generates for `emitDecoratorMetadata` and property defaults, and those synthetic branches are unreachable from a test. Files without decorators (`src/config/**`) reach 88-100 % branches; decorator-heavy files plateau near 50 %. Don't write filler tests chasing that number.

## Test design guidelines

- **Order: documentation tests first, edge cases later.** Don't add separator comments like `// Edge cases` — the reading order alone signals the progression.
- **One precise assertion per `it` when the assertion is the SUT's contract.** Multiple assertions are fine when they describe a single observable outcome.
- **Drop-and-still-passes check.** Before approving a test, mentally remove the production line that's supposed to make it pass. If the test still passes, it wasn't testing what it claimed. Fix the test.
- **No hardcoded values in unused fields.** Anti-pattern: `const user = { name: 'Paul', birthday: '2010-02-03' }` when only `birthday` matters. Either drop the field or use an arbitrary (`g(fc.string)` for property-based, see PBT section).
- **File-local helpers go at the bottom** of the spec, below all `describe` blocks, under a `// Helpers` comment line. Reusable helpers shared across files belong in `<module>/__tests__/helpers/` (module-wide) or `test/helpers/` (cross-cutting).

```ts
describe('AllExceptionsFilter', () => {
  /* ... */
});

// Helpers

const buildHost = (): ArgumentsHost => ({/* ... */}) as ArgumentsHost;
const buildFilter = () => new AllExceptionsFilter(/* ... */);
```

- **Helpers follow SRP.** A helper does one thing — its name must say it. Prefer three named helpers over one helper with three optional flags (`buildHost(...)`, `buildHostInProd(...)`, `buildHostWithCorrelation(...)` is better than `buildHost({ prod, correlation })`).
- **>10 parameters/mocks to set up the SUT = code smell.** Warn the reader (and the author) — the SUT likely has too many responsibilities (SRP). Recommend splitting before adding more test scaffolding.

## Mocking strategy by hexagonal layer

This is the part that diverges most from generic Jest advice. Match the layer or the test fails review.

### Domain layer (`src/modules/<context>/domain/`)

- **No mocks at all.** Domain is pure TS — instantiate it directly.
- **Forbidden:** `Test.createTestingModule`, `jest.mock`, `jest.spyOn` on domain code.
- **Why:** if the domain needs a mock, the test is wrong or the design leaked infra into domain.

```ts
// src/modules/billing/__tests__/domain/entities/invoice.entity.spec.ts
import { Invoice } from '../../../domain/entities/invoice.entity';
import { InvoiceIssued } from '../../../domain/events/invoice-issued.event';
import { InvoiceAmount } from '../../../domain/value-objects/invoice-amount.vo';
import { InvoiceId } from '../../../domain/value-objects/invoice-id.vo';

describe('Invoice', () => {
  describe('issue()', () => {
    it('debería registrar InvoiceIssued al emitir una factura en borrador', () => {
      // Arrange
      const invoice = Invoice.draft({
        id: InvoiceId.generate(),
        amount: InvoiceAmount.from(149_900),
      });

      // Act
      invoice.issue(new Date('2026-01-01T00:00:00Z'));

      // Assert
      expect(invoice.pullEvents()).toEqual([expect.any(InvoiceIssued)]);
    });
  });
});
```

### Application layer (`src/modules/<context>/application/`)

- **Hand-written port fakes**, not `jest.mock`. The fake is a class that `implements` the port's `abstract class`, often with an in-memory backing, and lives in `<module>/__tests__/helpers/` so every spec shares one (see `users/__tests__/helpers/in-memory-user.repository.ts`).
- The fake has no decorators, so it imports the port with `import type` — the reverse of production files, where a decorated class must import the port as a value (`clean-ddd-hexagonal/references/NESTJS-MAPPING.md` §2).
- Construct the use case directly: `new IssueInvoiceUseCase(fakeRepo)`. Don't go through `Test.createTestingModule` for unit tests.
- `jest.spyOn` is acceptable on the fake's methods to assert calls; `jest.mock` against module paths is not.

```ts
// src/modules/billing/__tests__/application/use-cases/issue-invoice.use-case.spec.ts
import { IssueInvoiceUseCase } from '../../../application/use-cases/issue-invoice.use-case';
import { Invoice } from '../../../domain/entities/invoice.entity';
import { InvoiceAmount } from '../../../domain/value-objects/invoice-amount.vo';
import { InvoiceId } from '../../../domain/value-objects/invoice-id.vo';
import { InMemoryInvoiceRepository } from '../../helpers/in-memory-invoice.repository';

describe('IssueInvoiceUseCase', () => {
  describe('execute()', () => {
    it('debería emitir una factura en borrador y entregar su evento al repositorio', async () => {
      // Arrange
      const id = InvoiceId.generate();
      const repository = new InMemoryInvoiceRepository([
        Invoice.draft({ id, amount: InvoiceAmount.from(149_900) }),
      ]);
      const useCase = new IssueInvoiceUseCase(repository);

      // Act
      await useCase.execute({ invoiceId: id.value });

      // Assert
      expect(repository.savedEvents()).toHaveLength(1);
    });
  });
});
```

```ts
// src/modules/billing/__tests__/helpers/in-memory-invoice.repository.ts
import type { Invoice } from '../../domain/entities/invoice.entity';
import type { InvoiceIssued } from '../../domain/events/invoice-issued.event';
import type { InvoiceRepository } from '../../domain/ports/invoice.repository';
import type { InvoiceId } from '../../domain/value-objects/invoice-id.vo';

export class InMemoryInvoiceRepository implements InvoiceRepository {
  private readonly store = new Map<string, Invoice>();
  private readonly events: InvoiceIssued[] = [];

  constructor(seed: Invoice[] = []) {
    seed.forEach((invoice) => this.store.set(invoice.id.value, invoice));
  }

  findById(id: InvoiceId): Promise<Invoice | null> {
    return Promise.resolve(this.store.get(id.value) ?? null);
  }

  save(invoice: Invoice, events: readonly InvoiceIssued[]): Promise<void> {
    this.store.set(invoice.id.value, invoice);
    this.events.push(...events);
    return Promise.resolve();
  }

  /** Solo para aserciones del test, no forma parte del puerto. */
  savedEvents(): readonly InvoiceIssued[] {
    return this.events;
  }
}
```

### Infrastructure layer (`src/modules/<context>/infrastructure/`)

This is the layer where the upstream skill's advice fully applies — `jest.mock`, `jest.spyOn`, and `Test.createTestingModule` are all on the table.

- **Controllers (`infrastructure/http/`):** the unit spec builds the controller directly with its real use cases over the in-memory fakes (`new UsersController(new FindUserByIdUseCase(repository), …)` in `users.controller.spec.ts`) and covers only the transport ↔ DTO translation; the happy path over HTTP belongs to the module's `<context>.e2e-spec.ts` (Supertest, inside the module's `__tests__/`). `Test.createTestingModule` is for when the DI wiring itself is under test.
- **Repositories (`infrastructure/persistence/`):** `*.typeorm.repository.e2e-spec.ts` against the real PostgreSQL test database (the one `test/setup-env.ts` forces, never the dev one), run by `pnpm test:e2e`. Don't `jest.mock('typeorm')` — the test loses its value — and don't swap in sqlite: behaviour such as the `23505` unique-violation translation is PostgreSQL's.
- **HTTP gateways:** `nock` or `msw`-node for outbound HTTP; `jest.mock` for the SDK module is acceptable when no other option exists.
- **Messaging adapters:** test against a test broker if available; otherwise hand-written fakes for the publisher.

### Bootstrap / cross-cutting

- Filters, interceptors, guards: unit tests with `ArgumentsHost`/`ExecutionContext` test doubles, or in `Test.createTestingModule` when integration is the goal.

## Core testing guidelines

These cut across all layers and complement the mocking-by-layer rules above.

- **Stubs over mocks.** A _stub_ provides an alternate implementation; a _mock_ asserts on calls made. The number of times a function is called is usually an internal detail, not a contract. Reach for `expect(mock).toHaveBeenCalledWith(...)` only when the call itself is the observable contract (e.g., a publisher writes an event). For everything else, build a stub that captures the new state and assert on that.
- **No real network calls in tests.** Stub outbound HTTP at the adapter boundary with [`msw`](https://mswjs.io/) or `nock`. `jest.mock('axios')` is a last resort — it tests your mock, not your code.
- **Reset globals/mocks only when needed.** This repo's `jest.config.mjs` sets `clearMocks: true` and `restoreMocks: true`, so per-test cleanup is automatic. **Do not** add redundant `afterEach(() => jest.resetAllMocks())`. Add `beforeEach` resets only when a specific test mutates `process.env`, `Date.now`, or another global outside the auto-reset's reach.
- **Realistic data in documentation-style tests.** When the test reads as living documentation (e.g., `it('debería normalizar un teléfono mexicano', ...)`), use realistic input (`'+52 55 1234 5678'`), not `'aaa'` or `'test1'`. For values whose specific shape is irrelevant to the assertion, use a fast-check arbitrary (see PBT section) instead of a hardcoded placeholder.
- **Snapshots with caution.** Use only when the captured shape is stable, small, and reviewable at a glance. A 200-line snapshot hides what is being asserted; a 5-line snapshot of a public response DTO is fine. Review snapshot diffs carefully **before approving the PR** (the implementer subagent never runs `git commit` — it suggests).

## Effective mocking (reference)

When mocks are appropriate (i.e. infrastructure or cross-cutting), the operational toolkit:

- `jest.mock('module-path')` for module-level mocks of third-party libraries.
- `jest.spyOn(obj, 'method')` for surgical replacement on real objects.
- `mockImplementation()` / `mockReturnValue()` / `mockResolvedValue()` to define behavior.
- Always type your mocks: `jest.mocked(fn)` over loose casting.
- Reminder: `clearMocks` and `restoreMocks` are already on globally — see "Core testing guidelines" above.

## Testing async code

- Use `async`/`await` in `it` callbacks. Always return a promise or await it — never fire-and-forget.
- For rejection assertions, start the call under `// Act` and await the assertion under
  `// Assert`, as CLAUDE.md's AAA rule asks — never a combined `// Act + Assert`:
  `const act = useCase.execute({ invoiceId });` then
  `await expect(act).rejects.toThrow(InvoiceNotFoundError);`. The class always goes in the
  `toThrow`: without it, any error — a stub's included — passes.
- For resolution assertions, the same split: `const found = await repo.findById(id);` under
  `// Act`, `expect(found).toBeNull();` under `// Assert`.
- Set timeouts only when justified: `jest.setTimeout(20_000)` for genuinely slow integration tests. Default is 15 s (unit) / 30 s (E2E).

## E2E with Supertest

- Use `createTestApp()` from `@test/helpers/create-test-app` (already in this repo): it boots the real `AppModule` with the same globals and creation options as production and returns `{ app, prefix, appConfig, corsConfig, docsPath }`.
- File name: `src/modules/<context>/__tests__/<context>.e2e-spec.ts` — the E2E ships inside the module it exercises.
- Build URLs from `prefix` (`/api/v1` today), never a hardcoded path.
- The suite runs against the test database that `test/setup-env.ts` forces, with one worker; a `TRUNCATE` in `beforeEach` is what makes it repeatable. On a fresh clone, run `pnpm db:migrate:test` once first.
- Protected endpoints need a token: register and log in **once** in `beforeAll`, as `orders.e2e-spec.ts` does with its `registerAndLogin` helper — the auth endpoints are throttled.
- Skeleton:

```ts
// src/modules/billing/__tests__/billing.e2e-spec.ts
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { createTestApp } from '@test/helpers/create-test-app';

describe('Billing (e2e)', () => {
  let app: INestApplication<App>;
  let prefix: string;

  beforeAll(async () => {
    ({ app, prefix } = await createTestApp());
  });

  beforeEach(async () => {
    await app.get(DataSource).query('TRUNCATE TABLE invoices, billing_outbox');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /invoices/:id/issue', () => {
    it('debería responder 401 sin token', async () => {
      // Arrange
      const path = `${prefix}/invoices/9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012/issue`;

      // Act
      const response = await request(app.getHttpServer()).post(path);

      // Assert
      expect(response.status).toBe(401);
    });
  });
});
```

## Snapshot testing

- Snapshot tests are appropriate for **stable serialized output** (e.g., a public response DTO contract). Avoid them for snapshots that change every refactor.
- Keep snapshots small — assert the specific shape, not the whole tree.
- Review snapshot diffs carefully **before approving the PR**. (The implementer subagent never runs `git commit` — they only **suggest** a commit. The user reviews snapshots before deciding.)

## Property-based testing (PBT) with fast-check

> **Required packages (already installed in this repo):** `fast-check`, `@fast-check/jest`, `@faker-js/faker`.

Property-based tests express **invariants** instead of examples: "for any `n`, `Math.abs(n) >= 0`". `fast-check` generates inputs systematically and **shrinks** failing cases to the smallest counterexample. Use it alongside example-based tests, not instead of them.

### When to use it

- Tests phrased as **always** or **never** ("should always X when Y", "should never produce Z").
- **Edge case detection** without writing 50 hand-crafted examples.
- **Round-trips:** `parse(serialize(x)) === x`, `decompress(compress(x)) === x`.
- **Comparison with a simpler reference** (e.g., binary search vs. linear scan agree).
- **Race conditions** in async code that takes async functions as input — see the dedicated subsection below.
- **Don't** use PBT to replace example-based tests. They are complementary: examples document specific scenarios; properties cover the space.

### PBT by hexagonal layer

| Layer              | Value         | Typical targets                                                                                                                                                          |
| ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Domain**         | High          | Invariants of value objects (`Money` non-negative), entity state machines (`Invoice` only issues from draft), pure functions (`sort` idempotency, `Period` containment). |
| **Application**    | Medium        | Use-case idempotency (`execute` twice = once), "no event order produces an invalid aggregate state", race-prone use cases via `fc.scheduler()`.                          |
| **Infrastructure** | Rare but real | Mappers (DTO ↔ entity round-trip), parsers, serializers. **Skip** for repos and HTTP clients — real integration tests are more valuable there.                           |

### Writing a property in `@fast-check/jest`

```ts
import { fc, it as itProp } from '@fast-check/jest';

describe('Money.add', () => {
  itProp.prop([
    fc.float({ min: 0, max: 1_000_000, noNaN: true }),
    fc.float({ min: 0, max: 1_000_000, noNaN: true }),
  ])('debería producir siempre un importe no negativo cuando ambos operandos lo son', (a, b) => {
    // Arrange
    const moneyA = Money.of(a, 'USD');
    const moneyB = Money.of(b, 'USD');

    // Act
    const sum = moneyA.add(moneyB);

    // Assert
    expect(sum.amount).toBeGreaterThanOrEqual(0);
  });
});
```

- Place property tests **after** example-based tests in the same `describe`, or in a sibling `describe('… (property-based)')` when there are several.
- `it.prop` requires a `describe` parent. The library wires `it.prop([arbs])('debería …', (...values) => { … })` directly to Jest.
- Apply AAA comments inside the property body — same rule as example-based tests.

### Arbitraries guidelines

- **Don't generate inputs directly.** If you write `fc.string()` and then call the SUT, you risk re-implementing the SUT inside the test to compute the expected value. Construct inputs _around_ a known outcome:

```ts
// Mal: el test reimplementa la búsqueda del substring para calcular lo esperado
it.prop([fc.string(), fc.string()])('debería detectar el substring', (text, pattern) => {
  // Arrange

  // Act
  const result = isSubstring(text, pattern);

  // Assert
  expect(result).toBe(text.includes(pattern));
});

// Bien: se construye un input que, por construcción, contiene el patrón
it.prop([fc.string(), fc.string(), fc.string()])(
  'debería detectar un substring construido dentro del input',
  (a, b, c) => {
    // Arrange
    const text = a + b + c;

    // Act
    const result = isSubstring(text, b);

    // Assert
    expect(result).toBe(true);
  },
);
```

- **Never set `maxLength` unless the algorithm requires it.** For algorithms that get slow on large inputs, prefer `{ size: '-1' }` (smaller default size). Capping length hides real input shapes.
- **No constraints unless required.** Use defaults (`fc.integer()`, `fc.string()`) — `fast-check` already biases toward edge cases.
- **Avoid `.filter` and `fc.pre`.** They throw away generated values and slow runs. Prefer arbitrary options or `.map`:

```ts
// Mal
fc.integer().filter((n) => n >= 0);
// Bien
fc.nat();

// Mal
fc.string().filter((s) => s.length >= 2);
// Bien
fc.string({ minLength: 2 });

// Mal
fc.integer().filter((n) => n % 2 === 0);
// Bien (truco del map)
fc.nat().map((n) => n * 2);
```

- **`bigint` over `number` for arithmetic with overflow risk** (e.g., `pow`, multiplications). Predicate failures on overflow are confusing; bigint sidesteps the issue.

### Race conditions with `fc.scheduler()`

When the SUT accepts async functions and concurrent resolution order matters, `fc.scheduler()` lets fast-check explore every interleaving. Example: a queue that must resolve in call order.

```ts
import { fc, it as itProp } from '@fast-check/jest';

describe('queue', () => {
  itProp.prop([fc.scheduler()])(
    'debería resolver siempre las llamadas en el orden en que se encolaron',
    async (s) => {
      // Arrange
      const seen: number[] = [];
      const call = jest.fn((v: number) => Promise.resolve(v));
      const queued = queue(s.scheduleFunction(call));

      // Act
      await s.waitFor(
        Promise.all([queued(1).then((v) => seen.push(v)), queued(2).then((v) => seen.push(v))]),
      );

      // Assert
      expect(seen).toEqual([1, 2]);
    },
  );
});
```

`s.scheduleFunction` wraps an async function so its resolution can be interleaved by fast-check; `s.waitFor` drives the scheduler until the promises settle. Vanilla `fast-check` form (no `@fast-check/jest`) requires `fc.assert(fc.asyncProperty(fc.scheduler(), async (s) => { … }))` and `await`.

### Faker integration (not wired yet)

> **Status (2026-09-29):** `@faker-js/faker` is installed, but nothing in `src/` or `test/` imports it and `test/helpers/faker-arb.ts` does **not** exist. The first spec that needs realistic data creates that helper from the snippet below; until then, don't import `@test/helpers/faker-arb`.

`@faker-js/faker` produces realistic data (`'María González'`, `'jgarcia+test@empresa.com.mx'`). Wire it into `fast-check` so you keep shrinking and seed reproducibility while gaining realistic inputs. The `FakerBuilder` class below is the canonical adapter:

Shared test helpers live under `test/helpers/` and are imported via the `@test/` alias — **not** `@/`, which maps to `src/`.

```ts
// test/helpers/faker-arb.ts (un único sitio, compartido por todos los specs)
import { Faker, type Randomizer, base } from '@faker-js/faker';
import fc from 'fast-check';

class FakerBuilder<TValue> extends fc.Arbitrary<TValue> {
  constructor(private readonly generator: (faker: Faker) => TValue) {
    super();
  }
  generate(mrng: fc.Random): fc.Value<TValue> {
    const randomizer: Randomizer = {
      next: () => mrng.nextDouble(),
      seed: () => {},
    };
    const customFaker = new Faker({ locale: base, randomizer });
    return new fc.Value(this.generator(customFaker), undefined);
  }
  canShrinkWithoutContext(_value: unknown): _value is TValue {
    return false;
  }
  shrink(_value: TValue, _context: unknown): fc.Stream<fc.Value<TValue>> {
    return fc.Stream.nil();
  }
}

export function fakerToArb<TValue>(generator: (faker: Faker) => TValue): fc.Arbitrary<TValue> {
  return new FakerBuilder(generator);
}
```

Use it inside `it.prop`:

```ts
import { fakerToArb } from '@test/helpers/faker-arb';
import { fc, it as itProp } from '@fast-check/jest';

itProp.prop([fakerToArb((f) => f.person.firstName()), fakerToArb((f) => f.person.lastName())])(
  'debería aceptar cualquier nombre completo realista',
  (firstName, lastName) => {
    // Arrange
    const fullName = `${firstName} ${lastName}`;
    // Act
    const person = Person.of(fullName);
    // Assert
    expect(person.fullName).toBe(fullName);
  },
);
```

**When Faker pulls its weight:** `Email`, `PersonName`, `Address`, `CompanyTaxId`, `PhoneNumber` — domains where input "shape" matters (accents, `+` in emails, locale-specific formats). **When it doesn't:** `Money`, `Quantity`, `Period`, `OrderTotal` — purely numeric/temporal. For those, plain `fast-check` arbitraries are enough.

### Avoid unstable values

- **Don't depend on the current date/time/locale.** Stub `Date.now` with `jest.useFakeTimers()` + `jest.setSystemTime(new Date('2026-01-01'))` for example-based tests. For property-based tests, generate the "today" value too: `g(fc.date, { min: new Date('2010-01-01'), noInvalidDate: true })`. The benefit over `setSystemTime` alone: fast-check tries new dates each run and reports the exact one that failed.
- **Don't depend on randomness.** All randomness in tests must come through fast-check (or a stubbed `Math.random`), so failures are reproducible.

### `@fast-check/jest` vs vanilla `fast-check` equivalence

Both work. Prefer `@fast-check/jest` for readability; fall back to vanilla when the test predicate doesn't fit the `it.prop` shape.

```ts
// Síncrono, con arbitrarios
// Con @fast-check/jest
import { fc, it as itProp } from '@fast-check/jest';
itProp.prop([fc.integer(), fc.integer()])('debería ser conmutativa', (a, b) => {
  // Arrange

  // Act
  const ab = add(a, b);
  const ba = add(b, a);

  // Assert
  expect(ab).toBe(ba);
});
// Con fast-check a secas: los marcadores AAA van dentro del predicado
import fc from 'fast-check';
it('debería ser conmutativa', () => {
  fc.assert(
    fc.property(fc.integer(), fc.integer(), (a, b) => {
      // Arrange

      // Act
      const ab = add(a, b);
      const ba = add(b, a);

      // Assert
      expect(ab).toBe(ba);
    }),
  );
});

// Predicado asíncrono
// Con @fast-check/jest
itProp.prop([fc.string()])('debería hashear de forma determinista', async (s) => {
  // Arrange

  // Act
  const first = await hash(s);
  const second = await hash(s);

  // Assert
  expect(first).toBe(second);
});
// Con fast-check a secas
it('debería hashear de forma determinista', async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (s) => {
      // Arrange

      // Act
      const first = await hash(s);
      const second = await hash(s);

      // Assert
      expect(first).toBe(second);
    }),
  );
});
```

## React / Frontend testing

This is a backend-only NestJS project. **There is no React Testing Library section** in this adaptation. If the codebase ever grows a frontend, restore the React guidance from the upstream skill.

## Workflow Integration

This skill is consulted, not invoked, and only when a test needs what it covers:

- **`express`, `executing-plans`, `subagent-driven-development` implementers** — mocking by layer, PBT, E2E patterns. The flow itself (case table ↔ `it`, stub first, red by assertion, guard tests that must fail without their protection, mutation of the new code) is defined in those skills and in `CLAUDE.md`.
- **`writing-plans`** — a task that needs a property, a scheduler-driven race or a Supertest E2E points here.
- **`adversarial-review`** — the reviewer judges tests against `CLAUDE.md`; this skill explains the why behind the mocking rules.
- **`clean-ddd-hexagonal`** — the layer rules here are the operational consequence of that skill's architecture.

## Git policy

This skill produces test code, never git operations. Nobody runs `git commit`: the project's `.claude/settings.json` denies it and the user commits. If a green suite feels like a checkpoint, **suggest** it: _"Te sugiero hacer un commit de los cambios por <razón>."_

## Source

Adapted from [github/awesome-copilot — javascript-typescript-jest](https://github.com/github/awesome-copilot). Modifications:

- NestJS conventions (`*.spec.ts` / `*.e2e-spec.ts`, `@swc/jest` baseline, project path aliases).
- Hexagonal mocking guidance (no mocks in domain, hand-written port fakes in application, realistic doubles in infrastructure).
- Supertest E2E section.
- Removal of React content.
- Integration with the rest of the skill chain (`writing-plans`, `subagent-driven-development`, `clean-ddd-hexagonal`, `nestjs-best-practices`).
- No-autocommit policy.
- AAA pattern made mandatory; `it` descriptions in Spanish starting with `debería…`; `// Helpers` block convention.
- Property-based testing section added: adapted from the user's pasted guidelines, with the `@fast-check/vitest` examples translated to `@fast-check/jest` (1:1 API parity), plus the `FakerBuilder` snippet for `@faker-js/faker` integration ([reference](https://fast-check.dev/blog/2024/07/18/integrating-faker-with-fast-check/)).
- 2026-09-30: conventions already fixed by `CLAUDE.md` removed (naming, location, AAA, describe/it, comments, 1:1), plus the generic matchers cheat sheet; the skill keeps what `CLAUDE.md` does not cover (decision D14 of the skills experiment, `docs/development-workflows.md`).
