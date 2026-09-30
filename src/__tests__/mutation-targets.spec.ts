import {
  addedLineRanges,
  isInMutationScope,
  mutationTargets,
} from '../../scripts/mutation-targets.mjs';

/**
 * `scripts/mutation-targets.mjs` decide qué muta `pnpm test:mutation:changed`: si deja fuera una
 * línea nueva, su superviviente no se ve; si mete una antigua, la deuda heredada vuelve a mezclarse
 * con la auditoría del cambio. Se ejercita con salidas de git escritas a mano, sin repositorio.
 */
describe('scripts/mutation-targets.mjs', () => {
  describe('isInMutationScope()', () => {
    it('debería aceptar el dominio y la aplicación de cualquier módulo y el kernel compartido', () => {
      // Arrange
      const paths = [
        'src/modules/orders/domain/entities/order.entity.ts',
        'src/modules/billing/application/use-cases/issue-invoice.use-case.ts',
        'src/shared/domain/aggregate-root.ts',
      ];

      // Act
      const accepted = paths.filter((path) => isInMutationScope(path));

      // Assert
      expect(accepted).toEqual(paths);
    });

    it('debería rechazar infraestructura, tests, módulos raíz y archivos que no son TypeScript', () => {
      // Arrange
      const paths = [
        'src/modules/orders/infrastructure/http/orders.controller.ts',
        'src/modules/orders/__tests__/domain/entities/order.entity.spec.ts',
        'src/modules/orders/orders.module.ts',
        'src/modules/orders/domain/README.md',
        'src/database/migrations/1790796856575-add-cancellation-to-orders.ts',
      ];

      // Act
      const accepted = paths.filter((path) => isInMutationScope(path));

      // Assert
      expect(accepted).toEqual([]);
    });
  });

  describe('addedLineRanges()', () => {
    it('debería devolver las líneas añadidas de cada hunk como un rango cerrado', () => {
      // Arrange
      const diff = [
        'diff --git a/x.ts b/x.ts',
        '@@ -3,0 +4,2 @@ export class Order',
        '+  a',
        '+  b',
        '@@ -20,3 +22,5 @@',
      ].join('\n');

      // Act
      const ranges = addedLineRanges(diff);

      // Assert
      expect(ranges).toEqual([
        { start: 4, end: 5 },
        { start: 22, end: 26 },
      ]);
    });

    it('debería tratar un hunk sin recuento como una sola línea añadida', () => {
      // Arrange
      const diff = '@@ -18 +18 @@ export type PlaceOrderInput';

      // Act
      const ranges = addedLineRanges(diff);

      // Assert
      expect(ranges).toEqual([{ start: 18, end: 18 }]);
    });

    it('debería ignorar los hunks que solo borran líneas', () => {
      // Arrange
      const diff = '@@ -7,4 +6,0 @@';

      // Act
      const ranges = addedLineRanges(diff);

      // Assert
      expect(ranges).toEqual([]);
    });
  });

  describe('mutationTargets()', () => {
    it('debería mutar entero un archivo añadido, renombrado o copiado del alcance', () => {
      // Arrange
      const nameStatus = [
        'A\tsrc/modules/orders/domain/events/order-cancelled.event.ts',
        'R087\tsrc/modules/orders/domain/old-name.ts\tsrc/modules/orders/domain/new-name.ts',
        'C075\tsrc/shared/domain/value-object.base.ts\tsrc/shared/domain/entity.base.ts',
      ].join('\n');

      // Act
      const targets = mutationTargets({ nameStatus, untracked: '', diffOf: unexpectedDiff });

      // Assert
      expect(targets).toEqual([
        'src/modules/orders/domain/events/order-cancelled.event.ts',
        'src/modules/orders/domain/new-name.ts',
        'src/shared/domain/entity.base.ts',
      ]);
    });

    it('debería mutar solo las líneas añadidas de un archivo modificado', () => {
      // Arrange
      const path = 'src/modules/orders/domain/entities/order.entity.ts';
      const diffs: Record<string, string> = { [path]: '@@ -8,1 +8,3 @@\n@@ -40,0 +43,2 @@' };

      // Act
      const targets = mutationTargets({
        nameStatus: `M\t${path}`,
        untracked: '',
        diffOf: (changed) => diffs[changed] ?? '',
      });

      // Assert
      expect(targets).toEqual([`${path}:8-10`, `${path}:43-44`]);
    });

    it('debería ignorar los archivos borrados y los que están fuera del alcance', () => {
      // Arrange
      const nameStatus = [
        'D\tsrc/modules/orders/domain/errors/gone.errors.ts',
        'M\tsrc/modules/orders/infrastructure/persistence/order.mapper.ts',
        'A\tsrc/modules/orders/__tests__/domain/entities/order.entity.spec.ts',
        'M\tCLAUDE.md',
      ].join('\n');

      // Act
      const targets = mutationTargets({ nameStatus, untracked: '', diffOf: unexpectedDiff });

      // Assert
      expect(targets).toEqual([]);
    });

    it('debería mutar enteros los archivos sin seguimiento del alcance', () => {
      // Arrange
      const untracked = [
        'src/modules/orders/application/use-cases/cancel-order.use-case.ts',
        'src/modules/orders/__tests__/application/use-cases/cancel-order.use-case.spec.ts',
        'docs/specs/2026-09-30-cancel-order-express.md',
        '',
      ].join('\n');

      // Act
      const targets = mutationTargets({ nameStatus: '', untracked, diffOf: unexpectedDiff });

      // Assert
      expect(targets).toEqual([
        'src/modules/orders/application/use-cases/cancel-order.use-case.ts',
      ]);
    });

    it('debería no mutar nada de un archivo modificado que solo pierde líneas', () => {
      // Arrange
      const path = 'src/modules/users/domain/value-objects/email.vo.ts';

      // Act
      const targets = mutationTargets({
        nameStatus: `M\t${path}`,
        untracked: '',
        diffOf: () => '@@ -12,2 +11,0 @@',
      });

      // Assert
      expect(targets).toEqual([]);
    });
  });
});

// Helpers

/** Un archivo añadido, borrado o fuera del alcance no necesita su diff: pedirlo es un defecto. */
const unexpectedDiff = (path: string): string => {
  throw new Error(`No se esperaba pedir el diff de ${path}`);
};
