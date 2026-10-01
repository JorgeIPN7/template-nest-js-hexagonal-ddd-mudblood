import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength, NotContains } from 'class-validator';

/**
 * Sustituye a `CreateUserDto`: el alta pasó a `auth` porque quien nace en el alta es una
 * CUENTA (perfil + credencial), no solo un perfil. Los límites son los mismos que publicaba
 * `POST /users`, así que ningún cliente que ya cumplía deja de cumplir.
 *
 * El byte NUL se rechaza en el nombre porque PostgreSQL no lo admite dentro de un texto: sin
 * esta regla, el INSERT del perfil fallaba con un `22021` y el alta acababa en 500 (medido). El
 * email ya lo rechaza `@IsEmail`, y la contraseña nunca llega a la base en claro.
 */
export class RegisterAccountDto {
  @ApiProperty({
    description:
      'Correo del usuario. Debe ser único: un alta con un email ya registrado devuelve 409.',
    example: 'maria.gonzalez@empresa.com.mx',
    format: 'email',
    maxLength: 254,
  })
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    description: 'Nombre visible del usuario. Entre 2 y 120 caracteres, sin el carácter NUL.',
    example: 'María González',
    minLength: 2,
    maxLength: 120,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @NotContains('\u0000', { message: 'name must not contain the NUL character' })
  name!: string;

  @ApiProperty({
    description: 'Contraseña en claro. Entre 12 y 128 caracteres. Nunca se persiste tal cual.',
    example: 'una-frase-larga-y-dificil-de-adivinar',
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
