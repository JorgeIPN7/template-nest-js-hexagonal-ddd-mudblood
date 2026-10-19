// src/__tests__/module-contract.spec.ts
import path from 'node:path';

import {
  checkModuleContract,
  discoverContexts,
  FLAT_MODULES,
  readModuleSources,
  type ContractViolation,
} from './helpers/module-contract-checker';

const ROOT = path.resolve(__dirname, '../..');

/**
 * Trinquete: las violaciones que el repo todavía tiene mientras sus contextos se llevan al
 * contrato, uno por uno. La fila del árbol las compara con igualdad exacta, así que arreglar una
 * sin quitarla de aquí, o quitarla sin arreglarla, pone la fila en rojo. Cuando la lista quede
 * vacía, la fila pasará a `toEqual([])` y esta constante desaparecerá.
 */
const PENDING_VIOLATIONS: readonly string[] = [
  'entities src/modules/auth/domain/entities/credential.entity.ts',
  'errors src/modules/auth/domain/errors/auth.errors.ts',
  'errors src/modules/orders/domain/errors/order.errors.ts',
  'filter src/modules/auth/infrastructure/http/auth-domain-exception.filter.ts',
  'filter src/modules/orders/infrastructure/http/orders-domain-exception.filter.ts',
  'orm-managed-columns src/modules/auth/infrastructure/persistence/credential.orm-entity.ts',
];

/**
 * Gate del contrato base de módulo: todo bounded context de `src/modules/` hereda del kernel
 * (`src/shared/domain/`), reutiliza las bases de `src/common/` y tiene la misma forma, para que un
 * módulo nuevo sea fácil de crear y uno existente, fácil de reemplazar. El checker es sintáctico,
 * sin type-check: lo que no ve está escrito en `docs/architecture.md`, «El contrato de módulo».
 *
 * El bloque «detector» es control positivo Y negativo, sobre un contexto sintético `billing`: un
 * gate que solo comprueba que el árbol está limpio pasaría igual de verde si el detector no
 * detectara nada. Cada fila rompe una sola regla del `billing` conforme, y todas comparan con
 * igualdad exacta, así que una regla que se disparara de más también las pondría en rojo.
 */
describe('module contract gate', () => {
  describe('el detector', () => {
    describe('structure', () => {
      it('debería marcar las cuatro carpetas de capa de un contexto que solo tiene su module file', () => {
        // Arrange
        const sources = new Map([['src/modules/billing/billing.module.ts', '']]);
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'structure src/modules/billing/__tests__/',
          'structure src/modules/billing/application/',
          'structure src/modules/billing/domain/',
          'structure src/modules/billing/infrastructure/',
        ]);
      });

      it('debería marcar el module file que falta', () => {
        // Arrange
        const sources = billingContext({ 'billing.module.ts': null });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual(['structure src/modules/billing/billing.module.ts']);
      });

      it('debería no aplicar el resto de reglas a un contexto que falla structure', () => {
        // Arrange
        const sources = billingContext({
          '__tests__/billing.spec.ts': null,
          'domain/errors/billing.errors.ts': replacing([
            'extends DomainError {}',
            'extends Error {}',
          ]),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual(['structure src/modules/billing/__tests__/']);
      });
    });

    describe('errors', () => {
      it('debería marcar una raíz de errores que extiende Error en vez de DomainError', () => {
        // Arrange
        const sources = billingContext({
          'domain/errors/billing.errors.ts': replacing([
            'extends DomainError {}',
            'extends Error {}',
          ]),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'errors src/modules/billing/domain/errors/billing.errors.ts',
        ]);
      });

      it.each<[string, FileChange]>([
        [
          'declarado en el propio archivo',
          [
            'class DomainError extends Error {}',
            '',
            'export abstract class BillingDomainError extends DomainError {}',
            '',
            'export class InvoiceNotFoundError extends BillingDomainError {}',
          ].join('\n'),
        ],
        [
          "importado de './domain-error'",
          replacing(["'@shared/domain/domain-error'", "'./domain-error'"]),
        ],
        [
          'importado del kernel por ruta relativa',
          replacing(["'@shared/domain/domain-error'", "'../../../../shared/domain/domain-error'"]),
        ],
      ])(
        'debería marcar una raíz cuyo DomainError no viene de @shared/domain/domain-error: %s',
        (_label, change) => {
          // Arrange
          const sources = billingContext({ 'domain/errors/billing.errors.ts': change });
          // Act
          const violations = checkModuleContract(sources);
          // Assert
          expect(render(violations)).toEqual([
            'errors src/modules/billing/domain/errors/billing.errors.ts',
          ]);
        },
      );

      it('debería marcar una segunda raíz abstracta que extiende DomainError', () => {
        // Arrange
        const sources = billingContext({
          'domain/errors/billing.errors.ts': appending(
            'export abstract class OtherRoot extends DomainError {}',
          ),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'errors src/modules/billing/domain/errors/billing.errors.ts',
        ]);
      });

      it('debería marcar una clase de error exportada que no desciende de la raíz', () => {
        // Arrange
        const sources = billingContext({
          'domain/errors/billing.errors.ts': appending('export class StrayError extends Error {}'),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'errors src/modules/billing/domain/errors/billing.errors.ts',
        ]);
      });

      it('debería marcar un archivo de errores que exporta algo que no es una clase', () => {
        // Arrange
        const sources = billingContext({
          'domain/errors/billing.errors.ts': appending("export const BILLING_CODE = 'B1';"),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'errors src/modules/billing/domain/errors/billing.errors.ts',
        ]);
      });

      it('debería marcar el contexto sin ningún *.errors.ts sin arrastrar al filtro', () => {
        // Arrange
        const sources = billingContext({ 'domain/errors/billing.errors.ts': null });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual(['errors src/modules/billing/domain/errors/']);
      });

      it('debería aceptar la raíz importada con import * as y los errores repartidos en varios *.errors.ts', () => {
        // Arrange
        const sources = billingContext({
          'domain/errors/billing.errors.ts': [
            "import * as kernel from '@shared/domain/domain-error';",
            '',
            'export abstract class BillingDomainError extends kernel.DomainError {}',
            '',
            'export class InvoiceNotFoundError extends BillingDomainError {}',
          ].join('\n'),
          'domain/errors/invoice.errors.ts': [
            "import { BillingDomainError } from './billing.errors';",
            '',
            'export class InvoiceAlreadyIssuedError extends BillingDomainError {}',
          ].join('\n'),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([]);
      });
    });

    describe('filter', () => {
      it('debería marcar el filtro que falta y no repetirlo en controller-filter', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/http/billing-domain-exception.filter.ts': null,
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'filter src/modules/billing/infrastructure/http/billing-domain-exception.filter.ts',
        ]);
      });

      it.each<[string, FileChange]>([
        [
          'implementa ExceptionFilter',
          [
            "import { Catch, type ExceptionFilter } from '@nestjs/common';",
            '',
            "import { BillingDomainError } from '../../domain/errors/billing.errors';",
            '',
            '@Catch(BillingDomainError)',
            'export class BillingDomainExceptionFilter implements ExceptionFilter {',
            '  catch(): void {}',
            '}',
          ].join('\n'),
        ],
        [
          "importa la base de './domain-exception.filter'",
          replacing(["'@common/filters/domain-exception.filter'", "'./domain-exception.filter'"]),
        ],
      ])(
        'debería marcar un filtro que no extiende el DomainExceptionFilter de @common: %s',
        (_label, change) => {
          // Arrange
          const sources = billingContext({
            'infrastructure/http/billing-domain-exception.filter.ts': change,
          });
          // Act
          const violations = checkModuleContract(sources);
          // Assert
          expect(render(violations)).toEqual([
            'filter src/modules/billing/infrastructure/http/billing-domain-exception.filter.ts',
          ]);
        },
      );

      it.each<[string, FileChange]>([
        ['@Catch()', replacing(['@Catch(BillingDomainError)', '@Catch()'])],
        [
          '@Catch(BillingDomainError, Error)',
          replacing(['@Catch(BillingDomainError)', '@Catch(BillingDomainError, Error)']),
        ],
      ])('debería marcar un @Catch sin exactamente un argumento: %s', (_label, change) => {
        // Arrange
        const sources = billingContext({
          'infrastructure/http/billing-domain-exception.filter.ts': change,
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'filter src/modules/billing/infrastructure/http/billing-domain-exception.filter.ts',
        ]);
      });

      // El de arriba de dos `@Catch` se aplica el último y sobrescribe los metadatos con `[]`, así
      // que el filtro queda igual de catch-all que sin ninguno.
      it.each<[string, FileChange, string]>([
        ['ningún @Catch', replacing(['@Catch(BillingDomainError)\n', '']), 'no lleva `@Catch`'],
        [
          '@Catch() encima de @Catch(BillingDomainError)',
          replacing(['@Catch(BillingDomainError)', '@Catch()\n@Catch(BillingDomainError)']),
          'lleva 2 `@Catch`',
        ],
      ])(
        'debería marcar un filtro sin exactamente un decorador @Catch: %s',
        (_label, change, reason) => {
          // Arrange
          const sources = billingContext({
            'infrastructure/http/billing-domain-exception.filter.ts': change,
          });
          // Act
          const violations = checkModuleContract(sources);
          // Assert
          expect(render(violations)).toEqual([
            'filter src/modules/billing/infrastructure/http/billing-domain-exception.filter.ts',
          ]);
          expect(violations[0]?.message).toContain(reason);
        },
      );

      it.each<[string, FileChange]>([
        [
          'DomainExceptionFilter<InvoiceNotFoundError>',
          replacing(
            [
              'import { BillingDomainError }',
              'import { BillingDomainError, InvoiceNotFoundError }',
            ],
            [
              'extends DomainExceptionFilter<BillingDomainError>',
              'extends DomainExceptionFilter<InvoiceNotFoundError>',
            ],
          ),
        ],
        [
          'DomainExceptionFilter sin argumento de tipo',
          replacing([
            'extends DomainExceptionFilter<BillingDomainError>',
            'extends DomainExceptionFilter',
          ]),
        ],
      ])('debería marcar un filtro cuyo argumento de tipo no es la raíz: %s', (_label, change) => {
        // Arrange
        const sources = billingContext({
          'infrastructure/http/billing-domain-exception.filter.ts': change,
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'filter src/modules/billing/infrastructure/http/billing-domain-exception.filter.ts',
        ]);
      });

      it('debería marcar un archivo de filtro con más de una clase', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/http/billing-domain-exception.filter.ts':
            appending('class FilterHelper {}'),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'filter src/modules/billing/infrastructure/http/billing-domain-exception.filter.ts',
        ]);
      });

      it('debería marcar un filtro cuyo @Catch recibe una subclase en vez de la raíz', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/http/billing-domain-exception.filter.ts': replacing(
            [
              'import { BillingDomainError }',
              'import { BillingDomainError, InvoiceNotFoundError }',
            ],
            ['@Catch(BillingDomainError)', '@Catch(InvoiceNotFoundError)'],
          ),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'filter src/modules/billing/infrastructure/http/billing-domain-exception.filter.ts',
        ]);
      });
    });

    describe('controller-filter', () => {
      it('debería marcar un controller sin @UseFilters a nivel de clase', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/http/billing.controller.ts': replacing([
            '@UseFilters(BillingDomainExceptionFilter)\n',
            '',
          ]),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'controller-filter src/modules/billing/infrastructure/http/billing.controller.ts',
        ]);
      });

      it('debería marcar un controller que solo pone @UseFilters en un método', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/http/billing.controller.ts': [
            "import { Controller, Get, UseFilters } from '@nestjs/common';",
            '',
            "import { BillingDomainExceptionFilter } from './billing-domain-exception.filter';",
            '',
            "@Controller('invoices')",
            'export class BillingController {',
            '  @Get()',
            '  @UseFilters(BillingDomainExceptionFilter)',
            '  list(): string[] {',
            '    return [];',
            '  }',
            '}',
          ].join('\n'),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'controller-filter src/modules/billing/infrastructure/http/billing.controller.ts',
        ]);
      });

      it('debería revisar también los controllers de las subcarpetas de infrastructure/http', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/http/admin/billing-admin.controller.ts': [
            "import { Controller } from '@nestjs/common';",
            '',
            "@Controller('admin/invoices')",
            'export class BillingAdminController {}',
          ].join('\n'),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'controller-filter src/modules/billing/infrastructure/http/admin/billing-admin.controller.ts',
        ]);
      });

      it('debería marcar un controller que usa el filtro de otro contexto', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/http/billing.controller.ts': replacing(
            [
              "import { BillingDomainExceptionFilter } from './billing-domain-exception.filter';",
              "import { ShippingDomainExceptionFilter } from '../../../shipping/infrastructure/http/shipping-domain-exception.filter';",
            ],
            [
              '@UseFilters(BillingDomainExceptionFilter)',
              '@UseFilters(ShippingDomainExceptionFilter)',
            ],
          ),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'controller-filter src/modules/billing/infrastructure/http/billing.controller.ts',
        ]);
      });
    });

    describe('entities', () => {
      it.each<[string, FileChange]>([
        ['sin extends', replacing([' extends AggregateRoot<InvoiceId, InvoiceEvent>', ''])],
        [
          "con AggregateRoot de '../aggregate-root'",
          replacing(["'@shared/domain/aggregate-root'", "'../aggregate-root'"]),
        ],
      ])(
        'debería marcar una entidad que no extiende Entity ni AggregateRoot del kernel: %s',
        (_label, change) => {
          // Arrange
          const sources = billingContext({ 'domain/entities/invoice.entity.ts': change });
          // Act
          const violations = checkModuleContract(sources);
          // Assert
          expect(render(violations)).toEqual([
            'entities src/modules/billing/domain/entities/invoice.entity.ts',
          ]);
        },
      );

      it.each<[string, FileChange]>([
        ['protected', replacing(['private constructor', 'protected constructor'])],
        ['sin constructor', replacing(['  private constructor() {\n    super();\n  }\n\n', ''])],
      ])('debería marcar una entidad sin constructor private: %s', (_label, change) => {
        // Arrange
        const sources = billingContext({ 'domain/entities/invoice.entity.ts': change });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'entities src/modules/billing/domain/entities/invoice.entity.ts',
        ]);
      });

      it('debería marcar una entidad sin static rehydrate', () => {
        // Arrange
        const sources = billingContext({
          'domain/entities/invoice.entity.ts': replacing(['static rehydrate', 'static restore']),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'entities src/modules/billing/domain/entities/invoice.entity.ts',
        ]);
      });

      it('debería marcar una entidad cuyo toSnapshot no es de instancia', () => {
        // Arrange
        const sources = billingContext({
          'domain/entities/invoice.entity.ts': replacing([
            '  toSnapshot()',
            '  static toSnapshot()',
          ]),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'entities src/modules/billing/domain/entities/invoice.entity.ts',
        ]);
      });

      it('debería marcar un *.entity.ts con más de una clase', () => {
        // Arrange
        const sources = billingContext({
          'domain/entities/invoice.entity.ts': appending('class InvoiceLine {}'),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'entities src/modules/billing/domain/entities/invoice.entity.ts',
        ]);
      });
    });

    describe('value-objects', () => {
      it('debería marcar un value object que no extiende ValueObject ni UuidIdentifier del kernel', () => {
        // Arrange
        const sources = billingContext({
          'domain/value-objects/invoice-amount.vo.ts': replacing([
            ' extends ValueObject<number>',
            '',
          ]),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'value-objects src/modules/billing/domain/value-objects/invoice-amount.vo.ts',
        ]);
      });

      it.each<[string, string, FileChange]>([
        [
          "la base es un ValueObject de './value-object.base'",
          'domain/value-objects/invoice-amount.vo.ts',
          replacing(["'@shared/domain/value-object.base'", "'./value-object.base'"]),
        ],
        [
          'el archivo solo exporta un type',
          'domain/value-objects/invoice-kind.vo.ts',
          "export type InvoiceKind = 'standard' | 'credit-note';",
        ],
      ])(
        'debería marcar un *.vo.ts cuya base no viene del kernel o que no declara ninguna clase: %s',
        (_label, file, change) => {
          // Arrange
          const sources = billingContext({ [file]: change });
          // Act
          const violations = checkModuleContract(sources);
          // Assert
          expect(render(violations)).toEqual([`value-objects src/modules/billing/${file}`]);
        },
      );

      it('debería marcar un value object con constructor público', () => {
        // Arrange
        const sources = billingContext({
          'domain/value-objects/invoice-amount.vo.ts': replacing([
            'export class InvoiceAmount extends ValueObject<number> {\n',
            'export class InvoiceAmount extends ValueObject<number> {\n  constructor(value: number) {\n    super(value);\n  }\n\n',
          ]),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'value-objects src/modules/billing/domain/value-objects/invoice-amount.vo.ts',
        ]);
      });

      it('debería marcar un value object sin su propio static from', () => {
        // Arrange
        const sources = billingContext({
          'domain/value-objects/invoice-amount.vo.ts': replacing(['static from', 'static of']),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'value-objects src/modules/billing/domain/value-objects/invoice-amount.vo.ts',
        ]);
      });

      it.each<[string, FileChange]>([
        [
          "UuidIdentifier<'PaymentId'>",
          replacing(["UuidIdentifier<'InvoiceId'>", "UuidIdentifier<'PaymentId'>"]),
        ],
        [
          'UuidIdentifier sin argumento',
          replacing(["UuidIdentifier<'InvoiceId'>", 'UuidIdentifier']),
        ],
      ])('debería marcar un id cuya marca no es el nombre de su clase: %s', (_label, change) => {
        // Arrange
        const sources = billingContext({ 'domain/value-objects/invoice-id.vo.ts': change });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'value-objects src/modules/billing/domain/value-objects/invoice-id.vo.ts',
        ]);
        expect(violations[0]?.message).toContain("'InvoiceId'");
      });
    });

    describe('use-cases', () => {
      it('debería marcar un caso de uso con otro miembro público además de execute', () => {
        // Arrange
        const sources = billingContext({
          'application/use-cases/issue-invoice.use-case.ts': replacing([
            '  private audit(',
            '  audit(',
          ]),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'use-cases src/modules/billing/application/use-cases/issue-invoice.use-case.ts',
        ]);
      });

      it('debería marcar un execute declarado como propiedad flecha', () => {
        // Arrange
        const sources = billingContext({
          'application/use-cases/issue-invoice.use-case.ts': [
            "import type { InvoiceRepository } from '../../domain/ports/invoice.repository';",
            '',
            'export type IssueInvoiceInput = { readonly invoiceId: string };',
            '',
            'export class IssueInvoiceUseCase {',
            '  constructor(private readonly invoices: InvoiceRepository) {}',
            '',
            '  execute = async (input: IssueInvoiceInput): Promise<void> => {',
            '    await this.invoices.issue(input.invoiceId);',
            '  };',
            '}',
          ].join('\n'),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'use-cases src/modules/billing/application/use-cases/issue-invoice.use-case.ts',
        ]);
      });

      it.each<[string, FileChange]>([
        ['readonly invoices', replacing(['private readonly invoices', 'readonly invoices'])],
        ['public invoices', replacing(['private readonly invoices', 'public invoices'])],
      ])('debería marcar una dependencia pública del constructor: %s', (_label, change) => {
        // Arrange
        const sources = billingContext({
          'application/use-cases/issue-invoice.use-case.ts': change,
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'use-cases src/modules/billing/application/use-cases/issue-invoice.use-case.ts',
        ]);
      });

      it.each<[string, FileChange]>([
        [
          'la clase se llama CreateInvoiceUseCase',
          replacing(['export class IssueInvoiceUseCase', 'export class CreateInvoiceUseCase']),
        ],
        [
          'IssueInvoiceInput no se exporta',
          replacing(['export type IssueInvoiceInput', 'type IssueInvoiceInput']),
        ],
        [
          'execute recibe un tipo en línea',
          replacing([
            'async execute(input: IssueInvoiceInput)',
            'async execute(input: { readonly invoiceId: string })',
          ]),
        ],
      ])(
        'debería marcar un caso de uso cuyo nombre no empareja archivo, clase, Input y execute: %s',
        (_label, change) => {
          // Arrange
          const sources = billingContext({
            'application/use-cases/issue-invoice.use-case.ts': change,
          });
          // Act
          const violations = checkModuleContract(sources);
          // Assert
          expect(render(violations)).toEqual([
            'use-cases src/modules/billing/application/use-cases/issue-invoice.use-case.ts',
          ]);
          expect(violations[0]?.message).toContain('IssueInvoice');
        },
      );

      it('debería marcar un *.use-case.ts con más de una clase', () => {
        // Arrange
        const sources = billingContext({
          'application/use-cases/issue-invoice.use-case.ts': appending('class Helper {}'),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'use-cases src/modules/billing/application/use-cases/issue-invoice.use-case.ts',
        ]);
      });
    });

    describe('suffixes', () => {
      it.each([
        ['domain/entities/refund.ts'],
        ['domain/value-objects/invoice-number.ts'],
        ['domain/errors/billing-errors.ts'],
        ['application/use-cases/void-invoice.ts'],
      ])(
        'debería marcar la clase exportada de %s, que no lleva el sufijo de su carpeta',
        (file) => {
          // Arrange
          const sources = billingContext({ [file]: 'export class X {}' });
          // Act
          const violations = checkModuleContract(sources);
          // Assert
          expect(render(violations)).toEqual([`suffixes src/modules/billing/${file}`]);
        },
      );
    });

    describe('orm-relations', () => {
      it.each([
        ['ManyToOne'],
        ['OneToMany'],
        ['OneToOne'],
        ['ManyToMany'],
        ['JoinColumn'],
        ['JoinTable'],
        ['RelationId'],
        ['ForeignKey'],
        ['Tree'],
        ['TreeParent'],
        ['TreeChildren'],
      ])('debería marcar %s de TypeORM en una entidad ORM', (name) => {
        // Arrange
        const sources = billingContext({
          'infrastructure/persistence/invoice.orm-entity.ts': replacing([
            "import { Column, Entity, PrimaryColumn } from 'typeorm';",
            `import { Column, Entity, PrimaryColumn, ${name} } from 'typeorm';`,
          ]),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'orm-relations src/modules/billing/infrastructure/persistence/invoice.orm-entity.ts',
        ]);
      });

      it('debería marcar un decorador de relación importado con alias', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/persistence/invoice.orm-entity.ts': replacing(
            [
              "import { Column, Entity, PrimaryColumn } from 'typeorm';",
              "import { Column, Entity, ManyToOne as BelongsTo, PrimaryColumn } from 'typeorm';",
            ],
            [
              '  createdAt!: Date;\n',
              '  createdAt!: Date;\n\n  @BelongsTo(() => Object)\n  customer!: object;\n',
            ],
          ),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'orm-relations src/modules/billing/infrastructure/persistence/invoice.orm-entity.ts',
        ]);
        expect(violations[0]?.message).toContain('ManyToOne');
      });

      it('debería marcar un decorador de relación usado a través de import * as', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/persistence/invoice.orm-entity.ts': [
            "import * as orm from 'typeorm';",
            '',
            "@orm.Entity('invoices')",
            'export class InvoiceOrmEntity {',
            "  @orm.PrimaryColumn('uuid')",
            '  id!: string;',
            '',
            '  @orm.ManyToOne(() => Object)',
            '  customer!: object;',
            '}',
          ].join('\n'),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'orm-relations src/modules/billing/infrastructure/persistence/invoice.orm-entity.ts',
        ]);
      });

      it('debería marcar un decorador de relación vetado aunque llegue de un módulo que no es typeorm', () => {
        // Arrange
        const sources = billingContext({
          'infrastructure/persistence/invoice.orm-entity.ts': replacing(
            [
              "import { Column, Entity, PrimaryColumn } from 'typeorm';",
              "import { Column, Entity, PrimaryColumn } from 'typeorm';\n\nimport { ManyToOne } from './orm-shim';",
            ],
            [
              '  createdAt!: Date;\n',
              '  createdAt!: Date;\n\n  @ManyToOne(() => Object)\n  customer!: object;\n',
            ],
          ),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'orm-relations src/modules/billing/infrastructure/persistence/invoice.orm-entity.ts',
        ]);
      });
    });

    describe('orm-managed-columns', () => {
      it.each([
        ['CreateDateColumn'],
        ['UpdateDateColumn'],
        ['DeleteDateColumn'],
        ['VersionColumn'],
      ])('debería marcar %s de TypeORM en una entidad ORM', (name) => {
        // Arrange
        const sources = billingContext({
          'infrastructure/persistence/invoice.orm-entity.ts': replacing([
            "import { Column, Entity, PrimaryColumn } from 'typeorm';",
            `import { Column, Entity, PrimaryColumn, ${name} } from 'typeorm';`,
          ]),
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'orm-managed-columns src/modules/billing/infrastructure/persistence/invoice.orm-entity.ts',
        ]);
      });

      it.each<[string, FileChange]>([
        [
          'con alias',
          replacing(
            [
              "import { Column, Entity, PrimaryColumn } from 'typeorm';",
              "import { Column, Entity, PrimaryColumn, UpdateDateColumn as Touched } from 'typeorm';",
            ],
            ['  createdAt!: Date;\n', '  createdAt!: Date;\n\n  @Touched()\n  updatedAt!: Date;\n'],
          ),
        ],
        [
          'por import * as',
          [
            "import * as orm from 'typeorm';",
            '',
            "@orm.Entity('invoices')",
            'export class InvoiceOrmEntity {',
            "  @orm.PrimaryColumn('uuid')",
            '  id!: string;',
            '',
            "  @orm.CreateDateColumn({ type: 'timestamptz' })",
            '  createdAt!: Date;',
            '}',
          ].join('\n'),
        ],
      ])('debería marcar una columna que rellena TypeORM aunque llegue %s', (_label, change) => {
        // Arrange
        const sources = billingContext({
          'infrastructure/persistence/invoice.orm-entity.ts': change,
        });
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([
          'orm-managed-columns src/modules/billing/infrastructure/persistence/invoice.orm-entity.ts',
        ]);
      });
    });

    describe('conforme y descubrimiento', () => {
      it('debería aceptar un contexto que cumple todo el contrato', () => {
        // Arrange
        const sources = billingContext();
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([]);
      });

      it('debería descubrir como contexto cada carpeta de src/modules salvo los módulos planos', () => {
        // Arrange
        const sources = new Map([
          ...billingContext(),
          ['src/modules/health/health.module.ts', 'export class HealthModule {}'],
          ['src/modules/shipping/shipping.module.ts', 'export class ShippingModule {}'],
          ['src/modules/notes.ts', 'export {};'],
        ]);
        // Act
        const contexts = discoverContexts(sources);
        // Assert
        expect(contexts).toEqual(['billing', 'shipping']);
      });

      it('debería eximir del contrato a los módulos planos', () => {
        // Arrange
        const sources = new Map([
          ...billingContext(),
          ['src/modules/health/health.module.ts', 'export class HealthModule {}'],
        ]);
        // Act
        const violations = checkModuleContract(sources);
        // Assert
        expect(render(violations)).toEqual([]);
      });

      it('debería mantener cerrada la lista de módulos planos', () => {
        // Arrange
        const flat = FLAT_MODULES;
        // Act
        const names = [...flat];
        // Assert
        expect(names).toEqual(['health']);
      });
    });
  });

  // Ninguna fila nombra un módulo de ejemplo: el README permite quitarlos, y el gate tiene que
  // seguir sirviendo a los contextos propios que los sustituyan.
  describe('el árbol', () => {
    it('debería descubrir al menos un contexto en src/modules y dejar fuera los módulos planos', () => {
      // Arrange
      const sources = readModuleSources(ROOT);
      // Act
      const contexts = discoverContexts(sources);
      // Assert
      expect(contexts.length).toBeGreaterThan(0);
      expect(contexts.filter((name) => FLAT_MODULES.includes(name))).toEqual([]);
    });

    it('debería cumplir el contrato en todos los contextos salvo las violaciones pendientes', () => {
      // Arrange
      const sources = readModuleSources(ROOT);
      // Act
      const violations = checkModuleContract(sources);
      // Assert
      expect(render(violations)).toEqual(PENDING_VIOLATIONS);
    });
  });
});

// Helpers

/** Cómo cambia un archivo del `billing` conforme: fuente nueva, `null` para borrarlo o una edición. */
type FileChange = string | null | ((source: string) => string);

const BILLING_ROOT = 'src/modules/billing/';

/**
 * Un contexto que cumple todo el contrato, con rutas relativas a `src/modules/billing/`. Cada fila
 * del detector rompe una sola regla sobre él.
 */
const CONFORMING_BILLING: Readonly<Record<string, string>> = {
  'billing.module.ts': 'export class BillingModule {}',
  'domain/errors/billing.errors.ts': [
    "import { DomainError } from '@shared/domain/domain-error';",
    '',
    'export abstract class BillingDomainError extends DomainError {}',
    '',
    'export class InvoiceNotFoundError extends BillingDomainError {}',
  ].join('\n'),
  'domain/entities/invoice.entity.ts': [
    "import { AggregateRoot } from '@shared/domain/aggregate-root';",
    '',
    "import type { InvoiceId } from '../value-objects/invoice-id.vo';",
    '',
    "export type InvoiceEvent = { readonly type: 'InvoiceIssued' };",
    '',
    'export class Invoice extends AggregateRoot<InvoiceId, InvoiceEvent> {',
    '  private constructor() {',
    '    super();',
    '  }',
    '',
    '  static rehydrate(): Invoice {',
    '    return new Invoice();',
    '  }',
    '',
    '  toSnapshot(): Record<string, never> {',
    '    return {};',
    '  }',
    '}',
  ].join('\n'),
  'domain/entities/payment.entity.ts': [
    "import { Entity } from '@shared/domain/entity.base';",
    '',
    "import type { PaymentId } from '../value-objects/payment-id.vo';",
    '',
    'export class Payment extends Entity<PaymentId> {',
    '  private constructor() {',
    '    super();',
    '  }',
    '',
    '  static rehydrate(): Payment {',
    '    return new Payment();',
    '  }',
    '',
    '  toSnapshot(): Record<string, never> {',
    '    return {};',
    '  }',
    '}',
  ].join('\n'),
  'domain/value-objects/invoice-id.vo.ts': [
    "import { UuidIdentifier } from '@shared/domain/uuid-identifier.base';",
    '',
    "export class InvoiceId extends UuidIdentifier<'InvoiceId'> {",
    '  static from(value: string): InvoiceId {',
    '    return new InvoiceId(value);',
    '  }',
    '}',
  ].join('\n'),
  'domain/value-objects/invoice-amount.vo.ts': [
    "import { ValueObject } from '@shared/domain/value-object.base';",
    '',
    'export class InvoiceAmount extends ValueObject<number> {',
    '  static from(value: number): InvoiceAmount {',
    '    return new InvoiceAmount(value);',
    '  }',
    '}',
  ].join('\n'),
  'domain/value-objects/invoice-status.ts': "export type InvoiceStatus = 'draft' | 'issued';",
  'application/use-cases/issue-invoice.use-case.ts': [
    "import type { InvoiceRepository } from '../../domain/ports/invoice.repository';",
    '',
    'export type IssueInvoiceInput = { readonly invoiceId: string };',
    '',
    'export class IssueInvoiceUseCase {',
    '  constructor(private readonly invoices: InvoiceRepository) {}',
    '',
    '  async execute(input: IssueInvoiceInput): Promise<void> {',
    '    await this.invoices.issue(input.invoiceId);',
    '    this.audit(input);',
    '    this.#trace(input);',
    '  }',
    '',
    '  private audit(_input: IssueInvoiceInput): void {}',
    '',
    '  #trace(_input: IssueInvoiceInput): void {}',
    '}',
  ].join('\n'),
  'infrastructure/http/billing-domain-exception.filter.ts': [
    "import { Catch } from '@nestjs/common';",
    '',
    'import {',
    '  DomainExceptionFilter,',
    '  type DomainErrorMapping,',
    "} from '@common/filters/domain-exception.filter';",
    '',
    "import { BillingDomainError } from '../../domain/errors/billing.errors';",
    '',
    '@Catch(BillingDomainError)',
    'export class BillingDomainExceptionFilter extends DomainExceptionFilter<BillingDomainError> {',
    '  protected readonly mappings: readonly DomainErrorMapping<BillingDomainError>[] = [];',
    '}',
  ].join('\n'),
  'infrastructure/http/billing.controller.ts': [
    "import { Controller, UseFilters } from '@nestjs/common';",
    '',
    "import { BillingDomainExceptionFilter } from './billing-domain-exception.filter';",
    '',
    "@Controller('invoices')",
    '@UseFilters(BillingDomainExceptionFilter)',
    'export class BillingController {}',
  ].join('\n'),
  'infrastructure/persistence/invoice.orm-entity.ts': [
    "import { Column, Entity, PrimaryColumn } from 'typeorm';",
    '',
    '// Ni ManyToOne ni CreateDateColumn: este comentario los nombra y no cuenta.',
    "@Entity('invoices')",
    'export class InvoiceOrmEntity {',
    "  @PrimaryColumn('uuid')",
    '  id!: string;',
    '',
    "  @Column({ type: 'timestamptz', default: () => 'now()' })",
    '  createdAt!: Date;',
    '}',
  ].join('\n'),
  '__tests__/billing.spec.ts': '// structure solo exige que la carpeta tenga algún .ts.',
};

/** El `billing` conforme con `changes` aplicados, con las rutas completas de `src/modules/`. */
function billingContext(changes: Readonly<Record<string, FileChange>> = {}): Map<string, string> {
  const files = new Map(Object.entries(CONFORMING_BILLING));
  for (const [relative, change] of Object.entries(changes)) {
    if (change === null) {
      files.delete(relative);
    } else if (typeof change === 'function') {
      const current = files.get(relative);
      if (current === undefined) {
        throw new Error(`El billing conforme no tiene ${relative}`);
      }
      files.set(relative, change(current));
    } else {
      files.set(relative, change);
    }
  }
  return new Map([...files].map(([relative, source]) => [`${BILLING_ROOT}${relative}`, source]));
}

/**
 * Una edición que sustituye cada `from` por su `to`, una vez y en orden. Falla si un `from` no
 * está: una edición que no cambia nada dejaría la fila en verde sin probar su regla.
 */
function replacing(
  ...pairs: readonly (readonly [from: string, to: string])[]
): (source: string) => string {
  return (source) =>
    pairs.reduce((current, [from, to]) => {
      if (!current.includes(from)) {
        throw new Error(`El fixture no contiene ${JSON.stringify(from)}`);
      }
      return current.replace(from, to);
    }, source);
}

/** Una edición que añade `text` al final del archivo. */
function appending(text: string): (source: string) => string {
  return (source) => `${source}\n\n${text}`;
}

/** `clave archivo`, ordenado: es lo que se quiere leer cuando el gate se pone rojo. */
function render(violations: readonly ContractViolation[]): string[] {
  return violations.map((violation) => `${violation.key} ${violation.file}`).sort();
}
