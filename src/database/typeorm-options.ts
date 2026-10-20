import { join } from 'node:path';

import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import type { DatabaseConfig } from '@config/database.config';

import { ParameterFreeLogger } from './parameter-free-logger';

/**
 * Las entidades del ORM y las migraciones se descubren por glob en lugar de listarse a
 * mano: un módulo nuevo solo tiene que colocar su `*.orm-entity.ts` bajo
 * `infrastructure/persistence/` y queda registrado. Se incluyen las extensiones `.js`
 * porque en producción se ejecuta el build de `dist/`.
 */
export const ENTITIES_GLOB = join(__dirname, '..', 'modules', '**', '*.orm-entity.{ts,js}');
export const MIGRATIONS_GLOB = join(__dirname, 'migrations', '*.{ts,js}');

export const buildTypeOrmOptions = (config: DatabaseConfig): TypeOrmModuleOptions => {
  const options = {
    type: 'postgres' as const,
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    schema: config.schema,
    ssl: config.ssl,
    synchronize: config.synchronize,
    migrationsRun: config.migrationsRun,
    logging: config.logging,
    entities: [ENTITIES_GLOB],
    migrations: [MIGRATIONS_GLOB],
    migrationsTableName: 'migrations',
    // `pg` acepta estas opciones de pool directamente.
    extra: {
      max: config.poolMax,
      idleTimeoutMillis: config.poolIdleTimeoutMs,
      connectionTimeoutMillis: config.connectionTimeoutMs,
    },
    autoLoadEntities: true,
  };
  // El logger lee `logging` de este mismo objeto en cada llamada (ver `ParameterFreeLogger`), así
  // que sigue a `DB_LOGGING` y a lo que cada comando de la CLI fije después con `setOptions`.
  return Object.assign(options, { logger: new ParameterFreeLogger(options) });
};
