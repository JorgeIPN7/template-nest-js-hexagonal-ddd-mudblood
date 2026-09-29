import type { NestExpressApplication } from '@nestjs/platform-express';

import type { CorsConfig } from '../cors.config';

/**
 * Prueba de TIPOS: el veredicto lo da `pnpm typecheck`, no Jest. SWC borra los tipos antes de
 * ejecutar, así que en `pnpm test` este `it` pasa siempre; si la igualdad se rompe, la línea
 * `const identical: … = true` deja de compilar (TS2322) y el gate que se pone rojo es el
 * typecheck.
 *
 * La referencia es `@nestjs/platform-express` y no la subruta de `@nestjs/common` de la que
 * salía `CorsOptions`: esa subruta es justo lo que `cors.config.ts` dejó de importar, y
 * compararse con ella dejaría aquí el mismo import que se rompe el día que Nest cierre el
 * comodín `./*`. La raíz de `platform-express` es API pública y su `enableCors` es lo que la
 * aplicación ejecuta de verdad sobre Express (`INestApplication.enableCors` acepta `any`).
 *
 * Este spec solo fija la EQUIVALENCIA del tipo derivado; no es la regresión del import. Con el
 * `CorsOptions` de la subruta la igualdad también se cumplía, así que aquí no hay rojo que
 * enseñar. Lo que impide que `cors.config.ts` vuelva a importar la subruta es la regla
 * `no-restricted-imports`, y la vigila `src/__tests__/eslint-config.spec.ts` (caso del
 * `import type` de `interfaces/external/cors-options.interface`).
 */

/** Igualdad exacta: a diferencia de la asignabilidad mutua, `any` no la satisface. */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Lo que `enableCors` acepta con Express, sin el `undefined` del opcional ni la función delegada. */
type ExpressCorsOptions = Exclude<
  Parameters<NestExpressApplication['enableCors']>[0],
  undefined | ((...args: never[]) => unknown)
>;

describe('CorsConfig', () => {
  it('debería tipar `options` exactamente como las CorsOptions que acepta enableCors en Express', () => {
    // Arrange
    type Options = CorsConfig['options'];
    // Act
    const identical: Equals<Options, ExpressCorsOptions> = true;
    // Assert
    expect(identical).toBe(true);
  });
});
