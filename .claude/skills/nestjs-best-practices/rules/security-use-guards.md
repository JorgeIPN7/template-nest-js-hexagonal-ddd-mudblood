---
title: Use Guards for Authentication and Authorization
impact: HIGH
impactDescription: Enforces access control before handlers execute
tags: security, guards, authentication, authorization, v12
---

## Use Guards for Authentication and Authorization

Guards determine whether a request should be handled based on authentication state, roles, permissions, or other conditions. They run after middleware but before pipes and interceptors, making them ideal for access control. Use guards instead of manual checks in controllers.

> **Reflector typing note (checked against NestJS 12.1.0):** `reflector.getAllAndOverride()` returns `undefined` at runtime when neither the handler nor the class carries the metadata — but neither overload puts `undefined` in its return type (`getAllAndOverride<TResult>(key, targets): TResult`; the `Reflector.createDecorator` form returns the decorator's value type). The compiler will not warn you: write the `undefined` into the type argument yourself (`getAllAndOverride<Role[] | undefined>(...)`) and treat "no metadata" as a deliberate fallback. `if (isPublic)` already does this safely, but `if (roles.length === 0)` throws a `TypeError` on every route without `@Roles()`. `getAllAndMerge()` returns the object itself, not a one-element array, when exactly one target carries a non-array object. Prefer the typed decorator form — `const Roles = Reflector.createDecorator<Role[]>()` and `reflector.getAllAndOverride(Roles, [...])` — so the key and the value type cannot drift apart; the `undefined` check is still yours to write.

**Incorrect (manual auth checks in every handler):**

```typescript
// Manual auth checks in every handler
@Controller('admin')
export class AdminController {
  @Get('users')
  async getUsers(@Request() req) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    if (!req.user.roles.includes('admin')) {
      throw new ForbiddenException();
    }
    return this.adminService.getUsers();
  }

  @Delete('users/:id')
  async deleteUser(@Request() req, @Param('id') id: string) {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    if (!req.user.roles.includes('admin')) {
      throw new ForbiddenException();
    }
    return this.adminService.deleteUser(id);
  }
}
```

**Correct (guards with declarative decorators):**

```typescript
// JWT Auth Guard
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for @Public() decorator
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      request.user = await this.jwtService.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

// Roles Guard
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // `| undefined` is not in the declared return type — without it the check below looks redundant
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}

// Decorators
export const Public = () => SetMetadata('isPublic', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

// Register guards globally
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

// Clean controller
@Controller('admin')
@Roles(Role.Admin) // Applied to all routes
export class AdminController {
  @Get('users')
  getUsers(): Promise<User[]> {
    return this.adminService.getUsers();
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string): Promise<void> {
    return this.adminService.deleteUser(id);
  }

  @Public() // Override: no auth required
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
```

Reference: [NestJS Guards](https://docs.nestjs.com/guards)
