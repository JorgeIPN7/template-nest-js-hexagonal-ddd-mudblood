// src/__tests__/helpers/aaa-scanner.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { collectTsFiles } from './language-scanner';

export type AaaReason = 'combined' | 'missing-arrange' | 'missing-act' | 'missing-assert';

export type AaaViolation = {
  file: string;
  line: number;
  /** El título del test, el primer argumento de la llamada. */
  name: string;
  reason: AaaReason;
};

export type AaaScan = { tests: number; violations: AaaViolation[] };

const TEST_FUNCTIONS: ReadonlySet<string> = new Set(['it', 'test', 'fcTest']);
const PHASES = ['Arrange', 'Act', 'Assert'] as const;
const SPEC_FILE = /\.(e2e-)?spec\.ts$/;

/**
 * Un marcador: una o varias fases unidas por `+`, `&` o `/`, y detrás cualquier cosa que no siga
 * la palabra (`// Arrange — …`, `// Assert: …`). Con más de una fase es un combinado. El
 * lookahead es el que deja fuera `// Actual …` o `// Assertions …`.
 */
const MARKER = /^\/\/\s*((?:Arrange|Act|Assert)(?:\s*[+&/]\s*(?:Arrange|Act|Assert))*)(?![A-Za-z])/;

/** `it`, `it.only`, `it.each(tabla)`, `fcTest.prop(arbitrarios)`…: el nombre del que cuelga la llamada. */
const rootName = (expression: ts.Expression): string | undefined => {
  let current = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
    current = current.expression;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
};

/**
 * Los comentarios que empiezan su propia línea dentro de `node`.
 *
 * Se recorren los comentarios que el AST cuelga delante de cada nodo y de cada TOKEN
 * (`getChildren`, no `forEachChild`). Así entran los que van delante de la llave de cierre, que
 * no pertenecen a ninguna sentencia, y no entra el texto de una cadena o una plantilla, que nunca
 * es un comentario aunque empiece por `//`. Lo de la línea propia lo da `getLeadingCommentRanges`:
 * un comentario detrás del código, en su misma línea, es un comentario final del token anterior y
 * no lo devuelve. Un mismo comentario puede salir dos veces (un nodo y su primer hijo empiezan en
 * el mismo sitio), y no importa: solo se mira qué fases nombran.
 */
const ownLineComments = (node: ts.Node, sourceFile: ts.SourceFile): string[] => {
  const text = sourceFile.text;
  const comments: string[] = [];
  const visit = (current: ts.Node): void => {
    for (const range of ts.getLeadingCommentRanges(text, current.getFullStart()) ?? []) {
      comments.push(text.slice(range.pos, range.end));
    }
    for (const child of current.getChildren(sourceFile)) {
      visit(child);
    }
  };
  visit(node);
  return comments;
};

/** Lo que incumple un cuerpo: cada combinado una vez, y cada fase que no nombra ningún marcador. */
const reasonsOf = (comments: readonly string[]): AaaReason[] => {
  const markers = comments.flatMap((comment) => {
    const match = MARKER.exec(comment);
    return match?.[1] === undefined ? [] : [match[1].split(/\s*[+&/]\s*/)];
  });
  const named = new Set(markers.flat());
  const reasons: AaaReason[] = markers.some((phases) => phases.length > 1) ? ['combined'] : [];
  for (const phase of PHASES) {
    if (!named.has(phase)) {
      reasons.push(`missing-${phase.toLowerCase()}` as AaaReason);
    }
  }
  return reasons;
};

/**
 * Los tests de un fuente y lo que incumple cada uno.
 *
 * Un test es una llamada a `it`, `test` o `fcTest`, también a través de `.only`, `.each(…)(…)` o
 * `.prop(…)(…)`, con un título como primer argumento y una función en línea como SEGUNDO. Se
 * mira el segundo y no el último porque un timeout va detrás (`it('…', async () => {…}, 60_000)`).
 * Un `describe`, un hook o un `it` que delega en una función con nombre no son tests aquí.
 *
 * LÍMITE CONOCIDO: no comprueba el orden de las fases, solo que estén las tres y separadas.
 */
export const scanSource = (source: string, file = 'fixture.spec.ts'): AaaScan => {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations: AaaViolation[] = [];
  let tests = 0;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const [title, body] = node.arguments;
      const fn = rootName(node.expression);
      if (
        fn !== undefined &&
        TEST_FUNCTIONS.has(fn) &&
        title !== undefined &&
        (ts.isStringLiteralLike(title) || ts.isTemplateExpression(title)) &&
        body !== undefined &&
        (ts.isArrowFunction(body) || ts.isFunctionExpression(body))
      ) {
        tests++;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        const name = ts.isStringLiteralLike(title) ? title.text : title.getText(sourceFile);
        for (const reason of reasonsOf(ownLineComments(body.body, sourceFile))) {
          violations.push({ file, line, name, reason });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { tests, violations };
};

/** Aplica `scanSource` a cada spec de `dirs`, con la ruta relativa a `root` en el reporte. */
export const scanTree = (root: string, dirs: readonly string[]): AaaScan => {
  const scans = dirs
    .flatMap((dir) => collectTsFiles(path.join(root, dir)))
    .filter((file) => SPEC_FILE.test(file))
    .map((file) =>
      scanSource(readFileSync(file, 'utf-8'), path.relative(root, file).split(path.sep).join('/')),
    );
  return {
    tests: scans.reduce((total, scan) => total + scan.tests, 0),
    violations: scans.flatMap((scan) => scan.violations),
  };
};
