import type { ErrorPayload } from '../../filters/all-exceptions.filter';

import { ErrorResponseDto, ValidationErrorResponseDto } from '../../dto/error-response.dto';

describe('ErrorResponseDto', () => {
  it('debería declarar exactamente las claves que produce AllExceptionsFilter', () => {
    // Arrange
    // `Required<ErrorPayload>` es lo que ata este test al filtro: si alguien añade una clave a
    // `ErrorPayload`, este literal deja de compilar hasta que se añada aquí, y entonces el
    // `Set` falla hasta que el DTO también la declare.
    const payload: Required<ErrorPayload> = {
      statusCode: 404,
      message: 'User not found',
      error: 'UserNotFoundError',
      timestamp: '2026-08-01T10:15:00.000Z',
      path: '/api/v1/users/1',
      requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      errorCode: 'RESOURCE_LOCKED',
    };

    // Act
    const declared = declaredKeys(ErrorResponseDto);

    // Assert
    expect(new Set(declared)).toEqual(new Set(Object.keys(payload)));
  });

  // Si `errorCode` se publicara como requerido, ningún ejemplo de error del documento —todos
  // salen de `buildErrorExample`, que no lo emite— satisfaría su esquema, y el guardián Ajv de
  // `openapi-contract.e2e-spec.ts` se pondría rojo en cada operación.
  it('debería publicar errorCode como opcional y con un example', () => {
    // Arrange
    const metadata = propertyMetadata(ErrorResponseDto, 'errorCode');

    // Act
    const { required, example } = metadata ?? {};

    // Assert
    expect(required).toBe(false);
    expect(example).toEqual(expect.any(String));
  });
});

describe('ValidationErrorResponseDto', () => {
  // Redeclarar estas tres propiedades solo sirve para cambiar el `example` heredado, que habla
  // de un 404. Por eso el test asserta el valor publicado y no que la clave esté registrada:
  // un `@ApiProperty()` sin opciones deja las claves intactas y vacía los ejemplos en silencio.
  //
  // Dependencia de compilador que conviene conocer: estas aserciones se sostienen porque SWC
  // emite `__decorate` para propiedades declaradas. `tsc` **no** emite un campo `declare` ni
  // sus decoradores, así que una redeclaración escrita con `declare` desaparecería del bundle
  // y este test seguiría en verde bajo el pipeline actual. Si algún día se sustituye SWC por
  // `tsc` en `.swcrc`/`nest-cli.json`, hay que revalidar este archivo: no es sensible a ese
  // cambio.
  it.each([
    ['statusCode', 400],
    ['message', 'email must be an email, name must be longer than or equal to 2 characters'],
    ['error', 'Bad Request'],
  ])('debería publicar en %s el example propio de un 400', (key, expected) => {
    // Arrange
    const metadata = propertyMetadata(ValidationErrorResponseDto, key);

    // Act
    const published = metadata?.example;

    // Assert
    expect(published).toEqual(expected);
  });

  it('debería conservar las claves que no redeclara, salvo errorCode', () => {
    // Arrange
    const declared = declaredKeys(ValidationErrorResponseDto);

    // Act
    const keys = new Set(declared);

    // Assert
    expect(keys).toEqual(
      new Set(['statusCode', 'message', 'error', 'timestamp', 'path', 'requestId']),
    );
  });

  // El `exceptionFactory` por defecto del `ValidationPipe` construye la excepción sin opciones
  // (`validation.pipe.js` en `@nestjs/common` 12.1.0), así que un 400 de validación nunca trae
  // `errorCode`. Heredarlo publicaría un campo que ese status no puede llevar.
  it('debería omitir errorCode, que el ValidationPipe nunca fija', () => {
    // Arrange
    const declared = declaredKeys(ValidationErrorResponseDto);

    // Act
    const hasErrorCode = declared.includes('errorCode');

    // Assert
    expect(hasErrorCode).toBe(false);
  });
});

// Helpers

// `@nestjs/swagger` acumula los nombres decorados en este array, cada uno prefijado con `:`, y
// guarda las opciones de cada propiedad bajo la otra clave, indexadas por nombre de propiedad
// (ver `createPropertyDecorator` en `dist/decorators/helpers.js`). Verificado contra 11.4.6 y
// de nuevo contra 12.0.2.
const KEYS_META = 'swagger/apiModelPropertiesArray';
const PROPERTY_META = 'swagger/apiModelProperties';

// Se tipa por el `prototype` y no como `new () => unknown`: en esa forma `prototype` es `any`
// y `Reflect.getMetadata` dispara `no-unsafe-argument`.
type DtoClass = { prototype: object };

type PropertyMetadata = { example?: unknown; required?: boolean };

/** Nombres de propiedad que `@ApiProperty` registró en el DTO. */
const declaredKeys = (dto: DtoClass): string[] =>
  ((Reflect.getMetadata(KEYS_META, dto.prototype) as string[] | undefined) ?? []).map((key) =>
    key.replace(/^:/, ''),
  );

/** Las opciones con las que se decoró una propiedad concreta: lo que acaba en el esquema. */
const propertyMetadata = (dto: DtoClass, key: string): PropertyMetadata | undefined =>
  Reflect.getMetadata(PROPERTY_META, dto.prototype, key) as PropertyMetadata | undefined;
