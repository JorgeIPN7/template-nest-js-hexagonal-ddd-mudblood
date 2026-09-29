import type { NestApplicationOptions } from '@nestjs/common';
import { registerAs } from '@nestjs/config';

import { envSchema, splitList } from './env.schema';

/**
 * Las `CorsOptions` de Nest, derivadas de un tipo que la raíz de `@nestjs/common` SÍ exporta.
 *
 * `@nestjs/common` 12.1.0 no exporta `CorsOptions` desde su raíz: solo desde la subruta
 * `interfaces/external/cors-options.interface`, que resuelve por el comodín `./*` de su mapa
 * `exports`, y desde `./internal`, que no es API pública. Las dos se pueden cerrar en un patch,
 * y ese día `typecheck` y `build` fallarían aquí; `eslint.config.mjs` ya no deja importarlas.
 * `NestApplicationOptions['cors']` es público y vale `boolean | CorsOptions |
 * CorsOptionsDelegate<any>`: sin el `undefined` del opcional, sin el booleano y sin la función
 * delegada queda exactamente `CorsOptions`. `__tests__/cors.config.spec.ts` fija esa igualdad
 * contra lo que acepta `enableCors` en `@nestjs/platform-express`.
 */
type NestCorsOptions = Exclude<
  NonNullable<NestApplicationOptions['cors']>,
  boolean | ((...args: never[]) => unknown)
>;

export type CorsConfig = {
  enabled: boolean;
  options: NestCorsOptions;
};

export const corsConfig = registerAs('cors', (): CorsConfig => {
  const env = envSchema.parse(process.env);
  const origins = splitList(env.CORS_ORIGINS);
  const allowAll = origins.length === 0 || origins.includes('*');

  if (allowAll && env.CORS_CREDENTIALS) {
    throw new Error(
      'CORS misconfiguration: CORS_ORIGINS=* is incompatible with CORS_CREDENTIALS=true. ' +
        'Provide an explicit origin list when credentials are enabled.',
    );
  }

  return {
    enabled: env.CORS_ENABLED,
    options: {
      origin: allowAll ? true : origins,
      credentials: env.CORS_CREDENTIALS,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-correlation-id'],
      exposedHeaders: ['x-request-id'],
      maxAge: 86_400,
    },
  };
});
