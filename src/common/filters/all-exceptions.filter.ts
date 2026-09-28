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
};

type NormalizedException = {
  statusCode: number;
  message: string;
  errorName: string;
};

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

  private normalizeException(exception: unknown): NormalizedException {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();

      if (typeof resp === 'string') {
        return { statusCode: status, message: resp, errorName: exception.name };
      }

      const body = resp as {
        message?: string | string[];
        error?: string;
        [key: string]: unknown;
      };
      const message = Array.isArray(body.message)
        ? body.message.join(', ')
        : (body.message ?? exception.message);

      return {
        statusCode: status,
        message,
        errorName: body.error ?? exception.name,
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
