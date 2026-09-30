# Mapeo Hexagonal/DDD → NestJS 12 + TS 6.0

Concreción de los conceptos genéricos del skill al stack del proyecto: **NestJS 12, TypeScript 6.0, Node 24, pnpm, SWC, Pino, Zod, class-validator, TypeORM, Jest**. Las versiones exactas no se repiten aquí porque envejecen con cada bump: mandan la línea «Stack» de `CLAUDE.md`, `package.json` (dependencias y `engines.node`), `.nvmrc` y `packageManager`.

> Esta referencia complementa `LAYERS.md`, `DDD-TACTICAL.md` y `HEXAGONAL.md`. Cuando el `SKILL.md` u otra referencia describa un concepto en pseudocódigo, este archivo es la fuente de verdad para cómo escribirlo en este repo. **La implementación de referencia es `src/modules/users/`**: ante la duda, copia su forma. Los ejemplos de abajo usan un contexto hipotético `billing` con la forma exacta de `users` y `orders`; cada bloque indica qué archivo real calca.

> **Convención obligatoria — `type`, nunca `interface`.** El ESLint del repo aplica `@typescript-eslint/consistent-type-definitions: ['error', 'type']`. Los demás archivos de `references/` usan `interface` porque son teoría agnóstica del lenguaje; **en código real de este repo eso rompe `pnpm lint:check`**. Datos, entradas de casos de uso y DTOs planos se declaran como `export type X = { … };`. **Los puertos son la excepción: `abstract class`** (§2), porque tienen que sobrevivir a la compilación para servir de token de inyección.

## 0. Qué cambia NestJS 12 para este mapeo

- **Todos los `@nestjs/*` 12.x son solo ESM** (`"type": "module"` en su `package.json`; `@nestjs/throttler` 6.x sigue en CJS). El repo **sigue siendo CommonJS**: SWC compila a CJS y Node carga esos paquetes con `require(esm)`, sin flag desde 20.19 / 22.12 — el suelo que la guía oficial fija para ejecutar Nest 12 (https://docs.nestjs.com/migration-guide). El repo va más allá y fija Node 24 (`.nvmrc`, `engines.node`) — entre otros motivos, porque Jest solo carga los paquetes ESM de v12 desde Node 24.9 (misma guía).
- **Los tests se lanzan siempre por los scripts `pnpm test*`**, que arrancan Jest con `node --experimental-vm-modules` (ver `package.json` y `jest.config.mjs`). Un `npx jest` a secas muere con `Must use import to load ES Module` (medición en `CLAUDE.md`).
- **La forma del código no cambia.** Una `abstract class` sigue siendo un token válido — `InjectionToken = string | symbol | Type<T> | Abstract<T> | Function` en `@nestjs/common/interfaces/modules/injection-token.interface.d.ts` (12.1.0) — y SWC sigue emitiendo `design:paramtypes`, así que los puertos de §2 se inyectan sin `@Inject`.
- **Importa siempre desde la raíz del paquete** (`@nestjs/common`, `@nestjs/core`, …), nunca desde una subruta. El mapa `exports` de `@nestjs/common` 12.1.0 (`"./*": "./*.js"`) deja resolver rutas internas, pero lo que no reexporta `index.d.ts` no es API pública — `CorsOptions`, por ejemplo, no sale por la raíz.
- **Un hook de apagado que falla ya no hace fallar `app.close()`.** `onModuleDestroy`, `beforeApplicationShutdown` y `onApplicationShutdown` corren con `Promise.allSettled` (`@nestjs/core/hooks/*.hook.js`): el rechazo se registra y el apagado sigue. Un adaptador que cierre una conexión en su hook no puede contar con que un fallo suyo se propague.

## 1. Estructura de carpetas (obligatoria)

Cada bounded context vive bajo `src/modules/<context>/` con sus capas **dentro** y respeta la regla de dependencia hacia adentro. Hoy hay tres —`users`, `auth`, `orders`— más `health`, que es plano.

```
src/
├── main.ts                        # Proceso: applyGlobals(), listen y apagado
├── app.module.ts                  # Importa los módulos de contexto y la config global; sin lógica
├── bootstrap/                     # Documento OpenAPI y UI de Scalar
├── common/                        # Cross-cutting: filters, interceptors, decorators, dto, auth, logger
├── config/                        # Configuración validada con Zod (registerAs)
├── database/                      # DataSource, migraciones, seeds, relay del outbox
├── shared/domain/                 # Kernel compartido: AggregateRoot, ValueObject
└── modules/
    └── <context>/                 # p. ej. users, auth, orders
        ├── domain/                # ❌ sin @nestjs/*, typeorm, axios, class-validator ni pino
        │   ├── entities/<aggregate>.entity.ts
        │   ├── value-objects/<name>.vo.ts
        │   ├── events/<event-name>.event.ts
        │   ├── ports/<name>.repository.ts    # abstract class (driven port)
        │   └── errors/<aggregate>.errors.ts  # jerarquía de errores del contexto
        ├── application/           # ✅ @Injectable; sin ORM ni clientes HTTP
        │   ├── use-cases/<verb-noun>.use-case.ts   # caso de uso + su `…Input`
        │   └── <context>.facade.ts                  # solo si otro contexto consume este
        ├── infrastructure/        # ✅ la única capa que toca librerías externas
        │   ├── http/<resource>.controller.ts        # driver adapter
        │   ├── http/<aggregate>-domain-exception.filter.ts
        │   ├── http/dto/<name>.dto.ts
        │   ├── persistence/<name>.orm-entity.ts     # decoradores de TypeORM
        │   ├── persistence/<name>.mapper.ts
        │   ├── persistence/<name>.typeorm.repository.ts
        │   └── <owner>-<name>.directory.ts          # ACL hacia otro contexto
        ├── __tests__/             # espejo de la estructura de arriba
        └── <context>.module.ts    # composition root del contexto
```

Otras carpetas de `infrastructure/` aparecen cuando hay algo que meter: `auth` tiene `security/` (hasher y firmador de tokens); `messaging/` no existe todavía en ningún contexto.

**Reglas** (las mecánicas las aplica `eslint.boundaries.js`, verificado por `src/__tests__/eslint-boundaries.spec.ts`):

- `domain/` no importa nada de `@nestjs/*`, `typeorm`, `axios`, `class-validator`, `pino` ni `argon2`. Solo TS estándar, su propio dominio y el kernel `@shared/domain/`.
- `application/` puede usar `@nestjs/common` para DI (`@Injectable`), pero **no** `typeorm`, `axios`, `argon2` ni `@nestjs/jwt`. Tampoco `class-validator`: la validación de transporte es del DTO HTTP. Esta última prohibición es convención de `CLAUDE.md`; hoy el gate de boundaries solo la aplica a `domain/` y `shared/domain/`.
- `infrastructure/` es la única capa que toca librerías externas, y `typeorm` solo aparece ahí y en `src/database/`.
- Controllers viven en `infrastructure/http/` (son driver adapters), no en una carpeta paralela.
- **Sin barrels**: no existe ningún `index.ts` en `src/`. Cada import apunta al archivo concreto.
- **Dentro de un módulo se importa en relativo** (`../../domain/…`); **entre módulos, solo el `<context>.module.ts` ajeno** es importable, y solo desde `infrastructure/` o la raíz del módulo.

## 2. Puertos: `abstract class`, tipo y token a la vez (obligatorio)

Un `type` se borra al compilar y no puede ser token de inyección. Una `abstract class` sobrevive: la misma referencia es el tipo del contrato **y** su token. No hay `Symbol`, no hay constante `SCREAMING_SNAKE_CASE` y **ningún consumidor necesita `@Inject`**.

```ts
// src/modules/billing/domain/ports/invoice.repository.ts
// Calca: src/modules/orders/domain/ports/order.repository.ts
import type { Invoice } from '../entities/invoice.entity';
import type { InvoiceIssued } from '../events/invoice-issued.event';
import type { InvoiceId } from '../value-objects/invoice-id.vo';

export abstract class InvoiceRepository {
  abstract findById(id: InvoiceId): Promise<Invoice | null>;
  /** Los eventos viajan en la misma llamada: la atomicidad con el outbox es del adaptador. */
  abstract save(invoice: Invoice, events: readonly InvoiceIssued[]): Promise<void>;
}
```

```ts
// src/modules/billing/billing.module.ts
// Calca: src/modules/users/users.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IssueInvoiceUseCase } from './application/use-cases/issue-invoice.use-case';
import { InvoiceRepository } from './domain/ports/invoice.repository';
import { InvoicesController } from './infrastructure/http/invoices.controller';
import { InvoiceOrmEntity } from './infrastructure/persistence/invoice.orm-entity';
import { InvoiceOutboxMessageOrmEntity } from './infrastructure/persistence/invoice-outbox-message.orm-entity';
import { InvoiceTypeOrmRepository } from './infrastructure/persistence/invoice.typeorm.repository';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceOrmEntity, InvoiceOutboxMessageOrmEntity])],
  controllers: [InvoicesController],
  providers: [
    // El token es la propia clase del puerto; quien la declare en su constructor la recibe.
    { provide: InvoiceRepository, useClass: InvoiceTypeOrmRepository },
    IssueInvoiceUseCase,
  ],
})
export class BillingModule {}
```

**Tres consecuencias, todas obligatorias:**

- **El puerto declara solo miembros `abstract` públicos** — sin campos, sin `protected`/`private`, sin constructor. Un campo o una parameter property rompe los fakes por objeto literal (`TS2741`); un constructor no rompe nada pero nunca se ejecuta (ver la siguiente), así que es código muerto. El razonamiento completo, medido, vive en el comentario de `src/modules/users/domain/ports/user.repository.ts`.
- **Los adaptadores hacen `implements`, nunca `extends`.** `implements` es lo **único** que comprueba la conformidad: en `ClassProvider<T = any>` (`@nestjs/common/interfaces/modules/provider.interface.d.ts`, 12.1.0) `provide` es un `InjectionToken` y `useClass` un `Type<T>` sin relación entre ellos, así que el `useClass` del módulo acepta cualquier clase. Medido con `tsc` 6.0.3: `{ provide: InvoiceRepository, useClass: ClaseSinElMetodo }` compila; con `implements InvoiceRepository` la misma clase da `TS2720`.
- **Nunca `import type` de un puerto en un archivo con decoradores** (casos de uso, adaptadores, módulos). La referencia se elide, la metadata no se emite y falla **en tiempo de ejecución** —`Nest can't resolve dependencies of the …UseCase (?)`— con `lint:check` y `typecheck` en verde. El bloque `no-restricted-syntax` de `eslint.config.mjs` lo prohíbe en `application/` e `infrastructure/`, en la forma `import type { … }` y en la mixta `import { X, type Puerto }`. En los fakes de test (sin decoradores) es al revés: `consistent-type-imports` **exige** `import type`.

Los `type` de datos que viajan con un puerto (`UserPage`, `FindUsersCriteria`, `CreateProfileResult`, `UserSummary`, …) sí se importan con `type` inline: `import { UserRepository, type UserPage } from '…'`. Esos nombres son una lista cerrada dentro de la regla de ESLint; un tipo de datos nuevo cuesta una línea revisada allí.

**Convención de nombres:**

- Puerto: nombre del concepto, **sin sufijo `Port`** — `InvoiceRepository`, `PasswordHasher`, `CustomerDirectory`. Archivo en `domain/ports/`: `<name>.repository.ts`, `<name>.directory.ts` o `<name>.ts`.
- Adaptador: nombre del puerto más lo que lo implementa, delante o detrás según se lea mejor, y el archivo lleva esa misma pieza:
  - `UserTypeOrmRepository` (puerto `UserRepository`) en `user.typeorm.repository.ts`;
  - `Argon2PasswordHasher` (`PasswordHasher`) en `argon2-password-hasher.ts`;
  - `NestJwtTokenSigner` (`TokenSigner`) en `nest-jwt-token-signer.ts`.

  En un adaptador ACL, lo que implementa es el contexto de origen: `UsersCustomerDirectory` (`CustomerDirectory` sobre `users`) en `users-customer.directory.ts`.

## 3. Entidades y Value Objects en TS 6.0

**Sin decoradores Nest ni de ORM dentro del dominio.** Los VOs extienden `ValueObject<T>` del kernel (`@shared/domain/value-object.base`), que aporta `protected constructor`, `equals()` y `toString()`; cada VO solo añade su validación en una factoría estática `from()` (y `generate()` para identidades). La validación lanza un error de dominio, nunca un `Error` genérico.

```ts
// src/modules/billing/domain/value-objects/invoice-amount.vo.ts
// Calca: src/modules/orders/domain/value-objects/order-amount.vo.ts
import { ValueObject } from '@shared/domain/value-object.base';

import { InvalidInvoiceAmountError } from '../errors/invoice.errors';

/** Importe en céntimos: entero y positivo, nunca flotantes. */
export class InvoiceAmount extends ValueObject<number> {
  static from(value: number): InvoiceAmount {
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidInvoiceAmountError(value);
    }
    return new InvoiceAmount(value);
  }
}
```

`ValueObject` compara con `===`: todos los VOs del repo envuelven un primitivo. Uno que envolviera un objeto tendría que sobrescribir `equals()`.

**Aggregate root:** constructor privado, una factoría que aplica las reglas de creación y otra, `rehydrate()`, que reconstituye desde persistencia sin reaplicarlas ni re-emitir eventos; `toSnapshot()` entrega primitivos al mapper. Si emite eventos, extiende `AggregateRoot<TEvent>` (`@shared/domain/aggregate-root`), que aporta `record()` (protegido) y `pullEvents()` (drena). **Si tiene transiciones que se guardan** (`issue()`, `cancel()`), lleva la `version` con la que se leyó —0 si aún no se ha guardado—: es la versión esperada del `UPDATE` condicionado del adaptador (§6). Sin ella, dos peticiones concurrentes emiten dos eventos.

```ts
// src/modules/billing/domain/entities/invoice.entity.ts
// Calca: src/modules/orders/domain/entities/order.entity.ts
import { AggregateRoot } from '@shared/domain/aggregate-root';

import { InvoiceNotDraftError } from '../errors/invoice.errors';
import { InvoiceIssued } from '../events/invoice-issued.event';
import type { InvoiceAmount } from '../value-objects/invoice-amount.vo';
import type { InvoiceId } from '../value-objects/invoice-id.vo';

export type InvoiceStatus = 'draft' | 'issued';

export type InvoiceSnapshot = {
  id: string;
  amountCents: number;
  status: InvoiceStatus;
  version: number;
};

export class Invoice extends AggregateRoot<InvoiceIssued> {
  private constructor(
    readonly id: InvoiceId,
    readonly amount: InvoiceAmount,
    private status: InvoiceStatus,
    /** La versión con la que se LEYÓ (0 = aún no guardada), no un contador: `issue()` no la toca. */
    readonly version: number,
  ) {
    super();
  }

  static draft(params: { id: InvoiceId; amount: InvoiceAmount }): Invoice {
    return new Invoice(params.id, params.amount, 'draft', 0);
  }

  /** Reconstituye desde persistencia: ni reglas de creación ni eventos, ya ocurrieron. */
  static rehydrate(params: {
    id: InvoiceId;
    amount: InvoiceAmount;
    status: InvoiceStatus;
    version: number;
  }): Invoice {
    return new Invoice(params.id, params.amount, params.status, params.version);
  }

  issue(now: Date): void {
    if (this.status !== 'draft') {
      throw new InvoiceNotDraftError(this.id.value);
    }
    this.status = 'issued';
    this.record(new InvoiceIssued(this.id.value, this.amount.value, now));
  }

  toSnapshot(): InvoiceSnapshot {
    return {
      id: this.id.value,
      amountCents: this.amount.value,
      status: this.status,
      version: this.version,
    };
  }
}
```

## 4. Casos de uso (application layer)

**Un caso de uso por archivo, con su entrada dentro.** `application/use-cases/issue-invoice.use-case.ts` contiene `IssueInvoiceUseCase` **y** su `export type IssueInvoiceInput`. No hay `commands/`, `queries/` ni `handlers/`: la entrada es la firma del caso de uso, no una pieza reutilizable, y una clase comando solo añadía un archivo y un `new` por llamada.

- Es `@Injectable()` con **un único método público, `execute(input)`** — el mismo nombre en todos.
- La entrada es un `type` plano, **nunca** una clase con `class-validator`.
- Recibe los puertos por constructor, tipados con la `abstract class` e importados como valor.
- Devuelve el agregado (o un tipo de resultado); el controller decide cómo publicarlo.

```ts
// src/modules/billing/application/use-cases/issue-invoice.use-case.ts
// Calca: src/modules/orders/application/use-cases/place-order.use-case.ts
import { Injectable } from '@nestjs/common';

import type { Invoice } from '../../domain/entities/invoice.entity';
import { InvoiceNotFoundError } from '../../domain/errors/invoice.errors';
import { InvoiceRepository } from '../../domain/ports/invoice.repository';
import { InvoiceId } from '../../domain/value-objects/invoice-id.vo';

export type IssueInvoiceInput = {
  invoiceId: string;
};

@Injectable()
export class IssueInvoiceUseCase {
  constructor(private readonly invoices: InvoiceRepository) {}

  async execute(input: IssueInvoiceInput): Promise<Invoice> {
    const invoice = await this.invoices.findById(InvoiceId.from(input.invoiceId));
    if (!invoice) {
      throw new InvoiceNotFoundError(input.invoiceId);
    }

    invoice.issue(new Date());
    await this.invoices.save(invoice, invoice.pullEvents());
    return invoice;
  }
}
```

**Sin reintento, un conflicto de versión llega al cliente** como 409 (§8), y ahí es alcanzable: dos `issue()` a la vez, y el segundo choca. Si la operación es idempotente, el caso de uso puede reintentar **una** vez releyendo, como `CancelOrderUseCase`; entonces comprueba si el 409 sigue siendo alcanzable antes de declararlo (en orders dejó de serlo: el reintento siempre relee un pedido ya cancelado).

**La fachada no es un caso de uso.** Cuando otro contexto necesita algo de este, la puerta es `application/<context>.facade.ts`, suelta fuera de `use-cases/` (ver §10). Crece por método, no por archivo.

## 5. Driver adapters (HTTP)

Controllers son adapters: el `ValidationPipe` global valida el DTO HTTP (`class-validator`), el controller construye la entrada **con campos nombrados** —`execute({ invoiceId: id })`, nunca posicionales— y traduce el resultado a un DTO de respuesta. **Nunca** tocan repositorios ni lanzan `HttpException` con reglas de negocio.

```ts
// src/modules/billing/infrastructure/http/invoices.controller.ts
// Calca: src/modules/users/infrastructure/http/users.controller.ts (que SÍ trae la documentación completa)
import { Controller, Param, Post, UseFilters } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Auth } from '@common/decorators/auth.decorator';

import { IssueInvoiceUseCase } from '../../application/use-cases/issue-invoice.use-case';

import { InvoiceResponseDto } from './dto/invoice-response.dto';
import { InvoiceDomainExceptionFilter } from './invoice-domain-exception.filter';

@ApiTags('Invoices')
@Controller('invoices')
@UseFilters(InvoiceDomainExceptionFilter)
export class InvoicesController {
  constructor(private readonly issueInvoice: IssueInvoiceUseCase) {}

  @Auth('admin')
  @Post(':id/issue')
  async issue(@Param('id') id: string): Promise<InvoiceResponseDto> {
    const invoice = await this.issueInvoice.execute({ invoiceId: id });
    return InvoiceResponseDto.fromDomain(invoice);
  }
}
```

- **La ruta no lleva versión ni prefijo.** `applyGlobals()` (`src/main.ts`) pone el prefijo global y `enableVersioning({ type: VersioningType.URI, defaultVersion })`: `@Controller('invoices')` queda en `/api/v1/invoices`.
- **⚠️ Dos rutas que puedan casar la misma petición abortan el arranque.** `NEST_APP_OPTIONS` (`src/main.ts`, compartido con `createTestApp()`) fija `routeConflictPolicy: { duplicate: 'error', shadow: 'error' }`, opción nueva de Nest 12 que por defecto vale `'off'` (`@nestjs/common/interfaces/nest-application-options.interface.d.ts`). Un `GET invoices/:id` junto a un `GET invoices/pending` hace fallar `app.init()` en cualquier orden. Si el patrón hace falta, se baja `shadow` a `'warn'` con el motivo escrito; nunca se quita la política.
- **Autenticación segura por defecto.** `JwtAuthGuard` es `APP_GUARD` global (registrado en `auth.module.ts`): sin decorador, el endpoint ya exige JWT. `@Auth()` / `@Auth('admin')` declara el rol y adjunta la documentación de 401/403; `@Public()` lo abre; `@CurrentUser()` inyecta los claims.
- **⚠️ El ejemplo omite a propósito los decoradores OpenAPI de la operación**, y así no pasaría la build: `src/bootstrap/__tests__/openapi-contract.e2e-spec.ts` recorre cada operación y exige `@ApiOperation` con `operationId`, `summary` y `description`, `@ApiEnvelope` con ejemplo, `@ApiStandardErrors()`, cada error del endpoint con ejemplo de `buildErrorExample()`, `@ApiParam`/`@ApiQuery`/`@ApiBody` con ejemplo. La tabla completa está en `CLAUDE.md`, «Endpoint documentation»; copia `UsersController`.

## 6. Driven adapters (persistencia)

**Dos modelos, nunca uno.** La entidad de dominio es una clase plana con invariantes; la entidad ORM (`<name>.orm-entity.ts`, con los decoradores de TypeORM) vive en `infrastructure/persistence/` y se descubre sola por el glob `*.orm-entity.ts`. Un mapper —objeto con `toDomain` y `toPersistence`— es el único puente: al leer usa `rehydrate`, al escribir usa `toSnapshot()`.

```ts
// src/modules/billing/infrastructure/persistence/invoice.typeorm.repository.ts
// Calca: src/modules/orders/infrastructure/persistence/order.typeorm.repository.ts
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

import type { Invoice } from '../../domain/entities/invoice.entity';
import { InvoiceVersionConflictError } from '../../domain/errors/invoice.errors';
import type { InvoiceIssued } from '../../domain/events/invoice-issued.event';
import { InvoiceRepository } from '../../domain/ports/invoice.repository';
import type { InvoiceId } from '../../domain/value-objects/invoice-id.vo';

import { InvoiceMapper } from './invoice.mapper';
import { InvoiceOrmEntity } from './invoice.orm-entity';
import { InvoiceOutboxMessageOrmEntity } from './invoice-outbox-message.orm-entity';

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code === '23505';

@Injectable()
export class InvoiceTypeOrmRepository implements InvoiceRepository {
  constructor(
    @InjectRepository(InvoiceOrmEntity)
    private readonly invoices: Repository<InvoiceOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: InvoiceId): Promise<Invoice | null> {
    const row = await this.invoices.findOne({ where: { id: id.value } });
    return row ? InvoiceMapper.toDomain(row) : null;
  }

  /**
   * Agregado y outbox en UNA transacción: si una escritura falla, no queda ninguna.
   * Concurrencia optimista: la versión 0 se INSERTA en la 1; el resto, UPDATE condicionado a la
   * versión leída. 0 filas afectadas —o un `23505` al insertar— es que otro proceso guardó antes:
   * conflicto, y lanzarlo dentro de la transacción revierte también el outbox.
   */
  async save(invoice: Invoice, events: readonly InvoiceIssued[]): Promise<void> {
    const invoiceRow = InvoiceMapper.toPersistence(invoice);
    const outboxRows = events.map((event) => {
      const row = new InvoiceOutboxMessageOrmEntity();
      row.id = randomUUID();
      row.eventType = event.constructor.name;
      row.payload = { ...event }; // el evento es plano: viaja tal cual (§7)
      row.occurredAt = event.occurredAt;
      row.processedAt = null;
      return row;
    });

    await this.dataSource.transaction(async (manager) => {
      if (invoiceRow.version === 0) {
        invoiceRow.version = 1;
        try {
          await manager.insert(InvoiceOrmEntity, invoiceRow);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new InvoiceVersionConflictError(invoiceRow.id);
          }
          throw error;
        }
      } else {
        // Solo lo mutable, y solo si la fila sigue en la versión que se leyó.
        const result = await manager.update(
          InvoiceOrmEntity,
          { id: invoiceRow.id, version: invoiceRow.version },
          { status: invoiceRow.status, version: invoiceRow.version + 1 },
        );
        if (result.affected !== 1) {
          throw new InvoiceVersionConflictError(invoiceRow.id);
        }
      }
      await manager.save(outboxRows);
    });
  }
}
```

- El puerto se importa **como valor** aunque solo aparezca en el `implements` (regla de §2); las entidades, eventos y VOs usados solo como tipo, con `import type`.
- **Nunca `manager.save()` para el agregado**: es un upsert, y un id duplicado sobrescribiría en silencio en vez de fallar. `version` es una columna normal y no un `@VersionColumn`, que la incrementaría sin comprobar nada: la comprobación es el `WHERE version = …`.
- **Depende de READ COMMITTED.** El `UPDATE` que espera el bloqueo de la fila re-evalúa su `WHERE` sobre la fila ya confirmada y afecta 0 filas; en REPEATABLE READ recibiría un `40001`. Un test de concurrencia tiene que **demostrar el intercalado**, no esperarlo: `order.typeorm.repository.e2e-spec.ts` bloquea la fila desde otra conexión, espera a ver el guardado bloqueado en `pg_blocking_pids` y solo entonces confirma. Dos `save` lanzados a la vez con `Promise.all` casi nunca se intercalan y el test pasa igual sin la protección.
- **Los errores del driver se traducen aquí.** `UserTypeOrmRepository.save()` convierte el `23505` de PostgreSQL en `EmailAlreadyTakenError`: sin eso, una inserción concurrente saldría como 500 en vez del 409 del contrato. El pre-check del caso de uso es una cortesía, no la defensa.
- **Cambios de esquema, por migración**: `pnpm migration:generate src/database/migrations/<Name>` tras tocar una entidad ORM. Un `DROP`/rename se parte en expand/contract (`CLAUDE.md`, «Destructive migrations»).

## 7. Eventos de dominio

Los eventos viven en `domain/events/` como clases planas con datos primitivos (más `Date`, que serializa a ISO): el payload viaja tal cual a la fila del outbox, sin mapper intermedio.

```ts
// src/modules/billing/domain/events/invoice-issued.event.ts
// Calca: src/modules/orders/domain/events/order-placed.event.ts
export class InvoiceIssued {
  constructor(
    readonly invoiceId: string,
    readonly amountCents: number,
    readonly occurredAt: Date,
  ) {}
}
```

El flujo es el de `orders`, y no hay bus en memoria (`@nestjs/event-emitter` y `@nestjs/cqrs` no están instalados):

1. El agregado **registra** el evento con `record()` (§3); nunca lo publica.
2. El caso de uso **drena** con `pullEvents()` y lo entrega al repositorio **en la misma llamada**, `save(aggregate, events)` (§4).
3. El adaptador escribe agregado y filas de outbox **en una sola `dataSource.transaction`** (§6). Cada contexto es dueño de su tabla de outbox (`orders_outbox`).
4. Un relay CLI publica las filas pendientes y las marca, at-least-once: `pnpm outbox:relay`, en `src/database/outbox/` (un módulo no puede importar `database`, por eso vive allí).

## 8. Errores de dominio

Cada contexto tiene una jerarquía en `domain/errors/<aggregate>.errors.ts`: una base abstracta y errores concretos que guardan el dato ofensor. **No heredan de `HttpException` ni conocen códigos HTTP.**

```ts
// src/modules/billing/domain/errors/invoice.errors.ts
// Calca: src/modules/users/domain/errors/user.errors.ts
export abstract class InvoiceDomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvoiceNotFoundError extends InvoiceDomainError {
  constructor(readonly invoiceId: string) {
    super(`Invoice ${invoiceId} was not found`);
  }
}

export class InvoiceNotDraftError extends InvoiceDomainError {
  constructor(readonly invoiceId: string) {
    super(`Invoice ${invoiceId} is not a draft`);
  }
}

export class InvalidInvoiceAmountError extends InvoiceDomainError {
  constructor(readonly value: number) {
    super(`${value} is not a valid invoice amount in cents`);
  }
}

/** Lo lanza el adaptador (§6) cuando la fila ya no está en la versión con la que se leyó. */
export class InvoiceVersionConflictError extends InvoiceDomainError {
  constructor(readonly invoiceId: string) {
    super(`Invoice ${invoiceId} was modified concurrently, retry the request`);
  }
}
```

La traducción a HTTP es de un filtro **del propio contexto**, en `infrastructure/http/`, aplicado con `@UseFilters` en su controller (§5). Relanza una excepción de Nest y el `AllExceptionsFilter` global (`APP_FILTER` en `app.module.ts`) da forma a la respuesta.

```ts
// src/modules/billing/infrastructure/http/invoice-domain-exception.filter.ts
// Calca: src/modules/users/infrastructure/http/user-domain-exception.filter.ts
import {
  BadRequestException,
  Catch,
  ConflictException,
  NotFoundException,
  type ExceptionFilter,
} from '@nestjs/common';

import {
  InvoiceDomainError,
  InvoiceNotDraftError,
  InvoiceNotFoundError,
  InvoiceVersionConflictError,
} from '../../domain/errors/invoice.errors';

@Catch(InvoiceDomainError)
export class InvoiceDomainExceptionFilter implements ExceptionFilter {
  catch(exception: InvoiceDomainError): never {
    if (exception instanceof InvoiceNotFoundError) {
      throw new NotFoundException(exception.message);
    }
    if (
      exception instanceof InvoiceNotDraftError ||
      exception instanceof InvoiceVersionConflictError
    ) {
      throw new ConflictException(exception.message);
    }
    // Un error de dominio sin mapeo explícito es entrada inválida, no fallo del servidor.
    throw new BadRequestException(exception.message);
  }
}
```

- **Construye la excepción de Nest con un string, no con un objeto.** Medido con `@nestjs/common` 12.1.0: `new NotFoundException('…').getResponse()` da `{ message, error: 'Not Found', statusCode: 404 }`, con el nombre canónico que `buildErrorExample()` deriva del status; con un objeto, el cuerpo es ese objeto tal cual y `error` desaparece. El nombre de la clase de dominio nunca llega al cliente.
- Nunca se importa `HttpException` (ni sus subclases) en `domain/` ni en `application/`.
- **Entre contextos no viajan excepciones**: un módulo no puede importar los errores de otro, así que la fachada devuelve un resultado (`{ ok: false, reason: 'email-taken' }`) y el consumidor lo traduce a un error suyo (§10).

## 9. Tests por capa

| Capa                          | Tipo               | Herramienta                                                 | Qué prueba                                                                             |
| ----------------------------- | ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Domain                        | Unitario puro      | Jest, sin mocks                                             | Invariantes de entidades y VOs                                                         |
| Application                   | Unitario con fakes | Jest + fakes in-memory escritos a mano                      | Casos de uso contra puertos fake                                                       |
| Infrastructure (traducción)   | Unitario           | Jest, sin base (PBT en los round-trips de mapper)           | Mappers, filtros de dominio, controllers, guards, DTOs, adaptadores ACL y de seguridad |
| Infrastructure (persistencia) | Integración        | Jest contra PostgreSQL real (base de test, `pnpm test:e2e`) | Repositorios TypeORM (`*.typeorm.repository.e2e-spec.ts`)                              |
| HTTP                          | E2E                | Jest + Supertest sobre el `AppModule` real                  | Endpoint completo: pipes, guard, filtros, base                                         |

**Importante:** los tests de dominio no levantan `Test.createTestingModule`. Son `Invoice.draft(...)` puro.

**En `infrastructure/` la base la pide lo que toca el SUT, no la carpeta.** De los 18 specs que hay hoy bajo `__tests__/infrastructure/` de los tres contextos, solo los 3 `*.typeorm.repository.e2e-spec.ts` corren en `pnpm test:e2e`. Los otros 15 son `*.spec.ts` de `pnpm test` y no abren conexión: mappers, filtros, controllers, guard, DTO, hasher, signer y adaptadores ACL.

**Convenciones de archivo y mocking** se rigen por el skill `javascript-typescript-jest`:

- **Ubicación:** en `src/modules/<context>/__tests__/`, espejo de la estructura del módulo y **1:1** con el archivo fuente (`domain/entities/invoice.entity.ts` ↔ `__tests__/domain/entities/invoice.entity.spec.ts`). Los puertos (`domain/ports/`, clases abstractas sin lógica) quedan exentos; los errores y los eventos no. El SUT se importa en relativo.
- **Unit:** `*.spec.ts`. **E2E:** `*.e2e-spec.ts` dentro del mismo `__tests__/` — el del contexto (`__tests__/<context>.e2e-spec.ts`) arranca la app con `createTestApp()` de `@test/helpers/create-test-app`; el de un repositorio vive en `__tests__/infrastructure/persistence/<name>.typeorm.repository.e2e-spec.ts`.
- **Ejecución:** siempre `pnpm test <ruta>` y `pnpm test:e2e` (§0). El E2E corre contra la base de test que fija `test/setup-env.ts` (no la de desarrollo), necesita PostgreSQL arriba y hace `TRUNCATE` en cada `beforeEach`.
- **Domain:** cero mocks. Si el test parece necesitar uno, el diseño leakea infra al dominio.
- **Application:** fakes escritos a mano de los puertos en `__tests__/helpers/` (p. ej. `in-memory-user.repository.ts`, que hace `implements UserRepository` con `import type`); nunca `jest.mock` contra rutas de módulo.
- **Infrastructure:** sin base todo lo que solo traduce:
  - el mapper, con un round-trip PBT (`user.mapper.spec.ts`);
  - el filtro, con errores de dominio reales y la excepción de Nest esperada (`user-domain-exception.filter.spec.ts`);
  - el controller, con sus casos de uso reales sobre los fakes (`users.controller.spec.ts`);
  - el adaptador ACL, con la puerta ajena como objeto literal (`users-customer.directory.spec.ts`).

  Base real solo para repositorios. Nunca `jest.mock('typeorm')`.

- AAA explícito (`// Arrange / // Act / // Assert`) y `it` en español empezando por `debería…` son obligatorios.

**Property-based testing (PBT) con `fast-check` + `@fast-check/jest`** — los invariantes de dominio (importe siempre positivo, `issue` solo desde `draft`) y el round-trip del mapper en infraestructura son el caso ideal. Las arbitrarias se **construyen**, nunca se `.filter()`-an sobre `fc.string()`. Ver la subsección «Property-based testing» del skill `javascript-typescript-jest`.

**La mutación es gate**: `pnpm test:mutation --mutate "src/modules/<context>/…"` y `thresholds.break` en `stryker.config.mjs`. Un módulo nuevo sin casos no entra en silencio.

## 10. Composición entre contextos

- **El `<context>.module.ts` es la única superficie pública.** Exporta al contenedor solo sus puertas (`exports: [UsersLookup, UsersProvisioning]`) y las **reexporta como símbolo TS** (`export { UsersLookup, UsersProvisioning } from './application/users.facade'`). Nunca exporta el repositorio, los casos de uso ni la clase que implementa la fachada.
- **Puertas segregadas por intención.** Una sola implementación (`UsersFacadeImpl`) detrás de varios tokens con `useExisting` —con dos `useClass` habría dos instancias—. Quien solo consulta inyecta `UsersLookup` y no puede llamar a `deleteProfile` porque el tipo que recibe no lo declara.
- **El consumidor define su propio puerto** (`orders/domain/ports/customer.directory.ts`) y lo implementa un adaptador ACL en su `infrastructure/` (`users-customer.directory.ts`), que inyecta la puerta importada del module file ajeno. El módulo consumidor importa el módulo ajeno en `imports`.
- **Las puertas devuelven primitivos o resultados, nunca el agregado** ni excepciones de negocio.
- **Dirección única.** `auth → users` y `orders → users`; si `users` importara a quien lo consume nacería un ciclo. Lo compartido por varios (`@Public`, `@Auth`, `@CurrentUser`, `AuthenticatedUser`) vive en `common/`.
- **Guard global desde un módulo.** `APP_GUARD` es multi-provider: `auth.module.ts` lo registra y protege toda la app sin que `AppModule` importe internos de ningún módulo.
- El root `AppModule` solo importa los módulos de contexto y la configuración global; no contiene lógica.
- Para multi-tenant request-scoped, `Scope.REQUEST` con **durable providers** (`durable?: boolean` sigue en las opciones de provider de `@nestjs/common` 12.1.0; regla `di-durable-providers` del skill nestjs-best-practices). Hoy ningún contexto lo necesita.

## 11. Checklist al diseñar un nuevo módulo

- [ ] Defino el aggregate root y sus VOs antes de pensar en endpoints
- [ ] Cada puerto es una `abstract class` en `domain/ports/`, solo con miembros `abstract` públicos
- [ ] Cada adaptador hace `implements` del puerto y se cablea con `{ provide: Puerto, useClass: Adaptador }`
- [ ] Ningún archivo con decoradores importa un puerto con `import type`
- [ ] Un caso de uso por archivo en `application/use-cases/`, con su `…Input` y un único `execute()`
- [ ] El controller vive en `infrastructure/http/`, llama a `execute({ … })` y lleva la documentación OpenAPI completa
- [ ] La entidad ORM y el mapper viven en `infrastructure/persistence/`; el dominio no tiene decoradores
- [ ] Errores de dominio tipados, traducidos por el filtro del contexto con excepciones construidas con string
- [ ] Tests en `__tests__/` espejo, 1:1; dominio puro, aplicación con fakes, repositorios contra PostgreSQL
- [ ] Ningún archivo de `domain/` importa de `@nestjs/*` ni de `infrastructure/`
- [ ] El módulo está en `imports` de `AppModule`, su scope en `commitlint.config.cjs` y, si hay tablas, su migración generada
