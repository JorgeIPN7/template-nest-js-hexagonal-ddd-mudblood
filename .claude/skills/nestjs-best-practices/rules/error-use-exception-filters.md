---
title: Use Exception Filters for Error Handling
impact: HIGH
impactDescription: Consistent, centralized error handling
tags: error-handling, exception-filters, consistency, error-code, v12
---

## Use Exception Filters for Error Handling

Never catch exceptions and manually format error responses in controllers. Use NestJS exception filters to handle errors consistently across your application. Create custom exception filters for specific error types and a global filter for unhandled exceptions.

> **NestJS 12 note — propagate `errorCode`:** `new NotFoundException('…', { errorCode: 'USER_NOT_FOUND' })` stores the code on `exception.errorCode` and the built-in filter serializes it into the body. A custom filter that **rebuilds** the body from scratch drops it unless it copies `exception.errorCode` itself — and when the exception was built from an object, the code is *only* on the property, never in `getResponse()`.

**Incorrect (manual error handling in controllers):**

```typescript
// Manual error handling in controllers
@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    try {
      const user = await this.usersService.findById(id);
      if (!user) {
        return res.status(404).json({
          statusCode: 404,
          message: 'User not found',
        });
      }
      return res.json(user);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        statusCode: 500,
        message: 'Internal server error',
      });
    }
  }
}
```

**Correct (exception filters with consistent handling):**

```typescript
// Use built-in and custom exceptions
@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }
    return user;
  }
}

// Custom domain exception — v12: a string message plus errorCode yields the standard body
// { message, error: 'Not Found', statusCode: 404, errorCode: 'USER_NOT_FOUND' }
export class UserNotFoundException extends NotFoundException {
  constructor(userId: string) {
    super(`User with ID "${userId}" not found`, { errorCode: 'USER_NOT_FOUND' });
  }
}

// Custom exception filter for domain errors
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.getStatus?.() || 400;

    response.status(status).json({
      statusCode: status,
      errorCode: exception.code, // one field name for every error, as in HttpException
      message: exception.message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

// Global exception filter for unhandled errors
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // getResponse(), not exception.message: ValidationPipe keeps its array of messages
    // there, while exception.message degrades to "Bad Request Exception"
    const body = isHttp ? exception.getResponse() : undefined;
    const message =
      typeof body === 'string'
        ? body
        : typeof body === 'object' && body !== null && 'message' in body
          ? body.message
          : 'Internal server error';

    // v12: the code lives on the exception; rebuilding the body means copying it
    const errorCode = isHttp ? exception.errorCode : undefined;

    this.logger.error(`${request.method} ${request.url}`, { exception });

    response.status(status).json({
      statusCode: status,
      message,
      ...(errorCode !== undefined && { errorCode }),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}

// Register globally in main.ts (Logger is not a provider: app.get(Logger) would throw)
app.useGlobalFilters(
  new AllExceptionsFilter(new Logger('Exceptions')),
  new DomainExceptionFilter(),
);

// Or via module
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
```

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)
