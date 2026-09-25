import { fc, it as itProp } from '@fast-check/jest';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

import { buildAppConfig } from '@test/helpers/config.factory';

import { HealthController } from '../health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheck: { check: jest.Mock };
  let memory: { checkHeap: jest.Mock; checkRSS: jest.Mock };
  let database: { pingCheck: jest.Mock };

  beforeEach(async () => {
    healthCheck = { check: jest.fn().mockResolvedValue({ status: 'ok' }) };
    memory = {
      checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }),
      checkRSS: jest.fn().mockResolvedValue({ memory_rss: { status: 'up' } }),
    };
    database = { pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheck },
        { provide: MemoryHealthIndicator, useValue: memory },
        { provide: TypeOrmHealthIndicator, useValue: database },
        { provide: ConfigService, useValue: { getOrThrow: () => buildAppConfig() } },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  describe('liveness()', () => {
    // Liveness contesta "¿hay que reiniciar el proceso?". Consultar la base aquí haría
    // que una caída de Postgres provocara reinicios en cadena que no arreglan nada.
    it('debería invocar check() sin indicadores, sin tocar la base', async () => {
      // Act
      const result = await controller.liveness();

      // Assert
      expect(result.status).toBe('ok');
      expect(healthCheck.check).toHaveBeenCalledWith([]);
      expect(database.pingCheck).not.toHaveBeenCalled();
    });
  });

  // `readiness()` y `check()` comparten indicadores, así que se verifican en paralelo:
  // duplicar el cuerpo hacía que una divergencia entre ambos pasara desapercibida.
  describe.each([
    ['readiness', (c: HealthController) => c.readiness()],
    ['check', (c: HealthController) => c.check()],
  ])('%s()', (_name, invoke) => {
    it('debería comprobar memoria y base con los límites configurados', async () => {
      // Act
      await invoke(controller);

      // Assert
      expect(healthCheck.check).toHaveBeenCalledTimes(1);
      const indicators = healthCheck.check.mock.calls[0][0] as (() => Promise<unknown>)[];
      expect(indicators).toHaveLength(3);
      await Promise.all(indicators.map((fn) => fn()));
      expect(memory.checkHeap).toHaveBeenCalledWith('memory_heap', 300 * 1024 * 1024);
      expect(memory.checkRSS).toHaveBeenCalledWith('memory_rss', 600 * 1024 * 1024);
      expect(database.pingCheck).toHaveBeenCalledWith('database');
    });

    it('debería propagar el rechazo cuando la base no responde', async () => {
      // Arrange
      database.pingCheck.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      healthCheck.check.mockImplementationOnce(async (indicators: (() => Promise<unknown>)[]) => {
        await Promise.all(indicators.map((fn) => fn()));
        return { status: 'ok' };
      });

      // Act + Assert
      await expect(invoke(controller)).rejects.toThrow('ECONNREFUSED');
    });

    it('debería propagar el rechazo cuando el indicador de memoria falla', async () => {
      // Arrange
      memory.checkHeap.mockRejectedValueOnce(new Error('OOM'));
      healthCheck.check.mockImplementationOnce(async (indicators: (() => Promise<unknown>)[]) => {
        await Promise.all(indicators.map((fn) => fn()));
        return { status: 'ok' };
      });

      // Act + Assert
      await expect(invoke(controller)).rejects.toThrow('OOM');
    });

    // Terminus 12 añade `message: err.message` cuando la query falla, y `AllExceptionsFilter`
    // publica ese mapa en el 503 de sondas `@Public`: el texto crudo del driver (usuario, host,
    // puerto) llegaría a cualquiera. El contrato de v11 no lo traía y se mantiene.
    describe('saneado del indicador database', () => {
      const databaseResult = async (): Promise<unknown> => {
        await invoke(controller);
        const indicators = healthCheck.check.mock.calls.at(-1)?.[0] as (() => Promise<
          Record<string, unknown>
        >)[];
        const results = await Promise.all(indicators.map((fn) => fn()));
        return results.find((result) => 'database' in result)?.database;
      };

      it('debería quitar el mensaje del driver cuando la query falla', async () => {
        // Arrange
        database.pingCheck.mockResolvedValueOnce({
          database: {
            status: 'down',
            responseTime: 4,
            message: 'password authentication failed for user "app"',
          },
        });

        // Act
        const result = await databaseResult();

        // Assert
        expect(result).toEqual({ status: 'down', responseTime: 4 });
      });

      it('debería conservar el mensaje de timeout que genera terminus', async () => {
        // Arrange
        const timedOut = {
          status: 'down',
          responseTime: 1001,
          message: 'timeout of 1000ms exceeded',
        };
        database.pingCheck.mockResolvedValueOnce({ database: timedOut });

        // Act
        const result = await databaseResult();

        // Assert
        expect(result).toEqual(timedOut);
      });

      it('debería dejar intacto un resultado en verde, responseTime incluido', async () => {
        // Arrange
        database.pingCheck.mockResolvedValueOnce({ database: { status: 'up', responseTime: 2 } });

        // Act
        const result = await databaseResult();

        // Assert
        expect(result).toEqual({ status: 'up', responseTime: 2 });
      });

      itProp.prop([fc.string()])(
        'debería quitar el mensaje del driver sea cual sea su detalle',
        async (detail) => {
          // Arrange
          database.pingCheck.mockResolvedValueOnce({
            database: {
              status: 'down',
              responseTime: 1,
              message: `connect ECONNREFUSED ${detail}`,
            },
          });

          // Act
          const result = await databaseResult();

          // Assert
          expect(result).toEqual({ status: 'down', responseTime: 1 });
        },
      );

      itProp.prop([fc.integer({ min: 0, max: 2 ** 32 - 1 })])(
        'debería conservar el mensaje de timeout sea cual sea el límite configurado',
        async (timeoutMs) => {
          // Arrange
          const message = `timeout of ${timeoutMs}ms exceeded`;
          database.pingCheck.mockResolvedValueOnce({
            database: { status: 'down', responseTime: timeoutMs, message },
          });

          // Act
          const result = await databaseResult();

          // Assert
          expect(result).toEqual({ status: 'down', responseTime: timeoutMs, message });
        },
      );

      // Las anclas `^…$` de la regex son lo único que impide que un texto del driver viaje
      // pegado al de timeout. Estas dos propiedades las fijan: sin `$` cae la primera, sin `^`
      // la segunda. Un prefijo o sufijo NO vacío nunca puede casar con la regex anclada, así que
      // el arbitrario se construye con `minLength: 1` en vez de filtrarse.
      itProp.prop([fc.integer({ min: 0, max: 60_000 }), fc.string({ minLength: 1 })])(
        'debería quitar el mensaje cuando el texto de timeout lleva algo detrás',
        async (timeoutMs, suffix) => {
          // Arrange
          database.pingCheck.mockResolvedValueOnce({
            database: {
              status: 'down',
              responseTime: 1,
              message: `timeout of ${timeoutMs}ms exceeded${suffix}`,
            },
          });

          // Act
          const result = await databaseResult();

          // Assert
          expect(result).toEqual({ status: 'down', responseTime: 1 });
        },
      );

      itProp.prop([fc.integer({ min: 0, max: 60_000 }), fc.string({ minLength: 1 })])(
        'debería quitar el mensaje cuando el texto de timeout lleva algo delante',
        async (timeoutMs, prefix) => {
          // Arrange
          database.pingCheck.mockResolvedValueOnce({
            database: {
              status: 'down',
              responseTime: 1,
              message: `${prefix}timeout of ${timeoutMs}ms exceeded`,
            },
          });

          // Act
          const result = await databaseResult();

          // Assert
          expect(result).toEqual({ status: 'down', responseTime: 1 });
        },
      );
    });
  });
});
