/**
 * Qué mutar cuando solo interesa el código NUEVO de una rama: los archivos nuevos de `domain/` y
 * `application/`, enteros, y de los modificados solo sus líneas añadidas, como rangos
 * `ruta:inicio-fin` que `stryker run --mutate` acepta.
 *
 * **Por qué existe.** `pnpm test:mutation` muta todo el alcance de `stryker.config.mjs`, y sus
 * supervivientes mezclan la deuda antigua (documentada en la cabecera de esa config) con lo que
 * acaba de escribirse. Los flujos de trabajo (`docs/development-workflows.md`) auditan el código
 * nuevo, así que antes había que cruzar a mano cada superviviente con el diff. Con rangos, lo que
 * sobrevive es del cambio y nada más, y el umbral de la config se aplica a ese código. Medido en
 * el experimento de skills del 2026-09-30: una corrida por rangos tarda segundos, no minutos.
 *
 * Vive aparte de `mutate-changed.mjs` por el mismo motivo que `scalar-bundle.mjs`: este módulo
 * solo exporta funciones puras sobre la salida de git, y el otro es el que ejecuta git y Stryker.
 * Lo ejercita `src/__tests__/mutation-targets.spec.ts`.
 */

/**
 * El alcance de `mutate` en `stryker.config.mjs`: dominio y aplicación de cada módulo, más el
 * kernel compartido. Si la config cambia de alcance, esta expresión cambia con ella.
 */
export const MUTATION_SCOPE =
  /^src\/(?:modules\/[^/]+\/(?:domain|application)|shared\/domain)\/.+\.ts$/;

/** ¿Entra el archivo (ruta relativa a la raíz del repo, con `/`) en el alcance de la mutación? */
export function isInMutationScope(path) {
  return MUTATION_SCOPE.test(path);
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
 * Las entradas para `--mutate`, a partir de tres lecturas de git contra la base:
 *
 * - `nameStatus`: la salida de `git diff --name-status <base>`. Un archivo añadido, renombrado o
 *   copiado se muta entero, porque todas sus líneas son nuevas para esta rama; uno modificado,
 *   solo en sus rangos añadidos; uno borrado, nunca.
 * - `untracked`: la salida de `git ls-files --others --exclude-standard`. Mientras un flujo
 *   trabaja nada está confirmado, y un archivo nuevo sin `git add` no aparece en ningún diff.
 * - `diffOf(path)`: el `git diff -U0 <base> -- <path>` de un archivo modificado.
 */
export function mutationTargets({ nameStatus, untracked, diffOf }) {
  const targets = [];
  for (const line of nameStatus.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const fields = line.split('\t');
    const status = fields[0].charAt(0);
    const path = fields[fields.length - 1];
    if (status === 'D' || !isInMutationScope(path)) {
      continue;
    }
    if (status === 'A' || status === 'R' || status === 'C') {
      targets.push(path);
      continue;
    }
    for (const { start, end } of addedLineRanges(diffOf(path))) {
      targets.push(`${path}:${start}-${end}`);
    }
  }
  for (const path of untracked.split('\n')) {
    if (path.trim() !== '' && isInMutationScope(path)) {
      targets.push(path);
    }
  }
  return targets;
}
