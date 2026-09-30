import { declaredResponses } from '@common/__tests__/helpers/swagger-metadata';

import { CancelOrderUseCase } from '../../../application/use-cases/cancel-order.use-case';
import { PlaceOrderUseCase } from '../../../application/use-cases/place-order.use-case';
import { OrderNotFoundError } from '../../../domain/errors/order.errors';
import { OrdersController } from '../../../infrastructure/http/orders.controller';
import { FakeCustomerDirectory } from '../../helpers/fake-customer.directory';
import { InMemoryOrderRepository } from '../../helpers/in-memory-order.repository';

const CUSTOMER_ID = '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012';
const OTHER_CUSTOMER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const CLAIMS = { sub: CUSTOMER_ID, email: 'maria.gonzalez@empresa.com.mx', role: 'user' };
const OTHER_CLAIMS = { sub: OTHER_CUSTOMER_ID, email: 'otra@empresa.com.mx', role: 'user' };
const PLACED_AT = new Date('2026-09-30T09:00:00.000Z');
const CANCELLED_AT = new Date('2026-09-30T09:05:00.000Z');

describe('OrdersController', () => {
  describe('place()', () => {
    it('debería colocar la orden con el customerId del token, no del body', async () => {
      // Arrange
      const controller = buildController();

      // Act
      const result = await controller.place(
        { concept: 'Suscripción anual plan Pro', amountCents: 149_900 },
        CLAIMS,
      );

      // Assert
      expect(result.customerId).toBe(CUSTOMER_ID);
      expect(result.concept).toBe('Suscripción anual plan Pro');
      expect(result.amountCents).toBe(149_900);
      expect(result.status).toBe('placed');
    });

    // Impide que un campo nuevo del agregado se filtre a la respuesta sin decidirlo.
    it('debería exponer solo los campos del DTO, nunca el agregado', async () => {
      // Arrange
      const controller = buildController();

      // Act
      const result = await controller.place(
        { concept: 'Suscripción anual plan Pro', amountCents: 149_900 },
        CLAIMS,
      );

      // Assert: sin `cancelledAt` (solo existe en un pedido cancelado) y sin `version`.
      expect(Object.keys(result).sort()).toEqual([
        'amountCents',
        'concept',
        'customerId',
        'id',
        'placedAt',
        'status',
      ]);
    });
  });

  describe('cancel()', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('debería declarar solo los códigos que la cancelación puede producir hoy', () => {
      // Arrange: la tabla «Contrato» de docs/specs/2026-09-30-cancel-order-express.md. Sin 409:
      // el reintento del caso de uso absorbe el conflicto (comentario junto a `cancel`).
      const reachable = ['200', '400', '401', '403', '404', '429', '500'];

      // Act
      const declared = Object.keys(declaredResponses(OrdersController, 'cancel'));

      // Assert
      expect(declared.sort()).toEqual(reachable);
    });

    it('debería cancelar el pedido del cliente del token y devolverlo con su fecha de cancelación', async () => {
      // Arrange: dos instantes distintos, para que un DTO que publicara `placedAt` como
      // `cancelledAt` no pasara; con uno solo, las dos fechas coincidirían.
      jest.useFakeTimers({ now: PLACED_AT });
      const controller = buildController();
      const placed = await controller.place({ concept: 'Plan Pro', amountCents: 100 }, CLAIMS);
      jest.setSystemTime(CANCELLED_AT);

      // Act
      const result = await controller.cancel(placed.id, CLAIMS);

      // Assert
      expect(result.id).toBe(placed.id);
      expect(result.status).toBe('cancelled');
      expect(result.placedAt).toEqual(PLACED_AT);
      expect(result.cancelledAt).toEqual(CANCELLED_AT);
    });

    it('debería exponer cancelledAt en un pedido cancelado y nunca la versión', async () => {
      // Arrange
      const controller = buildController();
      const placed = await controller.place({ concept: 'Plan Pro', amountCents: 100 }, CLAIMS);

      // Act
      const result = await controller.cancel(placed.id, CLAIMS);

      // Assert
      expect(Object.keys(result).sort()).toEqual([
        'amountCents',
        'cancelledAt',
        'concept',
        'customerId',
        'id',
        'placedAt',
        'status',
      ]);
    });

    it('debería cancelar a nombre del sub del token: el pedido de otro no existe para él', async () => {
      // Arrange
      const controller = buildController();
      const placed = await controller.place({ concept: 'Plan Pro', amountCents: 100 }, CLAIMS);

      // Act
      const act = controller.cancel(placed.id, OTHER_CLAIMS);

      // Assert
      await expect(act).rejects.toThrow(OrderNotFoundError);
    });
  });
});

// Helpers

const buildController = (): OrdersController => {
  const directory = new FakeCustomerDirectory([CUSTOMER_ID, OTHER_CUSTOMER_ID]);
  const repository = new InMemoryOrderRepository();
  return new OrdersController(
    new PlaceOrderUseCase(directory, repository),
    new CancelOrderUseCase(directory, repository),
  );
};
