import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  changeScore,
  changeSurface,
  importedPaths,
  mutantsTouchingChange,
  subjectOfSpec,
} from './mutation-targets.mjs';

/**
 * `pnpm test:mutation:changed [base] [flags de Stryker…]` — audita por mutación solo el código
 * nuevo desde `base`: las líneas cambiadas de `domain/` y `application/`, los archivos nuevos
 * enteros, y el SUT entero de cada spec o helper de test que haya cambiado, con lo que no está
 * confirmado incluido. Qué entra y por qué lo explica `mutation-targets.mjs`.
 *
 * - **Base por defecto:** `git merge-base HEAD main`, lo que esta rama cambió respecto a `main`.
 *   Los flujos pasan la suya, el `git rev-parse HEAD` que guardaron al empezar. Un `--` delante
 *   (`pnpm test:mutation:changed -- <base>`) se ignora: pnpm lo reenvía tal cual, y antes la base
 *   acababa en Stryker como un flag más y la corrida se medía contra `main` sin avisar.
 * - **Qué muta y qué puntúa:** Stryker muta los archivos ENTEROS; el score se calcula aquí, solo
 *   con los mutantes que tocan el cambio, y se compara con el `thresholds.break` de
 *   `stryker.config.mjs`. Por debajo, código de salida 1. Sin mutantes válidos en el cambio, lo
 *   dice y sale con 0: no hay nada que auditar, y un «NaN» de Stryker no se da por bueno en
 *   silencio.
 * - **Flags extra:** todo lo que va detrás de la base pasa tal cual a `stryker run` (por ejemplo
 *   `--concurrency 2`). `--reporters` no: el JSON que este script lee es uno de ellos.
 *
 * Stryker se lanza con el `node` actual sobre su propio `bin`, sin shell de por medio, y con su
 * configuración en un archivo temporal que extiende `stryker.config.mjs`: la lista de archivos no
 * pasa por la línea de comandos, donde `cmd.exe` —Windows es el entorno de referencia de
 * `scripts/migrate-test-db.mjs`— no trata las comas como sh.
 */

const TAG = '[test:mutation:changed]';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const explicitBase = args[0] !== undefined && !args[0].startsWith('-') ? args[0] : undefined;
const strykerArgs = explicitBase === undefined ? args : args.slice(1);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const git = (...gitArgs) =>
  execFileSync('git', ['-c', 'core.quotePath=false', ...gitArgs], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

/** Un error de uso o de entorno, no de mutación: sale con 2, como antes. */
class UsageError extends Error {}

const fail = (message) => {
  throw new UsageError(message);
};

const main = async (workDir) => {
  let base = explicitBase;
  if (base === undefined) {
    try {
      base = git('merge-base', 'HEAD', 'main').trim();
    } catch {
      fail(
        'no encuentro `main` para calcular la base. Pásala explícita: ' +
          'pnpm test:mutation:changed <commit>',
      );
    }
  }
  try {
    git('rev-parse', '--verify', '--quiet', `${base}^{commit}`);
  } catch {
    fail(`«${base}» no es un commit de este repositorio.`);
  }

  const { default: strykerConfig } = await import(
    pathToFileURL(join(repoRoot, 'stryker.config.mjs')).href
  );
  const scope = strykerConfig.mutate;
  const breakAt = strykerConfig.thresholds?.break ?? null;

  // Flags del diff fijados aquí y no heredados de la config de git del usuario: `-w` para que
  // re-indentar no cuente como código nuevo, y `--inter-hunk-context=0` porque un
  // `diff.interHunkContext` fusiona hunks y mete en el rango las líneas sin tocar de entre medias.
  const DIFF_FLAGS = ['-U0', '-w', '--inter-hunk-context=0', '--no-color', '--no-ext-diff'];

  /** El diff de `path` contra `base`, o contra el archivo `from` tal como estaba en `base`. */
  const diffOf = (path, from) => {
    if (from === undefined) {
      return git('diff', ...DIFF_FLAGS, base, '--', path);
    }
    const original = join(workDir, 'original.ts');
    writeFileSync(original, git('show', `${base}:${from}`));
    // `--no-index` sale con 1 cuando hay diferencias: es el caso normal, no un error.
    const result = spawnSync('git', ['diff', '--no-index', ...DIFF_FLAGS, '--', original, path], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0 && result.status !== 1) {
      fail(`no pude comparar ${path} con ${from}: ${result.stderr}`);
    }
    return result.stdout;
  };

  const testFiles = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src')
    .split('\n')
    .filter((path) => subjectOfSpec(path) !== undefined && existsSync(join(repoRoot, path)));

  /** Los specs unitarios que importan el helper, por ruta y por alias de `tsconfig.json`. */
  const specsImporting = (helper) => {
    const target = helper.replace(/\.ts$/, '');
    return testFiles.filter((spec) =>
      importedPaths(readFileSync(join(repoRoot, spec), 'utf8'), spec).includes(target),
    );
  };

  const surface = changeSurface({
    nameStatus: git('diff', '--name-status', '-M', '--no-color', base),
    untracked: git('ls-files', '--others', '--exclude-standard'),
    diffOf,
    specsImporting,
    scope,
  }).filter(({ path }) => existsSync(join(repoRoot, path)));

  if (surface.length === 0) {
    console.log(`${TAG} nada que mutar: ningún cambio en domain/ ni application/ desde ${base}.`);
    return 0;
  }

  console.log(`${TAG} base ${base} — ${surface.length} archivos:`);
  for (const { path, lines } of surface) {
    const what =
      lines === 'all' ? 'entero' : lines.map(({ start, end }) => `${start}-${end}`).join(', ');
    console.log(`  ${path} (${what})`);
  }

  const reportPath = join(workDir, 'mutation.json');
  const configPath = join(workDir, 'stryker.changed.config.mjs');
  writeFileSync(
    configPath,
    [
      `import base from ${JSON.stringify(pathToFileURL(join(repoRoot, 'stryker.config.mjs')).href)};`,
      '',
      'export default {',
      '  ...base,',
      `  mutate: ${JSON.stringify(surface.map(({ path }) => path))},`,
      // El umbral lo aplica este script sobre los mutantes del cambio, no Stryker sobre los
      // archivos enteros, que mezclarían la deuda antigua de esas mismas líneas.
      '  thresholds: { ...base.thresholds, break: null },',
      "  reporters: ['progress', 'json'],",
      `  jsonReporter: { fileName: ${JSON.stringify(reportPath)} },`,
      '};',
      '',
    ].join('\n'),
  );

  const require = createRequire(import.meta.url);
  const corePackagePath = require.resolve('@stryker-mutator/core/package.json');
  const { bin } = JSON.parse(readFileSync(corePackagePath, 'utf8'));
  const strykerBin = join(dirname(corePackagePath), typeof bin === 'string' ? bin : bin.stryker);

  const run = spawnSync(process.execPath, [strykerBin, 'run', configPath, ...strykerArgs], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (run.error) {
    fail(`no se pudo lanzar Stryker: ${run.error.message}`);
  }
  if (run.status !== 0) {
    return run.status ?? 1;
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const mutants = mutantsTouchingChange(report, surface);
  const { detected, undetected, valid, score } = changeScore(mutants);

  if (score === undefined) {
    console.log(
      `${TAG} ningún mutante válido toca el cambio: no hay nada que auditar (sin score, no un 100 %).`,
    );
  } else {
    console.log(
      `${TAG} mutantes del cambio: ${valid} válidos, ${detected} detectados — ${score.toFixed(2)} %` +
        (breakAt === null ? '' : ` (umbral ${breakAt}).`),
    );
    for (const mutant of undetected) {
      const { line, column } = mutant.location.start;
      const replacement = mutant.replacement === undefined ? '' : ` → ${mutant.replacement}`;
      console.log(
        `  [${mutant.status}] ${mutant.path}:${line}:${column} ${mutant.mutatorName}${replacement}`,
      );
    }
    if (undetected.length > 0 && valid < 7) {
      console.log(
        `${TAG} con ${valid} mutantes, un solo superviviente equivalente ya baja del 85 %. Si lo es ` +
          '—no hay test que pueda distinguirlo—, márcalo en el código con ' +
          '`// Stryker disable next-line <Mutador>: <motivo>` en vez de escribir un test que no ' +
          'prueba nada.',
      );
    }
    if (breakAt !== null && score < breakAt) {
      console.error(`${TAG} el score del cambio está por debajo del umbral.`);
      return 1;
    }
  }
  return 0;
};

const workDir = mkdtempSync(join(tmpdir(), 'mutation-changed-'));
let exitCode;
try {
  exitCode = await main(workDir);
} catch (error) {
  if (!(error instanceof UsageError)) {
    throw error;
  }
  console.error(`${TAG} ${error.message}`);
  exitCode = 2;
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
process.exit(exitCode);
