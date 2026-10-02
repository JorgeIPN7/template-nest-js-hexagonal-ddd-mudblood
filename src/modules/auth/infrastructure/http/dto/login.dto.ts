import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_LENGTH } from '@config/password-policy';

export class LoginDto {
  @ApiProperty({
    description: 'Correo con el que se registró el usuario.',
    example: 'maria.gonzalez@empresa.com.mx',
    format: 'email',
  })
  // Mismo mensaje que `RegisterAccountDto`: el ejemplo del 400 lo cita literalmente.
  @IsEmail({}, { message: 'email must be a valid address' })
  email!: string;

  // Los límites salen de `PASSWORD_LENGTH`, la misma constante con la que `env.schema.ts`
  // valida `ADMIN_PASSWORD`: el seed no puede crear un admin cuya contraseña rechace este DTO.
  @ApiProperty({
    description:
      'Contraseña en claro. Mismos límites que en el alta: entre ' +
      `${PASSWORD_LENGTH.min} y ${PASSWORD_LENGTH.max} caracteres.`,
    example: 'una-frase-larga-y-dificil-de-adivinar',
    minLength: PASSWORD_LENGTH.min,
    maxLength: PASSWORD_LENGTH.max,
  })
  @IsString()
  @MinLength(PASSWORD_LENGTH.min)
  @MaxLength(PASSWORD_LENGTH.max)
  password!: string;
}
