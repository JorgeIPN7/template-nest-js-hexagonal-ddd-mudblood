import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

/**
 * Contrato de error que realmente devuelve `AllExceptionsFilter`. Antes no existía en el
 * OpenAPI: el documento publicado describía únicamente los caminos felices, así que un SDK
 * generado no tenía forma de tipar un fallo. Es el mismo defecto que `ApiEnvelopeDto` ya
 * corrigió para las respuestas de éxito.
 *
 * Las claves deben seguir a `ErrorPayload` una a una, opcionales incluidas —
 * `error-response.dto.spec.ts` lo vigila.
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 404, description: 'Código HTTP de la respuesta.' })
  statusCode!: number;

  @ApiProperty({
    example: 'User not found',
    description:
      'Mensaje legible. En producción y staging se sanea para no filtrar detalles internos.',
  })
  message!: string;

  /**
   * Medido, no supuesto: `AllExceptionsFilter` toma `body.error ?? exception.name`, y cuando el
   * error viene de una `HttpException` construida con un string —que es lo que hace
   * `UserDomainExceptionFilter`— Nest ya rellena `body.error` con el nombre canónico del status.
   * Así que aquí sale `Conflict`, `Not Found` o `Bad Request`, **nunca** el nombre de la clase de
   * dominio: `UserNotFoundError` no llega jamás al cliente. Poner ese ejemplo, como estaba antes,
   * anunciaba un valor imposible e invitaba a bifurcar por algo que no existe.
   */
  @ApiProperty({
    example: 'Not Found',
    description:
      'Nombre canónico del status HTTP. Para distinguir dos errores que comparten status, mira ' +
      'el `message` o el status code — este campo no identifica el tipo de error de dominio.',
  })
  error!: string;

  @ApiProperty({ example: '2026-08-01T10:15:00.000Z', format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: '/api/v1/users/9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012' })
  path!: string;

  @ApiProperty({
    example: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    description:
      'Correlaciona la respuesta con la traza en los logs. Inclúyelo al reportar una incidencia.',
  })
  requestId!: string;

  /**
   * Opcional en el esquema porque es opcional en el filtro: `required: false` es lo que deja que
   * los ejemplos de `buildErrorExample`, que no lo llevan, sigan satisfaciendo el esquema en el
   * guardián Ajv. Ningún filtro de dominio lo emite; existe para que `AllExceptionsFilter` no
   * descarte el que traiga una excepción de Nest 12.
   */
  @ApiPropertyOptional({
    example: 'RESOURCE_LOCKED',
    description:
      'Identificador del error legible por máquina. Solo aparece cuando la excepción HTTP que ' +
      'origina la respuesta lo declara (opción `errorCode` de Nest); si no, la clave no existe, ' +
      'nunca vale `null`. Los errores de esta API no lo usan todavía: no bifurques por él sin ' +
      'comprobar que el endpoint lo documenta.',
  })
  errorCode?: string;
}

/**
 * La forma concreta que produce un fallo del `ValidationPipe` global de `main.ts`.
 *
 * **Las violaciones viajan en `message`.** Verificado contra el pipe real: su `exceptionFactory`
 * por defecto lanza `{ message: string[], error: 'Bad Request', statusCode: 400 }`, y
 * `AllExceptionsFilter` une el array en una sola cadena.
 *
 * `OmitType` es lo que permite sustituir los `example` heredados, que hablan de un 404 y
 * desorientarían en una respuesta 400.
 *
 * **Sin `errorCode`, y no se redeclara.** El `exceptionFactory` por defecto construye la
 * excepción sin opciones (`validation.pipe.js` en `@nestjs/common` 12.1.0), así que un fallo de
 * validación nunca lo trae. Heredarlo anunciaría un campo que este status no puede llevar.
 */
export class ValidationErrorResponseDto extends OmitType(ErrorResponseDto, [
  'statusCode',
  'message',
  'error',
  'errorCode',
] as const) {
  @ApiProperty({ example: 400, description: 'Código HTTP de la respuesta.' })
  statusCode!: number;

  @ApiProperty({
    example: 'email must be an email, name must be longer than or equal to 2 characters',
    description:
      'Todas las violaciones de validación, unidas por «, ». El pipe las produce como array y ' +
      '`AllExceptionsFilter` las une en una sola cadena.',
  })
  message!: string;

  @ApiProperty({
    example: 'Bad Request',
    description: 'Siempre `Bad Request` en un fallo del ValidationPipe.',
  })
  error!: string;
}
