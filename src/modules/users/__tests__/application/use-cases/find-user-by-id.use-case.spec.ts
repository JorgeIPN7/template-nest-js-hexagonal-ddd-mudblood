import { captureRejection } from '@test/helpers/capture-error';

import { FindUserByIdUseCase } from '../../../application/use-cases/find-user-by-id.use-case';
import { InvalidUserIdError, UserNotFoundError } from '../../../domain/errors/user.errors';
import type { User } from '../../../domain/entities/user.entity';
import { UserId } from '../../../domain/value-objects/user-id.vo';
import { InMemoryUserRepository } from '../../helpers/in-memory-user.repository';
import { buildUserWithEmail } from '../../helpers/user.factory';

describe('FindUserByIdUseCase', () => {
  describe('execute()', () => {
    it('debería devolver el usuario cuando existe', async () => {
      // Arrange
      const user = buildUserWithEmail('found@example.com');
      const useCase = buildUseCase([user]);

      // Act
      const found = await useCase.execute({ userId: user.id.value });

      // Assert
      expect(found.email.value).toBe('found@example.com');
    });

    it('debería lanzar UserNotFoundError cuando no existe', async () => {
      // Arrange
      const useCase = buildUseCase();
      const unknownId = UserId.generate().value;

      // Act
      const act = useCase.execute({ userId: unknownId });

      // Assert
      await expect(act).rejects.toThrow(UserNotFoundError);
    });

    // `UserId` guarda el valor en minúsculas: si el error citara el id normalizado, el 404 no
    // repetiría lo que mandó el cliente.
    it('debería repetir en el UserNotFoundError el id tal como llegó, aunque venga en mayúsculas', async () => {
      // Arrange
      const useCase = buildUseCase();
      const userId = '3F2504E0-4F89-41D3-9A0C-0305E82C3301';

      // Act
      const error = await captureRejection(useCase.execute({ userId }));

      // Assert
      expect(error).toBeInstanceOf(UserNotFoundError);
      expect(error.message).toBe('User 3F2504E0-4F89-41D3-9A0C-0305E82C3301 was not found');
    });

    // El value object valida antes de tocar el repositorio: un id mal formado es un error
    // de dominio que el filtro traduce a 400, no un "no encontrado" (404).
    it('debería rechazar un id con formato inválido antes de consultar', async () => {
      // Arrange
      const useCase = buildUseCase();

      // Act
      const act = useCase.execute({ userId: 'not-a-uuid' });

      // Assert
      await expect(act).rejects.toThrow(InvalidUserIdError);
    });
  });
});

// Helpers

const buildUseCase = (seed: User[] = []): FindUserByIdUseCase =>
  new FindUserByIdUseCase(new InMemoryUserRepository(seed));
