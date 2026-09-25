import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import type { AppConfig } from '@config/app.config';
import type { LogConfig } from '@config/log.config';

import { buildPinoHttpOptions } from './pino-options';

/**
 * Desde nestjs-pino 5 hay UN solo `pino-http` por proceso: vive en una variable de módulo de
 * `nestjs-pino/dist/rootLogger.js` y lo crea la primera llamada, así que la configuración de
 * esa primera llamada gana. En producción es irrelevante —un proceso, una app—, pero un spec
 * que arranque dos apps en el mismo fichero con `pinoHttp` distintos (nivel, `redact`,
 * destino) recibe en la segunda la instancia de la primera, sin aviso. Cada fichero de Jest
 * tiene su propio registro de módulos, así que el efecto no cruza entre ficheros.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: buildPinoHttpOptions(
          configService.getOrThrow<LogConfig>('log'),
          configService.getOrThrow<AppConfig>('app'),
        ),
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
