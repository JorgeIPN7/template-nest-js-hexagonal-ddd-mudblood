---
title: Throw HTTP Exceptions from Services
impact: HIGH
impactDescription: Keeps controllers thin and simplifies error handling
tags: error-handling, exceptions, services, error-code, v12
---

## Throw HTTP Exceptions from Services

It's acceptable (and often preferable) to throw `HttpException` subclasses from services in HTTP applications. This keeps controllers thin and allows services to communicate appropriate error states. For truly layer-agnostic services, use domain exceptions that map to HTTP status codes.

> **NestJS 12 note — `errorCode`:** `HttpExceptionOptions` accepts `errorCode`, a stable identifier clients can branch on instead of parsing `message`. It is copied to `exception.errorCode` and serialized into the body, with one exception:
>
> | You throw | Response body |
> | --- | --- |
> | `new NotFoundException('User #42 not found', { errorCode: 'USER_NOT_FOUND' })` | `{ "message": "User #42 not found", "error": "Not Found", "statusCode": 404, "errorCode": "USER_NOT_FOUND" }` |
> | `new HttpException('Teapot', 418, { errorCode: 'TEAPOT' })` | the default filter adds it: `{ "statusCode": 418, "message": "Teapot", "errorCode": "TEAPOT" }` |
> | `new NotFoundException({ message: 'x' }, { errorCode: 'USER_NOT_FOUND' })` | **your object, verbatim** — `errorCode` is only on `exception.errorCode` |
>
> Pass a string message (not an object) when you want the code in the body, and make sure a custom global filter that rebuilds the body copies `exception.errorCode` (see `error-use-exception-filters`).

**Incorrect (return error objects instead of throwing):**

```typescript
// Return error objects instead of throwing
@Injectable()
export class UsersService {
  async findById(id: string): Promise<{ user?: User; error?: string }> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      return { error: 'User not found' }; // Controller must check this
    }
    return { user };
  }
}

@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const result = await this.usersService.findById(id);
    if (result.error) {
      throw new NotFoundException(result.error);
    }
    return result.user;
  }
}
```

**Correct (throw exceptions directly from service):**

```typescript
// Throw exceptions directly from service
@Injectable()
export class UsersService {
  constructor(private readonly repo: UserRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      // v12: errorCode travels in the body next to message/error/statusCode
      throw new NotFoundException(`User #${id} not found`, { errorCode: 'USER_NOT_FOUND' });
    }
    return user;
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.repo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered', { errorCode: 'EMAIL_TAKEN' });
    }
    return this.repo.save(dto);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id); // Throws if not found
    Object.assign(user, dto);
    return this.repo.save(user);
  }
}

// Controller stays thin
@Controller('users')
export class UsersController {
  @Get(':id')
  findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto): Promise<User> {
    return this.usersService.create(dto);
  }
}

// For layer-agnostic services, use domain exceptions
export class EntityNotFoundException extends Error {
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} with ID "${id}" not found`);
  }
}

// Map to HTTP in exception filter
@Catch(EntityNotFoundException)
export class EntityNotFoundFilter implements ExceptionFilter {
  catch(exception: EntityNotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(404).json({
      statusCode: 404,
      message: exception.message,
      errorCode: 'ENTITY_NOT_FOUND', // same field name as HttpException's errorCode
      entity: exception.entity,
      id: exception.id,
    });
  }
}
```

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)
