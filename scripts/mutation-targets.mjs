import { posix } from 'node:path';

/**
 * Qué es NUEVO en una rama, a efectos de mutación, y qué mutantes de una corrida de Stryker le
 * pertenecen. Lo usa `pnpm test:mutation:changed` (`mutate-changed.mjs`).
 *
 * **Por qué existe.** `pnpm test:mutation` muta todo el alcance de `stryker.config.mjs`, y sus
 * supervivientes mezclan la deuda antigua (documentada en la cabecera de esa config) con lo que
 * acaba de escribirse. Los flujos de trabajo (`docs/development-workflows.md`) auditan el código
 * nuevo, así que antes había que cruzar a mano cada superviviente con el diff.
 *
 * **Cómo.** Se mutan los archivos ENTEROS y después se puntúan solo los mutantes que TOCAN las
 * líneas del cambio. Hasta el 2026-10-01 se pasaban a Stryker rangos `ruta:a-b`, y Stryker solo
 * muta lo que el rango contiene entero: un `&&` añadido a una condición de dos líneas, o el cuerpo
 * de un método nuevo cuya `}` git atribuía a la llave antigua, quedaban sin auditar, y un cambio
 * así podía dar cero mutantes y salir en verde.
 *
 * Vive aparte de `mutate-changed.mjs` por el mismo motivo que `scalar-bundle.mjs`: este módulo
 * solo exporta funciones puras sobre texto, y el otro es el que ejecuta git y Stryker. Lo ejercita
 * `src/__tests__/mutation-targets.spec.ts`.
 */

/**
 * ¿Entra `path` (relativa a la raíz del repo, con `/`) en el alcance de la mutación? `scope` es el
 * `mutate` de `stryker.config.mjs`, la única fuente: un glob que empieza por `!` excluye, como en
 * Stryker. Antes había aquí una copia a mano de esos globs como expresión regular.
 */
export function isInMutationScope(path, scope) {
  const matches = (glob) => posix.matchesGlob(path, glob);
  const included = scope.filter((glob) => !glob.startsWith('!'));
  const excluded = scope.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1));
  return included.some(matches) && !excluded.some(matches);
}

/**
 * Rangos de líneas AÑADIDAS en el `git diff -U0` de un archivo. Cada hunk `@@ -a,b +c,d @@`
 * añade las líneas `c … c+d-1` del archivo nuevo. Un `d` ausente vale 1 y un `d` de 0 es un
 * hunk que solo borra, sin nada que mutar.
 */
export function addedLineRanges(diff) {
  const ranges = [];
  for (const line of diff.split('\n')) {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) {
      continue;
    }
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count > 0) {
      ranges.push({ start, end: start + count - 1 });
    }
  }
  return ranges;
}

/**
 * El archivo que prueba un spec unitario según la convención 1:1 del repo (`__tests__/` replica la
 * estructura del módulo), o `undefined`. Los `*.e2e-spec.ts` no cuentan: Stryker no los ejecuta.
 */
export function subjectOfSpec(path) {
  const match = /^(src\/(?:modules\/[^/]+|shared))\/__tests__\/(.+)\.spec\.ts$/.exec(path);
  return match ? `${match[1]}/${match[2]}.ts` : undefined;
}

/** ¿Es un helper de test, del módulo o compartido, que varios specs pueden importar? */
export function isTestHelper(path) {
  return /^(?:src\/(?:modules\/[^/]+|shared)\/__tests__\/helpers|test\/helpers)\/.+\.ts$/.test(
    path,
  );
}

const ALIASES = [
  ['@test/', 'test/'],
  ['@modules/', 'src/modules/'],
  ['@shared/', 'src/shared/'],
  ['@common/', 'src/common/'],
  ['@config/', 'src/config/'],
  ['@database/', 'src/database/'],
  ['@/', 'src/'],
];

/**
 * Las rutas (relativas a la raíz, sin extensión) que importa el código fuente de `fromPath`:
 * relativas y con los alias de `tsconfig.json`. Los paquetes de `node_modules` no salen.
 */
export function importedPaths(source, fromPath) {
  const paths = [];
  for (const [, specifier] of source.matchAll(/(?:from|import)\s+'([^']+)'/g)) {
    if (specifier.startsWith('.')) {
      paths.push(posix.normalize(posix.join(posix.dirname(fromPath), specifier)));
      continue;
    }
    const alias = ALIASES.find(([prefix]) => specifier.startsWith(prefix));
    if (alias) {
      paths.push(alias[1] + specifier.slice(alias[0].length));
    }
  }
  return paths;
}

/**
 * Las líneas `git diff --name-status -M` como `{ status, path, from }`: `from` es la ruta original
 * de un renombrado o una copia.
 */
function parseNameStatus(nameStatus) {
  return nameStatus
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const fields = line.split('\t');
      return {
        status: fields[0].charAt(0),
        path: fields[fields.length - 1],
        from: fields.length > 2 ? fields[1] : undefined,
      };
    });
}

/**
 * La superficie del cambio: por cada archivo del alcance, `'all'` si es nuevo entero o la lista
 * de rangos de líneas añadidas si no. Lee git a través de lo que le pasa el llamador:
 *
 * - `nameStatus`: la salida de `git diff --name-status -M <base>`. Añadido o copiado → entero;
 *   renombrado → solo lo que cambió respecto al original, `diffOf(path, from)`; modificado → sus
 *   rangos, `diffOf(path)`; borrado → nada. Un archivo movido sin tocar no es código nuevo.
 * - `untracked`: la salida de `git ls-files --others --exclude-standard`. Mientras un flujo trabaja
 *   nada está confirmado, y un archivo sin `git add` no aparece en ningún diff. Si se llama igual
 *   que UNO de los borrados del alcance, es ese archivo movido: cuenta solo lo que cambió respecto
 *   al original. Si no, es nuevo entero.
 * - `diffOf(path, from?)`: el `git diff -U0 -w` de `path` contra `base` (contra `from` en `base`,
 *   si viene). `-w`: re-indentar líneas viejas al envolverlas en un `if` no las hace nuevas.
 * - `specsImporting(helper)`: los specs unitarios que importan un helper de test.
 * - `scope`: el `mutate` de `stryker.config.mjs`.
 *
 * Un spec o un helper cambiado arrastra a su SUT ENTERO: un test debilitado puede dejar vivo
 * cualquier mutante del archivo que probaba, también en líneas que nadie tocó. Antes un cambio
 * que solo tocaba tests salía con «nada que mutar».
 */
export function changeSurface({ nameStatus, untracked, diffOf, specsImporting, scope }) {
  const surface = new Map();
  const markWhole = (path) => surface.set(path, 'all');
  const addRanges = (path, ranges) => {
    const current = surface.get(path);
    if (ranges.length > 0 && current !== 'all') {
      surface.set(path, [...(current ?? []), ...ranges]);
    }
  };
  const inScope = (path) => isInMutationScope(path, scope);
  const isTestCode = (path) => subjectOfSpec(path) !== undefined || isTestHelper(path);

  const entries = parseNameStatus(nameStatus);
  const deletedInScope = entries
    .filter(({ status, path }) => status === 'D' && inScope(path))
    .map(({ path }) => path);
  const changedTests = [];

  for (const { status, path, from } of entries) {
    // También un spec BORRADO: quitar un test debilita la suite tanto como cambiarlo.
    if (isTestCode(path)) {
      changedTests.push(path);
      continue;
    }
    if (status === 'D' || !inScope(path)) {
      continue;
    }
    if (status === 'A' || status === 'C') {
      markWhole(path);
    } else {
      addRanges(path, addedLineRanges(diffOf(path, status === 'R' ? from : undefined)));
    }
  }

  for (const path of untracked.split('\n').filter((line) => line.trim() !== '')) {
    if (isTestCode(path)) {
      changedTests.push(path);
    } else if (inScope(path)) {
      const origins = deletedInScope.filter(
        (deleted) => posix.basename(deleted) === posix.basename(path),
      );
      if (origins.length === 1) {
        addRanges(path, addedLineRanges(diffOf(path, origins[0])));
      } else {
        markWhole(path);
      }
    }
  }

  for (const test of changedTests) {
    const specs = subjectOfSpec(test) === undefined ? specsImporting(test) : [test];
    for (const spec of specs) {
      const subject = subjectOfSpec(spec);
      if (subject !== undefined && inScope(subject)) {
        markWhole(subject);
      }
    }
  }

  return [...surface].map(([path, lines]) => ({ path, lines }));
}

/**
 * Los mutantes de un informe JSON de Stryker (esquema `mutation-testing-report-schema`) que TOCAN
 * la superficie del cambio: basta con que su ubicación comparta una línea con ella. Estar
 * contenido entero, que es lo que exigía `--mutate ruta:a-b`, dejaba fuera justo los mutantes que
 * abarcan una línea nueva y otra vieja.
 */
export function mutantsTouchingChange(report, surface) {
  const linesOf = new Map(surface.map(({ path, lines }) => [path, lines]));
  const touching = [];
  for (const [file, { mutants }] of Object.entries(report.files)) {
    const path = file.replaceAll('\\', '/');
    const lines = linesOf.get(path);
    if (lines === undefined) {
      continue;
    }
    for (const mutant of mutants) {
      const { start, end } = mutant.location;
      const touches =
        lines === 'all' ||
        lines.some((range) => range.start <= end.line && start.line <= range.end);
      if (touches) {
        touching.push({ ...mutant, path });
      }
    }
  }
  return touching;
}

/**
 * El score de esos mutantes con la fórmula de Stryker: detectados (`Killed`, `Timeout`) entre
 * válidos (detectados más `Survived` y `NoCoverage`). Los errores de compilación o de ejecución y
 * los ignorados no cuentan. Sin mutantes válidos, `score` es `undefined`: no hay nada que auditar,
 * y Stryker lo habría llamado `NaN` y lo habría dado por bueno contra cualquier umbral.
 */
export function changeScore(mutants) {
  const isDetected = (mutant) => mutant.status === 'Killed' || mutant.status === 'Timeout';
  const isUndetected = (mutant) => mutant.status === 'Survived' || mutant.status === 'NoCoverage';
  const detected = mutants.filter(isDetected).length;
  const undetected = mutants.filter(isUndetected);
  const valid = detected + undetected.length;
  return {
    detected,
    undetected,
    valid,
    score: valid === 0 ? undefined : (detected / valid) * 100,
  };
}
