import { fc, test as fcTest } from '@fast-check/jest';

import { CancelOrderUseCase } from '../../../application/use-cases/cancel-order.use-case';
import { Order } from '../../../domain/entities/order.entity';
import {
  CustomerGoneError,
  InvalidOrderIdError,
  OrderNotFoundError,
  OrderVersionConflictError,
} from '../../../domain/errors/order.errors';
import { OrderCancelled } from '../../../domain/events/order-cancelled.event';
import { OrderAmount } from '../../../domain/value-objects/order-amount.vo';
import { OrderConcept } from '../../../domain/value-objects/order-concept.vo';
import { OrderId } from '../../../domain/value-objects/order-id.vo';
import { FakeCustomerDirectory } from '../../helpers/fake-customer.directory';
import { InMemoryOrderRepository } from '../../helpers/in-memory-order.repository';

const CUSTOMER_ID = '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012';
const FIRST_CANCELLED_AT = new Date('2026-09-30T08:00:00.000Z');

describe('CancelOrderUseCase', () => {
  describe('execute()', () => {
    it('debería cancelar el pedido del cliente y guardarlo con su OrderCancelled en la misma llamada', async () => {
      // Arrange
      const { useCase, repository } = buildUseCase([CUSTOMER_ID]);
      const orderId = await seedPlacedOrder(repository, CUSTOMER_ID);
      const savesBefore = repository.saveCalls.length;

      // Act
      const order = await useCase.execute({ customerId: CUSTOMER_ID, orderId: orderId.value });

      // Assert
      const newSaves = repository.saveCalls.slice(savesBefore);
      expect(newSaves).toHaveLength(1);
      expect(newSaves[0]?.order).toBe(order);
      expect(newSaves[0]?.events).toEqual([
        new OrderCancelled(orderId.value, CUSTOMER_ID, order.cancelledAt!),
      ]);
    });

    it('debería devolver el pedido cancelado con su fecha de cancelación', async () => {
      // Arrange
      const { useCase, repository } = buildUseCase([CUSTOMER_ID]);
      const orderId = await seedPlacedOrder(repository, CUSTOMER_ID);

      // Act
      const order = await useCase.execute({ customerId: CUSTOMER_ID, orderId: orderId.value });

      // Assert
      expect(order.id.value).toBe(orderId.value);
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).toBeInstanceOf(Date);
    });

    it('debería devolver tal cual un pedido ya cancelado, con su fecha original y sin guardar nada', async () => {
      // Arrange
      const { useCase, repository } = buildUseCase([CUSTOMER_ID]);
      const orderId = await seedCancelledOrder(repository, CUSTOMER_ID, FIRST_CANCELLED_AT);
      const savesBefore = repository.saveCalls.length;

      // Act
      const order = await useCase.execute({ customerId: CUSTOMER_ID, orderId: orderId.value });

      // Assert
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).toEqual(FIRST_CANCELLED_AT);
      expect(repository.saveCalls).toHaveLength(savesBefore);
    });

    it('debería rechazar como inexistente un pedido que no existe', async () => {
      // Arrange
      const { useCase } = buildUseCase([CUSTOMER_ID]);
      const unknownId = OrderId.generate().value;

      // Act
      const act = useCase.execute({ customerId: CUSTOMER_ID, orderId: unknownId });

      // Assert
      await expect(act).rejects.toThrow(OrderNotFoundError);
    });

    fcTest.prop([fc.uuid({ version: 4 }), fc.uuid({ version: 4 })])(
      'debería rechazar el pedido de otro cliente con el mismo error y el mismo mensaje que uno inexistente',
      async (orderIdValue, ownerId) => {
        // Arrange
        fc.pre(ownerId !== CUSTOMER_ID);
        const foreign = buildUseCase([CUSTOMER_ID]);
        await foreign.repository.save(placedOrder(OrderId.from(orderIdValue), ownerId), []);
        const savesBefore = foreign.repository.saveCalls.length;
        const missing = buildUseCase([CUSTOMER_ID]);
        const input = { customerId: CUSTOMER_ID, orderId: orderIdValue };

        // Act
        const foreignError = await captureRejection(foreign.useCase.execute(input));
        const missingError = await captureRejection(missing.useCase.execute(input));

        // Assert: indistinguibles por clase y por mensaje, que es lo que el 404 publica.
        expect(foreignError).toBeInstanceOf(OrderNotFoundError);
        expect(foreignError.constructor).toBe(missingError.constructor);
        expect(foreignError.message).toBe(missingError.message);
        expect(foreign.repository.saveCalls).toHaveLength(savesBefore);
      },
    );

    it('debería rechazar al cliente que ya no existe o está inactivo sin tocar el pedido', async () => {
      // Arrange: el pedido existe y es suyo, pero el directorio ya no lo conoce.
      const { useCase, repository } = buildUseCase([]);
      const orderId = await seedPlacedOrder(repository, CUSTOMER_ID);
      const savesBefore = repository.saveCalls.length;

      // Act
      const act = useCase.execute({ customerId: CUSTOMER_ID, orderId: orderId.value });

      // Assert
      await expect(act).rejects.toThrow(CustomerGoneError);
      expect(repository.saveCalls).toHaveLength(savesBefore);
      expect((await repository.findById(orderId))?.status).toBe('placed');
    });

    it('debería rechazar un id de pedido mal formado', async () => {
      // Arrange
      const { useCase } = buildUseCase([CUSTOMER_ID]);

      // Act
      const act = useCase.execute({ customerId: CUSTOMER_ID, orderId: 'no-es-uuid' });

      // Assert
      await expect(act).rejects.toThrow(InvalidOrderIdError);
    });

    it('debería devolver el pedido ya cancelado sin un segundo evento cuando otro proceso lo cancela a la vez', async () => {
      // Arrange: la primera lectura del caso de uso es obsoleta (v1, placed). Entre ella y su
      // save, otro proceso canceló el pedido y lo guardó (v2).
      const { useCase, repository } = buildUseCase([CUSTOMER_ID]);
      const orderId = await seedPlacedOrder(repository, CUSTOMER_ID);
      const stale = await loadOrder(repository, orderId);
      const winner = await loadOrder(repository, orderId);
      winner.cancel(FIRST_CANCELLED_AT);
      await repository.save(winner, winner.pullEvents());
      jest.spyOn(repository, 'findById').mockResolvedValueOnce(stale);
      const savesBefore = repository.saveCalls.length;

      // Act
      const order = await useCase.execute({ customerId: CUSTOMER_ID, orderId: orderId.value });

      // Assert
      expect(order.status).toBe('cancelled');
      expect(order.cancelledAt).toEqual(FIRST_CANCELLED_AT);
      expect(repository.saveCalls).toHaveLength(savesBefore);
    });

    it('debería rendirse con un conflicto si el pedido vuelve a cambiar durante el reintento', async () => {
      // Arrange: jest.spyOn sobre el fake, permitido para forzar el fallo y contar intentos.
      const { useCase, repository } = buildUseCase([CUSTOMER_ID]);
      const orderId = await seedPlacedOrder(repository, CUSTOMER_ID);
      const save = jest
        .spyOn(repository, 'save')
        .mockRejectedValue(new OrderVersionConflictError(orderId.value));

      // Act
      const act = useCase.execute({ customerId: CUSTOMER_ID, orderId: orderId.value });

      // Assert
      await expect(act).rejects.toThrow(OrderVersionConflictError);
      expect(save).toHaveBeenCalledTimes(2);
    });

    it('debería propagar sin reintentar un fallo de guardado que no es de concurrencia', async () => {
      // Arrange
      const { useCase, repository } = buildUseCase([CUSTOMER_ID]);
      const orderId = await seedPlacedOrder(repository, CUSTOMER_ID);
      const failure = new Error('conexión perdida');
      const save = jest.spyOn(repository, 'save').mockRejectedValue(failure);

      // Act
      const act = useCase.execute({ customerId: CUSTOMER_ID, orderId: orderId.value });

      // Assert
      await expect(act).rejects.toBe(failure);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('debería rechazar al cliente que ya no existe antes de validar o leer el pedido', async () => {
      // Arrange: directorio vacío y un id que, validado antes, daría InvalidOrderIdError.
      const { useCase, repository } = buildUseCase([]);
      const findById = jest.spyOn(repository, 'findById');

      // Act
      const act = useCase.execute({ customerId: CUSTOMER_ID, orderId: 'no-es-uuid' });

      // Assert
      await expect(act).rejects.toThrow(CustomerGoneError);
      expect(findById).not.toHaveBeenCalled();
    });
  });
});

// Helpers

const buildUseCase = (knownCustomerIds: readonly string[]) => {
  const repository = new InMemoryOrderRepository();
  const directory = new FakeCustomerDirectory(knownCustomerIds);
  return { useCase: new CancelOrderUseCase(directory, repository), repository };
};

const placedOrder = (id: OrderId, customerId: string): Order =>
  Order.place({
    id,
    customerId,
    concept: OrderConcept.from('Suscripción anual plan Pro'),
    amount: OrderAmount.from(149_900),
    now: new Date('2026-09-29T10:00:00.000Z'),
  });

const seedPlacedOrder = async (
  repository: InMemoryOrderRepository,
  customerId: string,
): Promise<OrderId> => {
  const order = placedOrder(OrderId.generate(), customerId);
  await repository.save(order, order.pullEvents());
  return order.id;
};

const seedCancelledOrder = async (
  repository: InMemoryOrderRepository,
  customerId: string,
  cancelledAt: Date,
): Promise<OrderId> => {
  const orderId = await seedPlacedOrder(repository, customerId);
  const order = await loadOrder(repository, orderId);
  order.cancel(cancelledAt);
  await repository.save(order, order.pullEvents());
  return orderId;
};

const loadOrder = async (repository: InMemoryOrderRepository, id: OrderId): Promise<Order> => {
  const order = await repository.findById(id);
  if (!order) {
    throw new Error(`El pedido ${id.value} debería existir en el fake`);
  }
  return order;
};

const captureRejection = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Se esperaba que la promesa se rechazara y no lo hizo');
};
