import { baseConfig } from '../jest.config.mjs';

/**
 * Config de la suite E2E. Hereda de `jest.config.mjs` en vez de duplicar el transform de
 * SWC y el mapa de aliases, que es como estaba antes y garantizaba que ambos divergieran.
 *
 * @type {import('jest').Config}
 */
const config = {
  ...baseConfig,
  // `rootDir` se resuelve relativo a este archivo, que vive en `test/`.
  rootDir: '..',
  testRegex: '\\.e2e-spec\\.ts$',
  // Arrancar el AppModule real y conectar a Postgres es lento comparado con un unitario.
  testTimeout: 30_000,
  // Un solo worker: las suites E2E comparten base y `users.e2e-spec.ts` hace TRUNCATE en
  // cada `beforeEach`. En paralelo, una suite vaciaría la tabla de otra a mitad de un test.
  maxWorkers: 1,
  // Mide justo lo que la suite unitaria excluye argumentando que "lo cubren los E2E".
  // Sin esto aquello era un acto de fe: nadie comprobaba que fuera cierto.
  collectCoverageFrom: [
    'src/**/*.module.ts',
    'src/**/*.typeorm.repository.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage-e2e',
  coverageReporters: ['text', 'lcov'],
  // `branches: 30` — mismo fenómeno que documenta `jest.config.mjs` para la unitaria, pero
  // aquí la desproporción es extrema y está medida (2026-08-06, lcov de esta suite): de las
  // 130 ramas del scope, 106 son sintéticas de los helpers de decoradores de SWC — los cinco
  // `*.module.ts` reportan 19 ramas cada uno con BRDA más allá de su EOF, y `health.module.ts`
  // tiene 10 líneas y CERO condicionales en el fuente. Cubriendo TODA rama real alcanzable el
  // techo es 60/130 = 46 %: el 50 heredado era matemáticamente impasable y nunca estuvo verde
  // desde que nació (a30a677). El suelo en 30 queda bajo el 33 % medido hoy con margen corto:
  // sigue detectando un colapso real (suites que dejan de arrancar módulos), sin fingir una
  // cobertura que esta instrumentación no puede medir.
  coverageThreshold: {
    global: { branches: 30, functions: 80, lines: 80, statements: 80 },
  },
};

export default config;
