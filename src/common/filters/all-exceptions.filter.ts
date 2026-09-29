import { randomUUID } from 'node:crypto';

import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { AppConfig } from '@config/app.config';

export type ErrorPayload = {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  requestId: string;
  /**
   * El `errorCode` que Nest 12 añadió a `HttpException` (`options.errorCode`). Opcional de verdad:
   * la clave solo existe cuando la excepción lo trae, nunca como `undefined` ni `null`.
   */
  errorCode?: string;
};

type NormalizedException = {
  statusCode: number;
  message: string;
  errorName: string;
  errorCode?: string;
};

/**
 * El `errorCode` de una `HttpException`, o `undefined` si no trae ninguno publicable.
 *
 * Dos fuentes, porque ninguna basta sola (medido contra `@nestjs/common` 12.1.0): con una
 * respuesta objeto y `options`, `createBody` devuelve el objeto tal cual y el código solo vive en
 * la propiedad `exception.errorCode`; con el código escrito a mano dentro del cuerpo, la propiedad
 * no existe. La propiedad manda porque es la vía que Nest documenta. Solo vale una cadena no
 * vacía, el mismo criterio que aplican `initErrorCode` y `createBody`.
 */
const errorCodeOf = (
  exception: HttpException,
  body?: { errorCode?: unknown },
): string | undefined =>
  [exception.errorCode, body?.errorCode].find(
    (candidate): candidate is string => typeof candidate === 'string' && candidate !== '',
  );

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /**
   * Decide si el mensaje crudo del error llega al cliente. Mira `isProductionLike`, no
   * `isProduction`: en `staging` un fallo de conexión devolvía al cliente cosas como
   * `connect ECONNREFUSED 10.0.1.5:5432`, es decir topología interna en el body HTTP.
   */
  private readonly hidesErrorDetails: boolean;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: PinoLogger,
    configService: ConfigService,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
    this.hidesErrorDetails = configService.getOrThrow<AppConfig>('app').isProductionLike;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      if (exception instanceof Error) {
        throw exception;
      }
      return;
    }

    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<IncomingMessage & { id?: string; url?: string }>();
    const response = ctx.getResponse<ServerResponse>();

    const normalized = this.normalizeException(exception);
    const requestId = request.id ?? randomUUID();
    const resolvedPath: string =
      (httpAdapter.getRequestUrl(request) as string | undefined) ?? request.url ?? '';

    const payload: ErrorPayload = {
      statusCode: normalized.statusCode,
      message: normalized.message,
      error: normalized.errorName,
      timestamp: new Date().toISOString(),
      path: resolvedPath,
      requestId,
    };
    if (normalized.errorCode !== undefined) {
      payload.errorCode = normalized.errorCode;
    }

    const isServerError = normalized.statusCode >= 500;
    if (isServerError && !(exception instanceof HttpException)) {
      this.logger.fatal({ err: exception, requestId, path: resolvedPath }, normalized.message);
    } else if (isServerError) {
      this.logger.error({ err: exception, requestId, path: resolvedPath }, normalized.message);
    } else {
      this.logger.warn(
        { requestId, path: resolvedPath, statusCode: normalized.statusCode },
        normalized.message,
      );
    }

    httpAdapter.reply(response, payload, normalized.statusCode);
  }

  /**
   * `hidesErrorDetails` solo afecta a los `Error` no-HTTP. Una `HttpException` —también una 5xx—
   * publica su `message` y su `errorCode` en cualquier entorno: los dos los eligió para el cliente
   * quien la construyó, y ocultarlos en producción haría que el contrato dependiera del entorno.
   */
  private normalizeException(exception: unknown): NormalizedException {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();

      if (typeof resp === 'string') {
        return {
          statusCode: status,
          message: resp,
          errorName: exception.name,
          errorCode: errorCodeOf(exception),
        };
      }

      const body = resp as {
        message?: string | string[];
        error?: string;
        errorCode?: unknown;
        [key: string]: unknown;
      };
      const message = Array.isArray(body.message)
        ? body.message.join(', ')
        : (body.message ?? exception.message);

      return {
        statusCode: status,
        message,
        errorName: body.error ?? exception.name,
        errorCode: errorCodeOf(exception, body),
      };
    }

    if (exception instanceof Error) {
      if (this.hidesErrorDetails) {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          errorName: 'InternalServerError',
        };
      }
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message || 'Internal server error',
        errorName: exception.name || 'InternalServerError',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errorName: 'InternalServerError',
    };
  }
}
