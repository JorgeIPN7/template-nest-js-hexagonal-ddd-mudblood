---
title: Implement Health Checks for Microservices
impact: MEDIUM-HIGH
impactDescription: Health checks enable orchestrators to manage service lifecycle
tags: microservices, health-checks, terminus, kubernetes, v12
---

## Implement Health Checks for Microservices

Implement liveness and readiness probes using `@nestjs/terminus`. Liveness checks determine if the service should be restarted. Readiness checks determine if the service can accept traffic. Proper health checks enable Kubernetes and load balancers to route traffic correctly.

> **Terminus 12 notes:**
>
> - **The legacy indicator API is gone.** `HealthIndicator` (the base class) and `HealthCheckError` were deprecated in v11 and are removed in v12: custom indicators inject `HealthIndicatorService` and **return** `up()` / `down()` / `degraded()` — throwing is no longer how you report "down".
> - **`degraded`** is a third state: the indicator is still serving but impaired; the overall status becomes `degraded` and the HTTP status stays `200`.
> - **Built-in shutdown readiness.** From `beforeApplicationShutdown` on, `HealthCheckService.check()` answers `503` with `status: 'shutting_down'`; `TerminusModule.forRoot({ gracefulShutdownTimeoutMs })` also delays shutdown on SIGTERM. No hand-rolled flag needed.
> - **A `down` result carries the error text.** `attempt()`-based checks (such as `TypeOrmHealthIndicator.pingCheck`) add `message: err.message` and `responseTime` — on a public probe that can publish driver or infrastructure details. Strip it or keep the probe off the public surface.

**Incorrect (simple ping that doesn't check dependencies):**

```typescript
// Simple ping that doesn't check dependencies
@Controller('health')
export class HealthController {
  @Get()
  check(): string {
    return 'OK'; // Service might be unhealthy but returns OK
  }
}

// Health check that blocks on slow dependencies
@Controller('health')
export class HealthController {
  @Get()
  async check(): Promise<string> {
    // If database is slow, health check times out
    await this.userRepo.findOne({ where: { id: '1' } });
    await this.redis.ping();
    await this.externalApi.healthCheck();
    return 'OK';
  }
}
```

**Correct (use @nestjs/terminus for comprehensive health checks):**

```typescript
// Use @nestjs/terminus for comprehensive health checks
import {
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
  HealthCheck,
  DiskHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private db: TypeOrmHealthIndicator,
    private disk: DiskHealthIndicator,
    private memory: MemoryHealthIndicator,
    private redis: RedisHealthIndicator, // custom, defined below
    private queue: QueueHealthIndicator, // custom, defined below
  ) {}

  // Liveness probe - is the service alive?
  @Get('live')
  @HealthCheck()
  liveness() {
    return this.health.check([
      // Basic checks only
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024), // 200MB
    ]);
  }

  // Readiness probe - can the service handle traffic?
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      // v12: pingCheck returns an attempt; chain the timeout (the `timeout` option is deprecated)
      () => this.db.pingCheck('database').withTimeout(1000),
      () => this.redis.isHealthy('redis'), // Redis is not HTTP: custom indicator below
      () =>
        this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),
    ]);
  }

  // Deep health check for debugging (HttpHealthIndicator needs @nestjs/axios + axios)
  @Get('deep')
  @HealthCheck()
  deepCheck() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),
      () =>
        this.disk.checkStorage('disk', { path: '/', thresholdPercent: 0.9 }),
      () =>
        this.http.pingCheck('external-api', 'https://api.example.com/health'),
    ]);
  }
}

// Custom indicator for business-specific health (Terminus 12: HealthIndicatorService)
import { HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class QueueHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly queueService: QueueService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    const queueStats = await this.queueService.getStats();
    const data = {
      waiting: queueStats.waitingCount,
      active: queueStats.activeCount,
      failed: queueStats.failedCount,
    };

    if (queueStats.failedCount >= 100) {
      return indicator.down(data); // return it: the check turns 503
    }
    if (queueStats.waitingCount > 1_000) {
      return indicator.degraded(data); // still serving: overall 'degraded', HTTP 200
    }
    return indicator.up(data);
  }
}

// Redis health indicator: attempt() marks 'up' when the function resolves and
// 'down' (with message + responseTime) when it throws or times out
@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  isHealthy(key: string) {
    return this.healthIndicatorService
      .check(key)
      .attempt(async () => {
        const pong = await this.redis.ping();
        if (pong !== 'PONG') {
          throw new Error(`Unexpected PING reply: ${pong}`);
        }
      })
      .withTimeout(1000);
  }
}

// Use custom indicators
@Get('ready')
@HealthCheck()
readiness() {
  return this.health.check([
    () => this.db.pingCheck('database').withTimeout(1000),
    () => this.redis.isHealthy('redis'),
    () => this.queue.isHealthy('job-queue'),
  ]);
}

// Graceful shutdown: Terminus flips every check() to 503 'shutting_down' by itself
// (from beforeApplicationShutdown on) and, on SIGTERM, waits before the HTTP server closes.
// Keep the delay below Kubernetes' terminationGracePeriodSeconds. The hooks must receive
// the signal — see devops-graceful-shutdown for who owns SIGTERM.
@Module({
  imports: [TerminusModule.forRoot({ gracefulShutdownTimeoutMs: 5_000 })],
  controllers: [HealthController],
  providers: [QueueHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
```

### Kubernetes Configuration

```yaml
# Kubernetes deployment with probes
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  template:
    spec:
      containers:
        - name: api
          image: api-service:latest
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 0
            periodSeconds: 5
            failureThreshold: 30
```

Reference: [NestJS Terminus](https://docs.nestjs.com/recipes/terminus)
