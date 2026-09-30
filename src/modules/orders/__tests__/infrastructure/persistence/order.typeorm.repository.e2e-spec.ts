import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { createTestApp } from '@test/helpers/create-test-app';

import { OrderVersionConflictError } from '../../../domain/errors/order.errors';
import { OrderCancelled } from '../../../domain/events/order-cancelled.event';
import { OrderPlaced } from '../../../domain/events/order-placed.event';
import { Order } from '../../../domain/entities/order.entity';
import { OrderAmount } from '../../../domain/value-objects/order-amount.vo';
import { OrderConcept } from '../../../domain/value-objects/order-concept.vo';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { OrderOrmEntity } from '../../../infrastructure/persistence/order.orm-entity';
import { OrderTypeOrmRepository } from '../../../infrastructure/persistence/order.typeorm.repository';

const CUSTOMER_ID = '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012';
const CANCELLED_AT = new Date('2026-09-30T08:00:00.000Z');
const LATER = new Date('2026-09-30T08:00:05.000Z');

type OrderRow = { status: string; cancelled_at: Date | null; version: number };

/**
 * Contra PostgreSQL real: lo que se verifica es la TRANSACCIÓN — mockear el ORM aquí
 * eliminaría exactamente eso. El repositorio se construye con `new` y no resolviendo
 * `OrderRepository`: el binding no existe hasta la Task 5 y el sujeto es el adaptador,
 * no el wiring (divergencia deliberada respecto al spec E2E de users, documentada en la
 * cabecera del plan).
 */
describe('OrderTypeOrmRepository (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let repository: OrderTypeOrmRepository;

  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
    repository = new OrderTypeOrmRepository(dataSource.getRepository(OrderOrmEntity), dataSource);
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE TABLE orders, orders_outbox');
  });

  afterAll(async () => {
    await app.close();
  });

  const readOrderRows = () =>
    dataSource.query<OrderRow[]>('SELECT status, cancelled_at, version FROM orders');

  const savePlacedOrder = async (): Promise<Order> => {
    const order = placeOrder();
    await repository.save(order, order.pullEvents());
    return order;
  };

  const loadOrder = async (id: OrderId): Promise<Order> => {
    const order = await repository.findById(id);
    if (!order) {
      throw new Error(`El pedido ${id.value} debería existir`);
    }
    return order;
  };

  describe('save()', () => {
    it('debería persistir la orden y su evento en la misma transacción', async () => {
      // Arrange
      const order = placeOrder();
      const events = order.pullEvents();

      // Act
      await repository.save(order, events);

      // Assert: filas crudas, no el mapper leyéndose a sí mismo.
      const orderRows = await dataSource.query<{ id: string; customer_id: string }[]>(
        'SELECT id, customer_id FROM orders',
      );
      expect(orderRows).toEqual([{ id: order.id.value, customer_id: CUSTOMER_ID }]);

      const outboxRows = await dataSource.query<
        { event_type: string; payload: Record<string, unknown>; processed_at: Date | null }[]
      >('SELECT event_type, payload, processed_at FROM orders_outbox');
      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0]?.event_type).toBe('OrderPlaced');
      // Exacto y no `toMatchObject`: el payload es el evento expandido, así que un campo nuevo
      // de `OrderPlaced` llegaría a los consumidores del outbox sin que nada lo decidiera.
      expect(outboxRows[0]?.payload).toEqual({
        orderId: order.id.value,
        customerId: CUSTOMER_ID,
        amountCents: 149_900,
        occurredAt: '2026-08-06T09:30:00.000Z',
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
      const order = placeOrder();
      order.pullEvents();
      const poisoned = new OrderPlaced(order.id.value, CUSTOMER_ID, 149_900, new Date(NaN));

      // Act
      await expect(repository.save(order, [poisoned])).rejects.toThrow();

      // Assert: rollback total — ni orden ni outbox.
      const counts = await dataSource.query<{ orders: number; outbox: number }[]>(
        `SELECT
           (SELECT COUNT(*)::int FROM orders) AS orders,
           (SELECT COUNT(*)::int FROM orders_outbox) AS outbox`,
      );
      expect(counts[0]).toEqual({ orders: 0, outbox: 0 });
    });

    it('debería insertar un pedido nuevo en la versión 1, colocado y sin fecha de cancelación', async () => {
      // Arrange
      const order = placeOrder();

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
            customerId: CUSTOMER_ID,
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
      const cancelled = await dataSource.query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM orders_outbox WHERE event_type = 'OrderCancelled'`,
      );
      expect(cancelled[0]?.count).toBe(1);
    });

    it('debería dejar ganar a una sola de dos cancelaciones simultáneas y rechazar la otra con conflicto', async () => {
      // Arrange: dos copias en la versión 1 que se guardan A LA VEZ, cada una en su conexión
      // del pool. El orden no es determinista; el resultado sí. Si alguien subiera el
      // aislamiento a REPEATABLE READ, la perdedora recibiría un 40001 y no el conflicto.
      const placed = await savePlacedOrder();
      const first = await loadOrder(placed.id);
      const second = await loadOrder(placed.id);
      first.cancel(CANCELLED_AT);
      second.cancel(LATER);

      // Act
      const results = await Promise.allSettled([
        repository.save(first, first.pullEvents()),
        repository.save(second, second.pullEvents()),
      ]);

      // Assert
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(OrderVersionConflictError);
      const rows = await readOrderRows();
      expect(rows.map((row) => row.version)).toEqual([2]);
      const cancelled = await dataSource.query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM orders_outbox WHERE event_type = 'OrderCancelled'`,
      );
      expect(cancelled[0]?.count).toBe(1);
    });

    it('debería no dejar la cancelación cuando la escritura del outbox falla', async () => {
      // Arrange: misma sonda envenenada que la de la colocación, ahora sobre el UPDATE.
      const placed = await savePlacedOrder();
      const order = await loadOrder(placed.id);
      order.cancel(CANCELLED_AT);
      order.pullEvents();
      const poisoned = new OrderCancelled(placed.id.value, CUSTOMER_ID, new Date(NaN));

      // Act
      const act = repository.save(order, [poisoned]);

      // Assert: rollback total — el pedido sigue colocado en su versión 1.
      await expect(act).rejects.toThrow();
      expect(await readOrderRows()).toEqual([{ status: 'placed', cancelled_at: null, version: 1 }]);
    });
  });

  describe('findById()', () => {
    it('debería reconstruir la orden guardada (round-trip)', async () => {
      // Arrange
      const order = placeOrder();
      await repository.save(order, order.pullEvents());

      // Act
      const found = await repository.findById(order.id);

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
      const found = await repository.findById(placed.id);

      // Assert
      expect(found?.status).toBe('cancelled');
      expect(found?.cancelledAt).toEqual(CANCELLED_AT);
      expect(found?.version).toBe(2);
    });

    it('debería devolver null cuando la orden no existe', async () => {
      // Act
      const found = await repository.findById(OrderId.generate());

      // Assert
      expect(found).toBeNull();
    });
  });
});

// Helpers

const placeOrder = (): Order =>
  Order.place({
    id: OrderId.generate(),
    customerId: CUSTOMER_ID,
    concept: OrderConcept.from('Suscripción anual plan Pro'),
    amount: OrderAmount.from(149_900),
    now: new Date('2026-08-06T09:30:00.000Z'),
  });
