import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { createTestApp } from '@test/helpers/create-test-app';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('debería responder 200 con la cabecera x-request-id', async () => {
      // Arrange
      // (app is bootstrapped in beforeAll)

      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('debería devolver al cliente el x-request-id recibido', async () => {
      // Arrange
      const correlation = 'e2e-corr-id-123';

      // Act
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('x-request-id', correlation);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers['x-request-id']).toBe(correlation);
    });
  });

  describe('GET /api/v1/health/liveness', () => {
    it('debería responder 200 con status ok', async () => {
      // Arrange
      // (app is bootstrapped in beforeAll)

      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/health/liveness');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  describe('GET /api/v1/health/readiness', () => {
    it('debería responder 200 con status ok', async () => {
      // Arrange
      // (app is bootstrapped in beforeAll)

      // Act
      const response = await request(app.getHttpServer()).get('/api/v1/health/readiness');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });

  // App propia: destruir el `DataSource` de la app compartida rompería las demás pruebas.
  // Destruirlo recorre el camino real de terminus 12 —la query lanza (`Driver not Connected`) y su
  // `err.message` iría al 503— sin mocks. No es una caída de PostgreSQL: con la base parada el
  // texto sería el de `pg`, pero el camino hasta el 503 es el mismo.
  describe('con el DataSource cerrado', () => {
    let downApp: INestApplication<App>;

    beforeAll(async () => {
      ({ app: downApp } = await createTestApp());
      await downApp.get(DataSource).destroy();
    });

    // El cierre no vuelve a destruir el DataSource: @nestjs/typeorm solo llama a `destroy()` si
    // `isInitialized`, y Nest 12 corre los hooks de apagado con `Promise.allSettled`.
    afterAll(async () => {
      await downApp.close();
    });

    it.each(['/api/v1/health', '/api/v1/health/readiness'])(
      'debería responder 503 en %s sin el texto del error de la base',
      async (path) => {
        // Arrange
        // (DataSource destruido en beforeAll)

        // Act
        const response = await request(downApp.getHttpServer()).get(path);

        // Assert
        expect(response.status).toBe(503);
        expect(Object.keys(response.body as object).sort()).toEqual(
          ['error', 'message', 'path', 'requestId', 'statusCode', 'timestamp'].sort(),
        );
        expect(response.body.message).toBe('Service Unavailable Exception');
        expect(response.body.error).toEqual({
          database: { status: 'down', responseTime: expect.any(Number) },
        });
      },
    );
  });
});
