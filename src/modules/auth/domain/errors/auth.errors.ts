import { DomainError } from '@shared/domain/domain-error';

/**
 * Raíz de los errores de dominio de `auth`: la que atrapa el `@Catch` de su filtro. Sin
 * constructor propio: el protegido y el `name` de la clase concreta los pone `DomainError`, la
 * base del kernel. Son errores de negocio, no de transporte: traducirlos a una respuesta es tarea
 * de `infrastructure/http/auth-domain-exception.filter.ts`.
 *
 * `InvalidCredentialsError` e `InvalidPasswordHashError` VIVÍAN en `users`: se mudaron aquí
 * con la credencial. `users` ya no sabe qué es una contraseña, así que tampoco puede tener
 * los errores que hablan de ella.
 */
export abstract class AuthDomainError extends DomainError {}

/**
 * La fila de `auth_credentials` tiene un id que no es un uuid v4: solo puede dejarlo un SQL
 * externo a la aplicación. El mensaje lleva el valor, como `InvalidUserIdError`, porque un id de
 * credencial no es un secreto; aun así solo llega al log, porque el filtro responde un 500
 * saneado.
 */
export class InvalidCredentialIdError extends AuthDomainError {
  constructor(readonly value: string) {
    super(`"${value}" is not a valid credential id`);
  }
}

export class InvalidCredentialsError extends AuthDomainError {
  constructor() {
    // Mensaje único e idéntico para email inexistente, credencial ausente, password
    // incorrecto y usuario inactivo — anti-enumeración: la respuesta jamás dice cuál fue.
    super('Invalid credentials');
  }
}

export class InvalidPasswordHashError extends AuthDomainError {
  constructor() {
    // Sin el valor a propósito: lo rechazado suele ser un password EN CLARO pasado
    // por error, y un mensaje que lo incluya lo filtraría a logs y respuestas.
    super('Value is not a valid argon2id hash');
  }
}

/**
 * El directorio de usuarios rechazó el alta por email duplicado. NO es
 * `EmailAlreadyTakenError` de `users`: auth no puede importar los errores de otro contexto
 * (regla 3 del gate de boundaries), así que el puerto devuelve un RESULTADO y este caso de
 * uso lo traduce a su propio error. El mensaje se conserva palabra por palabra para que el
 * 409 publicado no cambie de forma al mudarse el endpoint.
 */
export class EmailAlreadyRegisteredError extends AuthDomainError {
  constructor(readonly email: string) {
    super(`Email ${email} is already registered`);
  }
}

/**
 * El directorio rechazó el perfil por una regla suya (email malformado, nombre fuera de
 * rango). El mensaje viaja tal cual desde el otro contexto: es lo único que auth puede
 * saber de una regla que no le pertenece, y mantenerlo conserva el 400 que hoy publica
 * `POST /users`.
 */
export class InvalidProfileError extends AuthDomainError {
  constructor(message: string) {
    super(message);
  }
}
