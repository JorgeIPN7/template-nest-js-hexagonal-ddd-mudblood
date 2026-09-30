// Tipos de `mutation-targets.mjs` para los specs en TypeScript: `tsconfig.json` no activa
// `allowJs`, así que sin esta declaración el import desde `src/__tests__/` sería `any` implícito
// (TS7016). Mismo patrón que `scalar-bundle.d.mts`.

/** El alcance de `mutate` en `stryker.config.mjs`. */
export declare const MUTATION_SCOPE: RegExp;

export declare function isInMutationScope(path: string): boolean;

export type LineRange = { start: number; end: number };

export declare function addedLineRanges(diff: string): LineRange[];

export declare function mutationTargets(git: {
  nameStatus: string;
  untracked: string;
  diffOf: (path: string) => string;
}): string[];
