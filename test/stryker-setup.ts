import fc from 'fast-check';

/**
 * Solo corre bajo Stryker: lo añade `stryker.config.mjs` a los `setupFiles` de Jest, nunca la
 * suite normal, que sigue explorando una semilla distinta en cada corrida.
 *
 * `@fast-check/jest` escribe la semilla en el TÍTULO del test —`(with seed=N)`— y, si nadie la
 * fija, la toma de `jest.getSeed()`, que cambia en cada `runCLI`. Stryker, con `perTest`, apunta
 * cada mutante a los tests que lo cubrieron en el dry run filtrando por ese título exacto: en la
 * corrida del mutante el título ya es otro, el filtro no casa con nada y la fila de propiedad no
 * llega a ejecutarse. El mutante sale «Survived» aunque la propiedad lo mate con cualquier
 * semilla. Medido el 2026-10-01 en `order-concept.vo.ts`: sin este archivo sobrevivían los dos
 * `EqualityOperator` de la línea 11 (84.62 %); con él muere el `< 1` → `<= 1`, que la fila de
 * propiedad mata (92.31 %). El otro, `> 140` → `>= 140`, sigue vivo con razón: ningún caso usa
 * exactamente 140 caracteres, y los arbitrarios de fast-check rara vez llegan al tope.
 *
 * `@fast-check/jest` prefiere la semilla global de fast-check a la de Jest, así que fijarla aquí
 * basta. `configureGlobal` reemplaza la configuración entera: por eso se parte de la actual.
 */
fc.configureGlobal({ ...fc.readConfigureGlobal(), seed: 20_261_001 });
