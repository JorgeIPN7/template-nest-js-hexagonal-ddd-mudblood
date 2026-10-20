import { failClosed } from '@common/persistence/fail-closed';

import { Email } from '../../domain/value-objects/email.vo';
import { User } from '../../domain/entities/user.entity';
import { UserDomainError } from '../../domain/errors/user.errors';
import { UserId } from '../../domain/value-objects/user-id.vo';
import type { UserRole } from '../../domain/value-objects/user-role';

import { UserOrmEntity } from './user.orm-entity';

const isUserDomainError = (error: unknown): error is UserDomainError =>
  error instanceof UserDomainError;

/**
 * Única frontera entre la fila de la tabla y el agregado. Al reconstituir se usa
 * `rehydrate`, no `create`: los datos ya persistidos no vuelven a pasar por las reglas
 * de creación, porque eran válidos cuando se guardaron.
 *
 * Falla cerrado: una fila que los VOs de hoy rechazan (un email sin arroba, un id que no es
 * un uuid v4) es un dato corrupto, no una entrada inválida. Como error de dominio, el filtro
 * de `users` la publicaría como 400 con el valor en el mensaje; `failClosed` la convierte en un
 * `Error` con el original como `cause`, que el filtro global responde con un 500 y registra
 * como `fatal`.
 */
export const UserMapper = {
  toDomain(row: UserOrmEntity): User {
    return failClosed(
      () =>
        User.rehydrate({
          id: UserId.from(row.id),
          email: Email.from(row.email),
          name: row.name,
          // Se confía en la columna en esta frontera: solo el propio mapper y el seed del
          // primer admin la escriben. Un valor ajeno no eleva privilegios — falla cerrado,
          // porque no coincidiría con ningún `roles.includes()` del guard.
          role: row.role as UserRole,
          active: row.active,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }),
      isUserDomainError,
      (error) => `El usuario ${row.id} tiene datos que el dominio rechaza: ${error.message}`,
    );
  },

  toPersistence(user: User): UserOrmEntity {
    const snapshot = user.toSnapshot();
    const row = new UserOrmEntity();
    row.id = snapshot.id;
    row.email = snapshot.email;
    row.name = snapshot.name;
    row.role = snapshot.role;
    row.active = snapshot.active;
    row.createdAt = snapshot.createdAt;
    row.updatedAt = snapshot.updatedAt;
    return row;
  },
};
