import { DomainError } from '@shared/domain/domain-error';

import {
  AuthDomainError,
  EmailAlreadyRegisteredError,
  InvalidCredentialIdError,
  InvalidCredentialsError,
  InvalidPasswordHashError,
  InvalidProfileError,
} from '../../../domain/errors/auth.errors';

const V1_CREDENTIAL_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('AuthDomainError', () => {
  it('debería ser un DomainError del kernel a través de la raíz de auth', () => {
    // Arrange

    // Act
    const error = new InvalidCredentialsError();

    // Assert
    expect(error).toBeInstanceOf(AuthDomainError);
    expect(error).toBeInstanceOf(DomainError);
  });
});

describe('InvalidCredentialsError', () => {
  it('debería llevar el mensaje único de credenciales inválidas', () => {
    // Arrange

    // Act
    const error = new InvalidCredentialsError();

    // Assert
    expect(error.message).toBe('Invalid credentials');
    expect(error.name).toBe('InvalidCredentialsError');
  });
});

describe('InvalidPasswordHashError', () => {
  it('debería llevar un mensaje fijo que no incluye el valor rechazado', () => {
    // Arrange

    // Act
    const error = new InvalidPasswordHashError();

    // Assert
    expect(error.message).toBe('Value is not a valid argon2id hash');
    expect(error.name).toBe('InvalidPasswordHashError');
  });
});

describe('EmailAlreadyRegisteredError', () => {
  it('debería identificar en su mensaje el email ya registrado', () => {
    // Arrange
    const email = 'taken@example.com';

    // Act
    const error = new EmailAlreadyRegisteredError(email);

    // Assert
    expect(error.message).toBe('Email taken@example.com is already registered');
    expect(error.email).toBe(email);
    expect(error.name).toBe('EmailAlreadyRegisteredError');
  });
});

describe('InvalidProfileError', () => {
  it('debería conservar tal cual el mensaje que llega del directorio', () => {
    // Arrange
    const message = '"x" is not a valid email address';

    // Act
    const error = new InvalidProfileError(message);

    // Assert
    expect(error.message).toBe(message);
    expect(error.name).toBe('InvalidProfileError');
  });
});

describe('InvalidCredentialIdError', () => {
  it('debería identificar en su mensaje el id de credencial rechazado', () => {
    // Arrange

    // Act
    const error = new InvalidCredentialIdError(V1_CREDENTIAL_ID);

    // Assert
    expect(error.message).toBe(`"${V1_CREDENTIAL_ID}" is not a valid credential id`);
    expect(error.value).toBe(V1_CREDENTIAL_ID);
    expect(error.name).toBe('InvalidCredentialIdError');
    expect(error).toBeInstanceOf(AuthDomainError);
  });
});
