// Tipos de `mutation-targets.mjs` para los specs en TypeScript: `tsconfig.json` no activa
// `allowJs`, así que sin esta declaración el import desde `src/__tests__/` sería `any` implícito
// (TS7016). Mismo patrón que `scalar-bundle.d.mts`.

export declare function isInMutationScope(path: string, scope: readonly string[]): boolean;

export type LineRange = { start: number; end: number };

export declare function addedLineRanges(diff: string): LineRange[];

export declare function subjectOfSpec(path: string): string | undefined;

export declare function isTestHelper(path: string): boolean;

export declare function importedPaths(source: string, fromPath: string): string[];

export type ChangedFile = { path: string; lines: 'all' | LineRange[] };

export declare function changeSurface(git: {
  nameStatus: string;
  untracked: string;
  diffOf: (path: string, from?: string) => string;
  specsImporting: (helper: string) => string[];
  scope: readonly string[];
}): ChangedFile[];

export type ReportMutant = {
  id: string;
  mutatorName: string;
  replacement?: string;
  status: string;
  location: { start: { line: number; column: number }; end: { line: number; column: number } };
};

export type MutationReport = { files: Record<string, { mutants: ReportMutant[] }> };

export declare function mutantsTouchingChange(
  report: MutationReport,
  surface: readonly ChangedFile[],
): (ReportMutant & { path: string })[];

export declare function changeScore(mutants: readonly ReportMutant[]): {
  detected: number;
  undetected: ReportMutant[];
  valid: number;
  score: number | undefined;
};
