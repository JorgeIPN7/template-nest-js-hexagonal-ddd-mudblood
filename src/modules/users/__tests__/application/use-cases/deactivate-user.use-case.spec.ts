import { captureRejection } from '@test/helpers/capture-error';

import { DeactivateUserUseCase } from '../../../application/use-cases/deactivate-user.use-case';
import { UserNotFoundError } from '../../../domain/errors/user.errors';
import type { User } from '../../../domain/entities/user.entity';
import { UserId } from '../../../domain/value-objects/user-id.vo';
import { InMemoryUserRepository } from '../../helpers/in-memory-user.repository';
import { buildUserWithEmail } from '../../helpers/user.factory';

/**
 * Muta estado pese a lo discreto del nombre: antes vivía dentro de un archivo llamado
 * `query-handlers.spec.ts`, lo que lo hacía pasar por una consulta.
 */
describe('DeactivateUserUseCase', () => {
  describe('execute()', () => {
    it('debería desactivar al usuario y persistir el cambio', async () => {
      // Arrange
      const user = buildUserWithEmail('active@example.com');
      const { useCase, repository } = buildUseCase([user]);

      // Act
      const result = await useCase.execute({ userId: user.id.value });

      // Assert
      expect(result.active).toBe(false);
      const reloaded = await repository.findById(user.id);
      expect(reloaded?.active).toBe(false);
    });

    it('debería lanzar UserNotFoundError cuando el usuario no existe', async () => {
      // Arrange
      const { useCase } = buildUseCase();

      // Act
      const act = useCase.execute({ userId: UserId.generate().value });

      // Assert
      await expect(act).rejects.toThrow(UserNotFoundError);
    });

    // `UserId` guarda el valor en minúsculas: si el error citara el id normalizado, el 404 no
    // repetiría lo que mandó el cliente.
    it('debería repetir en el UserNotFoundError el id tal como llegó, aunque venga en mayúsculas', async () => {
      // Arrange
      const { useCase } = buildUseCase();
      const userId = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';

      // Act
      const error = await captureRejection(useCase.execute({ userId }));

      // Assert
      expect(error).toBeInstanceOf(UserNotFoundError);
      expect(error.message).toBe('User 3F2504E0-4F89-41D3-9A0C-0305E82C3301 was not found');
    });

    // La entidad corta en seco si ya está inactiva, así que ni siquiera toca `updatedAt`.
    it('debería ser idempotente sobre un usuario ya inactivo', async () => {
      // Arrange
      const user = buildUserWithEmail('inactive@example.com');
      const { useCase } = buildUseCase([user]);
      const first = await useCase.execute({ userId: user.id.value });
      const firstUpdatedAt = first.updatedAt;

      // Act
      const result = await useCase.execute({ userId: user.id.value });

      // Assert
      expect(result.active).toBe(false);
      expect(result.updatedAt).toEqual(firstUpdatedAt);
    });

    // Desactivar no es borrar: la fila debe seguir ahí para conservar el histórico.
    it('debería conservar al usuario en el repositorio', async () => {
      // Arrange
      const user = buildUserWithEmail('conservado@example.com');
      const { useCase, repository } = buildUseCase([user]);

      // Act
      await useCase.execute({ userId: user.id.value });

      // Assert
      expect(repository.size()).toBe(1);
    });
  });
});

// Helpers

const buildUseCase = (seed: User[] = []) => {
  const repository = new InMemoryUserRepository(seed);
  return { useCase: new DeactivateUserUseCase(repository), repository };
};
