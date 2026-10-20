# Mapeo Hexagonal/DDD → NestJS 12 + TS 6.0

Concreción de los conceptos genéricos del skill al stack del proyecto: **NestJS 12, TypeScript 6.0, Node 24, pnpm, SWC, Pino, Zod, class-validator, TypeORM, Jest**. Las versiones exactas no se repiten aquí porque envejecen con cada bump: mandan la línea «Stack» de `CLAUDE.md`, `package.json` (dependencias y `engines.node`), `.nvmrc` y `packageManager`.

> Esta referencia complementa `LAYERS.md`, `DDD-TACTICAL.md` y `HEXAGONAL.md`. Cuando el `SKILL.md` u otra referencia describa un concepto en pseudocódigo, este archivo es la fuente de verdad para cómo escribirlo en este repo. **La implementación de referencia es `src/modules/users/`**: ante la duda, copia su forma. Los ejemplos de abajo usan un contexto hipotético `billing` con la forma exacta de `users` y `orders`; cada bloque indica qué archivo real calca.

> **Convención obligatoria — `type`, nunca `interface`.** El ESLint del repo aplica `@typescript-eslint/consistent-type-definitions: ['error', 'type']`. Los demás archivos de `references/` usan `interface` porque son teoría agnóstica del lenguaje; **en código real de este repo eso rompe `pnpm lint:check`**. Datos, entradas de casos de uso y DTOs planos se declaran como `export type X = { … };`. **Los puertos son la excepción: `abstract class`** (§2), porque tienen que sobrevivir a la compilación para servir de token de inyección.

## 0. Qué cambia NestJS 12 para este mapeo

- **Todos los `@nestjs/*` 12.x son solo ESM** (`"type": "module"` en su `package.json`; `@nestjs/throttler` 6.x sigue en CJS). El repo **sigue siendo CommonJS**: SWC compila a CJS y Node carga esos paquetes con `require(esm)`, sin flag desde 20.19 / 22.12 — el suelo que la guía oficial fija para ejecutar Nest 12 (https://docs.nestjs.com/migration-guide). El repo va más allá y fija Node 24 (`.nvmrc`, `engines.node`) — entre otros motivos, porque Jest solo carga los paquetes ESM de v12 desde Node 24.9 (misma guía).
- **Los tests se lanzan siempre por los scripts `pnpm test*`**, que arrancan Jest con `node --experimental-vm-modules` (ver `package.json` y `jest.config.mjs`). Un `npx jest` a secas muere con `Must use import to load ES Module` (medición en `docs/toolchain.md`).
- **La forma del código no cambia.** Una `abstract class` sigue siendo un token válido — `InjectionToken = string | symbol | Type<T> | Abstract<T> | Function` en `@nestjs/common/interfaces/modules/injection-token.interface.d.ts` (12.1.0) — y SWC sigue emitiendo `design:paramtypes`, así que los puertos de §2 se inyectan sin `@Inject`.
- **Importa siempre desde la raíz del paquete** (`@nestjs/common`, `@nestjs/core`, …), nunca desde una subruta. El mapa `exports` de `@nestjs/common` 12.1.0 (`"./*": "./*.js"`) deja resolver rutas internas, pero lo que no reexporta `index.d.ts` no es API pública — `CorsOptions`, por ejemplo, no sale por la raíz.
- **Un hook de apagado que falla ya no hace fallar `app.close()`.** `onModuleDestroy`, `beforeApplicationShutdown` y `onApplicationShutdown` corren con `Promise.allSettled` (`@nestjs/core/hooks/*.hook.js`): el rechazo se registra y el apagado sigue. Un adaptador que cierre una conexión en su hook no puede contar con que un fallo suyo se propague.

## 1. Estructura de carpetas (obligatoria)

Cada bounded context vive bajo `src/modules/<context>/` con sus capas **dentro** y respeta la regla de dependencia hacia adentro. Hoy hay tres —`users`, `auth`, `orders`— más `health`, que es plano.

```
src/
├── main.ts                        # Proceso: applyGlobals(), listen y apagado
├── app.module.ts                  # Importa los módulos de contexto y la config global; sin lógica
├── __tests__/                     # Tests de arquitectura: contrato de módulo, fronteras, idioma
├── bootstrap/                     # Documento OpenAPI y UI de Scalar
├── common/                        # Cross-cutting: filters (con la base DomainExceptionFilter), interceptors, decorators, dto, auth, logger, persistence (failClosed)
├── config/                        # Configuración validada con Zod (registerAs)
├── database/                      # DataSource, migraciones, seeds, relay del outbox
├── shared/domain/                 # Kernel compartido: DomainError, Entity, AggregateRoot, UuidIdentifier, ValueObject
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
        │   ├── http/<context>-domain-exception.filter.ts   # uno por contexto
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
- `application/` puede usar `@nestjs/common` para DI (`@Injectable`), pero **no** `typeorm`, `axios`, `argon2` ni `@nestjs/jwt`. Tampoco `class-validator`: la validación de transporte es del DTO HTTP. Desde el 2026-10-01 la regla 2 del gate de boundaries también la aplica a `application/` (`eslint.boundaries.js`, con su caso en `eslint-boundaries.spec.ts`).
- `infrastructure/` es la única capa que toca librerías externas, y `typeorm` solo aparece ahí y en `src/database/`.
- Controllers viven en `infrastructure/http/` (son driver adapters), no en una carpeta paralela.
- **Sin barrels**: no existe ningún `index.ts` en `src/`. Cada import apunta al archivo concreto.
- **Dentro de un módulo se importa en relativo** (`../../domain/…`); **entre módulos, solo el `<context>.module.ts` ajeno** es importable, y solo desde `infrastructure/` o la raíz del módulo.
- **La forma del contexto la verifica `src/__tests__/module-contract.spec.ts`** sobre todo `src/modules/*`, salvo la lista cerrada `FLAT_MODULES` (`health`): las cuatro carpetas y el module file, la raíz de errores sobre `DomainError`, el filtro `<context>-domain-exception.filter.ts` sobre `DomainExceptionFilter` y aplicado con `@UseFilters` en cada controller, las entidades sobre `Entity` o `AggregateRoot`, los VOs sobre `ValueObject` o `UuidIdentifier`, la forma de los casos de uso, los sufijos y las entidades ORM sin relaciones ni columnas que rellene TypeORM. Un módulo copiado de esta referencia lo pasa en cuanto tiene sus tests (`structure` pide un `.ts` en `__tests__/`), y compila: lo verifica `src/__tests__/nestjs-mapping.spec.ts`, que extrae los bloques `billing` de este documento, los pasa por el contrato y los compila con el `tsconfig.json` del repo contra el kernel y `common/` reales. ESLint y Prettier no pasan por ellos. El porqué de cada clave está en `docs/architecture.md`, «El contrato de módulo».

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

**Sin decoradores Nest ni de ORM dentro del dominio.** Los VOs extienden `ValueObject<T>` del kernel (`@shared/domain/value-object.base`), que aporta `protected constructor`, `equals()` y `toString()`; cada VO solo añade su validación en una factoría estática `from()`. La validación lanza un error de dominio, nunca un `Error` genérico. Ningún VO declara un constructor público.

**Las identidades extienden `UuidIdentifier<'<Clase>'>`** (`@shared/domain/uuid-identifier.base`), y la marca es el nombre de la clase: con ella, un `OrderId` ya no entra donde se espera un `UserId`, y el test de contrato comprueba que nadie copie la marca de otro id. La base normaliza a minúsculas y ofrece dos helpers protegidos, `isUuidV4` y `newUuid`; con ellos cada id escribe su propio `from()`, que lanza el error de **su** contexto, y su `generate()`. El id de una entidad de otro contexto (`Order.customerId`) es un `string`, porque ningún módulo puede importar el id de otro.

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

```ts
// src/modules/billing/domain/value-objects/invoice-id.vo.ts
// Calca: src/modules/orders/domain/value-objects/order-id.vo.ts
import { UuidIdentifier } from '@shared/domain/uuid-identifier.base';

import { InvalidInvoiceIdError } from '../errors/invoice.errors';

export class InvoiceId extends UuidIdentifier<'InvoiceId'> {
  static generate(): InvoiceId {
    return new InvoiceId(UuidIdentifier.newUuid());
  }

  static from(value: string): InvoiceId {
    if (!UuidIdentifier.isUuidV4(value)) {
      throw new InvalidInvoiceIdError(value);
    }
    return new InvoiceId(value);
  }
}
```

Los estados posibles son una constante y la unión que se deriva de ella, en una sola fuente: la leen la entidad, el mapper que los valida al leer y el DTO que los publica en OpenAPI.

```ts
// src/modules/billing/domain/value-objects/invoice-status.ts
// Calca: src/modules/orders/domain/value-objects/order-status.ts
/** Ciclo de vida de la factura. Unión y no enum, con el mismo patrón que `ORDER_STATUSES`. */
export const INVOICE_STATUSES = ['draft', 'issued'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
```

`ValueObject` compara con `===`: todos los VOs del repo envuelven un primitivo. Uno que envolviera un objeto tendría que sobrescribir `equals()`.

**Toda entidad extiende `Entity<TId>`** (`@shared/domain/entity.base`): su constructor protegido recibe `BaseEntityProps<TId>` —`{ id, createdAt, updatedAt }`— y aporta `id`, `createdAt`, el getter `updatedAt`, `touch(now)` (protegido) y `equals()`, que compara la clase y después el id. **Si emite eventos, extiende `AggregateRoot<TId, TEvent>`** (`@shared/domain/aggregate-root`), una `Entity` que además aporta `record()` (protegido) y `pullEvents()` (drena). Nada de props-bag: el resto del estado vive en los campos privados de cada entidad, que solo cambian sus métodos de intención.

**Aggregate root:** constructor privado `(base: BaseEntityProps<XId>, …estado propio)` que llama a `super(base)`, una factoría que aplica las reglas de creación y otra, `rehydrate()`, que reconstituye desde persistencia sin reaplicarlas ni re-emitir eventos; `toSnapshot()` entrega primitivos al mapper. **Nunca redeclara `id`, `createdAt` ni `updatedAt`**: un campo redeclarado no compila, pero una parameter property redeclarada sí, sin aviso, y dejaría dos fuentes de verdad. La factoría de creación sella `createdAt = updatedAt = now`, y cada método de intención llama a `touch(now)` **después** de su guarda, de modo que lo que no cambia nada no mueve la fecha. **Si tiene transiciones que se guardan** (`issue()`, `cancel()`), lleva la `version` con la que se leyó —0 si aún no se ha guardado—: es la versión esperada del `UPDATE` condicionado del adaptador (§6). Sin ella, dos peticiones concurrentes emiten dos eventos.

```ts
// src/modules/billing/domain/entities/invoice.entity.ts
// Calca: src/modules/orders/domain/entities/order.entity.ts
import { AggregateRoot } from '@shared/domain/aggregate-root';
import type { BaseEntityProps } from '@shared/domain/entity.base';

import { InvoiceNotDraftError } from '../errors/invoice.errors';
import { InvoiceIssued } from '../events/invoice-issued.event';
import type { InvoiceAmount } from '../value-objects/invoice-amount.vo';
import type { InvoiceId } from '../value-objects/invoice-id.vo';
import type { InvoiceStatus } from '../value-objects/invoice-status';

export type InvoiceSnapshot = {
  id: string;
  amountCents: number;
  createdAt: Date;
  updatedAt: Date;
  status: InvoiceStatus;
  version: number;
};

export class Invoice extends AggregateRoot<InvoiceId, InvoiceIssued> {
  private constructor(
    base: BaseEntityProps<InvoiceId>,
    readonly amount: InvoiceAmount,
    private status: InvoiceStatus,
    /** La versión con la que se LEYÓ (0 = aún no guardada), no un contador: `issue()` no la toca. */
    readonly version: number,
  ) {
    super(base);
  }

  static draft(params: { id: InvoiceId; amount: InvoiceAmount; now: Date }): Invoice {
    return new Invoice(
      { id: params.id, createdAt: params.now, updatedAt: params.now },
      params.amount,
      'draft',
      0,
    );
  }

  /** Reconstituye desde persistencia: ni reglas de creación ni eventos, ya ocurrieron. */
  static rehydrate(params: {
    id: InvoiceId;
    amount: InvoiceAmount;
    createdAt: Date;
    updatedAt: Date;
    status: InvoiceStatus;
    version: number;
  }): Invoice {
    return new Invoice(
      { id: params.id, createdAt: params.createdAt, updatedAt: params.updatedAt },
      params.amount,
      params.status,
      params.version,
    );
  }

  issue(now: Date): void {
    if (this.status !== 'draft') {
      throw new InvoiceNotDraftError(this.id.value);
    }
    this.status = 'issued';
    this.touch(now);
    this.record(new InvoiceIssued(this.id.value, this.amount.value, now));
  }

  toSnapshot(): InvoiceSnapshot {
    return {
      id: this.id.value,
      amountCents: this.amount.value,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
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

import { BillingDomainExceptionFilter } from './billing-domain-exception.filter';
import { InvoiceResponseDto } from './dto/invoice-response.dto';

@ApiTags('Invoices')
@Controller('invoices')
@UseFilters(BillingDomainExceptionFilter)
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

El DTO de respuesta es el único que se serializa: el agregado nunca sale tal cual. Lleva un `@ApiProperty` por campo, con su ejemplo, y construye la respuesta desde `toSnapshot()`.

```ts
// src/modules/billing/infrastructure/http/dto/invoice-response.dto.ts
// Calca: src/modules/orders/infrastructure/http/dto/order-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

import type { Invoice } from '../../../domain/entities/invoice.entity';
import { INVOICE_STATUSES, type InvoiceStatus } from '../../../domain/value-objects/invoice-status';

export class InvoiceResponseDto {
  @ApiProperty({
    description: 'Identificador de la factura.',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({ description: 'Importe en céntimos.', example: 149_900 })
  amountCents!: number;

  @ApiProperty({
    description: 'Estado de la factura. Una factura `issued` no vuelve a `draft`.',
    enum: [...INVOICE_STATUSES],
    example: 'issued',
  })
  status!: InvoiceStatus;

  // `type: String` + `format` explícitos: el tipo de diseño de un `Date` no basta para el esquema.
  @ApiProperty({
    description: 'Momento en que se creó el borrador, en UTC.',
    example: '2026-08-01T10:15:00.000Z',
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Última modificación, en UTC: al emitirla, el instante de la emisión.',
    example: '2026-08-01T12:30:00.000Z',
    type: String,
    format: 'date-time',
  })
  updatedAt!: Date;

  /** El dominio nunca se serializa directamente: siempre pasa por este DTO. */
  static fromDomain(invoice: Invoice): InvoiceResponseDto {
    const snapshot = invoice.toSnapshot();
    const dto = new InvoiceResponseDto();
    dto.id = snapshot.id;
    dto.amountCents = snapshot.amountCents;
    dto.status = snapshot.status;
    dto.createdAt = snapshot.createdAt;
    dto.updatedAt = snapshot.updatedAt;
    return dto;
  }
}
```

- **La ruta no lleva versión ni prefijo.** `applyGlobals()` (`src/main.ts`) pone el prefijo global y `enableVersioning({ type: VersioningType.URI, defaultVersion })`: `@Controller('invoices')` queda en `/api/v1/invoices`.
- **⚠️ Dos rutas que puedan casar la misma petición abortan el arranque.** `NEST_APP_OPTIONS` (`src/main.ts`, compartido con `createTestApp()`) fija `routeConflictPolicy: { duplicate: 'error', shadow: 'error' }`, opción nueva de Nest 12 que por defecto vale `'off'` (`@nestjs/common/interfaces/nest-application-options.interface.d.ts`). Un `GET invoices/:id` junto a un `GET invoices/pending` hace fallar `app.init()` en cualquier orden. Si el patrón hace falta, se baja `shadow` a `'warn'` con el motivo escrito; nunca se quita la política.
- **Autenticación segura por defecto.** `JwtAuthGuard` es `APP_GUARD` global (registrado en `auth.module.ts`): sin decorador, el endpoint ya exige JWT. `@Auth()` / `@Auth('admin')` declara el rol y adjunta la documentación de 401/403; `@Public()` lo abre; `@CurrentUser()` inyecta los claims.
- **⚠️ El ejemplo omite a propósito los decoradores OpenAPI de la operación**, y así no pasaría la build: `src/bootstrap/__tests__/openapi-contract.e2e-spec.ts` recorre cada operación y exige `@ApiOperation` con `operationId`, `summary` y `description`, `@ApiEnvelope` con ejemplo, `@ApiStandardErrors()`, cada error del endpoint con ejemplo de `buildErrorExample()`, `@ApiParam`/`@ApiQuery`/`@ApiBody` con ejemplo. La lista completa está en `CLAUDE.md`, «Endpoint documentation»; copia `UsersController`. En el `example` del sobre, el `request` se construye con `buildRequestMetaExample(path)` (`@common/dto/example-meta.factory`) y cada error con `buildErrorExample()`: los literales comunes (`timestamp`, `requestId`) tienen una sola fuente.

## 6. Driven adapters (persistencia)

**Dos modelos, nunca uno.** La entidad de dominio es una clase plana con invariantes; la entidad ORM (`<name>.orm-entity.ts`, con los decoradores de TypeORM) vive en `infrastructure/persistence/` y se descubre sola por el glob `*.orm-entity.ts`. Un mapper —objeto con `toDomain` y `toPersistence`— es el único puente: al leer usa `rehydrate`, al escribir usa `toSnapshot()`.

**El mapper falla cerrado.** Envuelve `rehydrate` en `failClosed(rebuild, isDomainError, describe)` (`@common/persistence/fail-closed`): una fila que los VOs de hoy rechazan es un dato corrupto, no una entrada inválida, y como error de dominio el filtro del contexto la publicaría como 400 con el valor dentro. `failClosed` la convierte en un `Error` con el original como `cause`, que el filtro global responde con un 500. La excepción es un contexto cuyo filtro ya sanea ese error en un 500 propio (`auth`, con `InvalidCredentialIdError`): ahí `failClosed` dejaría ver el mensaje en el cuerpo en development y test. Calca: `src/modules/users/infrastructure/persistence/user.mapper.ts`.

**El dominio es el dueño de las fechas.** Las columnas de fecha son `@Column({ type: 'timestamptz', default: () => 'now()' })`; ninguna entidad ORM usa `CreateDateColumn`, `UpdateDateColumn`, `DeleteDateColumn` ni `VersionColumn`, que TypeORM rellena por su cuenta (un `UpdateDateColumn` taparía un `touch()` olvidado). Tampoco decoradores de relación (`ManyToOne`, `OneToMany`, `JoinColumn`…): el esquema no tiene claves foráneas, para que los contextos puedan dejar de compartir base. Las dos prohibiciones las verifican las claves `orm-managed-columns` y `orm-relations` del test de contrato.

```ts
// src/modules/billing/infrastructure/persistence/invoice.orm-entity.ts
// Calca: src/modules/orders/infrastructure/persistence/order.orm-entity.ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'invoices' })
export class InvoiceOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  // Las sella el dominio y el adaptador las escribe siempre: el DEFAULT solo cubre un INSERT
  // que no las nombre.
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;
}
```

El outbox es del contexto: tabla propia, `billing_outbox`, y su entidad ORM vive aquí, no en un genérico compartido (§7).

```ts
// src/modules/billing/infrastructure/persistence/invoice-outbox-message.orm-entity.ts
// Calca: src/modules/orders/infrastructure/persistence/outbox-message.orm-entity.ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Sin FK a `invoices`: la fila es autosuficiente (el payload lleva todo) y el relay no necesita join. */
@Entity({ name: 'billing_outbox' })
export class InvoiceOutboxMessageOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 120 })
  eventType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
```

```ts
// src/modules/billing/infrastructure/persistence/invoice.mapper.ts
// Calca: src/modules/orders/infrastructure/persistence/order.mapper.ts
import { failClosed } from '@common/persistence/fail-closed';

import { Invoice } from '../../domain/entities/invoice.entity';
import { InvoiceDomainError } from '../../domain/errors/invoice.errors';
import { InvoiceAmount } from '../../domain/value-objects/invoice-amount.vo';
import { InvoiceId } from '../../domain/value-objects/invoice-id.vo';
import { INVOICE_STATUSES, type InvoiceStatus } from '../../domain/value-objects/invoice-status';

import { InvoiceOrmEntity } from './invoice.orm-entity';

const isInvoiceStatus = (value: string): value is InvoiceStatus =>
  (INVOICE_STATUSES as readonly string[]).includes(value);

// Predicado local y no exportado desde `invoice.errors.ts`: ese archivo solo puede exportar clases
// (clave `errors` del test de contrato de módulo).
const isInvoiceDomainError = (error: unknown): error is InvoiceDomainError =>
  error instanceof InvoiceDomainError;

/**
 * La columna tiene `DEFAULT 1` pero ningún `CHECK`. Una fila con versión 0 —que solo puede venir
 * de fuera del código: un arreglo a mano, un backfill— haría que el adaptador tomara la factura
 * por una sin guardar: su `save` iría por el INSERT, chocaría con su propio id y respondería un
 * 409 en cada intento, sin forma de emitirla nunca.
 */
const readVersion = (row: InvoiceOrmEntity): number => {
  if (row.version < 1) {
    throw new Error(
      `La factura ${row.id} tiene una versión imposible para una fila guardada: ${row.version}`,
    );
  }
  return row.version;
};

/**
 * Única frontera entre la fila y el agregado: `rehydrate` al leer, que no re-emite eventos, y
 * `toSnapshot()` al escribir. Falla cerrado: un `status` que este código no conoce (la columna es
 * un `varchar` sin `CHECK`), una `version` menor que 1 o una fila que los VOs de hoy rechazan es
 * un dato corrupto, y sale como 500, nunca como un 400 con el valor dentro.
 */
export const InvoiceMapper = {
  toDomain(row: InvoiceOrmEntity): Invoice {
    const { status } = row;
    if (!isInvoiceStatus(status)) {
      throw new Error(`La factura ${row.id} tiene un estado desconocido: "${status}"`);
    }
    const version = readVersion(row);
    return failClosed(
      () =>
        Invoice.rehydrate({
          id: InvoiceId.from(row.id),
          amount: InvoiceAmount.from(row.amountCents),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          status,
          version,
        }),
      isInvoiceDomainError,
      (error) => `La factura ${row.id} tiene datos que el dominio rechaza: ${error.message}`,
    );
  },

  toPersistence(invoice: Invoice): InvoiceOrmEntity {
    const snapshot = invoice.toSnapshot();
    const row = new InvoiceOrmEntity();
    row.id = snapshot.id;
    row.amountCents = snapshot.amountCents;
    row.createdAt = snapshot.createdAt;
    row.updatedAt = snapshot.updatedAt;
    row.status = snapshot.status;
    row.version = snapshot.version;
    return row;
  },
};
```

```ts
// src/modules/billing/infrastructure/persistence/invoice.typeorm.repository.ts
// Calca: src/modules/orders/infrastructure/persistence/order.typeorm.repository.ts
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository, type QueryDeepPartialEntity } from 'typeorm';

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
    const outboxRows = events.map(
      (event): QueryDeepPartialEntity<InvoiceOutboxMessageOrmEntity> => ({
        id: randomUUID(),
        eventType: event.constructor.name,
        payload: { ...event }, // el evento es plano: viaja tal cual (§7)
        occurredAt: event.occurredAt,
        processedAt: null,
      }),
    );

    // El nivel va explícito: el conflicto de abajo solo existe en READ COMMITTED.
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
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
        // Solo lo mutable, con el `updatedAt` que selló el dominio, y solo si la fila sigue en
        // la versión que se leyó.
        const result = await manager.update(
          InvoiceOrmEntity,
          { id: invoiceRow.id, version: invoiceRow.version },
          {
            status: invoiceRow.status,
            updatedAt: invoiceRow.updatedAt,
            version: invoiceRow.version + 1,
          },
        );
        if (result.affected !== 1) {
          throw new InvoiceVersionConflictError(invoiceRow.id);
        }
      }
      await manager.insert(InvoiceOutboxMessageOrmEntity, outboxRows);
    });
  }
}
```

- El puerto se importa **como valor** aunque solo aparezca en el `implements` (regla de §2); las entidades, eventos y VOs usados solo como tipo, con `import type`.
- **Nunca `manager.save()` para escribir: ni el agregado ni el outbox.** Con el id ya asignado es un upsert: primero busca esos ids —en el outbox, siempre en vano, y con el bloqueo de la fila tomado— y ante un id repetido sobrescribe en silencio en vez de fallar. `manager.insert()` no hace nada con una lista vacía. `version` es una columna normal y no un `@VersionColumn`, que la incrementaría sin comprobar nada: la comprobación es el `WHERE version = …`.
- **READ COMMITTED, pedido explícitamente.** El `UPDATE` que espera el bloqueo de la fila re-evalúa su `WHERE` sobre la fila ya confirmada y afecta 0 filas; en REPEATABLE READ o SERIALIZABLE recibiría un `40001` que nadie reintenta. Por eso `transaction('READ COMMITTED', …)` y no el nivel por defecto, que pueden cambiar el servidor, la base o el rol sin tocar el código. Un test de concurrencia tiene que **demostrar el intercalado**, no esperarlo: `order.typeorm.repository.e2e-spec.ts` bloquea la fila desde otra conexión, espera a ver el guardado bloqueado en `pg_blocking_pids` y solo entonces confirma, y repite el caso con una conexión cuyo defecto es SERIALIZABLE. Dos `save` lanzados a la vez con `Promise.all` casi nunca se intercalan y el test pasa igual sin la protección.
- **Solo el `23505` es un conflicto.** Cualquier otro fallo del `INSERT` sube tal cual, y un test lo fija provocando uno distinto (en orders, un byte NUL en un texto: `22021`). Sin ese test, ensanchar el predicado deja la suite en verde y convierte cualquier error de infraestructura en un 409 que invita a reintentar en vano.
- **Un recurso con dueño se lee con el dueño en la consulta** (`findByIdAndCustomer` en orders), no comparándolo después: el mapper falla cerrado con un 500 ante una fila corrupta, y si la ajena llegara a reconstruirse, ese 500 frente al 404 de un id cualquiera delataría que existe. La factura del ejemplo la emite un admin y no tiene dueño, por eso su `findById` es el plano.
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

Cada contexto tiene una jerarquía en `domain/errors/<aggregate>.errors.ts`: una raíz abstracta y errores concretos que guardan el dato ofensor. **No heredan de `HttpException` ni conocen códigos HTTP.** La raíz extiende `DomainError` del kernel (`@shared/domain/domain-error`) y no declara constructor: el protegido y el `name` de la clase concreta (`new.target.name`) los pone la base. Cada contexto conserva su propia raíz porque es la que atrapa el `@Catch` de su filtro; `DomainError` no puede serlo, ya que atraparía también los errores ajenos.

```ts
// src/modules/billing/domain/errors/invoice.errors.ts
// Calca: src/modules/users/domain/errors/user.errors.ts
import { DomainError } from '@shared/domain/domain-error';

export abstract class InvoiceDomainError extends DomainError {}

export class InvalidInvoiceIdError extends InvoiceDomainError {
  constructor(readonly value: string) {
    super(`"${value}" is not a valid invoice id`);
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

La traducción a HTTP es de **un filtro por contexto**, `infrastructure/http/<context>-domain-exception.filter.ts`, aplicado con `@UseFilters` en cada controller del contexto (§5). Extiende `DomainExceptionFilter<Raíz>` (`@common/filters/domain-exception.filter`) y solo declara su tabla `mappings`: **gana la primera coincidencia** por `instanceof`, en el orden de la tabla, y lo no mapeado es el 400 de la base (un error de dominio sin mapeo es entrada inválida, no un fallo del servidor). La base siempre relanza una excepción de Nest, y el `AllExceptionsFilter` global (`APP_FILTER` en `app.module.ts`) da forma a la respuesta.

```ts
// src/modules/billing/infrastructure/http/billing-domain-exception.filter.ts
// Calca: src/modules/users/infrastructure/http/users-domain-exception.filter.ts
import { Catch, ConflictException, NotFoundException } from '@nestjs/common';

import {
  DomainExceptionFilter,
  type DomainErrorMapping,
} from '@common/filters/domain-exception.filter';

import {
  InvoiceDomainError,
  InvoiceNotDraftError,
  InvoiceNotFoundError,
  InvoiceVersionConflictError,
} from '../../domain/errors/invoice.errors';

@Catch(InvoiceDomainError)
export class BillingDomainExceptionFilter extends DomainExceptionFilter<InvoiceDomainError> {
  protected readonly mappings: readonly DomainErrorMapping<InvoiceDomainError>[] = [
    { error: InvoiceNotFoundError, toHttp: (error) => new NotFoundException(error.message) },
    { error: InvoiceNotDraftError, toHttp: (error) => new ConflictException(error.message) },
    { error: InvoiceVersionConflictError, toHttp: (error) => new ConflictException(error.message) },
  ];
}
```

- **Cada subclase lleva su propio `@Catch(<raíz>)`, con un solo argumento, y la base no lleva ninguno**: Nest lee esos metadatos recorriendo la cadena de prototipos, así que las subclases heredarían el de la base, y ningún valor sirve a todas. Un filtro sin `@Catch` lo atrapa todo y, en las rutas de su controller, convertiría en 400 el 401 del guard JWT, el 403 de roles, el 408 del timeout y el 429 del throttler: de ese olvido protege la clave `filter` del test de contrato.
- **La anotación de `mappings` es obligatoria** (sin ella cada flecha da `TS7006`), las entradas son funciones flecha (`unbound-method`) y **el filtro no declara constructor**: Nest lo crea como injectable del módulo y no hay nada que inyectar. La raíz no puede ser una entrada (su constructor protegido da `TS2322`): ya la cubre el 400.
- **Construye la excepción de Nest con un string, no con un objeto.** Medido con `@nestjs/common` 12.1.0: `new NotFoundException('…').getResponse()` da `{ message, error: 'Not Found', statusCode: 404 }`, con el nombre canónico que `buildErrorExample()` deriva del status; con un objeto, el cuerpo es ese objeto tal cual y `error` desaparece. El nombre de la clase de dominio nunca llega al cliente.
- Nunca se importa `HttpException` (ni sus subclases) en `domain/` ni en `application/`.
- **Entre contextos no viajan excepciones**: un módulo no puede importar los errores de otro, así que la fachada devuelve un resultado (`{ ok: false, reason: 'email-taken' }`) y el consumidor lo traduce a un error suyo (§10).

## 9. Tests por capa

| Capa                                      | Tipo               | Herramienta                                                 | Qué prueba                                                                             |
| ----------------------------------------- | ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Domain (y el kernel `src/shared/domain/`) | Unitario puro      | Jest, sin mocks                                             | Invariantes de entidades y VOs; las bases del kernel con dobles de prueba              |
| Application                               | Unitario con fakes | Jest + fakes in-memory escritos a mano                      | Casos de uso contra puertos fake                                                       |
| Infrastructure (traducción)               | Unitario           | Jest, sin base (PBT en los round-trips de mapper)           | Mappers, filtros de dominio, controllers, guards, DTOs, adaptadores ACL y de seguridad |
| Infrastructure (persistencia)             | Integración        | Jest contra PostgreSQL real (base de test, `pnpm test:e2e`) | Repositorios TypeORM (`*.typeorm.repository.e2e-spec.ts`)                              |
| HTTP                                      | E2E                | Jest + Supertest sobre el `AppModule` real                  | Endpoint completo: pipes, guard, filtros, base                                         |
| Arquitectura                              | Unitario           | Jest + la API de TypeScript, sin type-check salvo esta referencia | Contrato de módulo, fronteras de ESLint, cero claves foráneas en las migraciones y que esta referencia cumpla el contrato y compile (`nestjs-mapping.spec.ts`) |

**Importante:** los tests de dominio no levantan `Test.createTestingModule`. Son `Invoice.draft(...)` puro.

**En `infrastructure/` la base la pide lo que toca el SUT, no la carpeta.** De los specs bajo `__tests__/infrastructure/` de los tres contextos, solo los `*.typeorm.repository.e2e-spec.ts` corren en `pnpm test:e2e`. Los demás son `*.spec.ts` de `pnpm test` y no abren conexión: mappers, filtros, controllers, guard, DTOs, hasher, signer y adaptadores ACL.

**Convenciones de archivo y mocking** se rigen por `CLAUDE.md` («Code conventions») y [`docs/testing.md`](../../../../docs/testing.md):

- **Ubicación:** en `src/modules/<context>/__tests__/`, espejo de la estructura del módulo y **1:1** con el archivo fuente (`domain/entities/invoice.entity.ts` ↔ `__tests__/domain/entities/invoice.entity.spec.ts`). Los puertos (`domain/ports/`, clases abstractas sin lógica) quedan exentos; los errores y los eventos no. El SUT se importa en relativo.
- **Unit:** `*.spec.ts`. **E2E:** `*.e2e-spec.ts` dentro del mismo `__tests__/` — el del contexto (`__tests__/<context>.e2e-spec.ts`) arranca la app con `createTestApp()` de `@test/helpers/create-test-app`; el de un repositorio vive en `__tests__/infrastructure/persistence/<name>.typeorm.repository.e2e-spec.ts`.
- **Ejecución:** siempre `pnpm test <ruta>` y `pnpm test:e2e` (§0). El E2E corre contra la base de test que fija `test/setup-env.ts` (no la de desarrollo), necesita PostgreSQL arriba y hace `TRUNCATE` en cada `beforeEach`.
- **Domain:** cero mocks. Si el test parece necesitar uno, el diseño leakea infra al dominio.
- **Application:** fakes escritos a mano de los puertos en `__tests__/helpers/` (p. ej. `in-memory-user.repository.ts`, que hace `implements UserRepository` con `import type`); nunca `jest.mock` contra rutas de módulo.
- **Infrastructure:** sin base todo lo que solo traduce:
  - el mapper, con un round-trip PBT (`user.mapper.spec.ts`);
  - el filtro, con errores de dominio reales y la excepción de Nest esperada (`users-domain-exception.filter.spec.ts`);
  - el controller, con sus casos de uso reales sobre los fakes (`users.controller.spec.ts`);
  - el adaptador ACL, con la puerta ajena como objeto literal (`users-customer.directory.spec.ts`).

  Base real solo para repositorios. Nunca `jest.mock('typeorm')`.

- AAA explícito (`// Arrange / // Act / // Assert`) y `it` en español empezando por `debería…` son obligatorios.

**Property-based testing (PBT) con `fast-check` + `@fast-check/jest`** — los invariantes de dominio (importe siempre positivo, `issue` solo desde `draft`) y el round-trip del mapper en infraestructura son el caso ideal. Las arbitrarias se **construyen**, nunca se `.filter()`-an sobre `fc.string()`.

**La mutación es gate**: `thresholds.break` en `stryker.config.mjs` y job propio en CI. Un módulo nuevo sin casos no entra en silencio. Para auditar solo lo que cambió una rama, `pnpm test:mutation:changed [base]`; para un módulo entero, `pnpm test:mutation --mutate "src/modules/<context>/domain/**/*.ts,src/modules/<context>/application/**/*.ts"` (sin llaves: Stryker parte `--mutate` por comas antes de expandirlas y daría cero mutantes en verde). El kernel se audita con `pnpm test:mutation --mutate "src/shared/domain/**/*.ts"`, con objetivo del 100 %: todo contexto hereda de él.

## 10. Composición entre contextos

- **El `<context>.module.ts` es la única superficie pública.** Exporta al contenedor solo sus puertas (`exports: [UsersLookup, UsersProvisioning]`) y las **reexporta como símbolo TS** (`export { UsersLookup, UsersProvisioning } from './application/users.facade'`). Nunca exporta el repositorio, los casos de uso ni la clase que implementa la fachada.
- **Puertas segregadas por intención.** Una sola implementación (`UsersFacadeImpl`) detrás de varios tokens con `useExisting` —con dos `useClass` habría dos instancias—. Quien solo consulta inyecta `UsersLookup` y no puede llamar a `deleteProfile` porque el tipo que recibe no lo declara.
- **El consumidor define su propio puerto** (`orders/domain/ports/customer.directory.ts`) y lo implementa un adaptador ACL en su `infrastructure/` (`users-customer.directory.ts`), que inyecta la puerta importada del module file ajeno. El módulo consumidor importa el módulo ajeno en `imports`.
- **Las puertas devuelven primitivos o resultados, nunca el agregado** ni excepciones de negocio.
- **Los ids de otro contexto viajan como `string`** (`Order.customerId`, `Credential.userId`): la regla 3 de las fronteras prohíbe importar `UserId` fuera de `users`.
- **El puerto del consumidor es la costura para extraer al proveedor.** Si `users` pasara a ser un servicio, `CustomerDirectory` y `UserDirectory` recibirían un adaptador HTTP o RPC y ni el dominio ni la aplicación del consumidor cambiarían: ver `docs/architecture.md`, «Extraer un módulo a un servicio».
- **Dirección única.** `auth → users` y `orders → users`; si `users` importara a quien lo consume nacería un ciclo. Lo compartido por varios (`@Public`, `@Auth`, `@CurrentUser`, `AuthenticatedUser`) vive en `common/`.
- **Guard global desde un módulo.** `APP_GUARD` es multi-provider: `auth.module.ts` lo registra y protege toda la app sin que `AppModule` importe internos de ningún módulo.
- El root `AppModule` solo importa los módulos de contexto y la configuración global; no contiene lógica.
- Para multi-tenant request-scoped, `Scope.REQUEST` con **durable providers** (`durable?: boolean` sigue en las opciones de provider de `@nestjs/common` 12.1.0). Hoy ningún contexto lo necesita.

## 11. Checklist al diseñar un nuevo módulo

- [ ] Defino el aggregate root y sus VOs antes de pensar en endpoints
- [ ] La raíz de errores extiende `DomainError`; las entidades, `Entity<TId>` o `AggregateRoot<TId, TEvent>`; el id, `UuidIdentifier<'<Clase>'>`, con su `from()` y su `generate()`
- [ ] Cada método de intención llama a `touch(now)` después de su guarda, y ninguna entidad redeclara `id`, `createdAt` ni `updatedAt`
- [ ] Cada puerto es una `abstract class` en `domain/ports/`, solo con miembros `abstract` públicos
- [ ] Cada adaptador hace `implements` del puerto y se cablea con `{ provide: Puerto, useClass: Adaptador }`
- [ ] Ningún archivo con decoradores importa un puerto con `import type`
- [ ] Un caso de uso por archivo en `application/use-cases/`, con su `…Input` y un único `execute()`
- [ ] El controller vive en `infrastructure/http/`, llama a `execute({ … })` y lleva la documentación OpenAPI completa
- [ ] La entidad ORM y el mapper viven en `infrastructure/persistence/`; el dominio no tiene decoradores
- [ ] Las fechas de la entidad ORM son `@Column({ type: 'timestamptz', default: () => 'now()' })`, sin columnas que rellene TypeORM ni decoradores de relación
- [ ] El mapper envuelve `rehydrate` en `failClosed`, salvo que el filtro del contexto ya sanee el error
- [ ] Errores de dominio tipados, traducidos por `<context>-domain-exception.filter.ts`: una subclase de `DomainExceptionFilter` con su `@Catch(<raíz>)` y su tabla `mappings`, con excepciones construidas con string
- [ ] Tests en `__tests__/` espejo, 1:1; dominio puro, aplicación con fakes, repositorios contra PostgreSQL
- [ ] Ningún archivo de `domain/` importa de `@nestjs/*` ni de `infrastructure/`
- [ ] `pnpm test src/__tests__/module-contract.spec.ts` en verde, sin añadir el contexto a `FLAT_MODULES`
- [ ] El módulo está en `imports` de `AppModule`, su scope en `commitlint.config.cjs` y, si hay tablas, su migración generada
