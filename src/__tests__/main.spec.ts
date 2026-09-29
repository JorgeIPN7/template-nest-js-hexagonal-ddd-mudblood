import {
  Controller,
  Delete,
  Get,
  Injectable,
  Post,
  type BeforeApplicationShutdown,
  type INestApplication,
  type Type,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { NEST_APP_OPTIONS } from '../main';

/**
 * `NEST_APP_OPTIONS` son opciones de Nest, así que lo que se prueba aquí es su EFECTO sobre una
 * app real de platform-express, no su valor: comparar el objeto con un literal sería una
 * tautología que seguiría verde si Nest dejara de respetar la opción en un bump.
 *
 * Los controllers son mínimos y sin base de datos a propósito: el arranque del `AppModule` real
 * con estas mismas opciones ya lo ejercita cada E2E a través de `createTestApp()`, que es donde se
 * comprueba que las rutas reales no chocan.
 */

type Deferred = { promise: Promise<void>; resolve: () => void };

const deferred = (): Deferred => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

@Controller('items')
class ParamBeforeLiteralController {
  @Get(':id')
  findOne(): string {
    return 'one';
  }

  @Get('me')
  me(): string {
    return 'me';
  }
}

@Controller('items')
class LiteralBeforeParamController {
  @Get('me')
  me(): string {
    return 'me';
  }

  @Get(':id')
  findOne(): string {
    return 'one';
  }
}

@Controller('items')
class FirstDuplicateController {
  @Get('all')
  list(): string {
    return 'first';
  }
}

@Controller('items')
class SecondDuplicateController {
  @Get('all')
  list(): string {
    return 'second';
  }
}

/** La forma de `UsersController` y `OrdersController`: mismo patrón con otro método u otra longitud. */
@Controller('items')
class DisjointRoutesController {
  @Get()
  list(): string {
    return 'list';
  }

  @Post()
  create(): string {
    return 'created';
  }

  @Get(':id')
  findOne(): string {
    return 'one';
  }

  @Delete(':id')
  remove(): string {
    return 'removed';
  }
}

@Injectable()
class InFlightGate {
  readonly started = deferred();
  readonly release = deferred();
}

@Injectable()
class ShutdownGate implements BeforeApplicationShutdown {
  readonly entered = deferred();
  readonly release = deferred();

  async beforeApplicationShutdown(): Promise<void> {
    this.entered.resolve();
    await this.release.promise;
  }
}

@Controller('work')
class WorkController {
  constructor(private readonly gate: InFlightGate) {}

  @Get('slow')
  async slow(): Promise<{ done: boolean }> {
    this.gate.started.resolve();
    await this.gate.release.promise;
    return { done: true };
  }

  @Get('fast')
  fast(): { done: boolean } {
    return { done: true };
  }
}

const createApp = async (
  controllers: Type<unknown>[],
  providers: Type<unknown>[] = [],
): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({ controllers, providers }).compile();
  return moduleRef.createNestApplication({ ...NEST_APP_OPTIONS, logger: false });
};

type ShutdownScenario = { late: Response; inFlight: Response };

/**
 * Deja una petición en vuelo, empieza el apagado y, con un hook bloqueando la secuencia —el
 * servidor todavía acepta conexiones—, lanza una petición nueva.
 */
const runShutdownScenario = async (): Promise<ShutdownScenario> => {
  const app = await createApp([WorkController], [InFlightGate, ShutdownGate]);
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const work = app.get(InFlightGate);
  const hook = app.get(ShutdownGate);

  const inFlightRequest = fetch(`${url}/work/slow`);
  await work.started.promise;
  const closing = app.close();
  await hook.entered.promise;

  const late = await fetch(`${url}/work/fast`);
  work.release.resolve();
  const inFlight = await inFlightRequest;
  hook.release.resolve();
  await closing;

  return { late, inFlight };
};

describe('NEST_APP_OPTIONS', () => {
  describe('routeConflictPolicy', () => {
    it('debería abortar el arranque cuando una ruta con parámetro tapa a una literal declarada después', async () => {
      // Arrange
      const app = await createApp([ParamBeforeLiteralController]);

      // Act
      const init = app.init();

      // Assert
      await expect(init).rejects.toThrow(
        'Route GET /items/me (ParamBeforeLiteralController#me) is shadowed by GET /items/:id ' +
          '(ParamBeforeLiteralController#findOne)',
      );
    });

    // No es lo deseable, pero es lo que hace `@nestjs/core` 12.1.0 y la plantilla lo acepta a
    // sabiendas (comentario de `NEST_APP_OPTIONS`). Fijarlo aquí hace que un bump que cambie el
    // criterio se note, en vez de dejar desfasada la advertencia de `main.ts`.
    it('debería abortar también con la literal declarada antes, porque shadow marca patrones solapados en cualquier orden', async () => {
      // Arrange
      const app = await createApp([LiteralBeforeParamController]);

      // Act
      const init = app.init();

      // Assert
      await expect(init).rejects.toThrow(
        'Route GET /items/:id (LiteralBeforeParamController#findOne) is shadowed by GET ' +
          '/items/me (LiteralBeforeParamController#me)',
      );
    });

    it('debería abortar el arranque cuando dos handlers declaran el mismo método y la misma ruta', async () => {
      // Arrange
      const app = await createApp([FirstDuplicateController, SecondDuplicateController]);

      // Act
      const init = app.init();

      // Assert
      await expect(init).rejects.toThrow(
        'Duplicate route: GET /items/all is registered by both FirstDuplicateController#list ' +
          'and SecondDuplicateController#list',
      );
    });

    it('debería arrancar con rutas que comparten patrón pero no método ni longitud', async () => {
      // Arrange
      const app = await createApp([DisjointRoutesController]);

      // Act
      const init = app.init();

      // Assert
      await expect(init).resolves.toBe(app);
      await app.close();
    });
  });

  describe('sin return503OnClosing', () => {
    // Si alguien activa la opción, esta petición recibe el 503 `text/html` de platform-express y
    // el 503 JSON `shutting_down` que publica el contrato de health deja de ser alcanzable: el
    // motivo completo está en el comentario de `NEST_APP_OPTIONS`.
    it('debería seguir atendiendo una petición nueva mientras el apagado espera a los hooks', async () => {
      // Arrange + Act
      const { late } = await runShutdownScenario();

      // Assert
      expect(late.status).toBe(200);
      await expect(late.json()).resolves.toEqual({ done: true });
    });

    it('debería dejar terminar la petición que ya estaba en vuelo cuando empezó el apagado', async () => {
      // Arrange + Act
      const { inFlight } = await runShutdownScenario();

      // Assert
      expect(inFlight.status).toBe(200);
      await expect(inFlight.json()).resolves.toEqual({ done: true });
    });
  });
});
