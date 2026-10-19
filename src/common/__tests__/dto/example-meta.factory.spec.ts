import {
  buildRequestMetaExample,
  EXAMPLE_REQUEST_ID,
  EXAMPLE_TIMESTAMP,
} from '../../dto/example-meta.factory';

describe('buildRequestMetaExample', () => {
  // El orden de las claves también cuenta: es el del documento publicado, y otro orden lo
  // cambiaría sin que ninguna otra guarda lo detectara.
  it('debería devolver la ruta recibida con los literales compartidos, en el orden en que TransformInterceptor emite el meta', () => {
    // Arrange
    const path = '/api/v1/widgets';
    // Act
    const meta = buildRequestMetaExample(path);
    // Assert
    expect(meta).toEqual({
      timestamp: EXAMPLE_TIMESTAMP,
      path: '/api/v1/widgets',
      requestId: EXAMPLE_REQUEST_ID,
    });
    expect(Object.keys(meta)).toEqual(['timestamp', 'path', 'requestId']);
  });
});
