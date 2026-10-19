import { Catch, ConflictException, NotFoundException } from '@nestjs/common';

import {
  DomainExceptionFilter,
  type DomainErrorMapping,
} from '@common/filters/domain-exception.filter';

import {
  EmailAlreadyTakenError,
  UserDomainError,
  UserNotFoundError,
} from '../../domain/errors/user.errors';

/**
 * Traduce los errores del dominio de `users` al protocolo HTTP. Vive en `infrastructure/http/`
 * justamente para que el dominio no tenga que saber qué es un 404: el dominio lanza
 * `UserNotFoundError` y es el adaptador quien decide el código de estado.
 *
 * La tabla solo lleva lo que no es un 400: los `Invalid*` (un email, un id o un nombre que el
 * dominio rechaza) caen en el 400 por defecto de `DomainExceptionFilter`, igual que un error de
 * dominio nuevo sin mapeo: el cliente pidió algo que el dominio rechaza. El 409 es una defensa
 * que ningún endpoint de `users` declara hoy: quien lanza `EmailAlreadyTakenError` es el alta,
 * que sale por la fachada como `email-taken`. Lo haría alcanzable un endpoint de `users` que
 * cambiara el email.
 *
 * Las excepciones se construyen con un STRING: así Nest rellena `body.error` con el nombre
 * canónico del status (`Not Found`, `Conflict`), que es lo que `buildErrorExample` deriva, y el
 * nombre de la clase de dominio no llega jamás al cliente. Una fila corrupta no pasa por aquí:
 * `UserMapper` la convierte en un `Error` plano, que este `@Catch` no atrapa, y es un 500.
 */
@Catch(UserDomainError)
export class UsersDomainExceptionFilter extends DomainExceptionFilter<UserDomainError> {
  protected readonly mappings: readonly DomainErrorMapping<UserDomainError>[] = [
    { error: UserNotFoundError, toHttp: (error) => new NotFoundException(error.message) },
    { error: EmailAlreadyTakenError, toHttp: (error) => new ConflictException(error.message) },
  ];
}
