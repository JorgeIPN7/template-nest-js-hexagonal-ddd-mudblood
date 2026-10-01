import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { DataSource, QueryFailedError, type QueryRunner } from 'typeorm';

import { captureRejection } from '@test/helpers/capture-error';
import { createTestApp } from '@test/helpers/create-test-app';

import { OrderVersionConflictError } from '../../../domain/errors/order.errors';
import { OrderCancelled } from '../../../domain/events/order-cancelled.event';
import { OrderPlaced } from '../../../domain/events/order-placed.event';
import type { Order } from '../../../domain/entities/order.entity';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { OrderOrmEntity } from '../../../infrastructure/persistence/order.orm-entity';
import { OrderTypeOrmRepository } from '../../../infrastructure/persistence/order.typeorm.repository';
import { OutboxMessageOrmEntity } from '../../../infrastructure/persistence/outbox-message.orm-entity';
import {
  DEFAULT_AMOUNT_CENTS,
  DEFAULT_CUSTOMER_ID,
  DEFAULT_PLACED_AT,
  buildPlacedOrder,
} from '../../helpers/order.factory';

const OTHER_CUSTOMER_ID = '3f0c8b6e-2d4a-4c1e-8b7f-5a9d1e2c3b40';
const CANCELLED_AT = new Date('2026-09-30T08:00:00.000Z');
const LATER = new Date('2026-09-30T08:00:05.000Z');

type OrderRow = { status: string; cancelled_at: Date | null; version: number };

/**
 * Contra PostgreSQL real: lo que se verifica es la TRANSACCIÓN — mockear el ORM aquí
 * eliminaría exactamente eso. El repositorio se construye con `new` y no resolviendo
 * `OrderRepository`: el sujeto es el adaptador, no el wiring (divergencia deliberada respecto
 * al spec E2E de users).
 */
describe('OrderTypeOrmRepository (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let repository: OrderTypeOrmRepository;
  /** La conexión que retiene el bloqueo de una fila en los tests de concurrencia. */
  let rival: QueryRunner | undefined;
  /** Una segunda base de datos con otro aislamiento por defecto, si el test la abre. */
  let otherDataSource: DataSource | undefined;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    repository = new OrderTypeOrmRepository(dataSource.getRepository(OrderOrmEntity), dataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE orders, orders_outbox');
  });

  // Un rival que se quedara con la transacción abierta bloquearía el TRUNCATE del siguiente test.
  // Se suelta antes de cerrar la otra base: un guardado suyo que siguiera esperando el bloqueo
  // no terminaría nunca.
  afterEach(async () => {
    if (rival?.isTransactionActive) {
      await rival.rollbackTransaction();
    }
    if (rival && !rival.isReleased) {
      await rival.release();
    }
    rival = undefined;
    if (otherDataSource?.isInitialized) {
      await otherDataSource.destroy();
    }
    otherDataSource = undefined;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('save()', () => {
    it('debería persistir la orden y su evento en la misma transacción', async () => {
      // Arrange
      const order = buildPlacedOrder();
      const events = order.pullEvents();

      // Act
      await repository.save(order, events);

      // Assert: filas crudas, no el mapper leyéndose a sí mismo.
      const orderRows = await dataSource.query<{ id: string; customer_id: string }[]>(
        'SELECT id, customer_id FROM orders',
      );
      expect(orderRows).toEqual([{ id: order.id.value, customer_id: DEFAULT_CUSTOMER_ID }]);

      const outboxRows = await dataSource.query<
        { event_type: string; payload: Record<string, unknown>; processed_at: Date | null }[]
      >('SELECT event_type, payload, processed_at FROM orders_outbox');
      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0]?.event_type).toBe('OrderPlaced');
      // Exacto y no `toMatchObject`: el payload es el evento expandido, así que un campo nuevo
      // de `OrderPlaced` llegaría a los consumidores del outbox sin que nada lo decidiera.
      expect(outboxRows[0]?.payload).toEqual({
        orderId: order.id.value,
        customerId: DEFAULT_CUSTOMER_ID,
        amountCents: DEFAULT_AMOUNT_CENTS,
        occurredAt: DEFAULT_PLACED_AT.toISOString(),
      });
      expect(outboxRows[0]?.processed_at).toBeNull();
    });

    /**
     * La sonda de atomicidad, diseñada con honestidad: el evento envenenado lleva un
     * `occurredAt` inválido, así que el INSERT de la orden SÍ se ejecuta y es la segunda
     * escritura (la columna `occurred_at` del outbox) la que revienta al serializar la
     * fecha. Sin transacción, la orden quedaría huérfana de evento — que es exactamente
     * el estado que el outbox promete imposible. Construir el evento a mano y no con
     * `Order.place()` es deliberado: el dominio nunca produce esa fecha; la sonda explota
     * que la clase del evento es plana y no valida.
     */
    it('debería no dejar la orden cuando la escritura del outbox falla', async () => {
      // Arrange
      const order = buildPlacedOrder();
      order.pullEvents();
      const poisoned = new OrderPlaced(
        order.id.value,
        DEFAULT_CUSTOMER_ID,
        DEFAULT_AMOUNT_CENTS,
        new Date(NaN),
      );

      // Act
      const act = repository.save(order, [poisoned]);

      // Assert: rollback total — ni orden ni outbox.
      await expect(act).rejects.toThrow();
      const counts = await dataSource.query<{ orders: number; outbox: number }[]>(
        `SELECT
           (SELECT COUNT(*)::int FROM orders) AS orders,
           (SELECT COUNT(*)::int FROM orders_outbox) AS outbox`,
      );
      expect(counts[0]).toEqual({ orders: 0, outbox: 0 });
    });

    it('debería insertar un pedido nuevo en la versión 1, colocado y sin fecha de cancelación', async () => {
      // Arrange
      const order = buildPlacedOrder();

      // Act
      await repository.save(order, order.pullEvents());

      // Assert
      expect(await readOrderRows()).toEqual([{ status: 'placed', cancelled_at: null, version: 1 }]);
    });

    it('debería guardar la cancelación y su OrderCancelled en la misma transacción, subiendo la versión', async () => {
      // Arrange
      const placed = await savePlacedOrder();
      const order = await loadOrder(placed.id);
      order.cancel(CANCELLED_AT);

      // Act
      await repository.save(order, order.pullEvents());

      // Assert
      expect(await readOrderRows()).toEqual([
        { status: 'cancelled', cancelled_at: CANCELLED_AT, version: 2 },
      ]);
      const outboxRows = await dataSource.query<
        { event_type: string; payload: Record<string, unknown> }[]
      >(`SELECT event_type, payload FROM orders_outbox WHERE event_type = 'OrderCancelled'`);
      expect(outboxRows).toEqual([
        {
          event_type: 'OrderCancelled',
          payload: {
            orderId: placed.id.value,
            customerId: DEFAULT_CUSTOMER_ID,
            occurredAt: CANCELLED_AT.toISOString(),
          },
        },
      ]);
    });

    it('debería rechazar con conflicto una copia obsoleta sin tocar la fila ni el outbox', async () => {
      // Arrange: dos lecturas del mismo pedido en la versión 1; la primera gana.
      const placed = await savePlacedOrder();
      const winner = await loadOrder(placed.id);
      const stale = await loadOrder(placed.id);
      winner.cancel(CANCELLED_AT);
      await repository.save(winner, winner.pullEvents());
      stale.cancel(LATER);

      // Act
      const act = repository.save(stale, stale.pullEvents());

      // Assert
      await expect(act).rejects.toThrow(OrderVersionConflictError);
      expect(await readOrderRows()).toEqual([
        { status: 'cancelled', cancelled_at: CANCELLED_AT, version: 2 },
      ]);
      expect(await countEvents('OrderCancelled')).toBe(1);
    });

    it('debería rechazar con conflicto la cancelación que esperaba el bloqueo de otra, sin tocar la fila ni el outbox', async () => {
      // Arrange: la copia obsoleta se leyó en la versión 1; otra conexión cancela a la vez y
      // retiene el bloqueo de la fila. Este es el intercalado real que la versión optimista
      // resuelve: el UPDATE bloqueado re-evalúa su WHERE sobre la fila ya confirmada, porque el
      // adaptador pide READ COMMITTED (el test siguiente comprueba que no depende del defecto).
      const placed = await savePlacedOrder();
      const stale = await loadOrder(placed.id);
      stale.cancel(LATER);
      rival = await cancelWithoutCommitting(placed.id, CANCELLED_AT);

      // Act: el guardado queda esperando detrás del bloqueo, y solo entonces el rival confirma.
      const outcome = captureRejection(repository.save(stale, stale.pullEvents()));
      await waitUntilBlockedBy(rival, outcome);
      await rival.commitTransaction();

      // Assert
      expect(await outcome).toBeInstanceOf(OrderVersionConflictError);
      expect(await readOrderRows()).toEqual([
        { status: 'cancelled', cancelled_at: CANCELLED_AT, version: 2 },
      ]);
      expect(await countEvents('OrderCancelled')).toBe(0);
    });

    it('debería resolver con conflicto la cancelación bloqueada aunque la base tenga otro aislamiento por defecto', async () => {
      // Arrange: el mismo intercalado, pero el adaptador usa una conexión cuyo aislamiento por
      // defecto es SERIALIZABLE, como el que deja un parameter group de RDS o un `ALTER DATABASE
      // … SET`. Si heredara ese nivel, el UPDATE que esperaba recibiría un 40001 —un 500 para el
      // perdedor del doble clic— en vez del conflicto que el caso de uso sabe reintentar.
      otherDataSource = await openDataSourceDefaultingToSerializable();
      const adapter = new OrderTypeOrmRepository(
        otherDataSource.getRepository(OrderOrmEntity),
        otherDataSource,
      );
      const placed = await savePlacedOrder();
      const stale = await loadOrder(placed.id);
      stale.cancel(LATER);
      rival = await cancelWithoutCommitting(placed.id, CANCELLED_AT);

      // Act
      const outcome = captureRejection(adapter.save(stale, stale.pullEvents()));
      await waitUntilBlockedBy(rival, outcome);
      await rival.commitTransaction();

      // Assert
      expect(await outcome).toBeInstanceOf(OrderVersionConflictError);
      expect(await countEvents('OrderCancelled')).toBe(0);
    });

    it('debería rechazar con conflicto guardar dos veces un pedido nuevo, sin tocar el outbox', async () => {
      // Arrange: la misma instancia sin releer conserva la versión 0 con la que nació. El puerto
      // prohíbe reutilizarla; el fake responde con conflicto y el adaptador tiene que coincidir.
      // El segundo guardado lleva otra vez su `OrderPlaced`: con una lista vacía no habría nada
      // que pudiera colarse en el outbox, y la última aserción no podría fallar.
      const order = buildPlacedOrder();
      const events = order.pullEvents();
      await repository.save(order, events);

      // Act
      const act = repository.save(order, events);

      // Assert
      await expect(act).rejects.toThrow(OrderVersionConflictError);
      expect(await countEvents('OrderPlaced')).toBe(1);
    });

    // Solo el 23505 es un conflicto: cualquier otro fallo del INSERT tiene que subir tal cual, o
    // un error de infraestructura se publicaría como un 409 que invita a reintentar en vano.
    it('debería propagar sin traducir un fallo del INSERT que no es de unicidad', async () => {
      // Arrange: PostgreSQL no admite el byte NUL dentro de un texto (22021). El dominio no lo
      // impide —es una restricción del almacenamiento, y el DTO de HTTP ya lo rechaza—, así que
      // es la forma más corta de hacer fallar el INSERT por otra razón que la unicidad.
      const order = buildPlacedOrder({ concept: 'Concepto con \u0000 en medio' });

      // Act
      const error = await captureRejection(repository.save(order, order.pullEvents()));

      // Assert
      expect(error).toBeInstanceOf(QueryFailedError);
      expect((error as QueryFailedError).driverError).toMatchObject({ code: '22021' });
      expect(await readOrderRows()).toEqual([]);
    });

    it('debería no dejar la cancelación cuando la escritura del outbox falla', async () => {
      // Arrange: misma sonda envenenada que la de la colocación, ahora sobre el UPDATE.
      const placed = await savePlacedOrder();
      const order = await loadOrder(placed.id);
      order.cancel(CANCELLED_AT);
      order.pullEvents();
      const poisoned = new OrderCancelled(placed.id.value, DEFAULT_CUSTOMER_ID, new Date(NaN));

      // Act
      const act = repository.save(order, [poisoned]);

      // Assert: rollback total — el pedido sigue colocado en su versión 1.
      await expect(act).rejects.toThrow();
      expect(await readOrderRows()).toEqual([{ status: 'placed', cancelled_at: null, version: 1 }]);
    });
  });

  describe('findByIdAndCustomer()', () => {
    it('debería reconstruir la orden guardada (round-trip)', async () => {
      // Arrange
      const order = buildPlacedOrder();
      await repository.save(order, order.pullEvents());

      // Act
      const found = await repository.findByIdAndCustomer(order.id, DEFAULT_CUSTOMER_ID);

      // Assert: todo igual salvo la versión, que la primera escritura deja en 1.
      expect(found?.toSnapshot()).toEqual({ ...order.toSnapshot(), version: 1 });
    });

    it('debería reconstruir un pedido cancelado con su estado, su fecha y su versión', async () => {
      // Arrange
      const placed = await savePlacedOrder();
      const order = await loadOrder(placed.id);
      order.cancel(CANCELLED_AT);
      await repository.save(order, order.pullEvents());

      // Act
      const found = await repository.findByIdAndCustomer(placed.id, DEFAULT_CUSTOMER_ID);

      // Assert
      expect(found?.status).toBe('cancelled');
      expect(found?.cancelledAt).toEqual(CANCELLED_AT);
      expect(found?.version).toBe(2);
    });

    it('debería devolver null cuando la orden no existe', async () => {
      // Arrange

      // Act
      const found = await repository.findByIdAndCustomer(OrderId.generate(), DEFAULT_CUSTOMER_ID);

      // Assert
      expect(found).toBeNull();
    });

    it('debería devolver null cuando la orden es de otro cliente', async () => {
      // Arrange
      const placed = await savePlacedOrder();

      // Act
      const found = await repository.findByIdAndCustomer(placed.id, OTHER_CUSTOMER_ID);

      // Assert
      expect(found).toBeNull();
    });

    it('debería devolver null para la orden de otro cliente aunque su fila no se pueda reconstruir', async () => {
      // Arrange: una fila ajena que el mapper rechaza (un estado que este código no conoce). Si
      // llegara a reconstruirse, su 500 frente al 404 de un id cualquiera delataría que existe.
      const placed = await savePlacedOrder();
      await dataSource.query(`UPDATE orders SET status = 'shipped' WHERE id = $1`, [
        placed.id.value,
      ]);

      // Act
      const found = await repository.findByIdAndCustomer(placed.id, OTHER_CUSTOMER_ID);

      // Assert
      expect(found).toBeNull();
    });
  });

  // Helpers

  const readOrderRows = () =>
    dataSource.query<OrderRow[]>('SELECT status, cancelled_at, version FROM orders');

  const savePlacedOrder = async (): Promise<Order> => {
    const order = buildPlacedOrder();
    await repository.save(order, order.pullEvents());
    return order;
  };

  const loadOrder = async (id: OrderId): Promise<Order> => {
    const order = await repository.findByIdAndCustomer(id, DEFAULT_CUSTOMER_ID);
    if (!order) {
      throw new Error(`El pedido ${id.value} debería existir`);
    }
    return order;
  };

  const countEvents = async (eventType: string): Promise<number> => {
    const rows = await dataSource.query<{ count: number }[]>(
      'SELECT COUNT(*)::int AS count FROM orders_outbox WHERE event_type = $1',
      [eventType],
    );
    return rows[0]?.count ?? 0;
  };

  /**
   * Otra conexión cancela el pedido SIN confirmar: la fila queda bloqueada hasta que el test
   * decida. Es SQL crudo y no el repositorio porque `save` abre y cierra su transacción entera, y
   * aquí hace falta tenerla abierta mientras el otro guardado espera.
   */
  const cancelWithoutCommitting = async (id: OrderId, at: Date): Promise<QueryRunner> => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = $2, version = version + 1 WHERE id = $1`,
      [id.value, at],
    );
    return runner;
  };

  /**
   * Espera hasta que alguna conexión esté bloqueada por la del rival. Sin esta espera el test
   * dependería del reparto de tiempos: si el guardado llegara después de la confirmación, sería
   * el caso secuencial de la copia obsoleta y no comprobaría el intercalado.
   *
   * Si el guardado termina antes de bloquearse —una regresión que lo hace fallar en el acto, una
   * columna renombrada—, seguir esperando no tiene sentido: corta y enseña cómo terminó, en vez de
   * consultar quinientas veces y tapar el error real con uno genérico.
   */
  const waitUntilBlockedBy = async (
    blocker: QueryRunner,
    pending: Promise<unknown>,
  ): Promise<void> => {
    const state: { settledWith?: unknown; settled: boolean } = { settled: false };
    const settle = (value: unknown) => {
      state.settled = true;
      state.settledWith = value;
    };
    void pending.then(settle, settle);
    // `QueryRunner.query` no es genérico en TypeORM 1: la forma de la fila se afirma aquí.
    const [blockerRow] = (await blocker.query('SELECT pg_backend_pid() AS pid')) as {
      pid: number;
    }[];
    for (let attempt = 0; attempt < 500; attempt += 1) {
      if (state.settled) {
        throw new Error(
          `El guardado terminó sin llegar a esperar el bloqueo de la fila: ${describeOutcome(state.settledWith)}`,
        );
      }
      const rows = await dataSource.query<{ waiting: number }[]>(
        'SELECT COUNT(*)::int AS waiting FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
        [blockerRow?.pid],
      );
      if ((rows[0]?.waiting ?? 0) > 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('El guardado nunca llegó a esperar el bloqueo de la fila');
  };

  /**
   * Una segunda conexión a la misma base cuyo aislamiento POR DEFECTO es SERIALIZABLE. Solo con
   * las dos entidades que toca el adaptador, y sin migraciones: la base ya está migrada.
   */
  const openDataSourceDefaultingToSerializable = async (): Promise<DataSource> => {
    const { options } = dataSource;
    if (options.type !== 'postgres') {
      throw new Error(`El E2E de pedidos corre contra PostgreSQL, no contra ${options.type}`);
    }
    return new DataSource({
      ...options,
      entities: [OrderOrmEntity, OutboxMessageOrmEntity],
      migrations: [],
      migrationsRun: false,
      synchronize: false,
      extra: {
        ...(options.extra as Record<string, unknown>),
        max: 2,
        options: '-c default_transaction_isolation=serializable',
      },
    }).initialize();
  };
});

// Helpers

const describeOutcome = (outcome: unknown): string =>
  outcome instanceof Error ? `${outcome.name}: ${outcome.message}` : String(outcome);
