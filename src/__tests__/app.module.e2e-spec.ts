import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from '../app.module';
import type { AppConfig } from '../config/app.config';
import type { CorsConfig } from '../config/cors.config';
import type { LogConfig } from '../config/log.config';
import type { ThrottlerConfigValues } from '../config/throttler.config';
import { HealthController } from '../modules/health/health.controller';
import { UserRepository } from '../modules/users/domain/ports/user.repository';
import { UserTypeOrmRepository } from '../modules/users/infrastructure/persistence/user.typeorm.repository';

/**
 * E2E: compilar `AppModule` levanta también la conexión a PostgreSQL, así que necesita la
 * base arriba (`pnpm db:up`). Valida el grafo de DI completo: si un provider global, una
 * factory asíncrona (Throttler, CLS, Pino) o un token de módulo estuviera mal cableado,
 * `compile()` lanzaría aquí en vez de fallar al arrancar en producción.
 *
 * Lo que NO se comprueba aquí: que cada namespace de configuración devuelva algo. Eso lo
 * cubre `config/__tests__/` con aserciones sobre los valores, y sin necesitar Postgres.
 */
describe('AppModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('debería registrar ConfigService de forma global', () => {
    // Act
    const configService = moduleRef.get(ConfigService, { strict: false });

    // Assert
    expect(configService).toBeInstanceOf(ConfigService);
  });

  // El cableado más frágil de una arquitectura hexagonal. Desde el ciclo 2 el token ya no
  // es un `Symbol` aparte sino la propia `abstract class` del puerto: una clase sobrevive
  // a la compilación, así que la MISMA referencia es el tipo y el token. El riesgo se
  // desplaza pero no desaparece — un `import type` en un consumidor borraría esa
  // referencia y el fallo saldría al resolver en runtime, con lint y typecheck verdes.
  // Este test lo adelanta. (El texto del `it` conserva la palabra «Symbol» del ciclo 1:
  // renombrarlo queda fuera del alcance del refactor, que no toca textos de test.)
  it('debería resolver el puerto del repositorio por su token Symbol', () => {
    // Act
    const repository = moduleRef.get(UserRepository, { strict: false });

    // Assert
    expect(repository).toBeInstanceOf(UserTypeOrmRepository);
  });

  it('debería tener una conexión a la base establecida', () => {
    // Act
    const dataSource = moduleRef.get(DataSource, { strict: false });

    // Assert
    expect(dataSource.isInitialized).toBe(true);
  });

  it('debería exponer la configuración de throttler que consume el guard global', () => {
    // Arrange
    const configService = moduleRef.get(ConfigService, { strict: false });

    // Act
    const throttler = configService.getOrThrow<ThrottlerConfigValues>('throttler');

    // Assert
    expect(throttler.ttlMs).toBeGreaterThan(0);
    expect(throttler.limit).toBeGreaterThan(0);
  });

  it('debería resolver el HealthController del módulo de features', () => {
    // Act
    const controller = moduleRef.get(HealthController, { strict: false });

    // Assert
    expect(controller).toBeInstanceOf(HealthController);
  });

  it('debería dejar accesibles las configuraciones que usa el bootstrap', () => {
    // Arrange
    const configService = moduleRef.get(ConfigService, { strict: false });

    // Act
    const app = configService.getOrThrow<AppConfig>('app');
    const cors = configService.getOrThrow<CorsConfig>('cors');
    const log = configService.getOrThrow<LogConfig>('log');

    // Assert
    expect(app.globalPrefix).toBeTruthy();
    expect(cors.options).toBeDefined();
    expect(log.level).toBeTruthy();
  });
});
