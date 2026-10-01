import { buildErrorExample, type ErrorExampleOptions } from '@common/dto/error-example.factory';

/**
 * Afirma que un cuerpo de error es EXACTAMENTE el del ejemplo que publica la documentación para
 * ese status: las mismas claves, el mismo `statusCode`, `error`, `path` y `message`. Se compara
 * contra la misma factoría que alimenta los `example`, así que el ejemplo y la respuesta real no
 * pueden divergir sin que el test se ponga rojo.
 *
 * `timestamp` y `requestId` cambian en cada respuesta: se exige que estén y sean texto, sin fijar
 * su valor. Cada suite copiaba antes el cuerpo y les ponía los del ejemplo antes de comparar, y
 * eso dejaba pasar una respuesta sin `requestId`.
 */
export const expectDocumentedError = (
  body: unknown,
  status: number,
  options: ErrorExampleOptions,
): void => {
  expect(body).toEqual({
    ...buildErrorExample(status, options),
    timestamp: expect.any(String),
    requestId: expect.any(String),
  });
};
