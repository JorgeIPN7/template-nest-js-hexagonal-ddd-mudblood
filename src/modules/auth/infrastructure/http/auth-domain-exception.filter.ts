import {
  Catch,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  DomainExceptionFilter,
  type DomainErrorMapping,
} from '@common/filters/domain-exception.filter';

import {
  AuthDomainError,
  EmailAlreadyRegisteredError,
  InvalidCredentialIdError,
  InvalidCredentialsError,
  InvalidPasswordHashError,
} from '../../domain/errors/auth.errors';

/**
 * El 500 de una fila corrupta, con una sola definición para las dos entradas que lo usan. Sale
 * IDÉNTICO al de cualquier otro fallo del servidor: `message: 'Internal server error'` y
 * `error: 'InternalServerError'` son literalmente lo que `AllExceptionsFilter` emite en su rama
 * de 500 y lo que publica `buildErrorExample(500, …)`. El mensaje del dominio NO viaja en el body
 * en NINGÚN entorno (la rama `isProductionLike` del filtro global solo sanea los `Error` no-HTTP,
 * y esto ya es una `HttpException`): va como `cause`, que solo ve el logger.
 */
const corruptRow = (cause: AuthDomainError): InternalServerErrorException =>
  new InternalServerErrorException('Internal server error', {
    description: 'InternalServerError',
    cause,
  });

/**
 * Traduce los errores del dominio de `auth` al protocolo HTTP. Vive en `infrastructure/http/`
 * justamente para que el dominio no tenga que saber qué es un 401: el dominio lanza
 * `InvalidCredentialsError` y es el adaptador quien decide el código de estado.
 *
 * **Todas las excepciones se construyen con un STRING**, nunca con un objeto (lección del
 * ciclo de auth original, hoy fijada además en `error-example.factory.spec.ts`): así Nest
 * rellena `body.error` con el nombre CANÓNICO del status —`Unauthorized`, `Conflict`,
 * `Bad Request`— que es exactamente lo que `buildErrorExample` deriva, y el nombre de la
 * clase de dominio no llega jamás al cliente.
 *
 * El `message` del 401 se conserva —`Invalid credentials`— y no se reemplaza por el canónico
 * `Unauthorized`: es el cuerpo que el contrato publicado ya promete para `POST /auth/login`.
 * Sigue sin enumerar nada: es el MISMO mensaje para email inexistente, cuenta sin credencial,
 * password incorrecto y usuario inactivo.
 *
 * El catch es ancho (`AuthDomainError`) y no solo los casos mapeados: un error de dominio
 * nuevo sin mapeo explícito cae en el 400 por defecto de `DomainExceptionFilter`, como entrada
 * inválida antes que como fallo del servidor —el cliente pidió algo que el dominio rechaza—, que
 * es donde cae hoy `InvalidProfileError`.
 *
 * **Las dos excepciones a ese 400 son filas corruptas, no entradas del usuario**, y por eso son
 * un 500 (`corruptRow`):
 *
 * - `InvalidPasswordHashError`: `PasswordHash.from()` solo lo lanza al RECONSTITUIR una
 *   credencial ya persistida (`credential.mapper.ts`); nada del body del cliente pasa por ahí.
 *   La fila de `auth_credentials` no contiene un hash argon2id, algo alcanzable de verdad: la
 *   migración copia el valor verbatim y no valida formato, así que basta una carga por SQL desde
 *   otro sistema. Descartado tratarlo como credenciales inválidas (401) pese a que uniformaría el
 *   login: la propiedad anti-enumeración protege de los caminos que un ATACANTE puede provocar
 *   por email, y una fila corrupta no es uno — es un fallo de operación. Con 401 la cuenta
 *   quedaría sin poder entrar para siempre y el filtro global loguearía un `warn` sin `err`,
 *   indistinguible de un password mal escrito: nadie se enteraría nunca.
 * - `InvalidCredentialIdError`: el id de la fila no es un uuid v4, otra vez por un SQL externo.
 *   El 400 por defecto publicaría el id en el cuerpo. El mapper no lo envuelve con `failClosed`
 *   a propósito: ese `Error` no es una `HttpException`, y fuera de producción `AllExceptionsFilter`
 *   publicaría su mensaje, con el id dentro; aquí el 500 sale saneado en todos los entornos. El
 *   remedio operativo es `UPDATE auth_credentials SET id = gen_random_uuid() WHERE id = '<id>'`,
 *   seguro porque nada referencia ese id: no hay claves foráneas y el JWT lleva el del usuario.
 */
@Catch(AuthDomainError)
export class AuthDomainExceptionFilter extends DomainExceptionFilter<AuthDomainError> {
  protected readonly mappings: readonly DomainErrorMapping<AuthDomainError>[] = [
    {
      error: InvalidCredentialsError,
      toHttp: (error) => new UnauthorizedException(error.message),
    },
    {
      error: EmailAlreadyRegisteredError,
      toHttp: (error) => new ConflictException(error.message),
    },
    { error: InvalidPasswordHashError, toHttp: corruptRow },
    { error: InvalidCredentialIdError, toHttp: corruptRow },
  ];
}
