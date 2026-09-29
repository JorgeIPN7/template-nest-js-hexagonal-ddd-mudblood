---
title: Handle Async Errors Properly
impact: HIGH
impactDescription: Prevents process crashes from unhandled rejections
tags: error-handling, async, promises, logging, v12
---

## Handle Async Errors Properly

NestJS automatically catches errors from async route handlers, but errors from background tasks, event handlers, and manually created promises can crash your application. Always handle async errors explicitly and use global handlers as a safety net.

> **NestJS 12 note — log the error in one entry.** The built-in logger treats plain objects after the message as structured params of the same entry, takes a trailing **string** as the log *context*, and only `error()` recognises a stack-trace string. So `logger.error('Unhandled Rejection at:', promise, 'reason:', reason)` splits into several records, the promise is printed as `{}`, and a string `reason` lands in the `context` or `stack` field instead of the message. Pass the error inside an object — `logger.error('Unhandled rejection', { reason })` — or its stack as the second argument of `error()`.

**Incorrect (fire-and-forget without error handling):**

```typescript
// Fire-and-forget without error handling
@Injectable()
export class UsersService {
  async createUser(dto: CreateUserDto): Promise<User> {
    const user = await this.repo.save(dto);

    // Fire and forget - if this fails, error is unhandled!
    this.emailService.sendWelcome(user.email);

    return user;
  }
}

// Unhandled promise in event handler
@Injectable()
export class OrdersService {
  @OnEvent('order.created')
  handleOrderCreated(event: OrderCreatedEvent) {
    // This returns a promise but it's not awaited!
    this.processOrder(event);
    // Errors will crash the process
  }

  private async processOrder(event: OrderCreatedEvent): Promise<void> {
    await this.inventoryService.reserve(event.items);
    await this.notificationService.send(event.userId);
  }
}

// Missing try-catch in scheduled tasks
@Cron('0 0 * * *')
async dailyCleanup(): Promise<void> {
  await this.cleanupService.run();
  // If this throws, no error handling
}
```

**Correct (explicit async error handling):**

```typescript
// Handle fire-and-forget with explicit catch
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  async createUser(dto: CreateUserDto): Promise<User> {
    const user = await this.repo.save(dto);

    // Explicitly catch and log errors
    this.emailService.sendWelcome(user.email).catch((error) => {
      this.logger.error('Failed to send welcome email', error.stack);
      // Optionally queue for retry
    });

    return user;
  }
}

// Properly handle async event handlers
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      await this.processOrder(event);
    } catch (error) {
      this.logger.error('Failed to process order', { event, error }); // v12: one entry, "params"
      // Handle it here: rethrowing only reaches @nestjs/event-emitter, which by default
      // (suppressErrors: true) logs it and moves on — the event would be lost silently
      await this.deadLetterQueue.add('order.created', event);
    }
  }
}

// Safe scheduled tasks
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  @Cron('0 0 * * *')
  async dailyCleanup(): Promise<void> {
    try {
      await this.cleanupService.run();
      this.logger.log('Daily cleanup completed');
    } catch (error) {
      this.logger.error('Daily cleanup failed', error.stack);
      // Alert or retry logic
    }
  }
}

// Global unhandled rejection handler in main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  process.on('unhandledRejection', (reason) => {
    // One entry; an Error reason is serialized with its stack, a string one stays a value
    logger.error('Unhandled rejection', { reason });
  });

  process.on('uncaughtException', (error) => {
    // fatal() does not detect a stack string: pass the error inside an object
    logger.fatal('Uncaught exception', { error });
    process.exit(1);
  });

  await app.listen(3000);
}
```

Reference: [Node.js Unhandled Rejections](https://nodejs.org/api/process.html#event-unhandledrejection)
