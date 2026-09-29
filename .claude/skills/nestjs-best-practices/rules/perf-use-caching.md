---
title: Use Caching Strategically
impact: HIGH
impactDescription: Dramatically reduces database load and response times
tags: performance, caching, redis, keyv, optimization, v11+, v12
---

## Use Caching Strategically

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
