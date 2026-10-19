import type { ApiSuccessResponse } from '../interceptors/transform.interceptor';

/**
 * Fija los campos que no aportan nada al leer un ejemplo, para que dos ejemplos de endpoints
 * distintos solo difieran en lo que de verdad los distingue.
 */
export const EXAMPLE_TIMESTAMP = '2026-08-01T10:15:00.000Z';

export const EXAMPLE_REQUEST_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/** Lo que `TransformInterceptor` añade a toda respuesta de éxito. */
export const buildRequestMetaExample = (path: string): ApiSuccessResponse<unknown>['request'] => ({
  timestamp: EXAMPLE_TIMESTAMP,
  path,
  requestId: EXAMPLE_REQUEST_ID,
});
