---
title: Use Structured Logging
impact: MEDIUM-HIGH
impactDescription: Structured logging enables effective debugging and monitoring
tags: devops, logging, structured-logs, pino, v11, v12
---

## Use Structured Logging

Use NestJS Logger with structured JSON output in production. Include contextual information (request ID, user ID, operation) to trace requests across services. Avoid `console.log` and implement proper log levels.

> **Since v11:** the framework has a **`fatal` log level** (above `error`) and the built-in `ConsoleLogger` natively supports **JSON output** plus knobs for `colors`, `compact`, `breakLength`, and `depth`. For many services this removes the need to ship Pino purely for JSON output — reach for Pino when you also need very low overhead, redaction, or HTTP request logging.

> **NestJS 12 note:** `ConsoleLogger` treats **plain objects passed after the message as structured params** of the same entry (`structuredParams`, default `true`) instead of printing each one as a separate record. In JSON mode they are nested under `params`, or spread into the root object with `flattenParams: true` (framework fields such as `message` or `level` win on key collisions). Only `error()` recognises a stack-trace string argument; `fatal()` does not, so pass the error inside an object there (`logger.fatal('Out of memory', { error })`).

**Incorrect (using console.log in production):**

```typescript
// Use console.log in production
@Injectable()
export class UsersService {
  async createUser(dto: CreateUserDto): Promise<User> {
    console.log('Creating user:', dto);
    // Not structured, no levels, lost in production logs

    try {
      const user = await this.repo.save(dto);
      console.log('User created:', user.id);
      return user;
    } catch (error) {
      console.log('Error:', error); // Using log for errors
      throw error;
    }
  }
}

// Log sensitive data
console.log('Login attempt:', { email, password }); // SECURITY RISK!

// Inconsistent log format
logger.log('User ' + userId + ' created at ' + new Date());
// Hard to parse, no structure
```

**Correct (use structured logging with context):**

```typescript
// Configure logger in main.ts
// Since v11: 'fatal' is a real level (above 'error'), include it in production
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['fatal', 'error', 'warn', 'log']
        : ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'],
  });
}

// Built-in JSON output with ConsoleLogger (v11+)
// Replaces ad-hoc JsonLogger implementations for most use cases
import { ConsoleLogger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // buffer until logger is attached so nothing is lost
    logger: new ConsoleLogger({
      json: process.env.NODE_ENV === 'production',
      colors: process.env.NODE_ENV !== 'production',
      logLevels: ['fatal', 'error', 'warn', 'log'],
    }),
  });
  // Output (production):
  // {"level":"log","pid":1,"timestamp":1735689600000,"message":"Listening","context":"NestApplication"}
}

// v12: plain objects after the message become structured params of the same entry
const logger = new ConsoleLogger('UsersService', { json: true });
logger.log('User created', { userId: 'u-1' });
// {"level":"log",…,"message":"User created","context":"UsersService","params":{"userId":"u-1"}}

const flat = new ConsoleLogger('UsersService', { json: true, flattenParams: true });
flat.log('User created', { userId: 'u-1' });
// {"level":"log",…,"message":"User created","context":"UsersService","userId":"u-1"}

// Use NestJS Logger with context
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  async createUser(dto: CreateUserDto): Promise<User> {
    this.logger.log('Creating user', { email: dto.email }); // v12: → "params": { "email": … }

    try {
      const user = await this.repo.save(dto);
      this.logger.log('User created', { userId: user.id });
      return user;
    } catch (error) {
      // error(): the stack string goes to "stack", the object to "params"
      this.logger.error('Failed to create user', error.stack, {
        email: dto.email,
      });
      throw error;
    }
  }
}

// Custom logger for JSON output — only if you need a shape ConsoleLogger cannot produce
@Injectable()
export class JsonLogger implements LoggerService {
  log(message: string, context?: object): void {
    console.log(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        message,
        ...context,
      }),
    );
  }

  error(message: string, trace?: string, context?: object): void {
    console.error(
      JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        message,
        trace,
        ...context,
      }),
    );
  }

  warn(message: string, context?: object): void {
    console.warn(
      JSON.stringify({
        level: 'warn',
        timestamp: new Date().toISOString(),
        message,
        ...context,
      }),
    );
  }

  debug(message: string, context?: object): void {
    console.debug(
      JSON.stringify({
        level: 'debug',
        timestamp: new Date().toISOString(),
        message,
        ...context,
      }),
    );
  }
}

// Request context logging with ClsModule
import { ClsModule, ClsService } from 'nestjs-cls';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
      },
    }),
  ],
})
export class AppModule {}

// Middleware to set request context
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.headers['x-request-id'] || randomUUID();
    this.cls.set('requestId', requestId);
    this.cls.set('userId', req.user?.id);

    res.setHeader('x-request-id', requestId);
    next();
  }
}

// Logger that includes request context
@Injectable()
export class ContextLogger {
  constructor(private cls: ClsService) {}

  log(message: string, data?: object): void {
    console.log(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        requestId: this.cls.get('requestId'),
        userId: this.cls.get('userId'),
        message,
        ...data,
      }),
    );
  }

  error(message: string, error: Error, data?: object): void {
    console.error(
      JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        requestId: this.cls.get('requestId'),
        userId: this.cls.get('userId'),
        message,
        error: error.message,
        stack: error.stack,
        ...data,
      }),
    );
  }
}

// Pino integration for high-performance logging
// Transports (pino-pretty, file, …) flush on the process 'exit' event: end the process
// with process.exit() on shutdown — see devops-graceful-shutdown (plain
// enableShutdownHooks() re-raises the signal and 'exit' never fires).
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        redact: ['req.headers.authorization', 'req.body.password'],
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            query: req.query,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
  ],
})
export class AppModule {}

// Usage with Pino
@Injectable()
export class UsersService {
  constructor(private logger: PinoLogger) {
    this.logger.setContext(UsersService.name);
  }

  async findOne(id: string): Promise<User> {
    this.logger.info({ userId: id }, 'Finding user');
    // Pino uses first arg for data, second for message
  }
}
```

Reference: [NestJS Logger](https://docs.nestjs.com/techniques/logger)
