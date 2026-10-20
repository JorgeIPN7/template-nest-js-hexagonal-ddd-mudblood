import { DomainError } from '@shared/domain/domain-error';

import {
  EmailAlreadyTakenError,
  InvalidEmailError,
  InvalidUserIdError,
  InvalidUserNameError,
  UserDomainError,
  UserNotFoundError,
} from '../../../domain/errors/user.errors';

// Una entrada por error concreto: su nombre, cómo se construye y el mensaje que compone. Cada
// error se construye dentro del `it`, nunca al recolectar la suite.
const CONCRETE_ERRORS: readonly (readonly [
  name: string,
  build: () => UserDomainError,
  message: string,
])[] = [
  [
    'InvalidEmailError',
    () => new InvalidEmailError('sin-arroba'),
    '"sin-arroba" is not a valid email address',
  ],
  [
    'InvalidUserIdError',
    () => new InvalidUserIdError('no-es-uuid'),
    '"no-es-uuid" is not a valid user id',
  ],
  ['InvalidUserNameError', () => new InvalidUserNameError('x'), '"x" is not a valid user name'],
  [
    'UserNotFoundError',
    () => new UserNotFoundError('3f2504e0-4f89-41d3-9a0c-0305e82c3301'),
    'User 3f2504e0-4f89-41d3-9a0c-0305e82c3301 was not found',
  ],
  [
    'EmailAlreadyTakenError',
    () => new EmailAlreadyTakenError('taken@example.com'),
    'Email taken@example.com is already registered',
  ],
];

describe('UserDomainError', () => {
  it.each(CONCRETE_ERRORS)('debería construir el mensaje exacto de %s', (_name, build, message) => {
    // Arrange
    const error = build();
    // Act
    const actual = error.message;
    // Assert
    expect(actual).toBe(message);
  });

  it.each(CONCRETE_ERRORS)('debería llamarse como su clase concreta (%s)', (name, build) => {
    // Arrange
    const error = build();
    // Act
    const actual = error.name;
    // Assert
    expect(actual).toBe(name);
  });

  it.each(CONCRETE_ERRORS)(
    'debería ser a la vez un UserDomainError y un DomainError del kernel (%s)',
    (_name, build) => {
      // Arrange
      const error = build();
      // Act
      const instances = [error instanceof UserDomainError, error instanceof DomainError];
      // Assert
      expect(instances).toEqual([true, true]);
    },
  );
});
