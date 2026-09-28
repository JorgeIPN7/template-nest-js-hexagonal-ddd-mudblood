// Tipos de `scalar-bundle.mjs` para los specs en TypeScript: `tsconfig.json` no activa `allowJs`,
// así que sin esta declaración el import desde `src/__tests__/` sería `any` implícito (TS7016).

/** Línea que se antepone al bundle para que su Zod no pruebe `Function('')`. Ver el `.mjs`. */
export declare const ZOD_JITLESS_PRELUDE: string;

/** Lo que `publishScalarBundle` escribe en `scalar-asset.json` y devuelve. */
export type ScalarAsset = {
  fileName: string;
  version: string;
  bytes: number;
};

export declare function publishScalarBundle(options: {
  vendorBundle: Buffer;
  version: string;
  outDir: string;
}): ScalarAsset;
