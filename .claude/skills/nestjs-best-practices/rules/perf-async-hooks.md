---
title: Use Async Lifecycle Hooks Correctly
impact: HIGH
impactDescription: Improper async handling blocks application startup
tags: performance, lifecycle, async, hooks, v11, v12
---

## Use Async Lifecycle Hooks Correctly

NestJS lifecycle hooks (`onModuleInit`, `onApplicationBootstrap`, etc.) support async operations. However, misusing them can block application startup or cause race conditions. Understand the lifecycle order and use hooks appropriately.

> **Since v11:** termination hooks (`onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown`) run in **reverse order** of their initialization counterparts. A module that initialized first will tear down last. This makes "destroy after my consumers" guarantees explicit: a database module imported by a feature module is destroyed *after* the feature, so feature-module destroy hooks can still issue queries.

> **NestJS 12 notes:**
>
> - **Hooks run by hierarchy level, also inside a module.** A provider's `onModuleInit` starts only after the `onModuleInit` of the providers it depends on has finished; providers on the same level run concurrently. Termination hooks walk the levels in reverse (consumers first). This can change the order you relied on in v11 — review hooks whose order matters.
> - **Termination hooks settle with `Promise.allSettled`.** A rejecting `onModuleDestroy`, `beforeApplicationShutdown` or `onApplicationShutdown` is logged with `Logger.error`, the sequence continues and `app.close()` **resolves** (in v11 the rejection failed the shutdown). Handle errors inside the hook; throwing no longer signals anything to your caller.
> - **Initialization hooks still use `Promise.all`:** a rejecting `onModuleInit` aborts bootstrap — fail fast is preserved.

**Initialization order (deepest dependency first):**
`onModuleInit` → `onApplicationBootstrap` (after every module is initialized)

**Termination order (reversed since v11):**
`onModuleDestroy` → `beforeApplicationShutdown` → *(HTTP server closes, waiting for in-flight requests)* → `onApplicationShutdown` (consumers tear down before their dependencies)

`onModuleDestroy` fires while requests are still being served: release pools and connections in `onApplicationShutdown`, which runs after the HTTP server has closed.

Termination hooks only fire if you call `app.close()` or the process receives a signal you are listening to — through `app.enableShutdownHooks()` or your own handler, never both (see `devops-graceful-shutdown`). Shutdown hook listeners are off by default because they consume system resources.

**Incorrect (fire-and-forget async without await):**

```typescript
// Fire-and-forget async without await
@Injectable()
export class DatabaseService implements OnModuleInit {
  onModuleInit() {
    // This runs but doesn't block - app starts before DB is ready!
    this.connect();
  }

  private async connect() {
    await this.pool.connect();
    console.log('Database connected');
  }
}

// Heavy blocking operations in constructor
@Injectable()
export class ConfigService {
  private config: Config;

  constructor() {
    // BLOCKS entire module instantiation synchronously
    this.config = fs.readFileSync('config.json');
  }
}
```

**Correct (return promises from async hooks):**

```typescript
// Return promise from async hooks
@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private pool: Pool;

  async onModuleInit(): Promise<void> {
    // NestJS waits for this to complete before continuing
    await this.pool.connect();
    console.log('Database connected');
  }

  async onApplicationShutdown(): Promise<void> {
    // Not onModuleDestroy: that one runs while in-flight requests may still query the pool.
    // A rejection here is only logged (allSettled) — log with context yourself.
    await this.pool.end();
    console.log('Database disconnected');
  }
}

// Use onApplicationBootstrap for cross-module dependencies
@Injectable()
export class CacheWarmerService implements OnApplicationBootstrap {
  constructor(
    private cache: CacheService,
    private products: ProductsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // All modules are initialized, safe to warm cache
    const products = await this.products.findPopular();
    await this.cache.warmup(products);
  }
}

// Heavy init in async hooks, not constructor
@Injectable()
export class ConfigService implements OnModuleInit {
  private config: Config;

  constructor() {
    // Keep constructor synchronous and fast
  }

  async onModuleInit(): Promise<void> {
    // Async loading in lifecycle hook
    this.config = await this.loadConfig();
  }

  private async loadConfig(): Promise<Config> {
    const file = await fs.promises.readFile('config.json');
    return JSON.parse(file.toString());
  }

  get<T>(key: string): T {
    return this.config[key];
  }
}

// Enable shutdown hooks in main.ts — the only listener for those signals
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // useProcessExit: exit via process.exit(0) so 'exit' fires; without it Nest re-raises the signal
  app.enableShutdownHooks(['SIGTERM', 'SIGINT'], { useProcessExit: true });
  await app.listen(3000);
}
```

Reference: [NestJS Lifecycle Events](https://docs.nestjs.com/fundamentals/lifecycle-events)
