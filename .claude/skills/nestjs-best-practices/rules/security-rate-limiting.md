---
title: Implement Rate Limiting
impact: HIGH
impactDescription: Protects against abuse and ensures fair resource usage
tags: security, rate-limiting, throttler, protection, v12
---

## Implement Rate Limiting

Use `@nestjs/throttler` to limit request rates per client. Apply different limits for different endpoints — stricter for auth endpoints, more relaxed for read operations. Consider using Redis for distributed rate limiting in clustered deployments.

> **NestJS 12 note:** `@nestjs/throttler` stays on its own 6.x line — 6.7.1 declares `@nestjs/common` / `@nestjs/core` `^12.0.0` among its peers and still ships CommonJS, unlike the ESM-only `@nestjs/*` 12 packages. Its guard exposes `protected getTracker(req): Promise<string>` (make overrides `async`) and **no `getLimit()` hook**: per-caller limits go in the options, where `limit` and `ttl` accept a function of the `ExecutionContext`.

> **Reverse proxy note:** when running behind a load balancer (k8s ingress, ALB, Cloudflare), `req.ip` resolves to the proxy's IP unless Express is told to trust it — every request looks like it comes from one client and rate limits are useless. Configure `app.set('trust proxy', ...)` with the exact hop count or CIDR, or run the throttler on the proxy. That is enough: the default tracker already reads `req.ip` (grouping IPv6 addresses by /64 subnet), and with a correct setting Express makes `req.ips[0]` equal to `req.ip` — overriding `getTracker()` to read `req.ips[0]` adds nothing. With `trust proxy` set to `true`, both come from the client-controlled `X-Forwarded-For`.

**Incorrect (no rate limiting on sensitive endpoints):**

```typescript
// No rate limiting on sensitive endpoints
@Controller('auth')
export class AuthController {
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<TokenResponse> {
    // Attackers can brute-force credentials
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    // Can be abused to spam users with emails
    return this.authService.sendResetEmail(dto.email);
  }
}

// Same limits for all endpoints
@UseGuards(ThrottlerGuard)
@Controller('api')
export class ApiController {
  @Get('public-data')
  async getPublic() {} // Should allow more requests

  @Post('process-payment')
  async payment() {} // Should be more restrictive
}
```

**Correct (configured throttler with endpoint-specific limits):**

```typescript
// Configure throttler globally with multiple limits
import { ThrottlerModule, ThrottlerGuard, minutes } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 3, // 3 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 20, // 20 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

// Override limits per endpoint
@Controller('auth')
export class AuthController {
  @Post('login')
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  async login(@Body() dto: LoginDto): Promise<TokenResponse> {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @Throttle({ short: { limit: 3, ttl: 3600000 } }) // 3 per hour
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.authService.sendResetEmail(dto.email);
  }
}

// Skip throttling for certain routes
@Controller('health')
export class HealthController {
  @Get()
  @SkipThrottle()
  check(): string {
    return 'OK';
  }
}

// Track authenticated users by ID — getTracker() is async in @nestjs/throttler 6.x
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // req.user only exists if the authentication guard already ran for this request
    if (req.user?.id) return `user:${req.user.id}`;
    // Anonymous: keep the default tracker (req.ip, IPv6 grouped by /64 subnet)
    return super.getTracker(req);
  }
}

// Limits per user type: `limit` (and `ttl`) accept a function of the ExecutionContext.
// ThrottlerGuard has no getLimit() hook — a method with that name is never called.
ThrottlerModule.forRoot([
  {
    ttl: minutes(1),
    limit: (context: ExecutionContext) => {
      const user = context.switchToHttp().getRequest().user;
      if (!user) return 50; // Anonymous users
      return user.isPremium ? 1000 : 200; // Higher limits for authenticated users
    },
  },
]);

// Trust the load balancer so req.ip / req.ips report the real client
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // 'loopback' for local dev, a CIDR for production, or `1` to trust one hop.
  // NEVER set this to `true` in production — IP-spoofing trivializes the throttler.
  app.set('trust proxy', process.env.TRUSTED_PROXIES ?? 'loopback');
  await app.listen(3000);
}
```

Reference: [NestJS Throttler](https://docs.nestjs.com/security/rate-limiting)
