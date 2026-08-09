import type { INestApplication } from '@nestjs/common';

import { buildAppConfig } from '@test/helpers/config.factory';

import { setupOpenApi } from '../openapi';
import type { buildOpenApiDocument } from '../openapi-document';

describe('setupOpenApi', () => {
  it('debería devolver null y no montar nada cuando la documentación está deshabilitada', () => {
    // Arrange
    const app = buildApp();
    let built = 0;
    const build = fakeDocument(() => {
      built += 1;
    });

    // Act
    const path = setupOpenApi(app, buildAppConfig(), { enabled: false, path: 'docs' }, build);

    // Assert
    // No basta con que devuelva `null`: si construyera el documento igualmente, arrancar con la
    // documentación apagada pagaría el coste de recorrer todos los controllers.
    expect(path).toBeNull();
    expect(built).toBe(0);
    expect(mountsOf(app)).toEqual([]);
  });

  it('debería montar la documentación bajo el prefijo global', () => {
    // Arrange
    const app = buildApp();

    // Act
    const path = setupOpenApi(
      app,
      buildAppConfig(),
      { enabled: true, path: 'docs' },
      fakeDocument(),
    );

    // Assert
    expect(path).toBe('api/docs');
  });

  it('debería respetar un prefijo y una ruta personalizados', () => {
    // Arrange
    const app = buildApp();

    // Act
    const path = setupOpenApi(
      app,
      buildAppConfig({ globalPrefix: 'gateway' }),
      { enabled: true, path: 'openapi' },
      fakeDocument(),
    );

    // Assert
    expect(path).toBe('gateway/openapi');
  });

  it('debería registrar /json antes del catch-all de Scalar', () => {
    // Arrange
    const app = buildApp();

    // Act
    setupOpenApi(app, buildAppConfig(), { enabled: true, path: 'docs' }, fakeDocument());
    const mounts = mountsOf(app);

    // Assert
    // El middleware de Scalar responde a cualquier path bajo su punto de montaje. Registrado
    // antes, `/api/docs/json` devolvería el HTML de la interfaz en vez del documento, y quien
    // generase un SDK obtendría una página web.
    const jsonIndex = mounts.indexOf('/api/docs/json');
    const catchAllIndex = mounts.lastIndexOf('/api/docs');
    expect(jsonIndex).toBeGreaterThanOrEqual(0);
    expect(jsonIndex).toBeLessThan(catchAllIndex);
  });

  it('debería registrar la CSP antes que cualquier ruta que sirva contenido', () => {
    // Arrange
    const app = buildApp();

    // Act
    setupOpenApi(app, buildAppConfig(), { enabled: true, path: 'docs' }, fakeDocument());
    const mounts = mountsOf(app);

    // Assert
    // El nonce lo genera el primer middleware y lo consume el HTML de Scalar. Montado después,
    // `res.locals.cspNonce` llegaría vacío y el `<script>` inline quedaría bloqueado por la
    // propia política que se acaba de instalar.
    expect(mounts.indexOf('/api/docs')).toBe(0);
    expect(mounts.lastIndexOf('/api/docs')).toBeGreaterThan(0);
  });
});

// Helpers

type FakeApp = INestApplication & { mounts: string[] };

/** Registra en qué rutas se monta cada middleware, que es lo único que estos tests observan. */
const buildApp = (): FakeApp => {
  const mounts: string[] = [];
  return {
    mounts,
    use: (...args: unknown[]): void => {
      if (typeof args[0] === 'string') {
        mounts.push(args[0]);
      }
    },
  } as unknown as FakeApp;
};

const mountsOf = (app: INestApplication): string[] => (app as FakeApp).mounts;

/**
 * Documento mínimo escrito a mano.
 *
 * Estos tests observan el orden de montaje, no el contenido, y construir el documento real
 * exigiría una aplicación Nest completa con sus controllers. Se inyecta como parámetro en vez de
 * espiar el módulo: SWC emite los exports con getters no configurables y `jest.spyOn` falla con
 * «Cannot redefine property».
 */
const fakeDocument =
  (onCall: () => void = () => undefined): typeof buildOpenApiDocument =>
  () => {
    onCall();
    return { openapi: '3.1.0', info: { title: 'test', version: '1' }, paths: {} };
  };
