import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min, NotContains } from 'class-validator';

/**
 * Sin `customerId` A PROPÓSITO (anti-spoof, spec §2): sale del `sub` del token. Si el
 * body lo trae igualmente, `forbidNonWhitelisted` del ValidationPipe global responde 400.
 *
 * El byte NUL se rechaza aquí porque PostgreSQL no lo admite dentro de un texto: sin esta
 * regla, el INSERT fallaba con un `22021` y la petición acababa en 500 (medido).
 */
export class PlaceOrderDto {
  @ApiProperty({
    description:
      'Concepto de la orden, entre 1 y 140 caracteres y sin el carácter NUL. El dominio ' +
      'recorta espacios: un concepto de solo espacios se rechaza con 400 aunque pase la longitud.',
    example: 'Suscripción anual plan Pro',
    minLength: 1,
    maxLength: 140,
  })
  @IsString()
  @Length(1, 140)
  @NotContains('\u0000', { message: 'concept must not contain the NUL character' })
  concept!: string;

  @ApiProperty({
    description:
      'Importe en céntimos: entero positivo, máximo 10 000 000. Céntimos y no decimales ' +
      'para que el importe nunca pase por un flotante.',
    example: 149_900,
    minimum: 1,
    maximum: 10_000_000,
  })
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  amountCents!: number;
}
