// Tipos de `stryker.config.mjs` para los specs en TypeScript, que leen de ella el alcance de
// `mutate` en vez de copiarlo: `tsconfig.json` no activa `allowJs`. Mismo patrón que
// `scripts/scalar-bundle.d.mts`. Solo declara lo que algún spec consume.

declare const config: {
  mutate: string[];
  thresholds: { high: number; low: number; break: number | null };
};

export default config;
