import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { Order } from '../../../domain/entities/order.entity';
import { ORDER_STATUSES, type OrderStatus } from '../../../domain/value-objects/order-status';

export class OrderResponseDto {
  @ApiProperty({
    description: 'Identificador de la orden.',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    description: 'Cliente que colocó la orden: siempre el `sub` del token, nunca del body.',
    example: '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012',
    format: 'uuid',
  })
  customerId!: string;

  @ApiProperty({ description: 'Concepto de la orden.', example: 'Suscripción anual plan Pro' })
  concept!: string;

  @ApiProperty({ description: 'Importe en céntimos.', example: 149_900 })
  amountCents!: number;

  // `type: String` + `format` explícitos como red de seguridad, mismo razonamiento
  // medido que documenta `user-response.dto.ts`.
  @ApiProperty({
    description: 'Momento en que se colocó la orden, en UTC.',
    example: '2026-08-01T10:15:00.000Z',
    type: String,
    format: 'date-time',
  })
  placedAt!: Date;

  @ApiProperty({
    description: 'Estado del pedido. Un pedido `cancelled` no vuelve a `placed`.',
    enum: [...ORDER_STATUSES],
    example: 'placed',
  })
  status!: OrderStatus;

  // Opcional y no `nullable`: es una decisión de diseño —un pedido colocado no tiene fecha de
  // cancelación, así que la clave no aparece— y no algo que imponga el contract guard. Medido
  // con su Ajv (8.20.0): con `type` explícito, `nullable: true` acepta `null`; lo que no compila
  // es `nullable` junto a un `$ref` sin `type`, que es la forma de un DTO anidado. Solo ahí
  // omitir la clave es obligatorio.
  @ApiPropertyOptional({
    description:
      'Momento de la cancelación, en UTC. Solo está presente cuando `status` es `cancelled`: ' +
      'un pedido colocado no lleva la clave.',
    example: '2026-08-01T12:30:00.000Z',
    type: String,
    format: 'date-time',
  })
  cancelledAt?: Date;

  /** El dominio nunca se serializa directamente: siempre pasa por este DTO. */
  static fromDomain(order: Order): OrderResponseDto {
    const snapshot = order.toSnapshot();
    const dto = new OrderResponseDto();
    dto.id = snapshot.id;
    dto.customerId = snapshot.customerId;
    dto.concept = snapshot.concept;
    dto.amountCents = snapshot.amountCents;
    dto.placedAt = snapshot.placedAt;
    dto.status = snapshot.status;
    if (snapshot.cancelledAt !== null) {
      dto.cancelledAt = snapshot.cancelledAt;
    }
    return dto;
  }
}
