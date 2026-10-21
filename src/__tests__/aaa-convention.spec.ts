// src/__tests__/aaa-convention.spec.ts
import path from 'node:path';

import { type AaaViolation, scanSource, scanTree } from './helpers/aaa-scanner';

const ROOT = path.resolve(__dirname, '../..');
const SCANNED_DIRS = ['src', 'test'] as const;

/**
 * Gate de la convención AAA: `// Arrange`, `// Act` y `// Assert` en cada test, cada uno en su
 * propia línea aunque la fase esté vacía, y nunca combinados (`CLAUDE.md`, «Code conventions»).
 *
 * La regla se fijó el 2026-09-29 y durante tres semanas solo la vigiló la revisión: el
 * 2026-10-19 la incumplían 194 de 1010 tests, que se pusieron al día el 2026-10-20 (backlog
 * #30). Esta suite es la que impide que la deuda vuelva.
 *
 * Los marcadores se buscan entre los COMENTARIOS del AST, no en el texto: un `// Arrange` escrito
 * dentro de una plantilla es texto de fixture y no cuenta. El detalle, y lo que el escáner
 * considera un test, viven en `helpers/aaa-scanner.ts`.
 *
 * Como en `language-convention.spec.ts`, el bloque «detector» es control positivo Y negativo: un
 * gate que solo mira el árbol pasaría igual de verde con un detector que no detectara nada.
 */
describe('aaa convention gate', () => {
  describe('el detector', () => {
    it('debería aceptar un test con los tres marcadores en líneas propias', () => {
      // Arrange
      const source = fixture(['// Arrange', '// Act', 'const value = 1;', '// Assert']);

      // Act
      const scan = scanSource(source);

      // Assert
      expect(scan.tests).toBe(1);
      expect(render(scan.violations)).toEqual([]);
    });

    it.each([
      ['// Act + Assert', ['// Arrange']],
      ['// Act & Assert', ['// Arrange']],
      ['// Arrange + Act', ['// Assert']],
      ['// Arrange & Act', ['// Assert']],
      ['// Arrange + Act + Assert', []],
    ])('debería marcar el marcador combinado %s', (combined, others) => {
      // Arrange
      const source = fixture([...others, combined, 'expect(1).toBe(1);']);

      // Act
      const scan = scanSource(source);

      // Assert
      expect(render(scan.violations)).toEqual(['fixture.spec.ts:1 debería x (combined)']);
    });

    it.each(['Arrange', 'Act', 'Assert'])(
      'debería marcar el test al que le falta // %s',
      (phase) => {
        // Arrange
        const markers = ['// Arrange', '// Act', '// Assert'].filter((m) => m !== `// ${phase}`);
        const source = fixture([...markers, 'expect(1).toBe(1);']);

        // Act
        const scan = scanSource(source);

        // Assert
        expect(render(scan.violations)).toEqual([
          `fixture.spec.ts:1 debería x (missing-${phase.toLowerCase()})`,
        ]);
      },
    );

    it('debería aceptar un marcador con una explicación detrás', () => {
      // Arrange — las tres formas que usa la suite: raya, dos puntos y paréntesis.
      const source = fixture([
        '// Arrange — sin nada que preparar.',
        '// Act: la llamada.',
        'const value = 1;',
        '// Assert (el valor)',
      ]);

      // Act
      const scan = scanSource(source);

      // Assert
      expect(render(scan.violations)).toEqual([]);
    });

    it('debería no contar como marcador una palabra que solo empieza igual', () => {
      // Arrange
      const source = fixture(['// Arrangement de prueba', '// Act', '// Assert']);

      // Act
      const scan = scanSource(source);

      // Assert
      expect(render(scan.violations)).toEqual(['fixture.spec.ts:1 debería x (missing-arrange)']);
    });

    it('debería no contar un marcador escrito al final de una línea de código', () => {
      // Arrange
      const source = fixture(['const value = 1; // Arrange', '// Act', '// Assert']);

      // Act
      const scan = scanSource(source);

      // Assert
      expect(render(scan.violations)).toEqual(['fixture.spec.ts:1 debería x (missing-arrange)']);
    });

    it('debería no contar como marcador el texto de una plantilla', () => {
      // Arrange — cada línea de la plantilla empieza por `// Arrange`, pero es texto, no un
      // comentario: un escáner que leyera líneas la daría por buena.
      const source = fixture(['const snippet = `', '// Arrange', '`;', '// Act', '// Assert']);

      // Act
      const scan = scanSource(source);

      // Assert
      expect(render(scan.violations)).toEqual(['fixture.spec.ts:1 debería x (missing-arrange)']);
    });

    it('debería contar los marcadores de una función anidada, como la propiedad de fast-check', () => {
      // Arrange
      const source = fixture([
        'fc.assert(',
        '  fc.property(fc.nat(), (n) => {',
        '    // Arrange',
        '    // Act',
        '    const value = n + 1;',
        '    // Assert',
        '    expect(value).toBeGreaterThan(n);',
        '  }),',
        ');',
      ]);

      // Act
      const scan = scanSource(source);

      // Assert
      expect(render(scan.violations)).toEqual([]);
    });

    it('debería ver los marcadores que no tienen código detrás', () => {
      // Arrange — los tres cuelgan de la llave de cierre, no de ninguna sentencia.
      const source = fixture(['// Arrange', '// Act', '// Assert']);

      // Act
      const scan = scanSource(source);

      // Assert
      expect(render(scan.violations)).toEqual([]);
    });

    it.each([
      ['test', "test('debería x', () => {"],
      ['it.only', "it.only('debería x', () => {"],
      ['it.each', "it.each([[1]])('debería x', (n) => {"],
      ['fcTest.prop', "fcTest.prop([fc.nat()])('debería x', (n) => {"],
      ['function', "it('debería x', function () {"],
      ['un timeout de tercer argumento', "it('debería x', async () => {"],
    ])('debería reconocer como test la forma %s', (_form, opening) => {
      // Arrange
      const closing = opening.startsWith("it('debería x', async") ? '}, 60_000);' : '});';
      const source = [opening, '  // Act', '  // Assert', closing].join('\n');

      // Act
      const scan = scanSource(source);

      // Assert
      expect(scan.tests).toBe(1);
      expect(render(scan.violations)).toEqual(['fixture.spec.ts:1 debería x (missing-arrange)']);
    });

    it('debería reconocer como test uno cuyo título es una plantilla', () => {
      // Arrange
      const source = ["it(`debería ${'x'}`, () => {", '  // Act', '  // Assert', '});'].join('\n');

      // Act
      const scan = scanSource(source);

      // Assert
      expect(render(scan.violations)).toEqual([
        "fixture.spec.ts:1 `debería ${'x'}` (missing-arrange)",
      ]);
    });

    it('debería ignorar describe, los hooks y los tests sin cuerpo en línea', () => {
      // Arrange
      const source = [
        "describe('un grupo', () => {",
        '  beforeEach(() => {});',
        "  it.todo('debería algo pendiente');",
        "  it('debería delegar en una función', sharedCase);",
        '});',
      ].join('\n');

      // Act
      const scan = scanSource(source);

      // Assert
      expect(scan.tests).toBe(0);
      expect(render(scan.violations)).toEqual([]);
    });
  });

  describe('el árbol', () => {
    it('debería llevar los tres marcadores en cada test de src/ y test/', () => {
      // Arrange

      // Act
      const scan = scanTree(ROOT, SCANNED_DIRS);

      // Assert
      expect(scan.tests).toBeGreaterThan(0);
      expect(render(scan.violations)).toEqual([]);
    });
  });
});

// Helpers

/** `file:line título (motivo)`, que es lo que se quiere leer cuando el gate se pone rojo. */
const render = (violations: readonly AaaViolation[]): string[] =>
  violations.map((v) => `${v.file}:${v.line} ${v.name} (${v.reason})`);

/** Un único `it('debería x', …)` con `body` dentro, una línea por elemento. */
const fixture = (body: readonly string[]): string =>
  ["it('debería x', () => {", ...body.map((line) => `  ${line}`), '});'].join('\n');
