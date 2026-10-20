import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import type { DataSource } from 'typeorm';

import type * as DataSourceModule from '../data-source';

/**
 * `data-source.ts` carga el `.env` por su cuenta (la CLI de TypeORM, el seed y el relay del
 * outbox viven fuera de Nest) y todo el repo da por hecho que NO pisa lo que ya está en
 * `process.env`: así redirigen a la base de tests `scripts/migrate-test-db.mjs` y
 * `test/setup-env.ts`. Si lo pisara, los E2E del seed y del relay —que hacen TRUNCATE— irían
 * contra la base de DESARROLLO.
 *
 * Desde dotenv 18, `config()` toma sus valores por defecto de variables del entorno como
 * `DOTENV_OVERRIDE`. Con ella exportada en el shell, un `config()` sin `override` explícito pasa a
 * pisar. Estos casos la exportan a propósito y exigen que la carga siga sin pisar nada.
 */
describe('data-source', () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'data-source-'));
    process.chdir(workdir);
    process.env.DOTENV_OVERRIDE = 'true';
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(workdir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('debería conservar el DB_DATABASE del entorno aunque DOTENV_OVERRIDE=true y el .env diga otra cosa', () => {
    // Arrange
    writeFileSync(join(workdir, '.env'), 'DB_DATABASE=from_file\n');
    process.env.DB_DATABASE = 'from_env';

    // Act
    const database = loadedDatabase();

    // Assert
    expect(database).toBe('from_env');
  });

  it('debería dar prioridad a .env.local sobre .env aunque DOTENV_OVERRIDE=true', () => {
    // Arrange
    writeFileSync(join(workdir, '.env.local'), 'DB_DATABASE=from_local\n');
    writeFileSync(join(workdir, '.env'), 'DB_DATABASE=from_file\n');
    delete process.env.DB_DATABASE;

    // Act
    const database = loadedDatabase();

    // Assert
    expect(database).toBe('from_local');
  });

  // Cada comando de la CLI de TypeORM fija su propio `logging` con `setOptions`
  // (`migration:show` pide `['schema']`; `migration:run` y `migration:revert`, también
  // `'query'` y `'error'`), y `setOptions` recrea el logger con `LoggerFactory.create`, que
  // devuelve tal cual una instancia. Si `ParameterFreeLogger` se quedara con el `DB_LOGGING` de su
  // constructor, `pnpm migration:show` saldría con 0 sin listar ninguna migración.
  it('debería imprimir lo que pide un comando de la CLI que fija su logging con setOptions', () => {
    // Arrange
    writeFileSync(join(workdir, '.env'), 'DB_LOGGING=false\n');
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const dataSource = loadedDataSource();
    dataSource.setOptions({ logging: ['schema'] });

    // Act
    dataSource.logger.logSchemaBuild('[X] 1 CreateUsers1700000000000');

    // Assert
    const printed = consoleLog.mock.calls
      .flat()
      .map((part) => stripVTControlCharacters(String(part)));
    expect(printed.join(' ')).toContain('[X] 1 CreateUsers1700000000000');
  });
});

// Helpers

/** Evalúa `data-source.ts` desde cero (su `loadEnv` corre al importarse) y devuelve la base. */
const loadedDatabase = (): unknown => {
  let database: unknown;
  jest.isolateModules(() => {
    const { dataSourceOptions } = jest.requireActual<typeof DataSourceModule>('../data-source');
    database = (dataSourceOptions as { database?: unknown }).database;
  });
  return database;
};

/** El `DataSource` que exporta `data-source.ts`, evaluado desde cero, como lo carga la CLI. */
const loadedDataSource = (): DataSource => {
  let dataSource: DataSource | undefined;
  jest.isolateModules(() => {
    dataSource = jest.requireActual<typeof DataSourceModule>('../data-source').default;
  });
  if (!dataSource) {
    throw new Error('data-source.ts no exportó un DataSource');
  }
  return dataSource;
};
