import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { buildErrorExample } from '@common/dto/error-example.factory';
import type { ErrorPayload } from '@common/filters/all-exceptions.filter';
import { createTestApp } from '@test/helpers/create-test-app';

const DEFAULT_PASSWORD = 'contrasena-larga-de-prueba';

describe('Orders (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let prefix: string;
  let userToken: string;
  let customerId: string;
  let otherToken: string;

  beforeAll(async () => {
    ({ app, prefix } = await createTestApp());
    dataSource = app.get(DataSource);

    // Arranque limpio de las cuentas (perfil + credencial, dos tablas desde el ciclo 4) y un
    // login por cliente para toda la suite, no por test: `/auth/register` y `/auth/login`
    // tienen 10/min cada uno. Contando los tests que registran cuentas propias, la suite gasta
    // 5 de cada 10: cabe, pero cada cuenta nueva consume uno de cada, así que un test que pueda
    // usar estas dos no debería registrar otra. Las filas deben sobrevivir a los beforeEach: el
    // directorio de clientes las consulta en cada orden.
    await dataSource.query('TRUNCATE TABLE auth_credentials');
    await dataSource.query('TRUNCATE TABLE users CASCADE');
    ({ token: userToken, id: customerId } = await registerAndLogin('cliente@example.com'));
    // Un segundo cliente, también para toda la suite: los pedidos ajenos de la cancelación.
    ({ token: otherToken } = await registerAndLogin('otro-cliente@example.com'));
  });

  beforeEach(async () => {
    // Solo las tablas de orders: truncar users mataría al dueño del token (→ 403 en todo).
    await dataSource.query('TRUNCATE TABLE orders, orders_outbox');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /orders', () => {
    it('debería colocar la orden y devolver 201 con el envelope completo', async () => {
      // Act
      const response = await postOrder(userToken, {
        concept: 'Suscripción anual plan Pro',
        amountCents: 149_900,
      });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(Object.keys(response.body as Record<string, unknown>).sort()).toEqual([
        'data',
        'request',
        'success',
      ]);
      expect(response.body.data.id).toEqual(expect.any(String));
      expect(response.body.data.customerId).toBe(customerId);
      expect(response.body.data.concept).toBe('Suscripción anual plan Pro');
      expect(response.body.data.amountCents).toBe(149_900);
    });

    it('debería persistir la orden y su evento OrderPlaced en el outbox', async () => {
      // Act
      const response = await postOrder(userToken, {
        concept: 'Suscripción anual plan Pro',
        amountCents: 149_900,
      });

      // Assert: filas crudas de las DOS tablas — el outbox es el objetivo del ciclo.
      const orderRows = await dataSource.query<{ id: string; customer_id: string }[]>(
        'SELECT id, customer_id FROM orders',
      );
      expect(orderRows).toEqual([{ id: response.body.data.id, customer_id: customerId }]);

      const outboxRows = await dataSource.query<
        { event_type: string; payload: Record<string, unknown>; processed_at: Date | null }[]
      >('SELECT event_type, payload, processed_at FROM orders_outbox');
      expect(outboxRows).toHaveLength(1);
      expect(outboxRows[0]?.event_type).toBe('OrderPlaced');
      expect(outboxRows[0]?.payload).toMatchObject({
        orderId: response.body.data.id,
        customerId,
        amountCents: 149_900,
      });
      expect(outboxRows[0]?.processed_at).toBeNull();
    });

    it('debería responder 401 sin token', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .post(`${prefix}/orders`)
        .send({ concept: 'Sin token', amountCents: 100 });

      // Assert
      expect(response.status).toBe(401);
    });

    it.each([
      ['concepto ausente', { amountCents: 100 }],
      ['concepto de solo espacios', { concept: '   ', amountCents: 100 }],
      ['concepto de 141 caracteres', { concept: 'a'.repeat(141), amountCents: 100 }],
      ['importe cero', { concept: 'Orden', amountCents: 0 }],
      ['importe no entero', { concept: 'Orden', amountCents: 10.5 }],
      ['importe sobre el tope', { concept: 'Orden', amountCents: 10_000_001 }],
    ])('debería responder 400 con %s', async (_caso, body) => {
      // Act
      const response = await postOrder(userToken, body);

      // Assert
      expect(response.status).toBe(400);
      const rows = await dataSource.query<{ count: number }[]>(
        'SELECT COUNT(*)::int AS count FROM orders',
      );
      expect(rows[0]?.count).toBe(0);
    });

    // Anti-spoof medible: el DTO no declara customerId y forbidNonWhitelisted lo rechaza.
    it('debería responder 400 cuando el body intenta traer un customerId', async () => {
      // Act
      const response = await postOrder(userToken, {
        concept: 'Orden ajena',
        amountCents: 100,
        customerId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      });

      // Assert
      expect(response.status).toBe(400);
    });

    it('debería responder 403 con el cuerpo documentado cuando el usuario fue desactivado tras emitir el token', async () => {
      // Arrange: token válido cuyo usuario deja de existir para orders — el caso que
      // justifica el `CustomerDirectory` (spec §5). UPDATE directo, patrón de la suite de
      // users para promover: la desactivación operativa no pasa por HTTP aquí.
      const path = `${prefix}/orders`;
      const { token } = await registerAndLogin('desactivado@example.com');
      await dataSource.query(`UPDATE users SET active = false WHERE email = $1`, [
        'desactivado@example.com',
      ]);

      // Act
      const response = await postOrder(token, { concept: 'Orden tardía', amountCents: 100 });

      // Assert: forma exacta contra la MISMA factoría que alimenta el example publicado.
      expect(response.status).toBe(403);
      const body = response.body as ErrorPayload;
      const documented = buildErrorExample(403, { path, message: 'Forbidden' });
      expect({ ...body, timestamp: documented.timestamp, requestId: documented.requestId }).toEqual(
        documented,
      );
    });

    it('debería no persistir nada cuando el cliente ya no está activo', async () => {
      // Arrange
      const { token } = await registerAndLogin('desactivado2@example.com');
      await dataSource.query(`UPDATE users SET active = false WHERE email = $1`, [
        'desactivado2@example.com',
      ]);

      // Act
      await postOrder(token, { concept: 'Orden fantasma', amountCents: 100 });

      // Assert
      const counts = await dataSource.query<{ orders: number; outbox: number }[]>(
        `SELECT
           (SELECT COUNT(*)::int FROM orders) AS orders,
           (SELECT COUNT(*)::int FROM orders_outbox) AS outbox`,
      );
      expect(counts[0]).toEqual({ orders: 0, outbox: 0 });
    });

    it('debería devolver el pedido colocado con status placed y sin cancelledAt', async () => {
      // Arrange

      // Act
      const response = await postOrder(userToken, { concept: 'Plan Pro', amountCents: 100 });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('placed');
      expect(response.body.data).not.toHaveProperty('cancelledAt');
    });
  });

  describe('POST /orders/:id/cancel', () => {
    it('debería cancelar el pedido y devolver 200 con el envelope y el pedido cancelado', async () => {
      // Arrange
      const orderId = await placeOrderFor(userToken);

      // Act
      const response = await cancelOrder(userToken, orderId);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(orderId);
      expect(response.body.data.customerId).toBe(customerId);
      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.cancelledAt).toEqual(expect.any(String));
    });

    it('debería persistir la cancelación y su evento OrderCancelled en el outbox', async () => {
      // Arrange
      const orderId = await placeOrderFor(userToken);

      // Act
      const response = await cancelOrder(userToken, orderId);

      // Assert: filas crudas de las dos tablas.
      const orderRows = await dataSource.query<{ status: string; cancelled_at: Date }[]>(
        'SELECT status, cancelled_at FROM orders',
      );
      expect(orderRows).toEqual([
        { status: 'cancelled', cancelled_at: new Date(response.body.data.cancelledAt as string) },
      ]);
      const outboxRows = await dataSource.query<{ payload: Record<string, unknown> }[]>(
        `SELECT payload FROM orders_outbox WHERE event_type = 'OrderCancelled'`,
      );
      expect(outboxRows).toEqual([
        {
          payload: {
            orderId,
            customerId,
            occurredAt: response.body.data.cancelledAt,
          },
        },
      ]);
    });

    it('debería responder 200 con el cancelledAt original y sin un segundo evento al cancelar de nuevo', async () => {
      // Arrange
      const orderId = await placeOrderFor(userToken);
      const first = await cancelOrder(userToken, orderId);

      // Act
      const second = await cancelOrder(userToken, orderId);

      // Assert
      expect(second.status).toBe(200);
      expect(second.body.data).toEqual(first.body.data);
      const cancelled = await dataSource.query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM orders_outbox WHERE event_type = 'OrderCancelled'`,
      );
      expect(cancelled[0]?.count).toBe(1);
    });

    it('debería responder al pedido de otro cliente con el mismo 404 documentado que a uno inexistente', async () => {
      // Arrange: el mismo id, primero ajeno y después inexistente — así el cuerpo entero,
      // path incluido, es comparable.
      const orderId = await placeOrderFor(userToken);
      const path = `${prefix}/orders/${orderId}/cancel`;

      // Act
      const foreign = await cancelOrder(otherToken, orderId);
      await dataSource.query('TRUNCATE TABLE orders, orders_outbox');
      const missing = await cancelOrder(otherToken, orderId);

      // Assert
      const documented = buildErrorExample(404, {
        path,
        message: `Order ${orderId} was not found`,
      });
      for (const response of [foreign, missing]) {
        expect(response.status).toBe(404);
        const body = response.body as ErrorPayload;
        expect({
          ...body,
          timestamp: documented.timestamp,
          requestId: documented.requestId,
        }).toEqual(documented);
      }
    });

    it('debería no cancelar el pedido de otro cliente', async () => {
      // Arrange
      const orderId = await placeOrderFor(userToken);

      // Act
      await cancelOrder(otherToken, orderId);

      // Assert
      const rows = await dataSource.query<{ status: string }[]>('SELECT status FROM orders');
      expect(rows).toEqual([{ status: 'placed' }]);
    });

    it('debería responder 400 con un id que no es un UUID v4', async () => {
      // Arrange

      // Act
      const response = await cancelOrder(userToken, 'no-es-uuid');

      // Assert: forma exacta contra la MISMA factoría que alimenta el example publicado.
      expect(response.status).toBe(400);
      const documented = buildErrorExample(400, {
        path: `${prefix}/orders/no-es-uuid/cancel`,
        message: '"no-es-uuid" is not a valid order id',
      });
      const body = response.body as ErrorPayload;
      expect({ ...body, timestamp: documented.timestamp, requestId: documented.requestId }).toEqual(
        documented,
      );
    });

    it('debería responder 401 sin token', async () => {
      // Arrange
      const orderId = await placeOrderFor(userToken);

      // Act
      const response = await request(app.getHttpServer()).post(
        `${prefix}/orders/${orderId}/cancel`,
      );

      // Assert
      expect(response.status).toBe(401);
    });

    it('debería responder 403 sin cancelar nada cuando el cliente fue desactivado tras emitir el token', async () => {
      // Arrange
      const { token } = await registerAndLogin('desactivado3@example.com');
      const orderId = await placeOrderFor(token);
      await dataSource.query(`UPDATE users SET active = false WHERE email = $1`, [
        'desactivado3@example.com',
      ]);

      // Act
      const response = await cancelOrder(token, orderId);

      // Assert
      expect(response.status).toBe(403);
      const documented = buildErrorExample(403, {
        path: `${prefix}/orders/${orderId}/cancel`,
        message: 'Forbidden',
      });
      const body = response.body as ErrorPayload;
      expect({ ...body, timestamp: documented.timestamp, requestId: documented.requestId }).toEqual(
        documented,
      );
      const rows = await dataSource.query<{ status: string }[]>('SELECT status FROM orders');
      expect(rows).toEqual([{ status: 'placed' }]);
      const cancelled = await dataSource.query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM orders_outbox WHERE event_type = 'OrderCancelled'`,
      );
      expect(cancelled[0]?.count).toBe(0);
    });
  });

  // Helpers

  const cancelOrder = (token: string, orderId: string) =>
    request(app.getHttpServer())
      .post(`${prefix}/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

  const placeOrderFor = async (token: string): Promise<string> => {
    const response = await postOrder(token, { concept: 'Plan Pro', amountCents: 100 }).expect(201);
    return response.body.data.id as string;
  };

  const postOrder = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`${prefix}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  async function registerAndLogin(email: string): Promise<{ token: string; id: string }> {
    const created = await request(app.getHttpServer())
      .post(`${prefix}/auth/register`)
      .send({ email, name: 'Cliente E2E', password: DEFAULT_PASSWORD })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post(`${prefix}/auth/login`)
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(200);
    return {
      token: login.body.data.accessToken as string,
      id: created.body.data.user.id as string,
    };
  }
});
