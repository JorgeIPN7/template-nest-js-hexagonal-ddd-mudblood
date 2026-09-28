import { config as loadEnv } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';

// Imports relativos a propósito: la CLI de TypeORM corre con ts-node, que no resuelve
// los alias de `tsconfig.paths` sin `tsconfig-paths/register`. Usar rutas relativas aquí
// evita añadir esa dependencia solo para un archivo.
import { buildDatabaseConfig } from '../config/database.config';
import { envSchema } from '../config/env.schema';

import { buildTypeOrmOptions } from './typeorm-options';

/**
 * DataSource que consume la CLI de TypeORM (`pnpm migration:generate|run|revert`).
 * Vive fuera del contenedor de Nest, así que carga el `.env` por su cuenta y reutiliza
 * el mismo schema de Zod y el mismo builder de opciones que la aplicación, para que la
 * CLI y el runtime no puedan divergir.
 *
 * `override: false` parece redundante —es el valor por defecto documentado— y NO lo es: desde
 * dotenv 18, `config()` toma sus defaults de variables del entorno como `DOTENV_OVERRIDE`, y con
 * ella exportada el `.env` pisaría lo que ya está en `process.env`. Eso rompería la redirección a
 * la base de tests de `scripts/migrate-test-db.mjs` y `test/setup-env.ts` —los E2E del seed y
 * del relay harían TRUNCATE sobre la base de desarrollo— e invertiría además la precedencia
 * `.env.local` > `.env`. Una opción explícita gana a la variable. Lo fija `data-source.spec.ts`.
 */
loadEnv({ path: ['.env.local', '.env'], quiet: true, override: false });

const databaseConfig = buildDatabaseConfig(envSchema.parse(process.env));

// `synchronize` y `migrationsRun` no aplican a la CLI: sus comandos son explícitos.
export const dataSourceOptions = {
  ...buildTypeOrmOptions(databaseConfig),
  synchronize: false,
  migrationsRun: false,
} as DataSourceOptions;

// Un único export de `DataSource`: la CLI de TypeORM rechaza el archivo si encuentra
// más de uno (por ejemplo, exportarlo a la vez como named y como default).
export default new DataSource(dataSourceOptions);
