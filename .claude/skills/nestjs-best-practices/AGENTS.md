# NestJS Best Practices

**Version 1.3.0**
NestJS Best Practices
September 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring NestJS codebases. Humans may also find it
> useful, but guidance here is optimized for automation and consistency
> by AI-assisted workflows.

---

## Abstract

Comprehensive best practices and architecture guide for NestJS applications, aligned with NestJS 12 (ESM-only packages loaded from CommonJS through require(esm) on Node.js 20.19+ / 22.12+, 24 LTS recommended; lifecycle hooks by hierarchy level with allSettled termination; one owner of the shutdown signals; Standard Schema config validation; Terminus HealthIndicatorService; HttpException errorCode; built-in CSRF protection and security headers since 12.1) and with the NestJS 11 changes it keeps (Express v5 / Fastify v5, cache-manager v6+ / Keyv, BullMQ WorkerHost). Designed for AI agents and LLMs. Contains 45 rules across 10 categories, prioritized by impact from critical (architecture, dependency injection) to incremental (DevOps patterns). Each rule includes a brief explanation, an incorrect example, a correct example, and explicit notes for version-specific behavior (v11 changes still in force, v12 changes) where applicable.

---

## Table of Contents

1. [Architecture](#1-architecture) — **CRITICAL**
   - 1.1 [Avoid Circular Dependencies](#11-avoid-circular-dependencies)
   - 1.2 [Organize by Feature Modules](#12-organize-by-feature-modules)
   - 1.3 [Use Proper Module Sharing Patterns](#13-use-proper-module-sharing-patterns)
   - 1.4 [Single Responsibility for Services](#14-single-responsibility-for-services)
   - 1.5 [Use Event-Driven Architecture for Decoupling](#15-use-event-driven-architecture-for-decoupling)
   - 1.6 [Use Repository Pattern for Data Access](#16-use-repository-pattern-for-data-access)
2. [Dependency Injection](#2-dependency-injection) — **CRITICAL**
   - 2.1 [Avoid Service Locator Anti-Pattern](#21-avoid-service-locator-anti-pattern)
   - 2.2 [Use Durable Providers for Multi-Tenant Request Scope](#22-use-durable-providers-for-multi-tenant-request-scope)
   - 2.3 [Apply Interface Segregation Principle](#23-apply-interface-segregation-principle)
   - 2.4 [Honor Liskov Substitution Principle](#24-honor-liskov-substitution-principle)
   - 2.5 [Prefer Constructor Injection](#25-prefer-constructor-injection)
   - 2.6 [Understand Provider Scopes](#26-understand-provider-scopes)
   - 2.7 [Use Injection Tokens for Interfaces](#27-use-injection-tokens-for-interfaces)
3. [Error Handling](#3-error-handling) — **HIGH**
   - 3.1 [Handle Async Errors Properly](#31-handle-async-errors-properly)
   - 3.2 [Throw HTTP Exceptions from Services](#32-throw-http-exceptions-from-services)
   - 3.3 [Use Exception Filters for Error Handling](#33-use-exception-filters-for-error-handling)
4. [Security](#4-security) — **HIGH**
   - 4.1 [Implement Secure JWT Authentication](#41-implement-secure-jwt-authentication)
   - 4.2 [Protect Cookie-Authenticated Endpoints from CSRF](#42-protect-cookie-authenticated-endpoints-from-csrf)
   - 4.3 [Implement Rate Limiting](#43-implement-rate-limiting)
   - 4.4 [Sanitize Output to Prevent XSS](#44-sanitize-output-to-prevent-xss)
   - 4.5 [Use Guards for Authentication and Authorization](#45-use-guards-for-authentication-and-authorization)
   - 4.6 [Apply Helmet for Default Security Headers](#46-apply-helmet-for-default-security-headers)
   - 4.7 [Validate All Input with DTOs and Pipes](#47-validate-all-input-with-dtos-and-pipes)
5. [Performance](#5-performance) — **HIGH**
   - 5.1 [Use Async Lifecycle Hooks Correctly](#51-use-async-lifecycle-hooks-correctly)
   - 5.2 [Use Lazy Loading for Large Modules](#52-use-lazy-loading-for-large-modules)
   - 5.3 [Optimize Database Queries](#53-optimize-database-queries)
   - 5.4 [Use Caching Strategically](#54-use-caching-strategically)
6. [Testing](#6-testing) — **MEDIUM-HIGH**
   - 6.1 [Use Supertest for E2E Testing](#61-use-supertest-for-e2e-testing)
   - 6.2 [Mock External Services in Tests](#62-mock-external-services-in-tests)
   - 6.3 [Use Testing Module for Unit Tests](#63-use-testing-module-for-unit-tests)
7. [Database & ORM](#7-database-orm) — **MEDIUM-HIGH**
   - 7.1 [Avoid N+1 Query Problems](#71-avoid-n-1-query-problems)
   - 7.2 [Use Database Migrations](#72-use-database-migrations)
   - 7.3 [Use Transactions for Multi-Step Operations](#73-use-transactions-for-multi-step-operations)
8. [API Design](#8-api-design) — **MEDIUM**
   - 8.1 [Use Named Wildcards in Middleware Routes (Express v5)](#81-use-named-wildcards-in-middleware-routes-express-v5-)
   - 8.2 [Use DTOs and Serialization for API Responses](#82-use-dtos-and-serialization-for-api-responses)
   - 8.3 [Use Interceptors for Cross-Cutting Concerns](#83-use-interceptors-for-cross-cutting-concerns)
   - 8.4 [Use Pipes for Input Transformation](#84-use-pipes-for-input-transformation)
   - 8.5 [Use API Versioning for Breaking Changes](#85-use-api-versioning-for-breaking-changes)
9. [Microservices](#9-microservices) — **MEDIUM**
   - 9.1 [Implement Health Checks for Microservices](#91-implement-health-checks-for-microservices)
   - 9.2 [Use Message and Event Patterns Correctly](#92-use-message-and-event-patterns-correctly)
   - 9.3 [Use Message Queues for Background Jobs](#93-use-message-queues-for-background-jobs)
10. [DevOps & Deployment](#10-devops-deployment) — **LOW-MEDIUM**
   - 10.1 [Implement Graceful Shutdown](#101-implement-graceful-shutdown)
   - 10.2 [Run on a Supported Node.js LTS](#102-run-on-a-supported-node-js-lts)
   - 10.3 [Use ConfigModule for Environment Configuration](#103-use-configmodule-for-environment-configuration)
   - 10.4 [Use Structured Logging](#104-use-structured-logging)

---

## 1. Architecture

**Section Impact: CRITICAL**

### 1.1 Avoid Circular Dependencies

**Impact: CRITICAL** — "#1 cause of runtime crashes"

Circular dependencies occur when Module A imports Module B, and Module B imports Module A (directly or transitively). NestJS can sometimes resolve these through forward references, but they indicate architectural problems and should be avoided. This is the #1 cause of runtime crashes in NestJS applications.

**Incorrect (circular module imports):**

```typescript
// users.module.ts
@Module({
  imports: [OrdersModule], // Orders needs Users, Users needs Orders = circular
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

// orders.module.ts
@Module({
  imports: [UsersModule], // Circular dependency!
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
```

**Correct (extract shared logic or use events):**

```typescript
// Option 1: Extract shared logic to a third module
// shared.module.ts
@Module({
  providers: [SharedService],
  exports: [SharedService],
})
export class SharedModule {}

// users.module.ts
@Module({
  imports: [SharedModule],
  providers: [UsersService],
})
export class UsersModule {}

// orders.module.ts
@Module({
  imports: [SharedModule],
  providers: [OrdersService],
})
export class OrdersModule {}

// Option 2: Use events for decoupled communication
// users.service.ts
@Injectable()
export class UsersService {
  constructor(private eventEmitter: EventEmitter2) {}

  async createUser(data: CreateUserDto) {
    const user = await this.userRepo.save(data);
    this.eventEmitter.emit('user.created', user);
    return user;
  }
}

// orders.service.ts
@Injectable()
export class OrdersService {
  @OnEvent('user.created')
  handleUserCreated(user: User) {
    // React to user creation without direct dependency
  }
}
```

Reference: [NestJS Circular Dependency](https://docs.nestjs.com/fundamentals/circular-dependency)

---

### 1.2 Organize by Feature Modules

**Impact: CRITICAL** — "3-5x faster onboarding and development"

Organize your application into feature modules that encapsulate related functionality. Each feature module should be self-contained with its own controllers, services, entities, and DTOs. Avoid organizing by technical layer (all controllers together, all services together). This enables 3-5x faster onboarding and feature development.

**Incorrect (technical layer organization):**

```typescript
// Technical layer organization (anti-pattern)
src/
├── controllers/
│   ├── users.controller.ts
│   ├── orders.controller.ts
│   └── products.controller.ts
├── services/
│   ├── users.service.ts
│   ├── orders.service.ts
│   └── products.service.ts
├── entities/
│   ├── user.entity.ts
│   ├── order.entity.ts
│   └── product.entity.ts
└── app.module.ts  // Imports everything directly
```

**Correct (feature module organization):**

```typescript
// Feature module organization
src/
├── users/
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   └── update-user.dto.ts
│   ├── entities/
│   │   └── user.entity.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── users.repository.ts
│   └── users.module.ts
├── orders/
│   ├── dto/
│   ├── entities/
│   ├── orders.controller.ts
│   ├── orders.service.ts
│   └── orders.module.ts
├── shared/
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   └── shared.module.ts
└── app.module.ts

// users.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService], // Only export what others need
})
export class UsersModule {}

// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(),
    UsersModule,
    OrdersModule,
    SharedModule,
  ],
})
export class AppModule {}
```

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

---

### 1.3 Use Proper Module Sharing Patterns

**Impact: CRITICAL** — Prevents duplicate instances, memory leaks, and state inconsistency

NestJS modules are singletons by default. When a service is properly exported from a module and that module is imported elsewhere, the same instance is shared. However, providing a service in multiple modules creates separate instances, leading to memory waste, state inconsistency, and confusing behavior. Always encapsulate services in dedicated modules, export them explicitly, and import the module where needed.

**Incorrect (service provided in multiple modules):**

```typescript
// StorageService provided directly in multiple modules - WRONG
// storage.service.ts
@Injectable()
export class StorageService {
  private cache = new Map(); // Each instance has separate state!

  store(key: string, value: any) {
    this.cache.set(key, value);
  }
}

// app.module.ts
@Module({
  providers: [StorageService], // Instance #1
  controllers: [AppController],
})
export class AppModule {}

// videos.module.ts
@Module({
  providers: [StorageService], // Instance #2 - different from AppModule!
  controllers: [VideosController],
})
export class VideosModule {}

// Problems:
// 1. Two separate StorageService instances exist
// 2. cache.set() in VideosModule doesn't affect AppModule's cache
// 3. Memory wasted on duplicate instances
// 4. Debugging nightmares when state doesn't sync
```

**Correct (dedicated module with exports):**

```typescript
// storage/storage.module.ts
@Module({
  providers: [StorageService],
  exports: [StorageService], // Make available to importers
})
export class StorageModule {}

// videos/videos.module.ts
@Module({
  imports: [StorageModule], // Import the module, not the service
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}

// channels/channels.module.ts
@Module({
  imports: [StorageModule], // Same instance shared
  controllers: [ChannelsController],
  providers: [ChannelsService],
})
export class ChannelsModule {}

// app.module.ts
@Module({
  imports: [
    StorageModule, // Only if AppModule itself needs StorageService
    VideosModule,
    ChannelsModule,
  ],
})
export class AppModule {}

// Now all modules share the SAME StorageService instance
```

**When to use @Global() (sparingly):**

```typescript
// ONLY for truly cross-cutting concerns
@Global()
@Module({
  providers: [ConfigService, LoggerService],
  exports: [ConfigService, LoggerService],
})
export class CoreModule {}

// Import once in AppModule
@Module({
  imports: [CoreModule], // Registered globally, available everywhere
})
export class AppModule {}

// Other modules don't need to import CoreModule
@Module({
  controllers: [UsersController],
  providers: [UsersService], // Can inject ConfigService without importing
})
export class UsersModule {}

// WARNING: Don't make everything global!
// - Hides dependencies (can't see what a module needs from imports)
// - Makes testing harder
// - Reserve for: config, logging, database connections
```

**Module re-exporting pattern:**

```typescript
// common.module.ts - shared utilities
@Module({
  providers: [DateService, ValidationService],
  exports: [DateService, ValidationService],
})
export class CommonModule {}

// core.module.ts - re-exports common for convenience
@Module({
  imports: [CommonModule, DatabaseModule],
  exports: [CommonModule, DatabaseModule], // Re-export for consumers
})
export class CoreModule {}

// feature.module.ts - imports CoreModule, gets both
@Module({
  imports: [CoreModule], // Gets CommonModule + DatabaseModule
  controllers: [FeatureController],
})
export class FeatureModule {}
```

Reference: [NestJS Modules](https://docs.nestjs.com/modules#shared-modules)

---

### 1.4 Single Responsibility for Services

**Impact: CRITICAL** — "40%+ improvement in testability"

Each service should have a single, well-defined responsibility. Avoid "god services" that handle multiple unrelated concerns. If a service name includes "And" or handles more than one domain concept, it likely violates single responsibility. This reduces complexity and improves testability by 40%+.

**Incorrect (god service anti-pattern):**

```typescript
// God service anti-pattern
@Injectable()
export class UserAndOrderService {
  constructor(
    private userRepo: UserRepository,
    private orderRepo: OrderRepository,
    private mailer: MailService,
    private payment: PaymentService,
  ) {}

  async createUser(dto: CreateUserDto) {
    const user = await this.userRepo.save(dto);
    await this.mailer.sendWelcome(user);
    return user;
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const order = await this.orderRepo.save({ userId, ...dto });
    await this.payment.charge(order);
    await this.mailer.sendOrderConfirmation(order);
    return order;
  }

  async calculateOrderStats(userId: string) {
    // Stats logic mixed in
  }

  async validatePayment(orderId: string) {
    // Payment logic mixed in
  }
}
```

**Correct (focused services with single responsibility):**

```typescript
// Focused services with single responsibility
@Injectable()
export class UsersService {
  constructor(private userRepo: UserRepository) {}

  async create(dto: CreateUserDto): Promise<User> {
    return this.userRepo.save(dto);
  }

  async findById(id: string): Promise<User> {
    return this.userRepo.findOneOrFail({ where: { id } });
  }
}

@Injectable()
export class OrdersService {
  constructor(private orderRepo: OrderRepository) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    return this.orderRepo.save({ userId, ...dto });
  }

  async findByUser(userId: string): Promise<Order[]> {
    return this.orderRepo.find({ where: { userId } });
  }
}

@Injectable()
export class OrderStatsService {
  constructor(private orderRepo: OrderRepository) {}

  async calculateForUser(userId: string): Promise<OrderStats> {
    // Focused stats calculation
  }
}

// Orchestration in controller or dedicated orchestrator
@Controller('orders')
export class OrdersController {
  constructor(
    private orders: OrdersService,
    private payment: PaymentService,
    private notifications: NotificationService,
  ) {}

  @Post()
  async create(@CurrentUser() user: User, @Body() dto: CreateOrderDto) {
    const order = await this.orders.create(user.id, dto);
    await this.payment.charge(order);
    await this.notifications.sendOrderConfirmation(order);
    return order;
  }
}
```

Reference: [NestJS Providers](https://docs.nestjs.com/providers)

---

### 1.5 Use Event-Driven Architecture for Decoupling

**Impact: MEDIUM-HIGH** — Enables async processing and modularity

Use `@nestjs/event-emitter` for intra-service events and message brokers for inter-service communication. Events allow modules to react to changes without direct dependencies, improving modularity and enabling async processing.

**Incorrect (direct service coupling):**

```typescript
// Direct service coupling
@Injectable()
export class OrdersService {
  constructor(
    private inventoryService: InventoryService,
    private emailService: EmailService,
    private analyticsService: AnalyticsService,
    private notificationService: NotificationService,
    private loyaltyService: LoyaltyService,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const order = await this.repo.save(dto);

    // Tight coupling - OrdersService knows about all consumers
    await this.inventoryService.reserve(order.items);
    await this.emailService.sendConfirmation(order);
    await this.analyticsService.track('order_created', order);
    await this.notificationService.push(order.userId, 'Order placed');
    await this.loyaltyService.addPoints(order.userId, order.total);

    // Adding new behavior requires modifying this service
    return order;
  }
}
```

**Correct (event-driven decoupling):**

```typescript
// Use EventEmitter for decoupling
import { EventEmitter2 } from '@nestjs/event-emitter';

// Define event
export class OrderCreatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly items: OrderItem[],
    public readonly total: number,
  ) {}
}

// Service emits events
@Injectable()
export class OrdersService {
  constructor(
    private eventEmitter: EventEmitter2,
    private repo: Repository<Order>,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const order = await this.repo.save(dto);

    // Emit event - no knowledge of consumers
    this.eventEmitter.emit(
      'order.created',
      new OrderCreatedEvent(order.id, order.userId, order.items, order.total),
    );

    return order;
  }
}

// Listeners in separate modules
@Injectable()
export class InventoryListener {
  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.inventoryService.reserve(event.items);
  }
}

@Injectable()
export class EmailListener {
  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.emailService.sendConfirmation(event.orderId);
  }
}

@Injectable()
export class AnalyticsListener {
  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.analyticsService.track('order_created', {
      orderId: event.orderId,
      total: event.total,
    });
  }
}
```

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events)

---

### 1.6 Use Repository Pattern for Data Access

**Impact: HIGH** — Decouples business logic from database

Create custom repositories to encapsulate complex queries and database logic. This keeps services focused on business logic, makes testing easier with mock repositories, and allows changing database implementations without affecting business code.

**Incorrect (complex queries in services):**

```typescript
// Complex queries in services
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
  ) {}

  async findActiveWithOrders(minOrders: number): Promise<User[]> {
    // Complex query logic mixed with business logic
    return this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.orders', 'order')
      .where('user.isActive = :active', { active: true })
      .andWhere('user.deletedAt IS NULL')
      .groupBy('user.id')
      .having('COUNT(order.id) >= :min', { min: minOrders })
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  // Service becomes bloated with query logic
}
```

**Correct (custom repository with encapsulated queries):**

```typescript
// Custom repository with encapsulated queries
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findActiveWithMinOrders(minOrders: number): Promise<User[]> {
    return this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.orders', 'order')
      .where('user.isActive = :active', { active: true })
      .andWhere('user.deletedAt IS NULL')
      .groupBy('user.id')
      .having('COUNT(order.id) >= :min', { min: minOrders })
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  async save(user: User): Promise<User> {
    return this.repo.save(user);
  }
}

// Clean service with business logic only
@Injectable()
export class UsersService {
  constructor(private usersRepo: UsersRepository) {}

  async getActiveUsersWithOrders(): Promise<User[]> {
    return this.usersRepo.findActiveWithMinOrders(1);
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const user = new User();
    user.email = dto.email;
    user.name = dto.name;
    return this.usersRepo.save(user);
  }
}
```

Reference: [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)

---

## 2. Dependency Injection

**Section Impact: CRITICAL**

### 2.1 Avoid Service Locator Anti-Pattern

**Impact: HIGH** — Hides dependencies and breaks testability

Avoid using `ModuleRef.get()` or global containers to resolve dependencies at runtime. This hides dependencies, makes code harder to test, and breaks the benefits of dependency injection. Use constructor injection instead.

**Incorrect (service locator anti-pattern):**

```typescript
// Use ModuleRef to get dependencies dynamically
@Injectable()
export class OrdersService {
  constructor(private moduleRef: ModuleRef) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // Dependencies are hidden - not visible in constructor
    const usersService = this.moduleRef.get(UsersService);
    const inventoryService = this.moduleRef.get(InventoryService);
    const paymentService = this.moduleRef.get(PaymentService);

    const user = await usersService.findOne(dto.userId);
    // ... rest of logic
  }
}

// Global singleton container
class ServiceContainer {
  private static instance: ServiceContainer;
  private services = new Map<string, any>();

  static getInstance(): ServiceContainer {
    if (!this.instance) {
      this.instance = new ServiceContainer();
    }
    return this.instance;
  }

  get<T>(key: string): T {
    return this.services.get(key);
  }
}
```

**Correct (constructor injection with explicit dependencies):**

```typescript
// Use constructor injection - dependencies are explicit
@Injectable()
export class OrdersService {
  constructor(
    private usersService: UsersService,
    private inventoryService: InventoryService,
    private paymentService: PaymentService,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const user = await this.usersService.findOne(dto.userId);
    const inventory = await this.inventoryService.check(dto.items);
    // Dependencies are clear and testable
  }
}

// Easy to test with mocks
describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: PaymentService, useValue: mockPaymentService },
      ],
    }).compile();

    service = module.get(OrdersService);
  });
});

// VALID: Factory pattern for dynamic instantiation
@Injectable()
export class HandlerFactory {
  constructor(private moduleRef: ModuleRef) {}

  getHandler(type: string): Handler {
    switch (type) {
      case 'email':
        return this.moduleRef.get(EmailHandler);
      case 'sms':
        return this.moduleRef.get(SmsHandler);
      default:
        return this.moduleRef.get(DefaultHandler);
    }
  }
}
```

Reference: [NestJS Module Reference](https://docs.nestjs.com/fundamentals/module-ref)

---

### 2.2 Use Durable Providers for Multi-Tenant Request Scope

**Impact: HIGH** — Avoids the multiplicative cost of REQUEST scope in multi-tenant apps

`Scope.REQUEST` providers create a fresh instance per HTTP request — and the cost cascades: every singleton that *injects* a request-scoped provider becomes request-scoped too. In a multi-tenant API where you only really care about a per-tenant context (not per-request), this is wasteful: hundreds of providers get re-instantiated on every request even though there are only N tenants.

**Durable providers** are NestJS's solution: mark the provider as `durable: true`, register a `ContextIdStrategy`, and NestJS will cache the dependency sub-tree per **context key** (e.g., tenant ID) instead of per request. Two requests from the same tenant share the same instance — but tenant isolation is preserved.

Use durable providers when:
- You need request-scoped state (active tenant, DB connection, feature flags), AND
- The state varies on a *bounded* dimension (tenant, region, plan), AND
- You're seeing measurable overhead from a `Scope.REQUEST` tree.

For "I just need the current request's user ID," prefer `nestjs-cls` instead — it gives you AsyncLocalStorage without making any provider request-scoped.

**Incorrect (REQUEST scope cascading across the whole tenant tree):**

```typescript
// Every dependent of TenantContext becomes REQUEST-scoped → re-instantiated per request
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(@Inject(REQUEST) private req: Request) {}

  getTenantId(): string {
    return this.req.headers['x-tenant-id'] as string;
  }
}

@Injectable() // looks singleton, but isn't anymore
export class TenantConfigService {
  constructor(private ctx: TenantContext) {}     // 🔥 cascades to REQUEST scope

  getConfig() {
    return this.loadConfigFor(this.ctx.getTenantId());
  }
}

@Injectable()
export class ReportsService {
  constructor(private config: TenantConfigService) {}  // 🔥 also REQUEST-scoped now
  // ... 50 more services in this tree, all rebuilt every request
}
```

**Correct (durable providers + tenant-keyed context):**

```typescript
// 1. Strategy: tell NestJS how to derive a context key from each request
import { ContextIdFactory, ContextIdResolverFn, ContextIdStrategy, HostComponentInfo } from '@nestjs/core';
import { Request } from 'express';

const tenants = new Map<string, ContextId>();

export class AggregateByTenantContextIdStrategy implements ContextIdStrategy {
  attach(contextId: ContextId, request: Request): ContextIdResolverFn {
    const tenantId = (request.headers['x-tenant-id'] as string) ?? 'public';

    let tenantSubTreeId = tenants.get(tenantId);
    if (!tenantSubTreeId) {
      tenantSubTreeId = ContextIdFactory.create();
      tenants.set(tenantId, tenantSubTreeId);
    }

    // Return the cache key for durable providers; non-durable providers
    // still get a fresh instance per request.
    return (info: HostComponentInfo) =>
      info.isTreeDurable ? tenantSubTreeId! : contextId;
  }
}

// 2. Bootstrap: register the strategy ONCE before app.listen
async function bootstrap() {
  ContextIdFactory.apply(new AggregateByTenantContextIdStrategy());
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

// 3. Mark the tenant-scoped tree as durable
@Injectable({ scope: Scope.REQUEST, durable: true })
export class TenantContext {
  constructor(@Inject(REQUEST) private req: Request) {}

  getTenantId(): string {
    return this.req.headers['x-tenant-id'] as string;
  }
}

@Injectable({ scope: Scope.REQUEST, durable: true })
export class TenantConfigService {
  constructor(private ctx: TenantContext) {}

  getConfig() {
    return this.loadConfigFor(this.ctx.getTenantId());
  }
}

// Now: one TenantContext + TenantConfigService instance per *tenant*,
// reused across all requests for that tenant. Switch tenants → fresh instance.
```

**Two important constraints:**

1. **The whole sub-tree must be marked `durable: true`** — a non-durable provider in the middle of the chain breaks caching back to per-request.
2. **The cache grows unbounded** unless you evict. For a small fixed set of tenants this is fine; for a long tail you need an LRU eviction policy in your strategy. Don't ship the naive `Map` above to a SaaS with 100k tenants without bounding it.

**When NOT to use this:**

- For per-user data (user ID, locale) prefer `nestjs-cls` (AsyncLocalStorage) — it keeps your providers as singletons and propagates context through async calls automatically.
- For audit logging, request IDs, or correlation IDs, also use `nestjs-cls`. Durable scope is overkill.
- If your "tenant" is really just a database name, inject a factory and pick the connection at call time instead of scoping the whole tree.

Reference: [NestJS Injection Scopes — Durable providers](https://docs.nestjs.com/fundamentals/injection-scopes#durable-providers)

---

### 2.3 Apply Interface Segregation Principle

**Impact: HIGH** — Reduces coupling and improves testability by 30-50%

Clients should not be forced to depend on interfaces they don't use. In NestJS, this means keeping interfaces small and focused on specific capabilities rather than creating "fat" interfaces that bundle unrelated methods. When a service only needs to send emails, it shouldn't depend on an interface that also includes SMS, push notifications, and logging. Split large interfaces into role-based ones.

**Incorrect (fat interface forcing unused dependencies):**

```typescript
// Fat interface - forces all consumers to depend on everything
interface NotificationService {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  sendSms(phone: string, message: string): Promise<void>;
  sendPush(userId: string, notification: PushPayload): Promise<void>;
  sendSlack(channel: string, message: string): Promise<void>;
  logNotification(type: string, payload: any): Promise<void>;
  getDeliveryStatus(id: string): Promise<DeliveryStatus>;
  retryFailed(id: string): Promise<void>;
  scheduleNotification(dto: ScheduleDto): Promise<string>;
}

// Consumer only needs email, but must mock everything for tests
@Injectable()
export class OrdersService {
  constructor(
    private notifications: NotificationService, // Depends on 8 methods, uses 1
  ) {}

  async confirmOrder(order: Order): Promise<void> {
    await this.notifications.sendEmail(
      order.customer.email,
      'Order Confirmed',
      `Your order ${order.id} has been confirmed.`,
    );
  }
}

// Testing is painful - must mock unused methods
const mockNotificationService = {
  sendEmail: jest.fn(),
  sendSms: jest.fn(),           // Never used, but required
  sendPush: jest.fn(),          // Never used, but required
  sendSlack: jest.fn(),         // Never used, but required
  logNotification: jest.fn(),   // Never used, but required
  getDeliveryStatus: jest.fn(), // Never used, but required
  retryFailed: jest.fn(),       // Never used, but required
  scheduleNotification: jest.fn(), // Never used, but required
};
```

**Correct (segregated interfaces by capability):**

```typescript
// Segregated interfaces - each focused on one capability
interface EmailSender {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

interface SmsSender {
  sendSms(phone: string, message: string): Promise<void>;
}

interface PushSender {
  sendPush(userId: string, notification: PushPayload): Promise<void>;
}

interface NotificationLogger {
  logNotification(type: string, payload: any): Promise<void>;
}

interface NotificationScheduler {
  scheduleNotification(dto: ScheduleDto): Promise<string>;
}

// Implementation can implement multiple interfaces
@Injectable()
export class NotificationService implements EmailSender, SmsSender, PushSender {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // Email implementation
  }

  async sendSms(phone: string, message: string): Promise<void> {
    // SMS implementation
  }

  async sendPush(userId: string, notification: PushPayload): Promise<void> {
    // Push implementation
  }
}

// Or separate implementations
@Injectable()
export class SendGridEmailService implements EmailSender {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // SendGrid-specific implementation
  }
}

// Consumer depends only on what it needs
@Injectable()
export class OrdersService {
  constructor(
    @Inject(EMAIL_SENDER) private emailSender: EmailSender, // Minimal dependency
  ) {}

  async confirmOrder(order: Order): Promise<void> {
    await this.emailSender.sendEmail(
      order.customer.email,
      'Order Confirmed',
      `Your order ${order.id} has been confirmed.`,
    );
  }
}

// Testing is simple - only mock what's used
const mockEmailSender: EmailSender = {
  sendEmail: jest.fn(),
};

// Module registration with tokens
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
export const SMS_SENDER = Symbol('SMS_SENDER');

@Module({
  providers: [
    { provide: EMAIL_SENDER, useClass: SendGridEmailService },
    { provide: SMS_SENDER, useClass: TwilioSmsService },
  ],
  exports: [EMAIL_SENDER, SMS_SENDER],
})
export class NotificationModule {}
```

**Combining interfaces when needed:**

```typescript
// Sometimes a consumer legitimately needs multiple capabilities
interface EmailAndSmsSender extends EmailSender, SmsSender {}

// Or use intersection types
type MultiChannelSender = EmailSender & SmsSender & PushSender;

// Consumer that genuinely needs multiple channels
@Injectable()
export class AlertService {
  constructor(
    @Inject(MULTI_CHANNEL_SENDER)
    private sender: EmailSender & SmsSender,
  ) {}

  async sendCriticalAlert(user: User, message: string): Promise<void> {
    await Promise.all([
      this.sender.sendEmail(user.email, 'Critical Alert', message),
      this.sender.sendSms(user.phone, message),
    ]);
  }
}
```

Reference: [Interface Segregation Principle](https://en.wikipedia.org/wiki/Interface_segregation_principle)

---

### 2.4 Honor Liskov Substitution Principle

**Impact: HIGH** — Ensures implementations are truly interchangeable without breaking callers

Subtypes must be substitutable for their base types without altering program correctness. In NestJS with dependency injection, this means any implementation of an interface or abstract class must honor the contract completely. A mock payment service used in tests must behave like a real payment service (return similar shapes, handle errors the same way). Violating LSP causes subtle bugs when swapping implementations.

**Incorrect (implementation violates the contract):**

```typescript
// Base interface with clear contract
interface PaymentGateway {
  /**
   * Charges the specified amount.
   * @returns PaymentResult on success
   * @throws PaymentFailedException on payment failure
   */
  charge(amount: number, currency: string): Promise<PaymentResult>;
}

// Production implementation - follows the contract
@Injectable()
export class StripeService implements PaymentGateway {
  async charge(amount: number, currency: string): Promise<PaymentResult> {
    const response = await this.stripe.charges.create({ amount, currency });
    return { success: true, transactionId: response.id, amount };
  }
}

// Mock that violates LSP - different behavior!
@Injectable()
export class MockPaymentService implements PaymentGateway {
  async charge(amount: number, currency: string): Promise<PaymentResult> {
    // VIOLATION 1: Throws for valid input (contract says return PaymentResult)
    if (amount > 1000) {
      throw new Error('Mock does not support large amounts');
    }

    // VIOLATION 2: Returns null instead of PaymentResult
    if (currency !== 'USD') {
      return null as any; // Real service would convert or reject properly
    }

    // VIOLATION 3: Missing required field
    return { success: true } as PaymentResult; // Missing transactionId!
  }
}

// Consumer trusts the contract
@Injectable()
export class OrdersService {
  constructor(@Inject(PAYMENT_GATEWAY) private payment: PaymentGateway) {}

  async checkout(order: Order): Promise<void> {
    const result = await this.payment.charge(order.total, order.currency);
    // These fail with MockPaymentService:
    await this.saveTransaction(result.transactionId); // undefined!
    await this.sendReceipt(result); // might be null!
  }
}
```

**Correct (implementations honor the contract):**

```typescript
// Well-defined interface with documented behavior
interface PaymentGateway {
  /**
   * Charges the specified amount.
   * @param amount - Amount in smallest currency unit (cents)
   * @param currency - ISO 4217 currency code
   * @returns PaymentResult with transactionId, success status, and amount
   * @throws PaymentFailedException if charge is declined
   * @throws InvalidCurrencyException if currency is not supported
   */
  charge(amount: number, currency: string): Promise<PaymentResult>;

  /**
   * Refunds a previous charge.
   * @throws TransactionNotFoundException if transactionId is invalid
   */
  refund(transactionId: string, amount?: number): Promise<RefundResult>;
}

// Production implementation
@Injectable()
export class StripeService implements PaymentGateway {
  async charge(amount: number, currency: string): Promise<PaymentResult> {
    try {
      const response = await this.stripe.charges.create({ amount, currency });
      return {
        success: true,
        transactionId: response.id,
        amount: response.amount,
      };
    } catch (error) {
      if (error.type === 'card_error') {
        throw new PaymentFailedException(error.message);
      }
      throw error;
    }
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    // Implementation...
  }
}

// Mock that honors LSP - same contract, same behavior shape
@Injectable()
export class MockPaymentService implements PaymentGateway {
  private transactions = new Map<string, PaymentResult>();

  async charge(amount: number, currency: string): Promise<PaymentResult> {
    // Honor the contract: validate currency like real service would
    if (!['USD', 'EUR', 'GBP'].includes(currency)) {
      throw new InvalidCurrencyException(`Unsupported currency: ${currency}`);
    }

    // Simulate decline for specific test scenarios
    if (amount === 99999) {
      throw new PaymentFailedException('Card declined (test scenario)');
    }

    // Return same shape as production
    const result: PaymentResult = {
      success: true,
      transactionId: `mock_${Date.now()}_${Math.random().toString(36)}`,
      amount,
    };

    this.transactions.set(result.transactionId, result);
    return result;
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    // Honor the contract: throw if transaction not found
    if (!this.transactions.has(transactionId)) {
      throw new TransactionNotFoundException(transactionId);
    }

    return {
      success: true,
      refundId: `refund_${transactionId}`,
      amount: amount ?? this.transactions.get(transactionId)!.amount,
    };
  }
}

// Consumer can swap implementations safely
@Injectable()
export class OrdersService {
  constructor(@Inject(PAYMENT_GATEWAY) private payment: PaymentGateway) {}

  async checkout(order: Order): Promise<Order> {
    try {
      const result = await this.payment.charge(order.total, order.currency);
      // Works with both StripeService and MockPaymentService
      order.transactionId = result.transactionId;
      order.status = 'paid';
      return order;
    } catch (error) {
      if (error instanceof PaymentFailedException) {
        order.status = 'payment_failed';
        return order;
      }
      throw error;
    }
  }
}
```

**Testing LSP compliance:**

```typescript
// Shared test suite that any implementation must pass
function testPaymentGatewayContract(
  createGateway: () => PaymentGateway,
) {
  describe('PaymentGateway contract', () => {
    let gateway: PaymentGateway;

    beforeEach(() => {
      gateway = createGateway();
    });

    it('returns PaymentResult with all required fields', async () => {
      const result = await gateway.charge(1000, 'USD');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('transactionId');
      expect(result).toHaveProperty('amount');
      expect(typeof result.transactionId).toBe('string');
    });

    it('throws InvalidCurrencyException for unsupported currency', async () => {
      await expect(gateway.charge(1000, 'INVALID'))
        .rejects.toThrow(InvalidCurrencyException);
    });

    it('throws TransactionNotFoundException for invalid refund', async () => {
      await expect(gateway.refund('nonexistent'))
        .rejects.toThrow(TransactionNotFoundException);
    });
  });
}

// Run against all implementations
describe('StripeService', () => {
  testPaymentGatewayContract(() => new StripeService(mockStripeClient));
});

describe('MockPaymentService', () => {
  testPaymentGatewayContract(() => new MockPaymentService());
});
```

Reference: [Liskov Substitution Principle](https://en.wikipedia.org/wiki/Liskov_substitution_principle)

---

### 2.5 Prefer Constructor Injection

**Impact: CRITICAL** — Required for proper DI and testing

Always use constructor injection over property injection. Constructor injection makes dependencies explicit, enables TypeScript type checking, ensures dependencies are available when the class is instantiated, and improves testability. This is required for proper DI, testing, and TypeScript support.

**Incorrect (property injection with hidden dependencies):**

```typescript
// Property injection - avoid unless necessary
@Injectable()
export class UsersService {
  @Inject()
  private userRepo: UserRepository; // Hidden dependency

  @Inject('CONFIG')
  private config: ConfigType; // Also hidden

  async findAll() {
    return this.userRepo.find();
  }
}

// Problems:
// 1. Dependencies not visible in constructor
// 2. Service can be instantiated without dependencies in tests
// 3. TypeScript can't enforce dependency types at instantiation
```

**Correct (constructor injection with explicit dependencies):**

```typescript
// Constructor injection - explicit and testable
@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UserRepository,
    @Inject('CONFIG') private readonly config: ConfigType,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }
}

// Testing is straightforward
describe('UsersService', () => {
  let service: UsersService;
  let mockRepo: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockRepo = {
      find: jest.fn(),
      save: jest.fn(),
    } as any;

    service = new UsersService(mockRepo, { dbUrl: 'test' });
  });

  it('should find all users', async () => {
    mockRepo.find.mockResolvedValue([{ id: '1', name: 'Test' }]);
    const result = await service.findAll();
    expect(result).toHaveLength(1);
  });
});

// Only use property injection for optional dependencies
@Injectable()
export class LoggingService {
  @Optional()
  @Inject('ANALYTICS')
  private analytics?: AnalyticsService;

  log(message: string) {
    console.log(message);
    this.analytics?.track('log', message); // Optional enhancement
  }
}
```

Reference: [NestJS Providers](https://docs.nestjs.com/providers)

---

### 2.6 Understand Provider Scopes

**Impact: CRITICAL** — Prevents data leaks and performance issues

NestJS has three provider scopes: DEFAULT (singleton), REQUEST (per-request instance), and TRANSIENT (new instance for each injection). Most providers should be singletons. Request-scoped providers have performance implications as they bubble up through the dependency tree. Understanding scopes prevents memory leaks and incorrect data sharing.

**Incorrect (wrong scope usage):**

```typescript
// Request-scoped when not needed (performance hit)
@Injectable({ scope: Scope.REQUEST })
export class UsersService {
  // This creates a new instance for EVERY request
  // All dependencies also become request-scoped
  async findAll() {
    return this.userRepo.find();
  }
}

// Singleton with mutable request state
@Injectable() // Default: singleton
export class RequestContextService {
  private userId: string; // DANGER: Shared across all requests!

  setUser(userId: string) {
    this.userId = userId; // Overwrites for all concurrent requests
  }

  getUser() {
    return this.userId; // Returns wrong user!
  }
}
```

**Correct (appropriate scope for each use case):**

```typescript
// Singleton for stateless services (default, most common)
@Injectable()
export class UsersService {
  constructor(private readonly userRepo: UserRepository) {}

  async findById(id: string): Promise<User> {
    return this.userRepo.findOne({ where: { id } });
  }
}

// Request-scoped ONLY when you need request context
@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  private userId: string;

  setUser(userId: string) {
    this.userId = userId;
  }

  getUser(): string {
    return this.userId;
  }
}

// Better: Use NestJS built-in request context
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class AuditService {
  constructor(@Inject(REQUEST) private request: Request) {}

  log(action: string) {
    console.log(`User ${this.request.user?.id} performed ${action}`);
  }
}

// Best: Use ClsModule for async context (no scope bubble-up)
import { ClsService } from 'nestjs-cls';

@Injectable() // Stays singleton!
export class AuditService {
  constructor(private cls: ClsService) {}

  log(action: string) {
    const userId = this.cls.get('userId');
    console.log(`User ${userId} performed ${action}`);
  }
}
```

Reference: [NestJS Injection Scopes](https://docs.nestjs.com/fundamentals/injection-scopes)

---

### 2.7 Use Injection Tokens for Interfaces

**Impact: HIGH** — Enables interface-based DI at runtime

TypeScript interfaces are erased at compile time and can't be used as injection tokens. Use string tokens, symbols, or abstract classes when you want to inject implementations of interfaces. This enables swapping implementations for testing or different environments.

**Incorrect (interface can't be used as token):**

```typescript
// Interface can't be used as injection token
interface PaymentGateway {
  charge(amount: number): Promise<PaymentResult>;
}

@Injectable()
export class StripeService implements PaymentGateway {
  charge(amount: number) { /* ... */ }
}

@Injectable()
export class OrdersService {
  // This WON'T work - PaymentGateway doesn't exist at runtime
  constructor(private payment: PaymentGateway) {}
}
```

**Correct (symbol tokens or abstract classes):**

```typescript
// Option 1: String/Symbol tokens (most flexible)
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentGateway {
  charge(amount: number): Promise<PaymentResult>;
}

@Injectable()
export class StripeService implements PaymentGateway {
  async charge(amount: number): Promise<PaymentResult> {
    // Stripe implementation
  }
}

@Injectable()
export class MockPaymentService implements PaymentGateway {
  async charge(amount: number): Promise<PaymentResult> {
    return { success: true, id: 'mock-id' };
  }
}

// Module registration
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      useClass: process.env.NODE_ENV === 'test'
        ? MockPaymentService
        : StripeService,
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentModule {}

// Injection
@Injectable()
export class OrdersService {
  constructor(
    @Inject(PAYMENT_GATEWAY) private payment: PaymentGateway,
  ) {}

  async createOrder(dto: CreateOrderDto) {
    await this.payment.charge(dto.amount);
  }
}

// Option 2: Abstract class (carries runtime type info)
export abstract class PaymentGateway {
  abstract charge(amount: number): Promise<PaymentResult>;
}

@Injectable()
export class StripeService extends PaymentGateway {
  async charge(amount: number): Promise<PaymentResult> {
    // Implementation
  }
}

// No @Inject needed with abstract class
@Injectable()
export class OrdersService {
  constructor(private payment: PaymentGateway) {}
}
```

Reference: [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)

---

## 3. Error Handling

**Section Impact: HIGH**

### 3.1 Handle Async Errors Properly

**Impact: HIGH** — Prevents process crashes from unhandled rejections

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

---

### 3.2 Throw HTTP Exceptions from Services

**Impact: HIGH** — Keeps controllers thin and simplifies error handling

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

---

### 3.3 Use Exception Filters for Error Handling

**Impact: HIGH** — Consistent, centralized error handling

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

---

## 4. Security

**Section Impact: HIGH**

### 4.1 Implement Secure JWT Authentication

**Impact: CRITICAL** — Essential for secure APIs

Use `@nestjs/jwt` with `@nestjs/passport` for authentication. Store secrets securely, use appropriate token lifetimes, implement refresh tokens, and validate tokens properly. Never expose sensitive data in JWT payloads.

**Incorrect (insecure JWT implementation):**

```typescript
// Hardcode secrets
@Module({
  imports: [
    JwtModule.register({
      secret: 'my-secret-key', // Exposed in code
      signOptions: { expiresIn: '7d' }, // Too long
    }),
  ],
})
export class AuthModule {}

// Store sensitive data in JWT
async login(user: User): Promise<{ accessToken: string }> {
  const payload = {
    sub: user.id,
    email: user.email,
    password: user.password, // NEVER include password!
    ssn: user.ssn, // NEVER include sensitive data!
    isAdmin: user.isAdmin, // Can be tampered if not verified
  };
  return { accessToken: this.jwtService.sign(payload) };
}

// Skip token validation
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: 'my-secret',
    });
  }

  async validate(payload: any): Promise<any> {
    return payload; // No validation of user existence
  }
}
```

**Correct (secure JWT with refresh tokens):**

```typescript
// Secure JWT configuration
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '15m', // Short-lived access tokens
          issuer: config.get<string>('JWT_ISSUER'),
          audience: config.get<string>('JWT_AUDIENCE'),
        },
      }),
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
})
export class AuthModule {}

// Minimal JWT payload
@Injectable()
export class AuthService {
  async login(user: User): Promise<TokenResponse> {
    // Only include necessary, non-sensitive data
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(user.id);

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(token, 10);

    await this.refreshTokenRepo.save({
      userId,
      token: hashedToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return token;
  }
}

// Proper JWT strategy with validation
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
      ignoreExpiration: false,
      issuer: config.get<string>('JWT_ISSUER'),
      audience: config.get<string>('JWT_AUDIENCE'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    // Verify user still exists and is active
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Verify token wasn't issued before password change
    if (user.passwordChangedAt) {
      const tokenIssuedAt = new Date(payload.iat * 1000);
      if (tokenIssuedAt < user.passwordChangedAt) {
        throw new UnauthorizedException('Token invalidated by password change');
      }
    }

    return user;
  }
}
```

Reference: [NestJS Authentication](https://docs.nestjs.com/security/authentication)

---

### 4.2 Protect Cookie-Authenticated Endpoints from CSRF

**Impact: HIGH** — CSRF lets an attacker perform state changes as the victim user

If your NestJS app authenticates browser users with **cookies** (session cookies, persistent JWT-in-cookie, OAuth refresh cookie), every state-changing endpoint is reachable from a cross-origin form unless you protect it. Since NestJS 12.1 the framework ships the protection built in: `app.enableCsrfProtection()` rejects cross-origin, state-changing browser requests based on Fetch Metadata (`Sec-Fetch-Site`) with an `Origin`/`Host` fallback — the algorithm of Go's `net/http.CrossOriginProtection`, no tokens and no cookies. Token schemes — the double-submit-cookie pattern via `csrf-csrf` (Express) or `@fastify/csrf-protection` (Fastify) — remain the answer on older NestJS versions and a supplement for browsers that send neither header. The deprecated `csurf` package is no longer maintained and should not be used.

CSRF protection is **not needed** for endpoints authenticated with `Authorization: Bearer ...` headers from a non-cookie source — browsers do not auto-attach those, so cross-origin requests can't impersonate the user.

**When you need CSRF protection:**

| Auth mechanism | CSRF risk | Need protection? |
|----------------|-----------|------------------|
| Session cookie | High — browser auto-sends | **Yes** |
| HTTP-only JWT cookie | High — browser auto-sends | **Yes** |
| `Authorization: Bearer` header (read from `localStorage`/memory) | Low | No |
| Pure machine-to-machine API (no browser clients) | None | No |
| `SameSite=Strict` cookie + no third-party login flows | Reduced, not zero | Yes (defense in depth) |

**Incorrect (cookie-authenticated app with no CSRF guard):**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.use(session({ secret: 'x', cookie: { httpOnly: true } }));

  // ❌ No CSRF protection — any cross-origin <form> targeting /api/* succeeds
  await app.listen(3000);
}

// Attacker page on evil.com:
// <form method="POST" action="https://yourapp.com/api/account/delete">
//   <button>Click for free coupon</button>
// </form>
// → cookie auto-sent, account deleted
```

**Correct (NestJS 12.1+ — built-in `app.enableCsrfProtection()`):**

```typescript
import { RequestMethod } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Once, before app.init() / app.listen(). The check runs before Nest middleware,
  // body parsing, guards and handlers; a rejection is a ForbiddenException that goes
  // through your exception filters.
  app.enableCsrfProtection({
    // Cross-origin callers allowed to change state. Origins allowed by CORS are
    // NOT trusted implicitly — list them here too. Exact "scheme://host[:port]".
    trustedOrigins: ['https://admin.example.com'],
    // Server-to-server callers that send a foreign Origin (e.g. webhooks). Declared
    // like MiddlewareConsumer.exclude(), without the global prefix, but matched exactly.
    exclude: [{ path: 'webhooks/stripe', method: RequestMethod.POST }],
  });

  await app.listen(3000);
}
```

What it lets through, measured with NestJS 12.1.0:

| Request | Result |
|---------|--------|
| `GET` / `HEAD` / `OPTIONS` | Always allowed |
| `Sec-Fetch-Site: same-origin` or `none` | Allowed |
| `Sec-Fetch-Site: same-site` or `cross-site` | **403** (unless trusted origin or excluded route) |
| No `Sec-Fetch-Site`, `Origin` not matching `Host` | **403** |
| Neither `Sec-Fetch-Site` nor `Origin` (curl, server-to-server) | Allowed — it protects browsers, not the API from non-browser clients |

Two deployment traps: browsers send `Sec-Fetch-Site` only to secure origins (HTTPS or `localhost`), so over plain HTTP only the `Origin`/`Host` comparison applies; and `X-Forwarded-Host` is ignored — behind a proxy that rewrites `Host`, preserve it or list the public origin in `trustedOrigins`. Middleware registered with `app.use()` **before** the call runs before the check.

**Correct (Express — `csrf-csrf` double-submit-cookie token, for NestJS < 12.1 or as a supplement):**

```typescript
// npm i csrf-csrf cookie-parser   (csrf-csrf v4 API)
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';
import type { Request, Response } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser(process.env.COOKIE_SECRET));

  const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
    getSecret: () => process.env.CSRF_SECRET!,
    // Required since v4: binds the token to the session (express-session here)
    getSessionIdentifier: (req) => req.session.id,
    cookieName: '__Host-psifi.x-csrf-token',
    cookieOptions: {
      sameSite: 'lax',
      path: '/',
      secure: true,
      httpOnly: true,
    },
    // Only protect mutating methods — GETs are read-only
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
  });

  app.use(doubleCsrfProtection);

  // Expose a public endpoint that issues a fresh token to the SPA
  app.use('/csrf-token', (req: Request, res: Response) => {
    res.json({ token: generateCsrfToken(req, res) });
  });

  await app.listen(3000);
}

// Frontend
// 1. fetch('/csrf-token', { credentials: 'include' }) → { token }
// 2. POST/PUT/DELETE with header: 'x-csrf-token': token
```

**Correct (Fastify — `@fastify/csrf-protection`):**

```typescript
// npm i @fastify/csrf-protection @fastify/cookie
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET,
  });
  await app.register(fastifyCsrf);

  await app.listen(3000);
}
```

**Defense in depth — also do this:**

- Set session cookies as `Secure; HttpOnly; SameSite=Lax` (or `Strict` if no third-party login redirects).
- Use the `__Host-` cookie prefix to lock cookies to the exact host with `Path=/`.
- Check `Origin` on mutating endpoints — `app.enableCsrfProtection()` does it for you on NestJS 12.1+; on older versions validate `Origin` / `Referer` by hand.
- Never accept a CSRF token via query string (it leaks into logs and the Referer header).

Reference: [NestJS Security — CSRF](https://docs.nestjs.com/security/csrf) · [csrf-csrf](https://github.com/Psifi-Solutions/csrf-csrf) · [OWASP CSRF Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

---

### 4.3 Implement Rate Limiting

**Impact: HIGH** — Protects against abuse and ensures fair resource usage

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

---

### 4.4 Sanitize Output to Prevent XSS

**Impact: HIGH** — XSS vulnerabilities can compromise user sessions and data

While NestJS APIs typically return JSON (which browsers don't execute), XSS risks exist when rendering HTML, storing user content, or when frontend frameworks improperly handle API responses. Sanitize user-generated content before storage and use proper Content-Type headers.

**Incorrect (storing raw HTML without sanitization):**

```typescript
// Store raw HTML from users
@Injectable()
export class CommentsService {
  async create(dto: CreateCommentDto): Promise<Comment> {
    // User can inject: <script>steal(document.cookie)</script>
    return this.repo.save({
      content: dto.content, // Raw, unsanitized
      authorId: dto.authorId,
    });
  }
}

// Return HTML without sanitization
@Controller('pages')
export class PagesController {
  @Get(':slug')
  @Header('Content-Type', 'text/html')
  async getPage(@Param('slug') slug: string): Promise<string> {
    const page = await this.pagesService.findBySlug(slug);
    // If page.content contains user input, XSS is possible
    return `<html><body>${page.content}</body></html>`;
  }
}

// Reflect user input in errors
@Get(':id')
async findOne(@Param('id') id: string): Promise<User> {
  const user = await this.repo.findOne({ where: { id } });
  if (!user) {
    // XSS if id contains malicious content and error is rendered
    throw new NotFoundException(`User ${id} not found`);
  }
  return user;
}
```

**Correct (sanitize content and use proper headers):**

```typescript
// Sanitize HTML content before storage
import * as sanitizeHtml from 'sanitize-html';

@Injectable()
export class CommentsService {
  private readonly sanitizeOptions: sanitizeHtml.IOptions = {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    allowedAttributes: {
      a: ['href', 'title'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  };

  async create(dto: CreateCommentDto): Promise<Comment> {
    return this.repo.save({
      content: sanitizeHtml(dto.content, this.sanitizeOptions),
      authorId: dto.authorId,
    });
  }
}

// Use validation pipe to strip HTML
import { Transform } from 'class-transformer';

export class CreatePostDto {
  @IsString()
  @MaxLength(1000)
  @Transform(({ value }) => sanitizeHtml(value, { allowedTags: [] }))
  title: string;

  @IsString()
  @Transform(({ value }) =>
    sanitizeHtml(value, {
      allowedTags: ['p', 'br', 'b', 'i', 'a'],
      allowedAttributes: { a: ['href'] },
    }),
  )
  content: string;
}

// Set proper Content-Type headers
@Controller('api')
export class ApiController {
  @Get('data')
  @Header('Content-Type', 'application/json')
  async getData(): Promise<DataResponse> {
    // JSON response - browser won't execute scripts
    return this.service.getData();
  }
}

// Sanitize error messages
@Get(':id')
async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
  const user = await this.repo.findOne({ where: { id } });
  if (!user) {
    // UUID validation ensures safe format
    throw new NotFoundException('User not found');
  }
  return user;
}

// Use Helmet for CSP headers
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  await app.listen(3000);
}
```

Reference: [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

### 4.5 Use Guards for Authentication and Authorization

**Impact: HIGH** — Enforces access control before handlers execute

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

---

### 4.6 Apply Helmet for Default Security Headers

**Impact: HIGH** — A single line of code blocks a wide class of browser-based attacks

Helmet sets a curated bundle of HTTP response headers that block common browser-based attacks: clickjacking, MIME-type sniffing, cross-origin resource loading, referrer leakage, and (with CSP) most XSS and data-exfiltration payloads. It is the lowest-effort, highest-payoff security middleware you can add to a NestJS app — install it once, configure CSP to match your frontend, and forget about it. Since NestJS 12.1 the same headers are also available without the dependency, through `app.useSecurityHeaders()` (see below).

Helmet does **not** replace input validation, output encoding, authentication, or CSRF protection. It is the browser-side complement to those server-side controls.

**Incorrect (no security headers, or `app.use(helmet())` mounted after routes):**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe());

  await app.listen(3000);
  // ❌ no Helmet — every response is missing CSP, X-Frame-Options, HSTS, ...
}
```

```typescript
// ❌ Helmet mounted AFTER global guards / controllers — won't apply to those responses
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalGuards(new AuthGuard());
  await app.listen(3000);
  app.use(helmet());                 // too late
}
```

**Correct (Express — mount before everything, configure CSP):**

```typescript
// npm i helmet
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: {
        // Strict-by-default; loosen per directive based on your frontend.
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],                        // never use 'unsafe-inline' if you can avoid it
          styleSrc: ["'self'", "'unsafe-inline'"],      // loosen for utility-CSS frameworks if needed
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://api.example.com'],
          frameAncestors: ["'none'"],                   // clickjacking — strictly stronger than X-Frame-Options
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      // For an API behind HTTPS, HSTS instructs browsers to never downgrade to HTTP
      strictTransportSecurity: {
        maxAge: 60 * 60 * 24 * 365, // 1 year
        includeSubDomains: true,
        preload: true,              // only enable after registering on hstspreload.org
      },
      // If you serve cross-origin assets (CDNs, third-party iframes), tune these:
      crossOriginEmbedderPolicy: false,                 // off if you embed third-party content
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  await app.listen(3000);
}
```

**Correct (NestJS 12.1+ — built-in `app.useSecurityHeaders()`, no dependency):**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Right after create(), once, before app.init() / app.listen() — later, or twice, it throws.
  // Same headers and defaults as helmet 8, same option names (helmet's legacy aliases such as
  // `hsts` or `frameguard` are rejected at startup).
  app.useSecurityHeaders({
    contentSecurityPolicy: {
      // Merged into the helmet-8 default policy (useDefaults: true)
      directives: {
        connectSrc: ["'self'", 'https://api.example.com'],
        frameAncestors: ["'none'"],
      },
    },
    strictTransportSecurity: { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  await app.listen(3000);
}
```

It writes the headers on every response — routes, `404`s and errors, including the `403`s of `app.enableCsrfProtection()` — and removes `X-Powered-By`; a route can still override one header with `@Header()`. Two limits keep `helmet` relevant: middleware registered with `app.use()` before the call runs first, so a response it ends itself carries no headers; and directive values are static (`string | string[] | boolean | null`), so a per-request CSP nonce still needs `helmet`'s function-valued directives.

**Correct (Fastify — use `@fastify/helmet`):**

```typescript
// npm i @fastify/helmet
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyHelmet from '@fastify/helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await app.listen(3000);
}
```

**Pure-JSON API note:** if your service only emits `application/json` and is consumed by non-browser clients, you still want Helmet for `X-Content-Type-Options`, `Strict-Transport-Security`, and to disable referrer leakage. You can drop CSP (`contentSecurityPolicy: false`) since browsers won't parse a JSON response, but **do not** disable Helmet wholesale.

**CSP rollout strategy:** start in `Content-Security-Policy-Report-Only` mode pointed at a reporting endpoint, fix violations in your frontend, then switch to enforcing mode. A blanket `'unsafe-inline'` defeats most of CSP's value — fix the inline scripts/styles instead.

Reference: [NestJS Security — Helmet and built-in security headers](https://docs.nestjs.com/security/helmet) · [helmet docs](https://helmetjs.github.io/) · [MDN: CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)

---

### 4.7 Validate All Input with DTOs and Pipes

**Impact: HIGH** — First line of defense against attacks

Always validate incoming data using class-validator decorators on DTOs and the global ValidationPipe. Never trust user input. Validate all request bodies, query parameters, and route parameters before processing.

**Incorrect (trust raw input without validation):**

```typescript
// Trust raw input without validation
@Controller('users')
export class UsersController {
  @Post()
  create(@Body() body: any) {
    // body could contain anything - SQL injection, XSS, etc.
    return this.usersService.create(body);
  }

  @Get()
  findAll(@Query() query: any) {
    // query.limit could be "'; DROP TABLE users; --"
    return this.usersService.findAll(query.limit);
  }
}

// DTOs without validation decorators
export class CreateUserDto {
  name: string;    // No validation
  email: string;   // Could be "not-an-email"
  age: number;     // Could be "abc" or -999
}
```

**Correct (validated DTOs with global ValidationPipe):**

```typescript
// Enable ValidationPipe globally in main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Strip unknown properties
      forbidNonWhitelisted: true,   // Throw on unknown properties
      transform: true,              // Auto-transform to DTO types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(3000);
}

// Create well-validated DTOs
import {
  IsString,
  IsEmail,
  IsInt,
  Min,
  Max,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsInt()
  @Min(0)
  @Max(150)
  age: number;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase, and number',
  })
  password: string;
}

// Query DTO with defaults and transformation
export class FindUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

// Param validation
export class UserIdParamDto {
  @IsUUID('4')
  id: string;
}

@Controller('users')
export class UsersController {
  @Post()
  create(@Body() dto: CreateUserDto): Promise<User> {
    // dto is guaranteed to be valid
    return this.usersService.create(dto);
  }

  @Get()
  findAll(@Query() query: FindUsersQueryDto): Promise<User[]> {
    // query.limit is a number, query.search is sanitized
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param() params: UserIdParamDto): Promise<User> {
    // params.id is a valid UUID
    return this.usersService.findById(params.id);
  }
}
```

Reference: [NestJS Validation](https://docs.nestjs.com/techniques/validation)

---

## 5. Performance

**Section Impact: HIGH**

### 5.1 Use Async Lifecycle Hooks Correctly

**Impact: HIGH** — Improper async handling blocks application startup

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

---

### 5.2 Use Lazy Loading for Large Modules

**Impact: MEDIUM** — Improves startup time for large applications

NestJS supports lazy-loading modules, which defers initialization until first use. This is valuable for large applications where some features are rarely used, serverless deployments where cold start time matters, or when certain modules have heavy initialization costs.

> **Caveats (unchanged in v12):** lifecycle hooks (`onModuleInit`, `onApplicationBootstrap`, …) are **not invoked** in lazily loaded modules and services; controllers, resolvers and gateways cannot be lazy loaded; a lazy module cannot be registered as global, and global enhancers it registers (`APP_GUARD`, `APP_INTERCEPTOR`, …) will not work properly.
>
> **Import path:** write the dynamic `import()` with the `.js` extension, as the official docs now do. Under `module`/`moduleResolution: nodenext` an `import()` is resolved with ESM rules even in a CommonJS project, so `import('./reports/reports.module')` fails the typecheck (TS2307) while the `.js` form compiles.

**Incorrect (loading everything eagerly):**

```typescript
// Load everything eagerly in a large app
@Module({
  imports: [
    UsersModule,
    OrdersModule,
    PaymentsModule,
    ReportsModule, // Heavy, rarely used
    AnalyticsModule, // Heavy, rarely used
    AdminModule, // Only admins use this
    LegacyModule, // Migration module, rarely used
    BulkImportModule, // Used once a month
  ],
})
export class AppModule {}

// All modules initialize at startup, even if never used
// Slow cold starts in serverless
// Memory wasted on unused modules
```

**Correct (lazy load rarely-used modules):**

```typescript
// Use LazyModuleLoader for optional modules
import { LazyModuleLoader } from '@nestjs/core';

@Injectable()
export class ReportsService {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  async generateReport(type: string): Promise<Report> {
    // Load module only when needed
    const { ReportsModule } = await import('./reports/reports.module.js');
    const moduleRef = await this.lazyModuleLoader.load(() => ReportsModule);

    const reportsService = moduleRef.get(ReportsGeneratorService);
    return reportsService.generate(type);
  }
}

// Lazy load admin features with caching
@Injectable()
export class AdminService {
  private adminModule: ModuleRef | null = null;

  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  private async getAdminModule(): Promise<ModuleRef> {
    if (!this.adminModule) {
      const { AdminModule } = await import('./admin/admin.module.js');
      this.adminModule = await this.lazyModuleLoader.load(() => AdminModule);
    }
    return this.adminModule;
  }

  async runAdminTask(task: string): Promise<void> {
    const moduleRef = await this.getAdminModule();
    const taskRunner = moduleRef.get(AdminTaskRunner);
    await taskRunner.run(task);
  }
}

// Reusable lazy loader service
@Injectable()
export class ModuleLoaderService {
  private loadedModules = new Map<string, ModuleRef>();

  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  async load<T>(
    key: string,
    importFn: () => Promise<{ default: Type<T> } | Type<T>>,
  ): Promise<ModuleRef> {
    if (!this.loadedModules.has(key)) {
      const module = await importFn();
      const moduleType = 'default' in module ? module.default : module;
      const moduleRef = await this.lazyModuleLoader.load(() => moduleType);
      this.loadedModules.set(key, moduleRef);
    }
    return this.loadedModules.get(key)!;
  }
}

// Preload modules in background after startup
@Injectable()
export class ModulePreloader implements OnApplicationBootstrap {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  async onApplicationBootstrap(): Promise<void> {
    setTimeout(async () => {
      await this.preloadModule(() => import('./reports/reports.module.js'));
    }, 5000); // 5 seconds after startup
  }

  private async preloadModule(importFn: () => Promise<any>): Promise<void> {
    try {
      const module = await importFn();
      const moduleType = module.default || Object.values(module)[0];
      await this.lazyModuleLoader.load(() => moduleType);
    } catch (error) {
      console.warn('Failed to preload module', error);
    }
  }
}
```

Reference: [NestJS Lazy Loading Modules](https://docs.nestjs.com/fundamentals/lazy-loading-modules)

---

### 5.3 Optimize Database Queries

**Impact: HIGH** — Database queries are typically the largest source of latency

Select only needed columns, use proper indexes, avoid over-fetching relations, and consider query performance when designing your data access. Most API slowness traces back to inefficient database queries.

> **TypeORM 1.x note:** `@nestjs/typeorm` 12 accepts `typeorm` `^0.3.0 || ^1.0.0-dev`, and TypeORM 1 removed the string-array forms of `select` and `relations` (`select: ['email']` no longer compiles). Use the object form shown below — TypeORM 0.3 accepts it too.

**Incorrect (over-fetching data and missing indexes):**

```typescript
// Select everything when you need few fields
@Injectable()
export class UsersService {
  async findAllEmails(): Promise<string[]> {
    const users = await this.repo.find();
    // Fetches ALL columns for ALL users
    return users.map((u) => u.email);
  }

  async getUserSummary(id: string): Promise<UserSummary> {
    const user = await this.repo.findOne({
      where: { id },
      relations: { posts: { comments: { author: true } }, followers: true },
    });
    // Over-fetches massive relation tree
    return { name: user.name, postCount: user.posts.length };
  }
}

// No indexes on frequently queried columns
@Entity()
export class Order {
  @Column()
  userId: string; // No index - full table scan on every lookup

  @Column()
  status: string; // No index - slow status filtering
}
```

**Correct (select only needed data with proper indexes):**

```typescript
// Select only needed columns
@Injectable()
export class UsersService {
  async findAllEmails(): Promise<string[]> {
    const users = await this.repo.find({
      select: { email: true }, // Only fetch email column
    });
    return users.map((u) => u.email);
  }

  // Use QueryBuilder for complex selections
  async getUserSummary(id: string): Promise<UserSummary> {
    return this.repo
      .createQueryBuilder('user')
      .select('user.name', 'name')
      .addSelect('COUNT(post.id)', 'postCount')
      .leftJoin('user.posts', 'post')
      .where('user.id = :id', { id })
      .groupBy('user.id')
      .getRawOne();
  }

  // Fetch relations only when needed
  async getFullProfile(id: string): Promise<User> {
    return this.repo.findOne({
      where: { id },
      relations: { posts: true }, // Only immediate relation
      select: {
        id: true,
        name: true,
        email: true,
        posts: {
          id: true,
          title: true,
        },
      },
    });
  }
}

// Add indexes on frequently queried columns
@Entity()
@Index(['userId'])
@Index(['status'])
@Index(['createdAt'])
@Index(['userId', 'status']) // Composite index for common query pattern
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}

// Always paginate large datasets
@Injectable()
export class OrdersService {
  async findAll(page = 1, limit = 20): Promise<PaginatedResult<Order>> {
    const [items, total] = await this.repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
```

Reference: [TypeORM Query Builder](https://typeorm.io/select-query-builder)

---

### 5.4 Use Caching Strategically

**Impact: HIGH** — Dramatically reduces database load and response times

Implement caching for expensive operations, frequently accessed data, and external API calls. Use NestJS `CacheModule` with appropriate TTLs and cache invalidation strategies. Don't cache everything — focus on high-impact areas.

> **Since NestJS 11 (still true in 12):** `@nestjs/cache-manager` runs on `cache-manager` v6+ (7.x today), which is built on top of **Keyv**. The legacy `redisStore` shape (`{ store: redisStore(...) }`) is no longer supported. Configure adapters via the `stores: [...]` array using `KeyvRedis`, `KeyvCacheableMemory`, etc. Cache values are wrapped in `{ value, expires }` internally — important if you read/write the cache directly or migrate from a v10 deployment that produced the old shape.

> **NestJS 12 note:** `@nestjs/cache-manager` jumped from 3.x to **12.0.0** to follow the framework's major, and that is the line to install — 3.1.3 declares peers `@nestjs/common`/`@nestjs/core` `^9 || ^10 || ^11` only, so it conflicts with Nest 12. 12.0.0 keeps the public API of 3.1.3 and its other peers (`cache-manager` `>=6`, `keyv` `>=5`), but ships as ESM only with `engines.node` `^20.19.0 || ^22.12.0 || >=24.0.0` — the versions where the `require(esm)` a CommonJS app relies on to load it works without a flag.

**Incorrect (no caching, caching everything, or legacy redisStore):**

```typescript
// No caching for expensive, repeated queries
@Injectable()
export class ProductsService {
  async getPopular(): Promise<Product[]> {
    // Runs complex aggregation query EVERY request
    return this.productsRepo
      .createQueryBuilder('p')
      .leftJoin('p.orders', 'o')
      .select('p.*, COUNT(o.id) as orderCount')
      .groupBy('p.id')
      .orderBy('orderCount', 'DESC')
      .limit(20)
      .getMany();
  }
}

// ❌ Legacy v10 shape — no longer works since NestJS 11 (nor in 12)
CacheModule.registerAsync({
  useFactory: async () => {
    const store = await redisStore({ socket: { host: 'localhost', port: 6379 } });
    return { store };
  },
});

// Cache everything without thought
@Injectable()
export class UsersService {
  @CacheKey('users')
  @CacheTTL(3600)
  @UseInterceptors(CacheInterceptor)
  async findAll(): Promise<User[]> {
    // Caching a constantly-changing list for 1 hour is the wrong tradeoff
    return this.usersRepo.find();
  }
}
```

**Correct (Keyv-based stores with strategic invalidation):**

```typescript
// Setup: install peers — npm i @nestjs/cache-manager@^12 cache-manager keyv @keyv/redis cacheable
import { CacheModule } from '@nestjs/cache-manager';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { KeyvCacheableMemory } from 'cacheable';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Two-tier cache: memory (fast) + Redis (shared across instances).
        // The first store is primary; later stores are fallbacks.
        stores: [
          new Keyv({
            store: new KeyvCacheableMemory({ ttl: 60_000, lruSize: 5_000 }),
          }),
          new KeyvRedis(config.getOrThrow<string>('REDIS_URL')),
        ],
        ttl: 60_000, // default 60s — TTLs are in MILLISECONDS
      }),
    }),
  ],
})
export class AppModule {}

// Manual caching for granular control
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private productsRepo: ProductRepository,
  ) {}

  async getPopular(): Promise<Product[]> {
    const cacheKey = 'products:popular';

    const cached = await this.cache.get<Product[]>(cacheKey);
    if (cached) return cached;

    const products = await this.fetchPopularProducts();
    await this.cache.set(cacheKey, products, 5 * 60_000); // 5 min in ms
    return products;
  }

  // Invalidate cache on writes
  async updateProduct(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.productsRepo.save({ id, ...dto });
    await Promise.all([
      this.cache.del('products:popular'),
      this.cache.del(`product:${id}`),
    ]);
    return product;
  }
}

// Decorator-based caching with the auto-interceptor
@Controller('categories')
@UseInterceptors(CacheInterceptor)
export class CategoriesController {
  @Get()
  @CacheTTL(30 * 60_000) // 30 minutes — categories rarely change
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @CacheTTL(60_000)
  @CacheKey('category')
  findOne(@Param('id') id: string): Promise<Category> {
    return this.categoriesService.findOne(id);
  }
}

// Event-based cache invalidation
@Injectable()
export class CacheInvalidationService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  @OnEvent('product.created')
  @OnEvent('product.updated')
  @OnEvent('product.deleted')
  async invalidateProductCaches(event: ProductEvent) {
    await Promise.all([
      this.cache.del('products:popular'),
      this.cache.del(`product:${event.productId}`),
    ]);
  }
}
```

**Decide what (and what NOT) to cache:**

| Good caching candidates | Avoid caching |
|--------------------------|---------------|
| Aggregations / reports recomputed often | Per-user PII you can't safely partition by key |
| Read-mostly reference data (categories, plans) | Mutating-write hot paths (you'll fight invalidation) |
| External API responses (rate-limited / paid) | Strongly time-sensitive data (auth tokens, balances) |
| Pure functions with bounded input space | Anything where staleness is a correctness bug |

Reference: [NestJS Caching](https://docs.nestjs.com/techniques/caching) · [Using alternative Cache stores (Keyv)](https://docs.nestjs.com/techniques/caching#using-alternative-cache-stores)

---

## 6. Testing

**Section Impact: MEDIUM-HIGH**

### 6.1 Use Supertest for E2E Testing

**Impact: HIGH** — Validates the full request/response cycle

End-to-end tests use Supertest to make real HTTP requests against your NestJS application. They test the full stack including middleware, guards, pipes, and interceptors. E2E tests catch integration issues that unit tests miss.

> **NestJS 12 note:** E2E suites load the whole `@nestjs/*` 12.x graph, which ships as ESM only — so they need the same runner setup as unit tests: on Jest in a CommonJS project, Node 24.9+ and `node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.json` (the official v12 template's `test:e2e` script); ESM projects use Vitest. Import Supertest with a **default import**, as both v12 templates do: `import * as request from 'supertest'` yields a namespace object, not the function — natively in ESM and under `esModuleInterop` in CommonJS (the templates enable it) — and the first call throws `TypeError: request is not a function`.

**Incorrect (no proper E2E setup or teardown):**

```typescript
// Only unit test controllers
describe('UsersController', () => {
  it('should return users', async () => {
    const service = { findAll: jest.fn().mockResolvedValue([]) };
    const controller = new UsersController(service as any);

    const result = await controller.findAll();

    expect(result).toEqual([]);
    // Doesn't test: routes, guards, pipes, serialization
  });
});

// E2E tests without proper setup/teardown
describe('Users API', () => {
  it('should create user', async () => {
    const app = await NestFactory.create(AppModule);
    // No proper initialization
    // No cleanup after test
    // Hits real database
  });
});
```

**Correct (proper E2E setup with Supertest):**

```typescript
// Proper E2E test setup
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest'; // default import — `import * as` is not callable
import { AppModule } from '../src/app.module';

describe('UsersController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same config as production
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/users (POST)', () => {
    it('should create a user', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({ name: 'John', email: 'john@test.com' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('John');
          expect(res.body.email).toBe('john@test.com');
        });
    });

    it('should return 400 for invalid email', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({ name: 'John', email: 'invalid-email' })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('email');
        });
    });
  });

  describe('/users/:id (GET)', () => {
    it('should return 404 for non-existent user', () => {
      return request(app.getHttpServer())
        .get('/users/non-existent-id')
        .expect(404);
    });
  });
});

// Testing with authentication
describe('Protected Routes (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'test@test.com', password: 'password' });

    authToken = loginResponse.body.accessToken;
  });

  it('should return 401 without token', () => {
    return request(app.getHttpServer())
      .get('/users/me')
      .expect(401);
  });

  it('should return user profile with valid token', () => {
    return request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.email).toBe('test@test.com');
      });
  });
});

// Database isolation for E2E tests
describe('Orders API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: '.env.test', // Test database config
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    dataSource = moduleFixture.get(DataSource);
    await app.init();
  });

  beforeEach(async () => {
    // Clean database between tests
    await dataSource.synchronize(true);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });
});
```

Reference: [NestJS E2E Testing](https://docs.nestjs.com/fundamentals/testing#end-to-end-testing)

---

### 6.2 Mock External Services in Tests

**Impact: HIGH** — Ensures fast, reliable, deterministic tests

Never call real external services (APIs, databases, message queues) in unit tests. Mock them to ensure tests are fast, deterministic, and don't incur costs. Use realistic mock data and test edge cases like timeouts and errors.

> **NestJS 12 note:** the `HttpService` mocked below comes from `@nestjs/axios` **12.x** — the package jumped from 4.x to 12.0.0, and 4.0.1 declares its `@nestjs/common` peer as `^10 || ^11` only. Everything `Test.createTestingModule` pulls in is ESM-only in v12, so on Jest in a CommonJS project the suite needs Node 24.9+ and `node --experimental-vm-modules node_modules/jest/bin/jest.js`; in a Vitest project (the ESM default) the `jest.*` helpers used here map to `vi.*` (`vi.fn()`, `vi.useFakeTimers()`, `vi.setSystemTime()`, `vi.advanceTimersByTime()`).

**Incorrect (calling real APIs and databases):**

```typescript
// Call real APIs in tests
describe('PaymentService', () => {
  it('should process payment', async () => {
    const service = new PaymentService(new StripeClient(realApiKey));
    // Hits real Stripe API!
    const result = await service.charge('tok_visa', 1000);
    // Slow, costs money, flaky
  });
});

// Use real database
describe('UsersService', () => {
  beforeEach(async () => {
    await connection.query('DELETE FROM users'); // Modifies real DB
  });

  it('should create user', async () => {
    const user = await service.create({ email: 'test@test.com' });
    // Side effects on shared database
  });
});

// Incomplete mocks
const mockHttpService = {
  get: jest.fn().mockResolvedValue({ data: {} }),
  // Missing error scenarios, missing other methods
};
```

**Correct (mock all external dependencies):**

```typescript
// Mock HTTP service properly
describe('WeatherService', () => {
  let service: WeatherService;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WeatherService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WeatherService);
    httpService = module.get(HttpService);
  });

  it('should return weather data', async () => {
    const mockResponse = {
      data: { temperature: 72, humidity: 45 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    };

    httpService.get.mockReturnValue(of(mockResponse));

    const result = await service.getWeather('NYC');

    expect(result).toEqual({ temperature: 72, humidity: 45 });
  });

  it('should handle API timeout', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('ETIMEDOUT')),
    );

    await expect(service.getWeather('NYC')).rejects.toThrow('Weather service unavailable');
  });

  it('should handle rate limiting', async () => {
    httpService.get.mockReturnValue(
      throwError(() => ({
        response: { status: 429, data: { message: 'Rate limited' } },
      })),
    );

    await expect(service.getWeather('NYC')).rejects.toThrow(TooManyRequestsException);
  });
});

// Mock repository instead of database
describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  it('should find user by id', async () => {
    const mockUser = { id: '1', name: 'John', email: 'john@test.com' };
    repo.findOne.mockResolvedValue(mockUser);

    const result = await service.findById('1');

    expect(result).toEqual(mockUser);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: '1' } });
  });
});

// Create mock factory for complex SDKs
function createMockStripe(): jest.Mocked<Stripe> {
  return {
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      confirm: jest.fn(),
      cancel: jest.fn(),
    },
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
  } as any;
}

// Mock time for time-dependent tests
describe('TokenService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should expire token after 1 hour', async () => {
    const token = await service.createToken();

    // Fast-forward time
    jest.advanceTimersByTime(61 * 60 * 1000);

    expect(await service.isValid(token)).toBe(false);
  });
});
```

Reference: [Jest Mocking](https://jestjs.io/docs/mock-functions)

---

### 6.3 Use Testing Module for Unit Tests

**Impact: HIGH** — Enables proper isolated testing with mocked dependencies

Use `@nestjs/testing` module to create isolated test environments with mocked dependencies. This ensures your tests run fast, don't depend on external services, and properly test your business logic in isolation.

> **NestJS 12 note — running the suite:** the testing API below is unchanged in v12; what changed is how Jest loads it. Every `@nestjs/*` 12.x package ships as ESM only, and Jest does not use Node's `require(esm)` but its own loader, which can `require()` an ES module only on **Node 24.9+** and only when Node runs with **`--experimental-vm-modules`** (that flag is what exposes `vm.SourceTextModule`). So a CommonJS project on Jest runs it as `node --experimental-vm-modules node_modules/jest/bin/jest.js` — the form the `test` script of the official v12 CommonJS template uses. A bare `npx jest` dies with `Must use import to load ES Module: …/@nestjs/…/dist/index.js`; on Node < 24.9 it fails with `ERR_REQUIRE_ASYNC_MODULE`. Pin **Jest ≥ 30.5**: 30.4 added the support, but a CommonJS module that `require()`d an ES module mid-graph could get a shared dependency evaluated twice — two instances of the same `@nestjs/*` module in one test (jestjs/jest#16375, shipped in 30.5.0). ESM projects are scaffolded with Vitest instead, where `jest.fn()` / `jest.spyOn()` become `vi.fn()` / `vi.spyOn()`.

**Incorrect (manual instantiation bypassing DI):**

```typescript
// Instantiate services manually without DI
describe('UsersService', () => {
  it('should create user', async () => {
    // Manual instantiation bypasses DI
    const repo = new UserRepository(); // Real repo!
    const service = new UsersService(repo);

    const user = await service.create({ name: 'Test' });
    // This hits the real database!
  });
});

// Test implementation details
describe('UsersController', () => {
  it('should call service', async () => {
    const service = { create: jest.fn() };
    const controller = new UsersController(service as any);

    await controller.create({ name: 'Test' });

    expect(service.create).toHaveBeenCalled(); // Tests implementation, not behavior
  });
});
```

**Correct (use Test.createTestingModule with mocked dependencies):**

```typescript
// Use Test.createTestingModule for proper DI
import { Test, TestingModule } from '@nestjs/testing';

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<UserRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UserRepository,
          useValue: {
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get(UserRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should save and return user', async () => {
      const dto = { name: 'John', email: 'john@test.com' };
      const expectedUser = { id: '1', ...dto };

      repo.save.mockResolvedValue(expectedUser);

      const result = await service.create(dto);

      expect(result).toEqual(expectedUser);
      expect(repo.save).toHaveBeenCalledWith(dto);
    });

    it('should throw on duplicate email', async () => {
      repo.findOne.mockResolvedValue({ id: '1', email: 'test@test.com' });

      await expect(
        service.create({ name: 'Test', email: 'test@test.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const user = { id: '1', name: 'John' };
      repo.findOne.mockResolvedValue(user);

      const result = await service.findById('1');

      expect(result).toEqual(user);
    });

    it('should throw NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findById('999')).rejects.toThrow(NotFoundException);
    });
  });
});

// Testing guards and interceptors
describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should allow when no roles required', () => {
    const context = createMockExecutionContext({ user: { roles: [] } });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow admin for admin-only route', () => {
    const context = createMockExecutionContext({ user: { roles: ['admin'] } });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    expect(guard.canActivate(context)).toBe(true);
  });
});

function createMockExecutionContext(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as ExecutionContext;
}
```

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)

---

## 7. Database & ORM

**Section Impact: MEDIUM-HIGH**

### 7.1 Avoid N+1 Query Problems

**Impact: HIGH** — N+1 queries are one of the most common performance killers

N+1 queries occur when you fetch a list of entities, then make an additional query for each entity to load related data. Use eager loading with `relations`, query builder joins, or DataLoader to batch queries efficiently.

> **TypeORM 1.x note:** `@nestjs/typeorm` 12 accepts `typeorm` `^0.3.0 || ^1.0.0-dev`, and TypeORM 1 removed the string-array forms of `relations` and `select` (`relations: ['items', 'items.product']` no longer compiles). Use the object form shown below — TypeORM 0.3 accepts it too.

**Incorrect (lazy loading in loops causes N+1):**

```typescript
// Lazy loading in loops causes N+1
@Injectable()
export class OrdersService {
  async getOrdersWithItems(userId: string): Promise<Order[]> {
    const orders = await this.orderRepo.find({ where: { userId } });
    // 1 query for orders

    for (const order of orders) {
      // N additional queries - one per order!
      order.items = await this.itemRepo.find({ where: { orderId: order.id } });
    }

    return orders;
  }
}

// Accessing lazy relations without loading
@Controller('users')
export class UsersController {
  @Get()
  async findAll(): Promise<User[]> {
    const users = await this.userRepo.find();
    // If User.posts is lazy-loaded, serializing triggers N queries
    return users; // Each user.posts access = 1 query
  }
}
```

**Correct (use relations for eager loading):**

```typescript
// Use relations option for eager loading
@Injectable()
export class OrdersService {
  async getOrdersWithItems(userId: string): Promise<Order[]> {
    // Single query with JOIN
    return this.orderRepo.find({
      where: { userId },
      relations: { items: { product: true } },
    });
  }
}

// Use QueryBuilder for complex joins
@Injectable()
export class UsersService {
  async getUsersWithPostCounts(): Promise<UserWithPostCount[]> {
    return this.userRepo
      .createQueryBuilder('user')
      .leftJoin('user.posts', 'post')
      .select('user.id', 'id')
      .addSelect('user.name', 'name')
      .addSelect('COUNT(post.id)', 'postCount')
      .groupBy('user.id')
      .getRawMany();
  }

  async getActiveUsersWithPosts(): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'post')
      .leftJoinAndSelect('post.comments', 'comment')
      .where('user.isActive = :active', { active: true })
      .andWhere('post.status = :status', { status: 'published' })
      .getMany();
  }
}

// Use find options for specific fields
async getOrderSummaries(userId: string): Promise<OrderSummary[]> {
  return this.orderRepo.find({
    where: { userId },
    relations: { items: true },
    select: {
      id: true,
      total: true,
      status: true,
      items: {
        id: true,
        quantity: true,
        price: true,
      },
    },
  });
}

// Use DataLoader for GraphQL to batch and cache queries
import DataLoader from 'dataloader';

@Injectable({ scope: Scope.REQUEST })
export class PostsLoader {
  constructor(private postsService: PostsService) {}

  readonly batchPosts = new DataLoader<string, Post[]>(async (userIds) => {
    // Single query for all users' posts
    const posts = await this.postsService.findByUserIds([...userIds]);

    // Group by userId
    const postsMap = new Map<string, Post[]>();
    for (const post of posts) {
      const userPosts = postsMap.get(post.userId) || [];
      userPosts.push(post);
      postsMap.set(post.userId, userPosts);
    }

    // Return in same order as input
    return userIds.map((id) => postsMap.get(id) || []);
  });
}

// In resolver
@ResolveField()
async posts(@Parent() user: User): Promise<Post[]> {
  // DataLoader batches multiple calls into single query
  return this.postsLoader.batchPosts.load(user.id);
}

// Enable query logging in development to detect N+1
TypeOrmModule.forRoot({
  logging: ['query', 'error'],
  logger: 'advanced-console',
});
```

Reference: [TypeORM Relations](https://typeorm.io/relations)

---

### 7.2 Use Database Migrations

**Impact: HIGH** — Enables safe, repeatable database schema changes

Never use `synchronize: true` in production. Use migrations for all schema changes. Migrations provide version control for your database, enable safe rollbacks, and ensure consistency across all environments.

**Incorrect (using synchronize or manual SQL):**

```typescript
// Use synchronize in production
TypeOrmModule.forRoot({
  type: 'postgres',
  synchronize: true, // DANGEROUS in production!
  // Can drop columns, tables, or data
});

// Manual SQL in production
@Injectable()
export class DatabaseService {
  async addColumn(): Promise<void> {
    await this.dataSource.query('ALTER TABLE users ADD COLUMN age INT');
    // No version control, no rollback, inconsistent across envs
  }
}

// Modify entities without migration
@Entity()
export class User {
  @Column()
  email: string;

  @Column() // Added without migration
  newField: string; // Will crash in production if synchronize is false
}
```

**Correct (use migrations for all schema changes):**

```typescript
// Configure TypeORM for migrations
// data-source.ts
export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
  synchronize: false, // Always false in production
  migrationsRun: true, // Run migrations on startup
});

// app.module.ts
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    host: config.get('DB_HOST'),
    synchronize: config.get('NODE_ENV') === 'development', // Only in dev
    migrations: ['dist/migrations/*.js'],
    migrationsRun: true,
  }),
});

// migrations/1705312800000-AddUserAge.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAge1705312800000 implements MigrationInterface {
  name = 'AddUserAge1705312800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add column with default to handle existing rows
    await queryRunner.query(`
      ALTER TABLE "users" ADD "age" integer DEFAULT 0
    `);

    // Add index for frequently queried columns
    await queryRunner.query(`
      CREATE INDEX "IDX_users_age" ON "users" ("age")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Always implement down for rollback
    await queryRunner.query(`DROP INDEX "IDX_users_age"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "age"`);
  }
}

// Safe column rename (two-step)
export class RenameNameToFullName1705312900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add new column
    await queryRunner.query(`
      ALTER TABLE "users" ADD "full_name" varchar(255)
    `);

    // Step 2: Copy data
    await queryRunner.query(`
      UPDATE "users" SET "full_name" = "name"
    `);

    // Step 3: Add NOT NULL constraint
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "full_name" SET NOT NULL
    `);

    // Step 4: Drop old column (after verifying app works)
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "name"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "name" varchar(255)`);
    await queryRunner.query(`UPDATE "users" SET "name" = "full_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "full_name"`);
  }
}
```

Reference: [TypeORM Migrations](https://typeorm.io/migrations)

---

### 7.3 Use Transactions for Multi-Step Operations

**Impact: HIGH** — Ensures data consistency in multi-step operations

When multiple database operations must succeed or fail together, wrap them in a transaction. This prevents partial updates that leave your data in an inconsistent state. Use TypeORM's transaction APIs or the DataSource query runner for complex scenarios.

**Incorrect (multiple saves without transaction):**

```typescript
// Multiple saves without transaction
@Injectable()
export class OrdersService {
  async createOrder(userId: string, items: OrderItem[]): Promise<Order> {
    // If any step fails, data is inconsistent
    const order = await this.orderRepo.save({ userId, status: 'pending' });

    for (const item of items) {
      await this.orderItemRepo.save({ orderId: order.id, ...item });
      await this.inventoryRepo.decrement({ productId: item.productId }, 'stock', item.quantity);
    }

    await this.paymentService.charge(order.id);
    // If payment fails, order and inventory are already modified!

    return order;
  }
}
```

**Correct (use DataSource.transaction for automatic rollback):**

```typescript
// Use DataSource.transaction() for automatic rollback
@Injectable()
export class OrdersService {
  constructor(private dataSource: DataSource) {}

  async createOrder(userId: string, items: OrderItem[]): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // All operations use the same transactional manager
      const order = await manager.save(Order, { userId, status: 'pending' });

      for (const item of items) {
        await manager.save(OrderItem, { orderId: order.id, ...item });
        await manager.decrement(
          Inventory,
          { productId: item.productId },
          'stock',
          item.quantity,
        );
      }

      // If this throws, everything rolls back
      await this.paymentService.chargeWithManager(manager, order.id);

      return order;
    });
  }
}

// QueryRunner for manual transaction control
@Injectable()
export class TransferService {
  constructor(private dataSource: DataSource) {}

  async transfer(fromId: string, toId: string, amount: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Debit source account
      await queryRunner.manager.decrement(
        Account,
        { id: fromId },
        'balance',
        amount,
      );

      // Verify sufficient funds
      const source = await queryRunner.manager.findOne(Account, {
        where: { id: fromId },
      });
      if (source.balance < 0) {
        throw new BadRequestException('Insufficient funds');
      }

      // Credit destination account
      await queryRunner.manager.increment(
        Account,
        { id: toId },
        'balance',
        amount,
      );

      // Log the transaction
      await queryRunner.manager.save(TransactionLog, {
        fromId,
        toId,
        amount,
        timestamp: new Date(),
      });

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

// Repository method with transaction support
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  async createWithProfile(
    userData: CreateUserDto,
    profileData: CreateProfileDto,
  ): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(User, userData);
      await manager.save(Profile, { ...profileData, userId: user.id });
      return user;
    });
  }
}
```

Reference: [TypeORM Transactions](https://typeorm.io/transactions)

---

## 8. API Design

**Section Impact: MEDIUM**

### 8.1 Use Named Wildcards in Middleware Routes (Express v5)

**Impact: HIGH** — Express v5 broke unnamed wildcards — silently mismatched routes are a security hazard

Since NestJS 11 the default HTTP platform is Express v5, which upgraded `path-to-regexp` to v8 — and NestJS 12 keeps both (`@nestjs/platform-express` 12.1.0 pins `express` 5.2.1 and `path-to-regexp` 8.4.2). Unnamed wildcards (`*`, `(.*)`) are no longer valid syntax — middleware routes must use **named wildcards** (`*splat` or the more explicit `{*splat}`). NestJS still auto-converts the legacy syntax: a bare `'*'` or `'(.*)'` is rewritten to `'{*path}'` **without any warning**, and a prefixed one such as `'api/*'` is rewritten to `'api/{*path}'` with a warning. Relying on the shim is fragile: you can end up with middleware that silently doesn't run on the routes you expected, which is especially dangerous for auth/rate-limit middleware.

The same change affects `@nestjs/platform-fastify` — Fastify v5 ships since NestJS 11 and still in 12 (`@nestjs/platform-fastify` 12.1.x pins `fastify` 5.12.5, `@fastify/middie` 9.3.4 and the same `path-to-regexp` 8.4.2), though Fastify's path matching is less affected outside of middleware.

**Incorrect (Express v4 wildcards — auto-shimmed since NestJS 11, still in 12):**

```typescript
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('*');           // ❌ invalid in path-to-regexp v8 — only works because Nest silently rewrites it

    consumer
      .apply(AuthMiddleware)
      .forRoutes('(.*)');        // ❌ legacy syntax — same silent rewrite; stop relying on it

    consumer
      .apply(TrimBodyMiddleware)
      .forRoutes({ path: '/api/*', method: RequestMethod.ALL }); // ❌ rewritten (with a warning) to '/api/{*path}' — never runs on GET /api
  }
}
```

**Correct (named wildcards — Express v5, NestJS 11+):**

```typescript
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // {*splat} matches the root path AND every nested path — preferred for global middleware
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('{*splat}');

    // *splat needs at least one character after the slash: it does NOT run on the bare root '/'
    consumer
      .apply(AuthMiddleware)
      .forRoutes('*splat');

    // A prefix AND everything below it: make the whole tail optional
    consumer
      .apply(TrimBodyMiddleware)
      .forRoutes({ path: 'api{/*splat}', method: RequestMethod.ALL });

    // Excluding routes follows the same syntax
    consumer
      .apply(SessionMiddleware)
      .exclude('health', 'metrics', 'api/auth{/*splat}')
      .forRoutes('{*splat}');
  }
}
```

**Pattern cheat sheet** (what each pattern runs on, measured with NestJS 12.1.0 + Express 5.2.1):

| Goal | NestJS 11+ / Express v5 | Legacy v10 form → what Nest 11+ rewrites it to |
|------|-------------------------|------------------------------------------------|
| Match every path including `/` | `'{*splat}'` | `'*'` / `'(.*)'` → `'{*path}'` (no warning) |
| Match every path except the bare `/` | `'*splat'` | — |
| Match a prefix **and** everything below it (`/api`, `/api/`, `/api/x/y`) | `'api{/*splat}'` | — |
| Match only what is **below** a prefix (not `/api`, not `/api/`) | `'api/*splat'` | — |
| Match below a prefix, `/api/` included but not `/api` | `'api/{*splat}'` | `'api/*'` / `'api/(.*)'` → `'api/{*path}'` (warning) |
| Match exactly one extra segment | `'/users/:id'` | unchanged |
| Match the literal `/` only | `'/'` | unchanged |
| Exclude a subtree, prefix included | `.exclude('api/auth{/*splat}')` | — |
| Exclude only what is below a prefix | `.exclude('api/auth/{*splat}')` | `.exclude('api/auth/(.*)')` → `'api/auth/{*path}'` (warning) |

The token after `*` is just a name — `splat` is convention, not magic. `'{*everything}'` works too.

**Why this is a security concern, not just a syntax change:** auth, CSRF, rate limiting, and request-logging middleware are usually mounted with a wildcard. If the pattern silently mismatches, the middleware doesn't run on the routes you thought it would — but everything compiles and starts. The classic miss is the bare prefix: `'api/*splat'` and `'api/{*splat}'` both skip `GET /api`, so a controller mounted at `@Controller('api')` with a `@Get()` handler never sees the middleware. Always add an integration test that hits an unauthenticated route — the bare prefix included — and asserts the auth middleware kicked in.

Reference: [NestJS Middleware — route wildcards](https://docs.nestjs.com/middleware#route-wildcards) · [path-to-regexp v8](https://github.com/pillarjs/path-to-regexp)

---

### 8.2 Use DTOs and Serialization for API Responses

**Impact: MEDIUM** — Response DTOs prevent accidental data exposure and ensure consistency

Never return entity objects directly from controllers. Use response DTOs with class-transformer's `@Exclude()` and `@Expose()` decorators to control exactly what data is sent to clients. This prevents accidental exposure of sensitive fields and provides a stable API contract.

**Incorrect (returning entities directly or manual spreading):**

```typescript
// Return entities directly
@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findById(id);
    // Returns: { id, email, passwordHash, ssn, internalNotes, ... }
    // Exposes sensitive data!
  }
}

// Manual object spreading (error-prone)
@Get(':id')
async findOne(@Param('id') id: string) {
  const user = await this.usersService.findById(id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    // Easy to forget to exclude sensitive fields
    // Hard to maintain across endpoints
  };
}
```

**Correct (use class-transformer with @Exclude and response DTOs):**

```typescript
// Enable class-transformer globally
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  await app.listen(3000);
}

// Entity with serialization control
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  name: string;

  @Column()
  @Exclude() // Never include in responses
  passwordHash: string;

  @Column({ nullable: true })
  @Exclude()
  ssn: string;

  @Column({ default: false })
  @Exclude({ toPlainOnly: true }) // Exclude from response, allow in requests
  isAdmin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  @Exclude()
  internalNotes: string;
}

// Now returning entity is safe
@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findById(id);
    // Returns: { id, email, name, createdAt }
    // Sensitive fields excluded automatically
  }
}

// For different response shapes, use explicit DTOs
export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  name: string;

  @Expose()
  @Transform(({ obj }) => obj.posts?.length || 0)
  postCount: number;

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}

export class UserDetailResponseDto extends UserResponseDto {
  @Expose()
  createdAt: Date;

  @Expose()
  @Type(() => PostResponseDto)
  posts: PostResponseDto[];
}

// Controller with explicit DTOs
@Controller('users')
export class UsersController {
  @Get()
  @SerializeOptions({ type: UserResponseDto })
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.usersService.findAll();
    return users.map(u => plainToInstance(UserResponseDto, u));
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<UserDetailResponseDto> {
    const user = await this.usersService.findByIdWithPosts(id);
    return plainToInstance(UserDetailResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }
}

// Groups for conditional serialization
export class UserDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose({ groups: ['admin'] })
  email: string;

  @Expose({ groups: ['admin'] })
  createdAt: Date;

  @Expose({ groups: ['admin', 'owner'] })
  settings: UserSettings;
}

@Controller('users')
export class UsersController {
  @Get()
  @SerializeOptions({ groups: ['public'] })
  async findAllPublic(): Promise<UserDto[]> {
    // Returns: { id, name }
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  @SerializeOptions({ groups: ['admin'] })
  async findAllAdmin(): Promise<UserDto[]> {
    // Returns: { id, name, email, createdAt }
  }

  @Get('me')
  @SerializeOptions({ groups: ['owner'] })
  async getProfile(@CurrentUser() user: User): Promise<UserDto> {
    // Returns: { id, name, settings }
  }
}
```

Reference: [NestJS Serialization](https://docs.nestjs.com/techniques/serialization)

---

### 8.3 Use Interceptors for Cross-Cutting Concerns

**Impact: MEDIUM-HIGH** — Interceptors provide clean separation for cross-cutting logic

Interceptors can transform responses, add logging, handle caching, and measure performance without polluting your business logic. They wrap the route handler execution, giving you access to both the request and response streams.

**Incorrect (logging and transformation in every method):**

```typescript
// Logging in every controller method
@Controller('users')
export class UsersController {
  @Get()
  async findAll(): Promise<User[]> {
    const start = Date.now();
    this.logger.log('findAll called');

    const users = await this.usersService.findAll();

    this.logger.log(`findAll completed in ${Date.now() - start}ms`);
    return users;
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User> {
    const start = Date.now();
    this.logger.log(`findOne called with id: ${id}`);

    const user = await this.usersService.findOne(id);

    this.logger.log(`findOne completed in ${Date.now() - start}ms`);
    return user;
  }
  // Repeated in every method!
}

// Manual response wrapping
@Get()
async findAll(): Promise<{ data: User[]; meta: Meta }> {
  const users = await this.usersService.findAll();
  return {
    data: users,
    meta: { timestamp: new Date(), count: users.length },
  };
}
```

**Correct (use interceptors for cross-cutting concerns):**

```typescript
// Logging interceptor
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: (data) => {
          const response = context.switchToHttp().getResponse();
          this.logger.log(
            `${method} ${url} ${response.statusCode} - ${Date.now() - now}ms`,
          );
        },
        error: (error) => {
          this.logger.error(
            `${method} ${url} ${error.status || 500} - ${Date.now() - now}ms`,
            error.stack,
          );
        },
      }),
    );
  }
}

// Response transformation interceptor
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          timestamp: new Date().toISOString(),
          path: context.switchToHttp().getRequest().url,
        },
      })),
    );
  }
}

// Timeout interceptor
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(5000),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          throw new RequestTimeoutException('Request timed out');
        }
        throw err;
      }),
    );
  }
}

// Apply globally or per-controller
@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}

// Or per-controller
@Controller('users')
@UseInterceptors(LoggingInterceptor)
export class UsersController {
  @Get()
  async findAll(): Promise<User[]> {
    // Clean business logic only
    return this.usersService.findAll();
  }
}

// Custom cache interceptor with TTL
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(
    // cache-manager >= 6 (the floor of @nestjs/cache-manager 12) exports `Cache` as a type,
    // not a class: without @Inject(CACHE_MANAGER) Nest cannot resolve this parameter
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();

    // Only cache GET requests
    if (request.method !== 'GET') {
      return next.handle();
    }

    const cacheKey = this.generateKey(request);
    // cache-manager TTLs are milliseconds
    const ttl = this.reflector.get<number | undefined>('cacheTTL', context.getHandler()) ?? 300_000;

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return of(cached);
    }

    return next.handle().pipe(
      tap((response) => {
        this.cacheManager.set(cacheKey, response, ttl);
      }),
    );
  }

  private generateKey(request: Request): string {
    return `cache:${request.url}:${JSON.stringify(request.query)}`;
  }
}

// Usage with custom TTL
@Get()
@SetMetadata('cacheTTL', 600_000) // 10 minutes, in milliseconds
@UseInterceptors(HttpCacheInterceptor)
async findAll(): Promise<User[]> {
  return this.usersService.findAll();
}

// Error mapping interceptor
@Injectable()
export class ErrorMappingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof EntityNotFoundError) {
          throw new NotFoundException(error.message);
        }
        if (error instanceof QueryFailedError) {
          if (error.message.includes('duplicate')) {
            throw new ConflictException('Resource already exists');
          }
        }
        throw error;
      }),
    );
  }
}
```

Reference: [NestJS Interceptors](https://docs.nestjs.com/interceptors)

---

### 8.4 Use Pipes for Input Transformation

**Impact: MEDIUM** — Pipes ensure clean, validated data reaches your handlers

Use built-in pipes like `ParseIntPipe`, `ParseUUIDPipe`, and `DefaultValuePipe` for common transformations. Create custom pipes for business-specific transformations. Pipes separate validation/transformation logic from controllers.

**Incorrect (manual type parsing in handlers):**

```typescript
// Manual type parsing in handlers
@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User> {
    // Manual validation in every handler
    const uuid = id.trim();
    if (!isUUID(uuid)) {
      throw new BadRequestException('Invalid UUID');
    }
    return this.usersService.findOne(uuid);
  }

  @Get()
  async findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
  ): Promise<User[]> {
    // Manual parsing and defaults
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    return this.usersService.findAll(pageNum, limitNum);
  }
}

// Type coercion without validation
@Get()
async search(@Query('price') price: string): Promise<Product[]> {
  const priceNum = +price; // NaN if invalid, no error
  return this.productsService.findByPrice(priceNum);
}
```

**Correct (use built-in and custom pipes):**

```typescript
// Use built-in pipes for common transformations
@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    // id is guaranteed to be a valid UUID
    return this.usersService.findOne(id);
  }

  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<User[]> {
    // Automatic defaults and type conversion
    return this.usersService.findAll(page, limit);
  }

  @Get('by-status/:status')
  async findByStatus(
    @Param('status', new ParseEnumPipe(UserStatus)) status: UserStatus,
  ): Promise<User[]> {
    return this.usersService.findByStatus(status);
  }
}

// Custom pipe for business logic
@Injectable()
export class ParseDatePipe implements PipeTransform<string, Date> {
  transform(value: string): Date {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    return date;
  }
}

@Get('reports')
async getReports(
  @Query('from', ParseDatePipe) from: Date,
  @Query('to', ParseDatePipe) to: Date,
): Promise<Report[]> {
  return this.reportsService.findBetween(from, to);
}

// Custom transformation pipes
@Injectable()
export class NormalizeEmailPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) return value;
    return value.trim().toLowerCase();
  }
}

// Parse comma-separated values
@Injectable()
export class ParseArrayPipe implements PipeTransform<string, string[]> {
  transform(value: string): string[] {
    if (!value) return [];
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
}

@Get('products')
async findProducts(
  @Query('ids', ParseArrayPipe) ids: string[],
  @Query('email', NormalizeEmailPipe) email: string,
): Promise<Product[]> {
  // ids is already an array, email is normalized
  return this.productsService.findByIds(ids);
}

// Sanitize HTML input
@Injectable()
export class SanitizeHtmlPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) return value;
    return sanitizeHtml(value, { allowedTags: [] });
  }
}

// Global validation pipe with transformation
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip non-DTO properties
    transform: true, // Auto-transform to DTO types
    transformOptions: {
      enableImplicitConversion: true, // Convert query strings to numbers
    },
    forbidNonWhitelisted: true, // Throw on extra properties
  }),
);

// DTO with transformation decorators
export class FindProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value?.split(','))
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

@Get()
async findAll(@Query() dto: FindProductsDto): Promise<Product[]> {
  // dto is already transformed and validated
  return this.productsService.findAll(dto);
}

// Pipe error customization
@Injectable()
export class CustomParseIntPipe extends ParseIntPipe {
  constructor() {
    super({
      exceptionFactory: (error) =>
        new BadRequestException(`${error} must be a valid integer`),
    });
  }
}

// Or use options on built-in pipes
@Get(':id')
async findOne(
  @Param(
    'id',
    new ParseIntPipe({
      errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE,
      exceptionFactory: () => new NotAcceptableException('ID must be numeric'),
    }),
  )
  id: number,
): Promise<Item> {
  return this.itemsService.findOne(id);
}
```

Reference: [NestJS Pipes](https://docs.nestjs.com/pipes)

---

### 8.5 Use API Versioning for Breaking Changes

**Impact: MEDIUM** — Versioning allows you to evolve APIs without breaking existing clients

Use NestJS built-in versioning when making breaking changes to your API. Choose a versioning strategy (URI, header, or media type) and apply it consistently. This allows old clients to continue working while new clients use updated endpoints.

**Incorrect (breaking changes without versioning):**

```typescript
// Breaking changes without versioning
@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<User> {
    // Original response: { id, name, email }
    // Later changed to: { id, firstName, lastName, emailAddress }
    // Old clients break!
    return this.usersService.findOne(id);
  }
}

// Manual versioning in routes
@Controller('v1/users')
export class UsersV1Controller {}

@Controller('v2/users')
export class UsersV2Controller {}
// Inconsistent, error-prone, hard to maintain
```

**Correct (use NestJS built-in versioning):**

```typescript
// Enable versioning in main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // URI versioning: /v1/users, /v2/users
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Or header versioning: X-API-Version: 1
  app.enableVersioning({
    type: VersioningType.HEADER,
    header: 'X-API-Version',
    defaultVersion: '1',
  });

  // Or media type: Accept: application/json;v=1
  app.enableVersioning({
    type: VersioningType.MEDIA_TYPE,
    key: 'v=',
    defaultVersion: '1',
  });

  await app.listen(3000);
}

// Version-specific controllers: the version goes in @Controller's options.
// @Version() is a MethodDecorator — on a class it does not compile.
@Controller({ path: 'users', version: '1' })
export class UsersV1Controller {
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<UserV1Response> {
    const user = await this.usersService.findOne(id);
    // V1 response format
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }
}

@Controller({ path: 'users', version: '2' })
export class UsersV2Controller {
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<UserV2Response> {
    const user = await this.usersService.findOne(id);
    // V2 response format with breaking changes
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      emailAddress: user.email,
      createdAt: user.createdAt,
    };
  }
}

// Per-route versioning - different versions for different routes
@Controller('users')
export class UsersController {
  @Get()
  @Version('1')
  findAllV1(): Promise<UserV1Response[]> {
    return this.usersService.findAllV1();
  }

  @Get()
  @Version('2')
  findAllV2(): Promise<UserV2Response[]> {
    return this.usersService.findAllV2();
  }

  @Get(':id')
  @Version(['1', '2']) // Same handler for multiple versions
  findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findOne(id);
  }

  @Post()
  @Version(VERSION_NEUTRAL) // Available in all versions
  create(@Body() dto: CreateUserDto): Promise<User> {
    return this.usersService.create(dto);
  }
}

// Shared service with version-specific logic
@Injectable()
export class UsersService {
  async findOne(id: string, version: string): Promise<any> {
    const user = await this.repo.findOne({ where: { id } });

    if (version === '1') {
      return this.toV1Response(user);
    }
    return this.toV2Response(user);
  }

  private toV1Response(user: User): UserV1Response {
    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
    };
  }

  private toV2Response(user: User): UserV2Response {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      emailAddress: user.email,
      createdAt: user.createdAt,
    };
  }
}

// Controller extracts version
@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('X-API-Version') version: string = '1',
  ): Promise<any> {
    return this.usersService.findOne(id, version);
  }
}

// Deprecation strategy - mark old versions as deprecated
@Controller({ path: 'users', version: '1' })
@UseInterceptors(DeprecationInterceptor)
export class UsersV1Controller {
  // All V1 routes will include deprecation warning
}

@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse();
    response.setHeader('Deprecation', 'true');
    response.setHeader('Sunset', 'Sat, 1 Jan 2025 00:00:00 GMT');
    response.setHeader('Link', '</v2/users>; rel="successor-version"');

    return next.handle();
  }
}
```

**NestJS 12+: catch overlapping routes at bootstrap.** Adding a version, a `VERSION_NEUTRAL` handler or a literal route next to a parametric one makes overlaps easy to introduce, and on Express the first-registered route silently wins: with `@Get(':id')` declared before `@Get('me')`, `GET /users/me` is served by the `:id` handler. NestJS 12 adds two opt-in `NestApplicationOptions` for that:

```typescript
const app = await NestFactory.create(AppModule, {
  // duplicate: same method + path + host + version. shadow: two patterns can match
  // the same request (/users/me vs /users/:id). Each is 'off' | 'warn' | 'error' (default 'off').
  routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
  // Register literal segments before parametric and wildcard ones on order-sensitive
  // adapters such as Express (default 'declaration' = the order you wrote them).
  routeResolutionStrategy: 'specificity',
});
```

Measured with NestJS 12.1.0: `shadow: 'warn'` logs `Route GET /users/me (…) is shadowed by GET /users/:id (…)`, `'error'` aborts the bootstrap, and `'specificity'` makes `GET /users/me` reach the `me` handler. Two controllers sharing `path: 'users'` with different `version` values are **not** reported as duplicates, so `duplicate: 'error'` is safe to combine with URI versioning.

Reference: [NestJS Versioning](https://docs.nestjs.com/techniques/versioning) · [NestJS 12 migration — route conflict diagnostics](https://docs.nestjs.com/migration-guide)

---

## 9. Microservices

**Section Impact: MEDIUM**

### 9.1 Implement Health Checks for Microservices

**Impact: MEDIUM-HIGH** — Health checks enable orchestrators to manage service lifecycle

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

---

### 9.2 Use Message and Event Patterns Correctly

**Impact: MEDIUM** — Proper patterns ensure reliable microservice communication

NestJS microservices support two communication patterns: request-response (MessagePattern) and event-based (EventPattern). Use MessagePattern when you need a response, and EventPattern for fire-and-forget notifications. Understanding the difference prevents communication bugs.

**Incorrect (using wrong pattern for use case):**

```typescript
// Use @MessagePattern for fire-and-forget
@Controller()
export class NotificationsController {
  @MessagePattern('user.created')
  async handleUserCreated(data: UserCreatedEvent) {
    // This WAITS for response, blocking the sender
    await this.emailService.sendWelcome(data.email);
    // If email fails, sender gets an error (coupling!)
  }
}

// Use @EventPattern expecting a response
@Controller()
export class OrdersController {
  @EventPattern('inventory.check')
  async checkInventory(data: CheckInventoryDto) {
    const available = await this.inventory.check(data);
    return available; // This return value is IGNORED with @EventPattern!
  }
}

// Tight coupling in client
@Injectable()
export class UsersService {
  async createUser(dto: CreateUserDto): Promise<User> {
    const user = await this.repo.save(dto);

    // Blocks until notification service responds
    await this.client.send('user.created', user).toPromise();
    // If notification service is down, user creation fails!

    return user;
  }
}
```

**Correct (use MessagePattern for request-response, EventPattern for fire-and-forget):**

```typescript
// MessagePattern: Request-Response (when you NEED a response)
@Controller()
export class InventoryController {
  @MessagePattern({ cmd: 'check_inventory' })
  async checkInventory(data: CheckInventoryDto): Promise<InventoryResult> {
    const result = await this.inventoryService.check(data.productId, data.quantity);
    return result; // Response sent back to caller
  }
}

// Client expects response
@Injectable()
export class OrdersService {
  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // Check inventory - we NEED this response to proceed
    const inventory = await firstValueFrom(
      this.inventoryClient.send<InventoryResult>(
        { cmd: 'check_inventory' },
        { productId: dto.productId, quantity: dto.quantity },
      ),
    );

    if (!inventory.available) {
      throw new BadRequestException('Insufficient inventory');
    }

    return this.repo.save(dto);
  }
}

// EventPattern: Fire-and-Forget (for notifications, side effects)
@Controller()
export class NotificationsController {
  @EventPattern('user.created')
  async handleUserCreated(data: UserCreatedEvent): Promise<void> {
    // No return value needed - just process the event
    await this.emailService.sendWelcome(data.email);
    await this.analyticsService.track('user_signup', data);
    // If this fails, it doesn't affect the sender
  }
}

// Client emits event without waiting
@Injectable()
export class UsersService {
  async createUser(dto: CreateUserDto): Promise<User> {
    const user = await this.repo.save(dto);

    // Fire and forget - doesn't block, doesn't wait
    this.eventClient.emit('user.created', {
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    });

    return user; // User creation succeeds regardless of event handling
  }
}

// Hybrid pattern for critical events
@Injectable()
export class OrdersService {
  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const order = await this.repo.save(dto);

    // Critical: inventory reservation (use MessagePattern)
    const reserved = await firstValueFrom(
      this.inventoryClient.send({ cmd: 'reserve_inventory' }, {
        orderId: order.id,
        items: dto.items,
      }),
    );

    if (!reserved.success) {
      await this.repo.delete(order.id);
      throw new BadRequestException('Could not reserve inventory');
    }

    // Non-critical: notifications (use EventPattern)
    this.eventClient.emit('order.created', {
      orderId: order.id,
      userId: dto.userId,
      total: dto.total,
    });

    return order;
  }
}

// Error handling patterns
// MessagePattern errors propagate to caller
@MessagePattern({ cmd: 'get_user' })
async getUser(userId: string): Promise<User> {
  const user = await this.repo.findOne({ where: { id: userId } });
  if (!user) {
    throw new RpcException('User not found'); // Received by caller
  }
  return user;
}

// EventPattern errors should be handled locally
@EventPattern('order.created')
async handleOrderCreated(data: OrderCreatedEvent): Promise<void> {
  try {
    await this.processOrder(data);
  } catch (error) {
    // Log and potentially retry - don't throw
    this.logger.error('Failed to process order event', error);
    await this.deadLetterQueue.add(data);
  }
}
```

Reference: [NestJS Microservices](https://docs.nestjs.com/microservices/basics)

---

### 9.3 Use Message Queues for Background Jobs

**Impact: MEDIUM-HIGH** — Queues enable reliable background processing

Use `@nestjs/bullmq` for background job processing. Queues decouple long-running tasks from HTTP requests, enable retry logic, and distribute workload across workers. Use them for emails, file processing, notifications, and any task that shouldn't block user requests.

> **Since NestJS 11 (still true in 12):** the legacy `@nestjs/bull` package wraps Bull (v3/v4), which is in maintenance mode — bug fixes only. For new projects use `@nestjs/bullmq` (BullMQ). The BullMQ processor model is **class-based** — extend `WorkerHost` and implement a single `process(job)` method. The `@Process('name')` decorator from Bull does **not** exist in BullMQ; dispatch by `job.name` inside `process()` instead.

> **NestJS 12 note:** install `@nestjs/bullmq` **12.x** — 11.0.5 declares peers `@nestjs/common`/`@nestjs/core` `^10 || ^11` only, so it conflicts with Nest 12. The 12.x line accepts `bullmq` `^3`–`^6` and, like every `@nestjs/*` 12 package, ships as ESM only: a CommonJS app loads it through Node's `require(esm)` (Node 20.19+, 22.12+ or 24+), and Jest needs `--experimental-vm-modules` to load it in tests. **BullMQ 6 removed `repeat` from `Queue.add()`** — schedule repeating jobs with `Queue.upsertJobScheduler()`, which recent BullMQ 5 releases already have, so the same code works on both.

**Incorrect (long-running tasks in HTTP handlers):**

```typescript
// Long-running tasks in HTTP handlers
@Controller('reports')
export class ReportsController {
  @Post()
  async generate(@Body() dto: GenerateReportDto): Promise<Report> {
    // This blocks the request for potentially minutes
    const data = await this.fetchLargeDataset(dto);
    const report = await this.processData(data); // Slow!
    await this.sendEmail(dto.email, report); // Can fail!
    return report; // Client times out
  }
}

// Fire-and-forget without retry
@Injectable()
export class EmailService {
  async sendWelcome(email: string): Promise<void> {
    // If this fails, email is never sent
    await this.mailer.send({ to: email, template: 'welcome' });
    // No retry, no tracking, no visibility
  }
}

// Use setInterval for scheduled tasks
setInterval(async () => {
  await cleanupOldRecords();
}, 60000); // No error handling, memory leaks
```

**Incorrect (legacy Bull `@Process('name')` style — NOT supported in BullMQ):**

```typescript
// ❌ This Bull-only pattern was removed in @nestjs/bullmq
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';

@Processor('audio')
export class AudioConsumer {
  @Process('transcode')
  async transcode(job: Job<unknown>) { /* ... */ }

  @Process('concatenate')
  async concatenate(job: Job<unknown>) { /* ... */ }
}
```

**Correct (use BullMQ `WorkerHost` for background processing):**

```typescript
// Configure BullMQ
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: 'localhost',
        port: 6379,
      },
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'reports' },
      { name: 'notifications' },
    ),
  ],
})
export class QueueModule {}

// Producer: Add jobs to queue
@Injectable()
export class ReportsService {
  constructor(
    @InjectQueue('reports') private reportsQueue: Queue,
  ) {}

  async requestReport(dto: GenerateReportDto): Promise<{ jobId: string }> {
    // Return immediately, process in background
    const job = await this.reportsQueue.add('generate', dto, {
      priority: dto.urgent ? 1 : 10,
      delay: dto.scheduledFor ? Date.parse(dto.scheduledFor) - Date.now() : 0,
    });

    return { jobId: job.id };
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const job = await this.reportsQueue.getJob(jobId);
    return {
      status: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
    };
  }
}

// Consumer: Extend WorkerHost and dispatch by job.name
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('reports')
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);

  async process(job: Job<any, any, string>): Promise<any> {
    // Single entry point — dispatch on job.name
    switch (job.name) {
      case 'generate':
        return this.generateReport(job);
      case 'export':
        return this.exportReport(job);
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  }

  private async generateReport(job: Job<GenerateReportDto>): Promise<Report> {
    this.logger.log(`Processing report job ${job.id}`);

    // Use job.updateProgress() — note: BullMQ uses updateProgress, not progress()
    await job.updateProgress(10);

    const data = await this.fetchData(job.data);
    await job.updateProgress(50);

    const report = await this.processData(data);
    await job.updateProgress(90);

    await this.saveReport(report);
    await job.updateProgress(100);

    return report;
  }

  private async exportReport(job: Job): Promise<void> {
    // ...
  }

  // Listen to worker lifecycle events with @OnWorkerEvent
  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} (${job.name})`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}

// Email queue with retry
@Processor('email')
export class EmailProcessor extends WorkerHost {
  constructor(private readonly mailer: MailerService) {
    super();
  }

  async process(job: Job<SendEmailDto>): Promise<void> {
    const { to, template, data } = job.data;

    try {
      await this.mailer.send({ to, template, context: data });
    } catch (error) {
      // BullMQ retries based on the job's attempts/backoff options
      throw error;
    }
  }
}

// Producer usage
@Injectable()
export class NotificationService {
  constructor(@InjectQueue('email') private emailQueue: Queue) {}

  async sendWelcome(user: User): Promise<void> {
    await this.emailQueue.add(
      'send',
      {
        to: user.email,
        template: 'welcome',
        data: { name: user.name },
      },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }
}

// Scheduled / repeatable jobs — job schedulers, not `add(..., { repeat })`:
// BullMQ 6 removed `repeat` from Queue.add(); recent BullMQ 5 releases have upsertJobScheduler() too
@Injectable()
export class ScheduledJobsService implements OnModuleInit {
  constructor(@InjectQueue('maintenance') private queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // Idempotent registration — upserting an existing scheduler id updates it, never duplicates it
    await this.queue.upsertJobScheduler(
      'daily-cleanup', // scheduler id
      { pattern: '0 0 * * *' }, // `pattern` (cron) or `every` (ms)
      { name: 'cleanup', data: {} }, // template for every job it produces
    );

    await this.queue.upsertJobScheduler(
      'hourly-digest',
      { every: 60 * 60 * 1000 },
      { name: 'digest', data: {} },
    );
  }
}

@Processor('maintenance')
export class MaintenanceProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'cleanup':
        return this.cleanup();
      case 'digest':
        return this.sendDigest();
    }
  }

  private async cleanup(): Promise<void> { /* ... */ }
  private async sendDigest(): Promise<void> { /* ... */ }
}

// Queue monitoring with Bull Board
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({ name: 'email', adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: 'reports', adapter: BullMQAdapter }),
  ],
})
export class AdminModule {}
```

**Choosing between `@nestjs/bullmq` and `@nestjs/bull`:**

| Concern | `@nestjs/bullmq` (recommended) | `@nestjs/bull` (legacy) |
|---------|--------------------------------|-------------------------|
| Underlying lib | BullMQ (actively maintained) | Bull v3/v4 (maintenance mode) |
| Line for NestJS 12 | `@nestjs/bullmq` 12.x (`bullmq` `^3`–`^6`) | `@nestjs/bull` 12.x (`bull` `^3.3` or `^4`) |
| Processor API | `extends WorkerHost` + `process()` | `@Process('name')` |
| Events | `@OnWorkerEvent('completed')` | `@OnQueueCompleted()` |
| Job progress | `job.updateProgress(n)` | `job.progress(n)` |
| Repeatable jobs | `queue.upsertJobScheduler(id, { pattern })` or `{ every }` | `repeat: { cron, every }` |
| TypeScript | Stricter generics | Looser typings |

Reference: [NestJS Queues](https://docs.nestjs.com/techniques/queues)

---

## 10. DevOps & Deployment

**Section Impact: LOW-MEDIUM**

### 10.1 Implement Graceful Shutdown

**Impact: MEDIUM-HIGH** — Proper shutdown handling ensures zero-downtime deployments

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

---

### 10.2 Run on a Supported Node.js LTS

**Impact: CRITICAL** — NestJS 12 packages are ESM-only — a CommonJS app on Node below 20.19 / 22.12 dies at the first require

NestJS 12 ships every `@nestjs/*` package as **ESM only**. A CommonJS application — most existing apps; migrating your own code to ESM is optional and not part of the upgrade — keeps working because Node loads those packages through `require(esm)`, which runs **without a flag only from Node.js 20.19 and 22.12** onwards. That, not `@nestjs/core`'s `engines` field (`>= 20`), is the real floor. The ecosystem around it is often stricter: `nestjs-pino` 5 declares `>=22.12.0`, `nestjs-cls` 7 `>=22`, and the CLI's `@nestjs/schematics` 12 (`nest new`, `nest generate`) `^22.22.3 || ^24.15.0 || >=26.0.0`. Your floor is the strictest of all of them.

Node.js 20 reached end-of-life on 2026-04-30, so the practical choice is the **24.x LTS** (supported until 2028-04-30), or 22.12+ (until 2027-04-30) if you cannot move yet. Pin it in `package.json`, your Dockerfile, CI and `.nvmrc` so dev, test and prod cannot drift onto an unsupported version.

> **Since v11:** Node.js 16 and 18 are unsupported (both are EOL).

**Incorrect (no engine pin, mismatched runtimes, Node without unflagged `require(esm)`):**

```dockerfile
# Dockerfile
FROM node:18-alpine     # ❌ unsupported since NestJS 11
# FROM node:20.11-alpine  ❌ NestJS 12 in a CJS app: no unflagged require(esm) before 20.19
WORKDIR /app
COPY . .
RUN npm ci && npm run build
CMD ["node", "dist/main"]
```

```jsonc
// package.json — silent on engine, anything goes
{
  "name": "api",
  "scripts": { "start": "node dist/main" }
  // no "engines" field — the package manager installs on any Node
}
```

```jsonc
// package.json — a floor copied from @nestjs/core's engines: too low for NestJS 12
{
  "engines": { "node": ">=20" } // ❌ admits 20.0–20.18, which cannot require() the ESM packages
}
```

```yaml
# .github/workflows/ci.yml
- uses: actions/setup-node@v7
  with:
    node-version: 22.11    # ❌ tests run on one version, prod on another — and 22.11 lacks unflagged require(esm)
```

**Correct (pin the LTS in every layer):**

```jsonc
// package.json
{
  "name": "api",
  "engines": {
    "node": "^24.15.0", // strictest of: require(esm) (20.19 / 22.12), your deps' engines, the CLI's
    "pnpm": ">=11"
  },
  "packageManager": "pnpm@11.28.0",
  "scripts": {
    "start": "node dist/main"
  }
}
```

```dockerfile
# Dockerfile — same LTS line in build and runtime (pin an exact version or digest in real images)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
CMD ["node", "dist/main"]
```

```yaml
# .github/workflows/ci.yml — same Node as production
- uses: actions/setup-node@v7
  with:
    node-version-file: '.nvmrc'    # single source of truth
    cache: 'pnpm'
```

```text
# .nvmrc
24.21.0
```

```bash
# Local dev: nvm + .nvmrc keeps every contributor on the same Node
$ nvm use
Found '/path/to/repo/.nvmrc' with version <24.21.0>
Now using node v24.21.0

# Detect the capability NestJS 12 needs in a CJS app (true from 20.19 / 22.12)
$ node -p "process.features.require_module"
true
```

**Why this matters:**

- **Security patches** stop landing on EOL Node — staying current is the only way to get them.
- **The failure is at startup, not at install time.** Without unflagged `require(esm)`, the first `require('@nestjs/core')` throws `Error [ERR_REQUIRE_ESM]: require() of ES Module …/@nestjs/core/index.js … not supported.` The message names a file, not the Node version you need.
- **`@nestjs/core`'s `engines` (`>= 20`) is not the answer.** It still admits the versions that cannot load it from CommonJS; take the floor from `require(esm)` and from the strictest `engines` in your dependency tree.
- **Drift between dev and prod** is the source of "works on my machine" bugs around `URL`, `crypto.subtle`, and timing. The `engines` field + lockfile + Dockerfile + `.nvmrc` together prevent it.

Reference: [NestJS v12 migration guide](https://docs.nestjs.com/migration-guide) · [Node.js — Loading ECMAScript modules using `require()`](https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require) · [Node.js release schedule](https://github.com/nodejs/release#release-schedule)

---

### 10.3 Use ConfigModule for Environment Configuration

**Impact: LOW-MEDIUM** — Proper configuration prevents deployment failures

Use `@nestjs/config` for environment-based configuration. Validate configuration at startup to fail fast on misconfigurations. Use namespaced configuration for organization and type safety.

> **NestJS 12 note:** `@nestjs/config` 12 moves from Joi-specific validation to **Standard Schema**. `validationSchema` accepts any Standard Schema-compatible schema (Zod, Valibot, ArkType, …). Joi still works but needs **Joi v18 or later**, which implements the spec, and Joi's own settings move from `validationOptions` to `validationOptions.libraryOptions` — the v11 shape `validationOptions: { abortEarly, allowUnknown }` no longer compiles (TS2353). For Joi, `@nestjs/config` keeps its historical defaults `allowUnknown: true` and `abortEarly: false` and merges yours on top.

**Incorrect (accessing process.env directly):**

```typescript
// Access process.env directly
@Injectable()
export class DatabaseService {
  constructor() {
    // No validation, can fail at runtime
    this.connection = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT), // NaN if missing
      password: process.env.DB_PASSWORD, // undefined if missing
    });
  }
}

// Scattered env access
@Injectable()
export class EmailService {
  sendEmail() {
    // Different services access env differently
    const apiKey = process.env.SENDGRID_API_KEY || 'default';
    // Typos go unnoticed: process.env.SENDGRID_API_KY
  }
}
```

**Correct (use @nestjs/config with validation):**

```typescript
// Setup validated configuration
import { ConfigModule, ConfigService, registerAs, type ConfigType } from '@nestjs/config';
import { z } from 'zod';

// config/database.config.ts
export const databaseConfig = registerAs('database', () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
}));

// config/app.config.ts
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  environment: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api',
}));

// config/validation.schema.ts — any Standard Schema library (Zod shown)
export const validationSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  REDIS_URL: z.url(),
});
// A missing JWT_SECRET aborts bootstrap:
// Error: Config validation error: JWT_SECRET: Invalid input: expected string, received undefined

// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Available everywhere without importing
      load: [databaseConfig, appConfig],
      validationSchema,
      // Undeclared variables stay available: @nestjs/config merges them back after validation
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.database'),
        autoLoadEntities: true,
      }),
    }),
  ],
})
export class AppModule {}

// Type-safe configuration access
export interface AppConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  apiPrefix: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

// Type-safe access
@Injectable()
export class AppService {
  constructor(private config: ConfigService) {}

  getPort(): number {
    // Type-safe with generic
    return this.config.get<number>('app.port');
  }

  getDatabaseConfig(): DatabaseConfig {
    return this.config.get<DatabaseConfig>('database');
  }
}

// Inject namespaced config directly
@Injectable()
export class DatabaseService {
  constructor(
    @Inject(databaseConfig.KEY)
    private dbConfig: ConfigType<typeof databaseConfig>,
  ) {
    // Full type inference!
    const host = this.dbConfig.host; // string
    const port = this.dbConfig.port; // number
  }
}

// Joi (v18+ only): library-specific options go under libraryOptions
ConfigModule.forRoot({
  validationSchema: Joi.object({ PORT: Joi.number().default(3000) }),
  validationOptions: {
    libraryOptions: { abortEarly: true }, // v11 put this directly under validationOptions
  },
});

// Environment files support
ConfigModule.forRoot({
  envFilePath: [
    `.env.${process.env.NODE_ENV}.local`,
    `.env.${process.env.NODE_ENV}`,
    '.env.local',
    '.env',
  ],
});

// .env.development
// DB_HOST=localhost
// DB_PORT=5432

// .env.production
// DB_HOST=prod-db.example.com
// DB_PORT=5432
```

Reference: [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)

---

### 10.4 Use Structured Logging

**Impact: MEDIUM-HIGH** — Structured logging enables effective debugging and monitoring

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

---

## References

- [NestJS Documentation](https://docs.nestjs.com)
- [NestJS 12 Migration Guide](https://docs.nestjs.com/migration-guide)
- [NestJS Lifecycle Events](https://docs.nestjs.com/fundamentals/lifecycle-events)
- [NestJS Injection Scopes (incl. Durable Providers)](https://docs.nestjs.com/fundamentals/injection-scopes)
- [NestJS Caching (cache-manager v6+ / Keyv)](https://docs.nestjs.com/techniques/caching)
- [NestJS Queues (BullMQ)](https://docs.nestjs.com/techniques/queues)
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
- [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)
- [NestJS Logger](https://docs.nestjs.com/techniques/logger)
- [NestJS Versioning](https://docs.nestjs.com/techniques/versioning)
- [NestJS Microservices](https://docs.nestjs.com/microservices/basics)
- [NestJS Terminus (Health Checks)](https://docs.nestjs.com/recipes/terminus)
- [NestJS Security — Helmet and built-in security headers (12.1+)](https://docs.nestjs.com/security/helmet)
- [NestJS Security — CSRF (built-in since 12.1, csrf-csrf)](https://docs.nestjs.com/security/csrf)
- [NestJS Throttler](https://docs.nestjs.com/security/rate-limiting)
- [Node.js — Loading ECMAScript modules using require()](https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require)
- [Node.js release schedule](https://github.com/nodejs/release#release-schedule)
- [Jest — ECMAScript Modules](https://jestjs.io/docs/ecmascript-modules)

---

*Generated by build-agents.ts on 2026-09-29*
