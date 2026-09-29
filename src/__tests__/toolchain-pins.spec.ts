// src/__tests__/toolchain-pins.spec.ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

const read = (relative: string): string => readFileSync(path.join(ROOT, relative), 'utf-8');

const packageJson = JSON.parse(read('package.json')) as {
  engines: { node: string };
  packageManager: string;
  devDependencies: Record<string, string>;
};

type RegexManager = {
  customType: string;
  depNameTemplate?: string;
  managerFilePatterns: string[];
  matchStrings: string[];
  matchStringsStrategy?: string;
};

const renovate = JSON.parse(read('renovate.json')) as { customManagers: RegexManager[] };

// Los documentos que le dicen a una persona —o a un agente— qué instalar. No son decoración: el
// de incidencias existe para descartar «runtime equivocado» como causa, y con la versión
// equivocada prerellenada hace lo contrario de su trabajo; la línea de Stack de `CLAUDE.md` es
// lo primero que lee un agente antes de tocar nada.
const NODE_DOCS = ['README.md', '.github/ISSUE_TEMPLATE/bug_report.yml', 'CLAUDE.md'];
// `CLAUDE.md` cita pnpm solo por su major («pnpm 11»): no hay literal de versión que mantener.
const PNPM_DOCS = ['README.md', '.github/ISSUE_TEMPLATE/bug_report.yml'];

/**
 * El customManager que reescribe las citas en prosa de `depName`. Tiene que ser uno, de tipo
 * regex y con la estrategia `any` por defecto, porque es la semántica que replica
 * `renovatedValues`: con otra, este spec afirmaría sobre algo que Renovate no hace.
 */
const managerFor = (depName: string): RegexManager => {
  const [manager, ...others] = renovate.customManagers.filter(
    (candidate) => candidate.depNameTemplate === depName,
  );
  if (
    manager === undefined ||
    others.length > 0 ||
    manager.customType !== 'regex' ||
    (manager.matchStringsStrategy ?? 'any') !== 'any'
  ) {
    throw new Error(
      `renovate.json debería declarar un único customManager regex con estrategia «any» para ${depName}`,
    );
  }
  return manager;
};

/**
 * `managerFilePatterns` admite regex (`/…/`) y globs. Hoy solo hay regex, y el spec se niega a
 * adivinar un glob: Renovate usa minimatch con `dot: true` y `path.matchesGlob` no, que es
 * justo la diferencia que decide si `**` entra en `.github/`.
 */
const coversFile = (pattern: string, file: string): boolean => {
  const regex = /^\/(.*)\/(i?)$/s.exec(pattern);
  if (regex === null) {
    throw new Error(`Patrón glob sin soporte en este spec: ${pattern}. Escríbelo como /regex/.`);
  }
  return new RegExp(regex[1] ?? '', regex[2]).test(file);
};

/**
 * Las versiones que Renovate lee —y por tanto reescribe— en `contents`: cada `matchString` por
 * separado y de forma global, que es la estrategia `any` (`handleAny` en
 * `lib/modules/manager/custom/regex/strategies.ts` compila cada una con `regEx(matchString, 'g')`).
 * Solo esos sitios: una cita que ninguna expresión cubre no la mueve nadie.
 */
const renovatedValues = (manager: RegexManager, contents: string): string[] =>
  manager.matchStrings.flatMap((source) =>
    Array.from(
      contents.matchAll(new RegExp(source, 'g')),
      (match) => match.groups?.currentValue ?? '',
    ),
  );

/**
 * Los tres casos que atan los documentos de `docs` al customManager de `depName`. Test y Renovate
 * no pueden divergir en ninguna dirección: un documento que el spec vigila y Renovate no cubre es
 * rojo, un sitio con otra versión es rojo, y una expresión que ya no casa en ningún documento
 * —Renovate dejaría de mover esa cita en silencio— también.
 */
const describeRenovatedDocs = (depName: string, docs: string[], pinned: string): void => {
  describe('documentos que Renovate reescribe', () => {
    it.each(docs)('debería tener %s bajo los managerFilePatterns de su customManager', (doc) => {
      // Arrange
      const { managerFilePatterns } = managerFor(depName);

      // Act
      const covered = managerFilePatterns.some((pattern) => coversFile(pattern, doc));

      // Assert
      expect(covered).toBe(true);
    });

    it.each(docs)('debería citar esa versión, y solo esa, en cada sitio de %s', (doc) => {
      // Arrange
      const manager = managerFor(depName);

      // Act
      const values = renovatedValues(manager, read(doc));

      // Assert
      expect(values).not.toHaveLength(0);
      expect(values).toEqual(values.map(() => pinned));
    });

    it('debería encontrar cada matchString en alguno de los documentos', () => {
      // Arrange
      const { matchStrings } = managerFor(depName);
      const contents = docs.map(read);

      // Act
      const dead = matchStrings.filter(
        (source) => !contents.some((text) => new RegExp(source).test(text)),
      );

      // Assert
      expect(dead).toEqual([]);
    });
  });
};

/**
 * Contrato del toolchain. El repo declara Node en SIETE sitios —cuatro con manager nativo de
 * Renovate (`.nvmrc`, `.node-version`, el `FROM` del Dockerfile y `engines.node`) y tres en prosa
 * (la tabla de requisitos del README, la plantilla de incidencias y la línea de Stack de
 * `CLAUDE.md`)—, pnpm en TRES (`packageManager` y dos en prosa) y el compilador en DOS, y hasta
 * el 2026-08-19 nada lo verificaba. Las dos veces que se movió quedó a medias, y las dos veces en
 * verde:
 *
 *   - `bdfe609` (Node 22.23.2 → 24.19.0) tocó `.nvmrc`, `.node-version` y el `FROM` del
 *     Dockerfile, y dejó `engines.node` en `>=22.23.2 <25.0.0`: un manifiesto anunciando tres
 *     majors de los que se ejercita uno. `CHANGELOG.md` ya nombraba los cuatro archivos.
 *   - `2723d87` (pnpm 11.17.0 → 11.22.0) movió `packageManager` y dejó `README.md` y la
 *     plantilla de incidencias citando la versión vieja como si fuera la que fija el repo.
 *
 * Ninguno rompió nada, y ahí está el problema: `engines` no bloquea la instalación —no hay
 * `engine-strict`, y el propio README lo dice—, la CI toma la versión de `.nvmrc` sin matriz, y
 * ningún spec leía estos archivos. El coste se cobra fuera del repo, en quien deriva la
 * plantilla.
 *
 * Los sitios en prosa se leen con las MISMAS expresiones con las que Renovate los reescribe
 * (`customManagers` de `renovate.json`). Hasta el 2026-09-28 se leían con un `toContain` sobre el
 * documento entero, y el agujero era real: el comentario HTML que precede a la tabla del README
 * citaba la versión de pnpm, así que la fila podía quedarse vieja con este spec en verde —el
 * fallo de `2723d87`, el mismo para el que existe—.
 *
 * Se afirma sobre el RESULTADO, no sobre la intención: qué versión resuelve de verdad, no qué
 * versión pretendía el literal.
 */
describe('toolchain pins', () => {
  describe('Node', () => {
    const nvmrc = read('.nvmrc').trim();

    it('debería declarar la misma versión en .nvmrc y en .node-version', () => {
      // Arrange
      const nodeVersion = read('.node-version').trim();

      // Act & Assert
      expect(nodeVersion).toBe(nvmrc);
    });

    it('debería construir la imagen sobre esa misma versión', () => {
      // Arrange — el pin viaja con digest desde que Renovate lo gestiona (`docker:pinDigests`),
      // así que el patrón exige las dos mitades: sin digest no hay reproducibilidad, y sin
      // versión legible nadie sabe qué está desplegando.
      const dockerfile = read('Dockerfile');

      // Act
      const from = /^FROM node:([^-]+)-alpine@sha256:[0-9a-f]{64} AS base$/m.exec(dockerfile);

      // Assert
      expect(from?.[1]).toBe(nvmrc);
    });

    // La forma es `^<nvmrc>` y no `>=<nvmrc> <<major+1>.0.0`, aunque para versiones estables son
    // equivalentes: el manager npm de Renovate degrada `rangeStrategy: bump` a `widen` en cualquier
    // rango compuesto (`isComplexRange`), y con `widen` un patch nuevo ya cabe en el rango y el
    // suelo no se mueve nunca. Con la forma compuesta, la PR de Node 24.21.0 (#72) llegó sin tocar
    // engines.node y este mismo test la puso en rojo. `^` es un rango de un solo elemento y ya
    // lleva el techo en el major siguiente.
    it('debería usar esa versión como suelo de engines.node, con techo en el major siguiente', () => {
      // Arrange
      const expected = `^${nvmrc}`;

      // Act
      const range = packageJson.engines.node;

      // Assert
      expect(range).toBe(expected);
    });

    describeRenovatedDocs('node', NODE_DOCS, nvmrc);
  });

  describe('pnpm', () => {
    // `packageManager` es la única autoridad: con `corepack enable`, el pnpm global la respeta.
    const pinned = packageJson.packageManager.replace(/^pnpm@/, '');

    it('debería fijar la versión en packageManager con el prefijo del gestor', () => {
      // Arrange & Act
      const declared = packageJson.packageManager;

      // Assert
      expect(declared).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    });

    describeRenovatedDocs('pnpm', PNPM_DOCS, pinned);
  });

  describe('typescript', () => {
    // El override de `pnpm-workspace.yaml` está scoped a `@nestjs/cli>typescript` desde el
    // 2026-08-19. Estas dos aserciones son la mitad que hace que ese scope sea seguro: con el
    // override global el bump de `package.json` era inerte, y con el override scoped y los dos
    // literales divergiendo habría DOS compiladores validando el mismo código —`nest build`
    // usa el suyo porque `nest-cli.json` lleva `typeCheck: true`—. Las dos formas de
    // equivocarse quedan cubiertas: una copia, y que sea la que anuncia el manifiesto.
    it('debería resolver una sola copia de typescript en el árbol', () => {
      // Arrange — layout aislado de pnpm. Ya es dependencia asumida en el comentario de
      // `stryker.config.mjs` y en el gate de swagger-ui-dist de `ci.yml`
      // (`node_modules/.pnpm/@nestjs+swagger@*`). El `@` del
      // patrón no es opcional: sin él, `typescript-eslint@…` entraría en la cuenta.
      const store = readdirSync(path.join(ROOT, 'node_modules/.pnpm'));

      // Act
      const copies = store.filter((entry) => entry.startsWith('typescript@'));

      // Assert
      expect(copies).toHaveLength(1);
    });

    it('debería resolver la versión que declara package.json', () => {
      // Arrange
      const declared = packageJson.devDependencies.typescript;

      // Act
      const resolved = (
        JSON.parse(read('node_modules/typescript/package.json')) as { version: string }
      ).version;

      // Assert
      expect(resolved).toBe(declared);
    });
  });
});
