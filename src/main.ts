import 'reflect-metadata';

import { constants as osConstants } from 'node:os';

import {
  ValidationPipe,
  VersioningType,
  type INestApplication,
  type NestApplicationOptions,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, type NestApplication } from '@nestjs/core';
import compression from 'compression';
// `express` se declara como dependencia directa aunque llegue con `@nestjs/platform-express`:
// aquí se importa por nombre, y con el aislamiento estricto de pnpm una dependencia
// transitiva no es resoluble desde la raíz del proyecto. Sin declararla, los tests pasan
// —el resolver de Jest alcanza el store hoisted de pnpm— pero `node dist/src/main` muere
// con `Cannot find module 'express'`, así que solo se veía al desplegar.
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { setupOpenApi } from './bootstrap/openapi';
import type { AppConfig } from '@config/app.config';
import type { CorsConfig } from '@config/cors.config';
import type { DocsConfig } from '@config/docs.config';

/**
 * Opciones de creación que producción y los E2E comparten: `test/helpers/create-test-app.ts` las
 * importa de aquí, así que cada E2E arranca con la misma política de rutas que `bootstrap()`.
 *
 * - `routeConflictPolicy` (Nest 12, `off` por defecto): al registrar las rutas —en `app.init()`,
 *   que `listen()` llama— Nest compara todos los pares y, con `'error'`, aborta el arranque con
 *   `RouteConflictException`. Sin ella, dos handlers en la misma ruta o un `users/:id` declarado
 *   antes que `users/me` arrancan sin queja y Express resuelve por orden de declaración: el
 *   segundo no se ejecuta nunca y el fallo aparece en runtime como un 400 o un 404.
 *   ⚠️ `shadow` es simétrico: marca cualquier par de patrones que PUEDAN casar la misma
 *   petición, en cualquier orden. `users/me` falla al arrancar también si va ANTES que
 *   `users/:id`, que es el orden que sí funciona. Medido con `@nestjs/core` 12.1.0, y
 *   `src/__tests__/main.spec.ts` fija los dos órdenes. La plantilla prefiere prohibir los
 *   patrones solapados a descubrirlos en producción; quien necesite uno lo decide bajando
 *   `shadow` a `'warn'`, nunca quitando la política entera.
 *
 * `return503OnClosing` (Nest 12) se deja APAGADO a propósito. Con él, platform-express contesta
 * 503 a toda petición nueva desde el primer instante de `close()`, con un middleware que va antes
 * que helmet, pino-http y los filtros: `text/html` con cuerpo `Service Unavailable`, sin sobre de
 * error, sin `x-request-id` y sin línea de log. Eso tapa el 503 JSON `shutting_down` que Terminus
 * da en `health/liveness` y `health/readiness` desde `beforeApplicationShutdown`, que es la
 * respuesta que el contrato OpenAPI de esas sondas publica. Y no protege nada aquí: el `DataSource`
 * se destruye en `onApplicationShutdown`, DESPUÉS de que el servidor HTTP cierre y espere a las
 * peticiones en vuelo, así que una petición rezagada lo encuentra vivo. Medido con `dist` y un hook
 * lento (2026-09-28); `src/__tests__/main.spec.ts` fija que la app sigue atendiendo mientras el
 * apagado espera a los hooks.
 */
export const NEST_APP_OPTIONS: NestApplicationOptions = {
  routeConflictPolicy: { duplicate: 'error', shadow: 'error' },
};

/**
 * Señales que disparan el apagado ordenado. Por qué solo estas dos, en el comentario ⚠️ de
 * `bootstrap()`.
 */
const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

type HandledSignal = (typeof SHUTDOWN_SIGNALS)[number];

export function applyGlobals(app: INestApplication, appCfg: AppConfig, corsCfg: CorsConfig): void {
  app.use(json({ limit: appCfg.bodyLimit }));
  app.use(urlencoded({ extended: true, limit: appCfg.bodyLimit }));

  // La CSP ya no se desactiva en desarrollo. Esa excepcion existia porque estorbaba a
  // Swagger UI, y significaba que un problema de CSP solo se manifestaba al desplegar. Con
  // Scalar servido desde el propio origen y su propia politica acotada a la ruta de la
  // documentacion, sobra: ahora lo que rompa, rompe en local.
  app.use(helmet());
  app.use(compression());

  if (corsCfg.enabled) {
    app.enableCors(corsCfg.options);
  }

  app.setGlobalPrefix(appCfg.globalPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: appCfg.apiVersion,
  });

  // Sin `enableImplicitConversion`: convertía cada valor al tipo declarado *antes* de
  // validar, así que un `{"name": {"$ne": null}}` se volvía la cadena "[object Object]" y
  // pasaba `@IsString`, `@MinLength(2)` y `@MaxLength(120)` sin una sola queja. Los DTO
  // que sí necesitan coerción la piden explícitamente con `@Type(() => Number)`.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );
}

async function bootstrap(): Promise<void> {
  // `NestApplication` y no el `INestApplication` por defecto: la interfaz publica `close()` sin
  // argumentos, y el handler de señales necesita `close(signal)` —que la clase sí declara— para
  // que los hooks reciban la señal como la recibían con `enableShutdownHooks()`.
  const app = await NestFactory.create<NestApplication>(AppModule, {
    ...NEST_APP_OPTIONS,
    bufferLogs: true,
    abortOnError: false,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.flushLogs();

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    process.exit(1);
  });

  const configService = app.get(ConfigService);
  const appCfg = configService.getOrThrow<AppConfig>('app');
  const corsCfg = configService.getOrThrow<CorsConfig>('cors');
  const docsCfg = configService.getOrThrow<DocsConfig>('docs');

  applyGlobals(app, appCfg, corsCfg);

  const httpAdapter = app.getHttpAdapter().getInstance<{
    set?: (key: string, value: unknown) => void;
  }>();
  if (typeof httpAdapter.set === 'function') {
    httpAdapter.set('trust proxy', appCfg.trustProxy);
  }

  const docsPath = setupOpenApi(app, appCfg, docsCfg);

  // ⚠️ Este handler es el ÚNICO dueño de SIGTERM y SIGINT, y `enableShutdownHooks()` no se llama
  // en ningún sitio, a propósito. El listener que instala, al acabar el apagado, relanza la señal
  // con `process.kill(process.pid, signal)`: el proceso moría por la acción por defecto de la
  // señal, SIN emitir `'exit'`. Dos consecuencias, medidas sobre `dist` del commit anterior:
  //   1. El `.then`/`.catch` de aquí no corría nunca: «Graceful shutdown completed» no se había
  //      emitido en ningún SIGTERM real (ya pasaba en Nest 11).
  //   2. pino no vaciaba su buffer, porque su SonicBoom asíncrono y el worker de `pino-pretty` se
  //      vacían en `'exit'`. Con `LOG_PRETTY=true` la línea «Received SIGTERM» se perdía en 6 de
  //      6 apagados, en development y en production por igual; con JSON a un archivo sobrevivía.
  //
  // `enableShutdownHooks(signals, { useProcessExit: true })` arreglaría el vaciado, pero termina
  // con `process.exit(0)`: un SIGTERM pasaría de salir con 143 a salir con 0, y eso es lo que
  // leen Kubernetes y Docker. Aquí se sale con `128 + número de la señal` —143 con SIGTERM, 130
  // con SIGINT, los mismos códigos que antes— pero con `process.exit`, que sí emite `'exit'`. El
  // smoke de `ci.yml` exige las dos cosas: código 143 y la línea en el log.
  //
  // Solo estas dos señales, las que usan los caminos reales: el `Dockerfile` no declara
  // `STOPSIGNAL` (Docker y Kubernetes mandan SIGTERM); `nest start --watch` (`@nestjs/cli`
  // 12.0.7) mata al hijo con SIGTERM al recompilar y le reenvía SIGINT/SIGTERM al salir; Ctrl+C
  // es SIGINT. `enableShutdownHooks()` sin argumentos escuchaba además SIGHUP, SIGQUIT, SIGILL,
  // SIGTRAP, SIGABRT, SIGBUS, SIGFPE, SIGSEGV y SIGUSR2: esas ya no pasan por los hooks y aplican
  // su acción por defecto —terminar, o terminar con volcado de core—.
  //
  // Se registra ANTES de `listen()`, como hacía `enableShutdownHooks()` desde `applyGlobals`: un
  // SIGTERM durante el arranque —un pod que se escala a la baja mientras aún arranca— también pasa
  // por los hooks en vez de matar el proceso con la acción por defecto.
  //
  // Una segunda señal durante el apagado se ignora y el límite lo pone `forceTimer`: Ctrl+C sobre
  // `nest start` llega DOS veces al hijo —la terminal la manda a todo el grupo de procesos y el
  // CLI la reenvía—, y con `process.once` la segunda lo mataba a mitad del apagado (medido: sin
  // «Graceful shutdown completed» en 3 de 3; con la guarda, completo en 3 de 3).
  //
  // Efecto visible en desarrollo: Ctrl+C sobre `pnpm start` imprime ahora `[ELIFECYCLE] Command
  // failed with exit code 130.` (medido; `start:dev` sale por el mismo código del CLI). Antes el
  // hijo moría por la señal, el CLI de Nest traducía eso a 0 y pnpm callaba; ahora el hijo sale
  // con 130 y el CLI lo propaga.
  let shuttingDown = false;
  const handleSignal = (signal: HandledSignal): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.log(`Received ${signal}, starting graceful shutdown`, 'Bootstrap');
    const forceTimer = setTimeout(() => {
      logger.fatal({ signal }, 'Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, appCfg.shutdownTimeoutMs);
    forceTimer.unref();
    app
      .close(signal)
      .then(() => {
        clearTimeout(forceTimer);
        logger.log('Graceful shutdown completed', 'Bootstrap');
        process.exit(128 + osConstants.signals[signal]);
      })
      // Casi inalcanzable desde Nest 12: `onModuleDestroy`, `beforeApplicationShutdown` y
      // `onApplicationShutdown` corren con `Promise.allSettled`, así que un hook que falla solo
      // deja un `Logger.error` y `close()` resuelve igual —el proceso sale con 143, como en un
      // apagado limpio, y el fallo queda en el log (aceptado al migrar, backlog #27)—. Lo que
      // cambia es que ese log ya se vacía antes de salir, porque se sale por `process.exit`.
      .catch((err: unknown) => {
        clearTimeout(forceTimer);
        logger.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      });
  };
  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, () => handleSignal(signal));
  }

  await app.listen(appCfg.port, appCfg.host);

  const server = app.getHttpServer() as {
    requestTimeout: number;
    headersTimeout: number;
    keepAliveTimeout: number;
  };
  server.requestTimeout = appCfg.requestTimeoutMs;
  server.headersTimeout = appCfg.requestTimeoutMs + 1_000;
  server.keepAliveTimeout = appCfg.keepAliveTimeoutMs;

  const url = await app.getUrl();
  logger.log(`Application ready at ${url}/${appCfg.globalPrefix}`, 'Bootstrap');
  if (docsPath) {
    logger.log(`OpenAPI docs available at ${url}/${docsPath}`, 'Bootstrap');
  }
}

// Arranca solo cuando este archivo es el punto de entrada del proceso. Los tests E2E
// importan `applyGlobals` desde aquí, y sin esta guarda el simple import levantaría un
// servidor HTTP real en cada worker de Jest, provocando colisiones de puerto.
if (require.main === module) {
  bootstrap().catch((err: unknown) => {
    console.error('Fatal bootstrap error', err);
    process.exit(1);
  });
}
