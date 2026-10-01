import {
  addedLineRanges,
  changeScore,
  changeSurface,
  importedPaths,
  isInMutationScope,
  isTestHelper,
  mutantsTouchingChange,
  subjectOfSpec,
  type ChangedFile,
  type ReportMutant,
} from '../../scripts/mutation-targets.mjs';
import strykerConfig from '../../stryker.config.mjs';

/** El alcance real: la misma lista que lee `mutate-changed.mjs`, sin copia que pueda divergir. */
const SCOPE = strykerConfig.mutate;

/**
 * `scripts/mutation-targets.mjs` decide qué audita `pnpm test:mutation:changed`: si deja fuera una
 * línea nueva, su superviviente no se ve; si mete una antigua, la deuda heredada vuelve a mezclarse
 * con la auditoría del cambio. Se ejercita con salidas de git y de Stryker escritas a mano, sin
 * repositorio ni corrida.
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
      const accepted = paths.filter((path) => isInMutationScope(path, SCOPE));

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
      const accepted = paths.filter((path) => isInMutationScope(path, SCOPE));

      // Assert
      expect(accepted).toEqual([]);
    });

    it('debería rechazar una ruta que contiene el alcance más adentro o una extensión tras el .ts', () => {
      // Arrange: lo que dejaría pasar una expresión sin anclas al principio o al final.
      const paths = [
        'packages/api/src/modules/orders/domain/entities/order.entity.ts',
        'src/modules/orders/domain/entities/order.entity.ts.orig',
      ];

      // Act
      const accepted = paths.filter((path) => isInMutationScope(path, SCOPE));

      // Assert
      expect(accepted).toEqual([]);
    });

    it('debería excluir lo que un glob con ! deja fuera, como hace Stryker', () => {
      // Arrange
      const scope = ['src/**/*.ts', '!src/**/*.generated.ts'];

      // Act
      const accepted = ['src/a.ts', 'src/b.generated.ts'].filter((path) =>
        isInMutationScope(path, scope),
      );

      // Assert
      expect(accepted).toEqual(['src/a.ts']);
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

    it('debería leer solo las cabeceras de hunk, no una línea añadida que se les parezca', () => {
      // Arrange: código cuyo texto contiene una cabecera; sin el ancla `^` contaría como hunk.
      const diff = ['@@ -1,0 +2,1 @@', '+// @@ -9 +9 @@ citado en un comentario'].join('\n');

      // Act
      const ranges = addedLineRanges(diff);

      // Assert
      expect(ranges).toEqual([{ start: 2, end: 2 }]);
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

  describe('subjectOfSpec()', () => {
    it.each([
      [
        'src/modules/orders/__tests__/domain/value-objects/order-id.vo.spec.ts',
        'src/modules/orders/domain/value-objects/order-id.vo.ts',
      ],
      ['src/shared/__tests__/domain/aggregate-root.spec.ts', 'src/shared/domain/aggregate-root.ts'],
    ])('debería devolver para %s el archivo que prueba, %s', (spec, subject) => {
      // Arrange

      // Act
      const found = subjectOfSpec(spec);

      // Assert
      expect(found).toBe(subject);
    });

    it('debería no devolver nada para un E2E, que Stryker no ejecuta, ni para un spec fuera de un módulo', () => {
      // Arrange: las dos últimas rutas solo casarían si a la expresión le faltaran sus anclas.
      const paths = [
        'src/modules/orders/__tests__/orders.e2e-spec.ts',
        'src/__tests__/main.spec.ts',
        'src/modules/orders/__tests__/helpers/order.factory.ts',
        'packages/api/src/modules/orders/__tests__/domain/order.entity.spec.ts',
        'src/modules/orders/__tests__/domain/order.entity.spec.ts.snap',
      ];

      // Act
      const subjects = paths.map((path) => subjectOfSpec(path));

      // Assert
      expect(subjects).toEqual([undefined, undefined, undefined, undefined, undefined]);
    });
  });

  describe('isTestHelper()', () => {
    it('debería reconocer los helpers de un módulo y los compartidos de test/helpers', () => {
      // Arrange
      const paths = [
        'src/modules/orders/__tests__/helpers/in-memory-order.repository.ts',
        'test/helpers/capture-error.ts',
        'src/modules/orders/__tests__/domain/entities/order.entity.spec.ts',
        'src/modules/orders/domain/entities/order.entity.ts',
        'packages/api/test/helpers/capture-error.ts',
        'test/helpers/capture-error.ts.orig',
      ];

      // Act
      const helpers = paths.filter((path) => isTestHelper(path));

      // Assert
      expect(helpers).toEqual(paths.slice(0, 2));
    });
  });

  describe('importedPaths()', () => {
    it('debería resolver las importaciones relativas y por alias, y saltarse los paquetes', () => {
      // Arrange
      const spec =
        'src/modules/orders/__tests__/application/use-cases/cancel-order.use-case.spec.ts';
      const source = [
        "import { fc, test as fcTest } from '@fast-check/jest';",
        "import { captureRejection } from '@test/helpers/capture-error';",
        'import {',
        '  buildPlacedOrder,',
        "} from '../../helpers/order.factory';",
        "import './side-effect';",
      ].join('\n');

      // Act
      const paths = importedPaths(source, spec);

      // Assert
      expect(paths).toEqual([
        'test/helpers/capture-error',
        'src/modules/orders/__tests__/helpers/order.factory',
        'src/modules/orders/__tests__/application/use-cases/side-effect',
      ]);
    });
  });

  describe('changeSurface()', () => {
    it('debería tomar entero un archivo añadido o copiado del alcance', () => {
      // Arrange
      const nameStatus = [
        'A\tsrc/modules/orders/domain/events/order-cancelled.event.ts',
        'C075\tsrc/shared/domain/value-object.base.ts\tsrc/shared/domain/entity.base.ts',
      ].join('\n');

      // Act
      const surface = changeSurface(git({ nameStatus }));

      // Assert
      expect(surface).toEqual([
        { path: 'src/modules/orders/domain/events/order-cancelled.event.ts', lines: 'all' },
        { path: 'src/shared/domain/entity.base.ts', lines: 'all' },
      ]);
    });

    it('debería tomar de un archivo renombrado solo lo que cambió respecto al original', () => {
      // Arrange: un archivo movido sin tocar no es código nuevo, aunque git lo vea renombrado.
      const from = 'src/modules/users/domain/errors/user.errors.ts';
      const path = 'src/modules/users/domain/errors/legacy/user.errors.ts';
      const diffs: Record<string, string> = { [`${path}<${from}`]: '@@ -9,0 +10,1 @@' };

      // Act
      const surface = changeSurface(
        git({
          nameStatus: `R091\t${from}\t${path}`,
          diffOf: (changed, original) => diffs[`${changed}<${original}`] ?? '',
        }),
      );

      // Assert
      expect(surface).toEqual([{ path, lines: [{ start: 10, end: 10 }] }]);
    });

    it('debería tomar solo las líneas añadidas de un archivo modificado', () => {
      // Arrange
      const path = 'src/modules/orders/domain/entities/order.entity.ts';
      const diffs: Record<string, string> = { [path]: '@@ -8,1 +8,3 @@\n@@ -40,0 +43,2 @@' };

      // Act
      const surface = changeSurface(
        git({ nameStatus: `M\t${path}`, diffOf: (changed) => diffs[changed] ?? '' }),
      );

      // Assert
      expect(surface).toEqual([
        {
          path,
          lines: [
            { start: 8, end: 10 },
            { start: 43, end: 44 },
          ],
        },
      ]);
    });

    it('debería ignorar los archivos borrados y los que están fuera del alcance', () => {
      // Arrange
      const nameStatus = [
        'D\tsrc/modules/orders/domain/errors/gone.errors.ts',
        'M\tsrc/modules/orders/infrastructure/persistence/order.mapper.ts',
        'M\tCLAUDE.md',
      ].join('\n');

      // Act
      const surface = changeSurface(git({ nameStatus }));

      // Assert
      expect(surface).toEqual([]);
    });

    it('debería tomar entero un archivo sin seguimiento que no se llama como ninguno borrado', () => {
      // Arrange
      const untracked = [
        'src/modules/orders/application/use-cases/cancel-order.use-case.ts',
        'docs/specs/2026-09-30-cancel-order-express.md',
        '',
      ].join('\n');

      // Act
      const surface = changeSurface(git({ untracked }));

      // Assert
      expect(surface).toEqual([
        { path: 'src/modules/orders/application/use-cases/cancel-order.use-case.ts', lines: 'all' },
      ]);
    });

    it('debería tratar un archivo sin seguimiento con el nombre de uno borrado como ese archivo movido', () => {
      // Arrange: mover sin confirmar deja el original borrado y el nuevo sin seguimiento.
      const from = 'src/modules/users/domain/errors/user.errors.ts';
      const path = 'src/modules/users/domain/errors/legacy/user.errors.ts';

      // Act
      const surface = changeSurface(
        git({
          nameStatus: `D\t${from}`,
          untracked: path,
          diffOf: (changed, original) =>
            changed === path && original === from ? '@@ -3,1 +3,1 @@' : '',
        }),
      );

      // Assert
      expect(surface).toEqual([{ path, lines: [{ start: 3, end: 3 }] }]);
    });

    it('debería tomar entero el archivo que prueba un spec cambiado, aunque el archivo no cambie', () => {
      // Arrange: un test debilitado puede dejar vivo cualquier mutante de su SUT.
      const spec = 'src/modules/orders/__tests__/domain/value-objects/order-id.vo.spec.ts';

      // Act
      const surface = changeSurface(git({ nameStatus: `M\t${spec}` }));

      // Assert
      expect(surface).toEqual([
        { path: 'src/modules/orders/domain/value-objects/order-id.vo.ts', lines: 'all' },
      ]);
    });

    it('debería tomar entero el archivo que probaba un spec borrado', () => {
      // Arrange
      const spec = 'src/modules/orders/__tests__/domain/value-objects/order-id.vo.spec.ts';

      // Act
      const surface = changeSurface(git({ nameStatus: `D\t${spec}` }));

      // Assert
      expect(surface).toEqual([
        { path: 'src/modules/orders/domain/value-objects/order-id.vo.ts', lines: 'all' },
      ]);
    });

    it('debería tomar enteros los archivos que prueban los specs que importan un helper cambiado', () => {
      // Arrange
      const helper = 'src/modules/orders/__tests__/helpers/in-memory-order.repository.ts';
      const importers: Record<string, string[]> = {
        [helper]: [
          'src/modules/orders/__tests__/application/use-cases/cancel-order.use-case.spec.ts',
          'src/modules/orders/__tests__/infrastructure/persistence/order.mapper.spec.ts',
        ],
      };

      // Act
      const surface = changeSurface(
        git({ nameStatus: `M\t${helper}`, specsImporting: (path) => importers[path] ?? [] }),
      );

      // Assert: el del mapper queda fuera porque su SUT es infraestructura.
      expect(surface).toEqual([
        {
          path: 'src/modules/orders/application/use-cases/cancel-order.use-case.ts',
          lines: 'all',
        },
      ]);
    });

    it('debería no tomar nada de un archivo modificado que solo pierde líneas', () => {
      // Arrange
      const path = 'src/modules/users/domain/value-objects/email.vo.ts';

      // Act
      const surface = changeSurface(
        git({ nameStatus: `M\t${path}`, diffOf: () => '@@ -12,2 +11,0 @@' }),
      );

      // Assert
      expect(surface).toEqual([]);
    });
  });

  describe('mutantsTouchingChange()', () => {
    it('debería incluir el mutante que abarca una línea vieja y una nueva', () => {
      // Arrange: un `&&` sobre las líneas 10-11, con solo la 11 añadida. Con `--mutate ruta:11-11`
      // Stryker lo dejaba fuera, porque exigía que el rango lo contuviera entero.
      const surface: ChangedFile[] = [{ path: FILE, lines: [{ start: 11, end: 11 }] }];
      const report = reportWith(FILE, [mutantAt('1', 10, 11)]);

      // Act
      const touching = mutantsTouchingChange(report, surface);

      // Assert
      expect(touching.map((mutant) => mutant.id)).toEqual(['1']);
    });

    it('debería excluir los mutantes que caen enteros fuera de las líneas del cambio', () => {
      // Arrange
      const surface: ChangedFile[] = [{ path: FILE, lines: [{ start: 11, end: 12 }] }];
      const report = reportWith(FILE, [mutantAt('antes', 5, 10), mutantAt('después', 13, 14)]);

      // Act
      const touching = mutantsTouchingChange(report, surface);

      // Assert
      expect(touching).toEqual([]);
    });

    it('debería incluir todos los mutantes de un archivo que entra entero', () => {
      // Arrange
      const surface: ChangedFile[] = [{ path: FILE, lines: 'all' }];
      const report = reportWith(FILE, [mutantAt('1', 1, 1), mutantAt('2', 90, 95)]);

      // Act
      const touching = mutantsTouchingChange(report, surface);

      // Assert
      expect(touching.map((mutant) => mutant.id)).toEqual(['1', '2']);
    });

    it('debería casar las rutas del informe escritas con barras invertidas e ignorar las ajenas', () => {
      // Arrange: así escribe Stryker las rutas en Windows.
      const surface: ChangedFile[] = [{ path: FILE, lines: 'all' }];
      const report = {
        files: {
          [FILE.replaceAll('/', '\\')]: { mutants: [mutantAt('propio', 1, 1)] },
          'src/modules/orders/domain/value-objects/order-id.vo.ts': {
            mutants: [mutantAt('ajeno', 1, 1)],
          },
        },
      };

      // Act
      const touching = mutantsTouchingChange(report, surface);

      // Assert
      expect(touching.map((mutant) => [mutant.id, mutant.path])).toEqual([['propio', FILE]]);
    });
  });

  describe('changeScore()', () => {
    it('debería dividir los detectados entre los válidos, como Stryker', () => {
      // Arrange
      const mutants = ['Killed', 'Timeout', 'Killed', 'Survived', 'NoCoverage'].map(
        (status, index) => ({ ...mutantAt(String(index), 1, 1), status }),
      );

      // Act
      const { detected, valid, score, undetected } = changeScore(mutants);

      // Assert
      expect({ detected, valid, score }).toEqual({ detected: 3, valid: 5, score: 60 });
      expect(undetected.map((mutant) => mutant.status)).toEqual(['Survived', 'NoCoverage']);
    });

    it('debería dejar fuera del denominador los errores y los ignorados', () => {
      // Arrange
      const mutants = ['Killed', 'CompileError', 'RuntimeError', 'Ignored'].map(
        (status, index) => ({ ...mutantAt(String(index), 1, 1), status }),
      );

      // Act
      const { valid, score } = changeScore(mutants);

      // Assert
      expect({ valid, score }).toEqual({ valid: 1, score: 100 });
    });

    it('debería no dar score cuando ningún mutante válido toca el cambio', () => {
      // Arrange: Stryker lo llamaba NaN y lo daba por bueno contra cualquier umbral.
      const mutants = [{ ...mutantAt('1', 1, 1), status: 'CompileError' }];

      // Act
      const { valid, score } = changeScore(mutants);

      // Assert
      expect({ valid, score }).toEqual({ valid: 0, score: undefined });
    });
  });
});

// Helpers

const FILE = 'src/modules/orders/domain/entities/order.entity.ts';

/** Una lectura de git sin nada, de la que cada test cambia solo lo que prueba. */
const git = (
  overrides: Partial<Parameters<typeof changeSurface>[0]>,
): Parameters<typeof changeSurface>[0] => ({
  nameStatus: '',
  untracked: '',
  diffOf: unexpectedDiff,
  specsImporting: () => [],
  scope: SCOPE,
  ...overrides,
});

/** Un archivo añadido, borrado o fuera del alcance no necesita su diff: pedirlo es un defecto. */
const unexpectedDiff = (path: string): string => {
  throw new Error(`No se esperaba pedir el diff de ${path}`);
};

const mutantAt = (id: string, startLine: number, endLine: number): ReportMutant => ({
  id,
  mutatorName: 'LogicalOperator',
  status: 'Survived',
  location: { start: { line: startLine, column: 1 }, end: { line: endLine, column: 2 } },
});

const reportWith = (file: string, mutants: ReportMutant[]) => ({ files: { [file]: { mutants } } });
