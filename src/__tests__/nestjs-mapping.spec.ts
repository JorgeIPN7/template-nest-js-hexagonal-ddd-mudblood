import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import {
  checkModuleContract,
  type ContractKey,
  type ContractViolation,
} from './helpers/module-contract-checker';

const ROOT = path.resolve(__dirname, '../..');
const REFERENCE = 'docs/nestjs-mapping.md';
const BILLING = 'src/modules/billing/';
const FILTER = `${BILLING}infrastructure/http/billing-domain-exception.filter.ts`;
const MAPPER = `${BILLING}infrastructure/persistence/invoice.mapper.ts`;
const REPOSITORY = `${BILLING}infrastructure/persistence/invoice.typeorm.repository.ts`;

/**
 * Qué ruta revisa cada clave del contrato, para la fila de no vacuidad. Duplica un dato del
 * checker, pero solo como fixture: si una clave no tuviera ningún archivo del ejemplo que mirar,
 * el contrato en verde no probaría nada sobre ella. `Record` obliga a listar las diez.
 */
const KEY_TARGETS: Record<ContractKey, RegExp> = {
  structure: /^src\/modules\/billing\/billing\.module\.ts$/,
  errors: /\/domain\/errors\/[^/]+\.errors\.ts$/,
  filter: /\/infrastructure\/http\/billing-domain-exception\.filter\.ts$/,
  'controller-filter': /\/infrastructure\/http\/[^/]+\.controller\.ts$/,
  entities: /\/domain\/entities\/[^/]+\.entity\.ts$/,
  'value-objects': /\/domain\/value-objects\/[^/]+\.vo\.ts$/,
  'use-cases': /\/application\/use-cases\/[^/]+\.use-case\.ts$/,
  suffixes: /\/(?:entities|value-objects|errors|use-cases)\/[^/]+\.ts$/,
  'orm-relations': /\/infrastructure\/persistence\/[^/]+\.orm-entity\.ts$/,
  'orm-managed-columns': /\/infrastructure\/persistence\/[^/]+\.orm-entity\.ts$/,
};

/**
 * `docs/nestjs-mapping.md` es la fuente de verdad de la forma del código (`CLAUDE.md`), y su
 * ejemplo `billing` es lo que se copia al crear un contexto. Esta guarda lo trata como un
 * módulo de verdad: extrae sus bloques, los pasa por el contrato de módulo y los compila con el
 * `tsconfig` del repo contra el kernel y `common/` reales. Si el kernel cambia y la referencia
 * no, se pone roja aquí, y no en el primer módulo que alguien copie.
 *
 * Sigue el patrón de `docs/testing.md`, «Guardas de arquitectura»: el árbol (la referencia de
 * hoy) más una rotura puntual por comprobación, que demuestra que ni el contrato ni `tsc` pasan
 * en vacío. Lo que no ve: ESLint y Prettier no pasan por los bloques del md.
 */
describe('nestjs-mapping.md', () => {
  describe('los bloques', () => {
    it('debería declarar en cada bloque ts la ruta del archivo de billing que enseña, sin repetir ninguna', () => {
      // Arrange
      const blocks = referenceBlocks();

      // Act
      const paths = blocks.map((block) => block.path);

      // Assert
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.filter((file) => !file?.startsWith(BILLING))).toEqual([]);
      expect(new Set(paths).size).toBe(paths.length);
    });

    it('debería darle a cada clave del contrato al menos un archivo que revisar', () => {
      // Arrange
      const paths = [...referenceSources().keys()];

      // Act
      const uncovered = Object.entries(KEY_TARGETS)
        .filter(([, target]) => !paths.some((file) => target.test(file)))
        .map(([key]) => key);

      // Assert
      expect(uncovered).toEqual([]);
    });

    it('debería extraer cada valla de TypeScript del md, sin saltarse ninguna', () => {
      // Arrange
      const markdown = referenceMarkdown();

      // Act
      const skipped = unextractedFences(markdown);

      // Assert
      expect(skipped).toEqual([]);
    });

    it.each([
      { variant: '```typescript', block: ['```typescript', '```'], skipped: '5: ```typescript' },
      { variant: '```tsx', block: ['```tsx', '```'], skipped: '5: ```tsx' },
      {
        variant: '```ts title="…"',
        block: ['```ts title="invoice.ts"', '```'],
        skipped: '5: ```ts title="invoice.ts"',
      },
      {
        variant: '```ts sangrado en una lista',
        block: ['- Paso:', '', '  ```ts', '  ```'],
        skipped: '7: ```ts',
      },
      { variant: '``` ts', block: ['``` ts', '```'], skipped: '5: ``` ts' },
      { variant: '~~~ts', block: ['~~~ts', '~~~'], skipped: '5: ~~~ts' },
      { variant: '````ts', block: ['````ts', '````'], skipped: '5: ````ts' },
      { variant: '```TS', block: ['```TS', '```'], skipped: '5: ```TS' },
    ])('debería señalar la valla $variant que el extractor no extrae', ({ block, skipped }) => {
      // Arrange: un bloque `ts` que sí se extrae (líneas 1 a 3) y, debajo, la variante.
      const markdown = ['```ts', `// ${BILLING}domain/x.ts`, '```', '', ...block].join('\n');

      // Act
      const result = unextractedFences(markdown);

      // Assert
      expect(result).toEqual([skipped]);
    });
  });

  describe('el contrato de módulo', () => {
    it('debería cumplir el contrato de módulo como un módulo recién copiado', () => {
      // Arrange
      const sources = withSyntheticTests(referenceSources());

      // Act
      const violations = checkModuleContract(sources);

      // Assert
      expect(describeViolations(violations)).toEqual([]);
    });

    it('debería ver la violación cuando un bloque rompe el contrato', () => {
      // Arrange: el filtro sin su `@Catch`, el olvido que convertiría en 400 el 401 del guard.
      const sources = new Map(withSyntheticTests(referenceSources()));
      sources.set(FILTER, (sources.get(FILTER) ?? '').replace('@Catch(InvoiceDomainError)\n', ''));

      // Act
      const violations = checkModuleContract(sources);

      // Assert
      expect(describeViolations(violations)).toEqual([`filter ${FILTER}`]);
    });
  });

  describe('la compilación', () => {
    it('debería compilar sin diagnósticos con el tsconfig del repo', () => {
      // Arrange
      const program = referenceProgram();

      // Act
      const diagnostics = ts.getPreEmitDiagnostics(program);

      // Assert
      expect(diagnostics.map(describeDiagnostic)).toEqual([]);
    });

    it('debería ver el diagnóstico cuando falta el archivo que un bloque importa', () => {
      // Arrange
      const sources = new Map(referenceSources());
      sources.delete(MAPPER);
      const program = compile(sources);

      // Act
      const diagnostics = ts.getPreEmitDiagnostics(program);

      // Assert
      expect(missingModules(diagnostics)).toEqual([`${REPOSITORY}: ./invoice.mapper`]);
    });
  });
});

// Helpers

/** `opening` es la línea, contando desde 1, de la valla que abre el bloque. */
type Block = { opening: number; path: string | undefined; source: string };

/**
 * Cada valla `ts` del md, con la ruta de su primera línea (`// src/modules/billing/…`). Parte
 * por `\r?\n`: un clon con `core.autocrlf=true` tendría el md en CRLF. Solo abre con
 * `` ```ts `` en la columna 0; las demás formas las vigila `unextractedFences`.
 */
const extractBlocks = (markdown: string): Block[] => {
  const blocks: Block[] = [];
  let current: string[] | undefined;
  let opening = 0;
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    if (current === undefined) {
      if (/^```ts\s*$/.test(line)) {
        current = [];
        opening = index + 1;
      }
      continue;
    }
    if (/^```\s*$/.test(line)) {
      const [first = ''] = current;
      blocks.push({
        opening,
        path: /^\/\/ (src\/modules\/billing\/\S+\.ts)$/.exec(first)?.[1],
        source: current.join('\n'),
      });
      current = undefined;
      continue;
    }
    current.push(line);
  }
  return blocks;
};

/**
 * Una valla de TypeScript en cualquiera de las formas que CommonMark acepta: `typescript` o `tsx`,
 * atributos tras el lenguaje, sangría, tildes, más de tres acentos graves o mayúsculas.
 */
const TS_FENCE = /^\s*(?:`{3,}|~{3,})\s*(?:ts|typescript|tsx)\b/i;

/**
 * Las vallas de TypeScript que no abrieron un bloque extraído, como `línea: valla`. Sin esto, un
 * bloque escrito de otra forma se saltaría en silencio el contrato y la compilación.
 */
const unextractedFences = (markdown: string): string[] => {
  const opened = new Set(extractBlocks(markdown).map((block) => block.opening));
  return markdown
    .split(/\r?\n/)
    .flatMap((line, index) =>
      TS_FENCE.test(line) && !opened.has(index + 1) ? [`${index + 1}: ${line.trim()}`] : [],
    );
};

let cachedMarkdown: string | undefined;
let cachedBlocks: Block[] | undefined;
let cachedProgram: ts.Program | undefined;

const referenceMarkdown = (): string =>
  (cachedMarkdown ??= readFileSync(path.join(ROOT, REFERENCE), 'utf-8'));

const referenceBlocks = (): Block[] => (cachedBlocks ??= extractBlocks(referenceMarkdown()));

/** Los bloques con ruta, como el mapa `ruta → fuente` que leen el checker y el compilador. */
const referenceSources = (): ReadonlyMap<string, string> =>
  new Map(
    referenceBlocks().flatMap((block) =>
      block.path === undefined ? [] : [[block.path, block.source] as const],
    ),
  );

/** La clave `structure` pide un `.ts` en cada capa, y la referencia no enseña tests. */
const withSyntheticTests = (sources: ReadonlyMap<string, string>): ReadonlyMap<string, string> =>
  new Map([...sources, [`${BILLING}__tests__/billing.spec.ts`, '']]);

const referenceProgram = (): ts.Program => (cachedProgram ??= compile(referenceSources()));

const toPosix = (file: string): string => file.split(path.sep).join('/');

/**
 * Un programa de TypeScript con el `tsconfig.json` del repo, sin emitir, cuyos únicos archivos
 * raíz son los bloques. Se sirven desde memoria bajo la raíz del repo y todo lo demás sale del
 * disco: los alias resuelven al kernel y a `common/` reales, y los paquetes, a `node_modules`.
 */
const compile = (sources: ReadonlyMap<string, string>): ts.Program => {
  const { config } = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), (file) =>
    ts.sys.readFile(file),
  );
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, ROOT);
  const compilerOptions: ts.CompilerOptions = { ...options, noEmit: true, incremental: false };
  const virtual = new Map(
    [...sources].map(([file, source]) => [toPosix(path.join(ROOT, file)), source]),
  );
  const virtualDirectories = new Set(
    [...virtual.keys()].flatMap((file) => {
      const directories: string[] = [];
      let dir = path.posix.dirname(file);
      while (dir.length > toPosix(ROOT).length) {
        directories.push(dir);
        dir = path.posix.dirname(dir);
      }
      return directories;
    }),
  );
  const host = ts.createCompilerHost(compilerOptions);
  const fileExists = host.fileExists.bind(host);
  const readFile = host.readFile.bind(host);
  const directoryExists = host.directoryExists?.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (file) => virtual.has(toPosix(file)) || fileExists(file);
  host.readFile = (file) => virtual.get(toPosix(file)) ?? readFile(file);
  // Sin esto, la resolución da por inexistente la carpeta de un bloque y ni siquiera pregunta por
  // sus archivos: todo import relativo entre bloques saldría como TS2307.
  host.directoryExists = (dir) =>
    virtualDirectories.has(toPosix(dir)) || (directoryExists?.(dir) ?? true);
  host.getSourceFile = (file, languageVersion, ...rest) => {
    const source = virtual.get(toPosix(file));
    if (source !== undefined) {
      return ts.createSourceFile(file, source, languageVersion, true);
    }
    // El kernel, `common/` y las declaraciones de `node_modules` no cambian entre compilaciones:
    // parsearlos una vez deja la segunda en lo que cuesta el chequeo de tipos.
    if (!diskSourceFiles.has(file)) {
      diskSourceFiles.set(file, getSourceFile(file, languageVersion, ...rest));
    }
    return diskSourceFiles.get(file);
  };
  return ts.createProgram({ rootNames: [...virtual.keys()], options: compilerOptions, host });
};

const diskSourceFiles = new Map<string, ts.SourceFile | undefined>();

const relativeToRoot = (file: string): string => path.posix.relative(toPosix(ROOT), toPosix(file));

const describeDiagnostic = (diagnostic: ts.Diagnostic): string => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
  if (diagnostic.file === undefined || diagnostic.start === undefined) {
    return `TS${diagnostic.code} ${message}`;
  }
  const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${relativeToRoot(diagnostic.file.fileName)}:${line + 1} TS${diagnostic.code} ${message}`;
};

/** Los `TS2307` («Cannot find module»), como `archivo: módulo que no encuentra`. */
const missingModules = (diagnostics: readonly ts.Diagnostic[]): string[] =>
  diagnostics
    .filter((diagnostic) => diagnostic.code === 2307 && diagnostic.file !== undefined)
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      const [, specifier] = /'([^']+)'/.exec(message) ?? [];
      return `${relativeToRoot(diagnostic.file?.fileName ?? '')}: ${specifier ?? message}`;
    });

const describeViolations = (violations: readonly ContractViolation[]): string[] =>
  violations.map((violation) => `${violation.key} ${violation.file}`);
