import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { modelPropertiesOf } from '@common/__tests__/helpers/swagger-metadata';
import { PASSWORD_LENGTH } from '@config/password-policy';

import { LoginDto } from '../../../../infrastructure/http/dto/login.dto';

/**
 * La contraseña se valida y se publica con `PASSWORD_LENGTH`, la misma constante que valida
 * `ADMIN_PASSWORD` en `env.schema.ts`. Aquí se fijan los dos lados: lo que publica `@ApiProperty`
 * y lo que aceptan `@MinLength`/`@MaxLength`. Un error de uno en cualquiera de los dos dejaría al
 * seed crear un admin que este DTO rechaza, o publicaría límites que el servidor no aplica.
 */
describe('LoginDto', () => {
  it('debería publicar en la contraseña los límites de PASSWORD_LENGTH', () => {
    // Arrange
    const properties = modelPropertiesOf(LoginDto);

    // Act
    const published = {
      minLength: properties.password?.minLength,
      maxLength: properties.password?.maxLength,
      description: properties.password?.description,
    };

    // Assert
    expect(published).toEqual({
      minLength: PASSWORD_LENGTH.min,
      maxLength: PASSWORD_LENGTH.max,
      description: expect.stringContaining(
        `entre ${PASSWORD_LENGTH.min} y ${PASSWORD_LENGTH.max} caracteres`,
      ),
    });
  });

  // Fronteras en literales, como en `password-policy.spec.ts`: `PASSWORD_LENGTH` ya está fijada
  // a 12 y 128 allí.
  it('debería aceptar una contraseña de exactamente el mínimo y otra de exactamente el máximo', () => {
    // Arrange
    const shortest = 'a'.repeat(12);
    const longest = 'a'.repeat(128);

    // Act
    const accepted = [acceptsPassword(shortest), acceptsPassword(longest)];

    // Assert
    expect(accepted).toEqual([true, true]);
  });

  it('debería rechazar una contraseña de un carácter menos que el mínimo y otra de uno más que el máximo', () => {
    // Arrange
    const tooShort = 'a'.repeat(11);
    const tooLong = 'a'.repeat(129);

    // Act
    const accepted = [acceptsPassword(tooShort), acceptsPassword(tooLong)];

    // Assert
    expect(accepted).toEqual([false, false]);
  });
});

// Helpers

/** Solo cuentan los errores de `password`: el email va válido, pero así no puede tapar nada. */
const acceptsPassword = (password: string): boolean =>
  validateSync(plainToInstance(LoginDto, { email: 'maria@example.com', password })).every(
    (error) => error.property !== 'password',
  );
