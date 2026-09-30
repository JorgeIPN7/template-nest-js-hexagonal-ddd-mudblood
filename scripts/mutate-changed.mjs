import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mutationTargets } from './mutation-targets.mjs';

/**
 * `pnpm test:mutation:changed [base] [flags de Stryker…]` — muta solo el código nuevo desde
 * `base`: las líneas cambiadas de `domain/` y `application/` y los archivos nuevos enteros, con
 * lo que no está confirmado incluido. Qué entra y por qué lo explica `mutation-targets.mjs`.
 *
 * - **Base por defecto:** `git merge-base HEAD main`, lo que esta rama cambió respecto a `main`.
 *   Los flujos pasan la suya, el `git rev-parse HEAD` que guardaron al empezar.
 * - **Umbral:** el `thresholds.break` de `stryker.config.mjs` se aplica a ese código nuevo. Un
 *   score por debajo sale con código distinto de 0, igual que `pnpm test:mutation`.
 * - **Flags extra:** todo lo que va detrás de la base pasa tal cual a `stryker run`, por ejemplo
 *   `--reporters json,clear-text` o `--disableBail`.
 *
 * Stryker se lanza con el `node` actual sobre su propio `bin`, sin shell de por medio. Con
 * `shell: true`, las comas y los dos puntos de `--mutate` quedarían a merced del intérprete de
 * comandos, y en Windows —el entorno de referencia de `scripts/migrate-test-db.mjs`— `cmd.exe`
 * no los trata como sh.
 *
 * Saltarse el shim de pnpm tiene un precio que se paga aquí: el shim de `node_modules/.bin`
 * exporta `NODE_PATH` con `node_modules/.pnpm/node_modules`, las dependencias izadas, y sin eso
 * el jest-runner de Stryker no encuentra `jest-environment-node` y la corrida inicial aborta
 * (medido el 2026-09-30). Se añade esa ruta a mano, que es lo único del shim que hace falta.
 */

const TAG = '[test:mutation:changed]';

const argv = process.argv.slice(2);
const explicitBase = argv[0] !== undefined && !argv[0].startsWith('-') ? argv[0] : undefined;
const strykerArgs = explicitBase === undefined ? argv : argv.slice(1);

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const fail = (message) => {
  console.error(`${TAG} ${message}`);
  process.exit(2);
};

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

const targets = mutationTargets({
  nameStatus: git('diff', '--name-status', base),
  untracked: git('ls-files', '--others', '--exclude-standard'),
  diffOf: (path) => git('diff', '-U0', base, '--', path),
});

if (targets.length === 0) {
  console.log(`${TAG} nada que mutar: ningún cambio en domain/ ni application/ desde ${base}.`);
  process.exit(0);
}

console.log(`${TAG} base ${base} — ${targets.length} objetivos:`);
for (const target of targets) {
  console.log(`  ${target}`);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const hoistedDependencies = join(repoRoot, 'node_modules', '.pnpm', 'node_modules');
const nodePath = [hoistedDependencies, process.env.NODE_PATH].filter(Boolean).join(delimiter);

const require = createRequire(import.meta.url);
const corePackagePath = require.resolve('@stryker-mutator/core/package.json');
const { bin } = JSON.parse(readFileSync(corePackagePath, 'utf8'));
const strykerBin = join(dirname(corePackagePath), typeof bin === 'string' ? bin : bin.stryker);

const result = spawnSync(
  process.execPath,
  [strykerBin, 'run', '--mutate', targets.join(','), ...strykerArgs],
  { stdio: 'inherit', env: { ...process.env, NODE_PATH: nodePath } },
);

if (result.error) {
  fail(`no se pudo lanzar Stryker: ${result.error.message}`);
}
process.exit(result.status ?? 1);
