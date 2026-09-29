---
title: Implement Graceful Shutdown
impact: MEDIUM-HIGH
impactDescription: Proper shutdown handling ensures zero-downtime deployments
tags: devops, graceful-shutdown, lifecycle, kubernetes, v11, v12
---

## Implement Graceful Shutdown

Handle SIGTERM and SIGINT signals to gracefully shutdown your NestJS application. Stop accepting new requests, wait for in-flight requests to complete, close database connections, and clean up resources. This prevents data loss and connection errors during deployments.

> **Since v11:** termination hooks (`onModuleDestroy`, `beforeApplicationShutdown`, `onApplicationShutdown`) run in **reverse order** vs initialization. Take advantage of this: place "first to start, last to stop" infrastructure (logger, database, Redis) at the top of the import graph and they will be available to feature-module destroy hooks. Don't try to manually reorder shutdown — let the framework do it.

> **NestJS 12 notes:**
>
> - **A failing termination hook no longer fails the shutdown.** Each hierarchy level runs with `Promise.allSettled`; a rejection is only logged with `Logger.error` and `app.close()` still **resolves** (in v11 it rejected). A `.catch()` on `close()` does not detect a broken hook.
> - **`enableShutdownHooks()` owns the signal.** Its listener runs the shutdown sequence and then re-raises the signal with `process.kill(process.pid, signal)` (exit 143 on SIGTERM), or calls `process.exit(0)` when you pass `{ useProcessExit: true }`. Any `process.on(signal)` of yours runs **alongside** it and races it.
> - **Sequence of `close()`:** arm `return503OnClosing` → `onModuleDestroy` → `beforeApplicationShutdown` → HTTP server closes (waits for in-flight requests) → `onApplicationShutdown`. `onModuleDestroy` fires while requests are still being served, so release pools and connections in `onApplicationShutdown`.
> - **`return503OnClosing: true`** (`NestFactory.create` option, default `false`): from the start of `close()` until the HTTP server stops listening (right after `beforeApplicationShutdown`), new requests get `503` with `Connection: close`; from then on new connections are refused. In-flight requests finish either way. So the 503 window is as long as your `onModuleDestroy` + `beforeApplicationShutdown` hooks take. That 503 comes from a platform middleware registered before any of yours: on Express it is `text/html` with the body `Service Unavailable` — no error envelope, no request id, no log line — and it pre-empts Terminus' `shutting_down` JSON too.

**Pick exactly one owner of the signal:**

| | A — your handler owns it (no `enableShutdownHooks`) | B — `enableShutdownHooks(signals, { useProcessExit: true })` |
| --- | --- | --- |
| Exit code on SIGTERM | 143 (`128 + 15`) — the conventional one | 0 |
| `'exit'` event emitted (async loggers such as pino transports flush on it) | Yes | Yes |
| Watchdog and your own logs | Yes | No — the orchestrator's kill timeout is the watchdog |
| Hooks receive the signal | Yes, through `close(signal)` | Yes |
| Repeated signal during shutdown (one Ctrl+C under `nest start` arrives twice) | Ignored by your guard — requires `process.on`, never `process.once` | Ignored by Nest's own guard |

Plain `enableShutdownHooks()` without options exits by the re-raised signal: correct code (143), but **no `'exit'` event**, so a logger that flushes on `'exit'` can lose its last lines.

**Incorrect (ignoring shutdown signals):**

```typescript
// Ignore shutdown signals
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  // App crashes immediately on SIGTERM
  // In-flight requests fail
  // Database connections are abruptly closed
}

// Long-running tasks without cancellation
@Injectable()
export class ProcessingService {
  async processLargeFile(file: File): Promise<void> {
    // No way to interrupt this during shutdown
    for (let i = 0; i < file.chunks.length; i++) {
      await this.processChunk(file.chunks[i]);
      // May run for minutes, blocking shutdown
    }
  }
}
```

**Incorrect (two owners of the same signal — dead code in NestJS 12):**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // Nest's listener is registered first...
  const server = await app.listen(3000);

  process.on('SIGTERM', () => {
    // ...and this one runs next to it, racing it
    server.close(async () => {
      await app.close(); // awaits the shutdown Nest already started
      process.exit(0); // with process.once(): never reached — Nest re-raises the
    }); //                  signal and the default action kills the process first.
    //                      with process.on(): wins the race and exits 0, even
    //                      when a hook failed.
  });
  // A .catch(() => process.exit(1)) here never sees a failing hook in v12:
  // close() resolves (allSettled).
}

// Readiness flag flipped in onApplicationShutdown: too late — by then the HTTP
// server is already closed, so the probe can no longer reach it.
@Injectable()
export class AppShutdownService implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    this.shutdownService.startShutdown();
    await this.sleep(5000); // delays exit, drains nothing
  }
}

// Hand-rolled in-flight tracking: redundant — close() already waited for the
// in-flight requests (HTTP server close) before onApplicationShutdown runs.
@Injectable()
export class RequestTracker implements NestMiddleware, OnApplicationShutdown {
  /* counts requests, 503s new ones, waits in onApplicationShutdown */
}
```

**Correct — option A (recommended): your handler is the only listener:**

```typescript
// main.ts
import { Logger } from '@nestjs/common';
import { NestFactory, type NestApplication } from '@nestjs/core';
import { constants } from 'node:os';
import { AppModule } from './app.module';

const SHUTDOWN_TIMEOUT_MS = 25_000; // below Kubernetes' terminationGracePeriodSeconds (30 s)

async function bootstrap(): Promise<void> {
  // `NestApplication`, not the default `INestApplication`: only the class declares
  // `close(signal?: string)`; on the interface `close()` takes no argument (TS2554).
  const app = await NestFactory.create<NestApplication>(AppModule, {
    return503OnClosing: true, // 503 to new requests until the server stops listening
  });
  // No app.enableShutdownHooks(): Nest would register a second listener and re-raise the signal.
  await app.listen(3000);

  const logger = new Logger('Shutdown');
  let shuttingDown = false;

  const shutdown = (signal: 'SIGTERM' | 'SIGINT'): void => {
    if (shuttingDown) return; // a repeated signal is ignored: the watchdog is the limit
    shuttingDown = true;
    logger.log(`Received ${signal}, starting graceful shutdown`);

    // Watchdog: a hook that never settles must not hold the pod until SIGKILL
    const watchdog = setTimeout(() => {
      logger.fatal(`Shutdown exceeded ${SHUTDOWN_TIMEOUT_MS} ms, forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    watchdog.unref();

    app
      .close(signal) // hooks receive the signal (Terminus only waits on 'SIGTERM')
      .then(() => {
        clearTimeout(watchdog);
        // 128 + signal number keeps the conventional status (SIGTERM → 143, SIGINT → 130),
        // and process.exit() emits 'exit' so async loggers can flush.
        process.exit(128 + constants.signals[signal]);
      })
      // A failing hook does NOT land here (it is only logged); this only catches a
      // failure outside the hooks, such as a connected microservice rejecting on close.
      .catch((err: unknown) => {
        logger.error('Graceful shutdown failed', { err }); // v12: plain object → structured params
        process.exit(1);
      });
  };

  // process.on, NOT once — the guard above makes a repeated signal a no-op. One Ctrl+C under
  // `nest start` (or any wrapper that forwards signals) reaches the child TWICE: the terminal
  // sends SIGINT to the whole process group and the CLI forwards its own copy. With once(), the
  // second copy finds no listener, Node's default action kills the process mid-shutdown and the
  // in-flight requests, the remaining hooks and the 'exit' event are all lost. Nest's own
  // enableShutdownHooks() listener uses the same process.on + "already shutting down" guard.
  // Manual escape hatch while the watchdog runs: SIGKILL.
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

**Correct — option B: Nest owns the signal and exits with `process.exit(0)`:**

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { return503OnClosing: true });
  // useProcessExit: process.exit(0) instead of re-raising the signal, so 'exit' fires
  // (async loggers flush) — at the price of SIGTERM's 143 becoming 0.
  app.enableShutdownHooks(['SIGTERM', 'SIGINT'], { useProcessExit: true });
  await app.listen(3000);
  // Do NOT add process.on('SIGTERM', ...) here: that is two owners again.
}
```

**Correct (readiness during shutdown with Terminus 12):**

```typescript
// health.module.ts — no hand-rolled "isShuttingDown" flag needed
@Module({
  imports: [TerminusModule.forRoot({ gracefulShutdownTimeoutMs: 5_000 })],
  controllers: [HealthController],
})
export class HealthModule {}
// From beforeApplicationShutdown on, every HealthCheckService.check() answers
// 503 { status: 'shutting_down' }, and on SIGTERM Terminus waits 5 s so the load
// balancer can withdraw the pod while it keeps serving traffic.
//
// ⚠️ return503OnClosing is armed EARLIER (at the start of close()), so combined with
// this delay it answers 503 to ALL traffic during those 5 s. Use one or the other:
// the Terminus delay, or a Kubernetes preStop sleep plus return503OnClosing for stragglers.
```

**Correct (lifecycle hooks for cleanup):**

```typescript
// Release connections in onApplicationShutdown: it runs after the HTTP server
// has closed, so no in-flight request can still need them
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly connections: Connection[] = [];

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Closing connections on ${signal}`);
    await Promise.all(this.connections.map((conn) => conn.close()));
  }
}

// Long-running work: cancel cooperatively at the first shutdown hook
@Injectable()
export class ProcessingService implements OnModuleDestroy {
  private readonly abort = new AbortController();

  onModuleDestroy(): void {
    this.abort.abort();
  }

  async processLargeFile(file: File): Promise<void> {
    for (const chunk of file.chunks) {
      this.abort.signal.throwIfAborted(); // stop between chunks; re-queue the rest
      await this.processChunk(chunk);
    }
  }
}

// Queue processor with graceful shutdown
@Injectable()
export class QueueService implements OnApplicationShutdown, OnModuleDestroy {
  private isShuttingDown = false;

  onModuleDestroy(): void {
    this.isShuttingDown = true;
  }

  async onApplicationShutdown(): Promise<void> {
    // Wait for current jobs to complete
    await this.queue.close();
  }

  async processJob(job: Job): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Service is shutting down');
    }
    await this.doWork(job);
  }
}

// WebSocket gateway cleanup
@WebSocketGateway()
export class EventsGateway implements OnApplicationShutdown {
  @WebSocketServer()
  server: Server;

  async onApplicationShutdown(): Promise<void> {
    // Notify all connected clients
    this.server.emit('shutdown', { message: 'Server is shutting down' });

    // Close all connections
    this.server.disconnectSockets();
  }
}
```

Reference: [NestJS Lifecycle Events](https://docs.nestjs.com/fundamentals/lifecycle-events) · [NestJS Terminus — graceful shutdown](https://docs.nestjs.com/recipes/terminus) · [NestJS v12 migration guide](https://docs.nestjs.com/migration-guide)
