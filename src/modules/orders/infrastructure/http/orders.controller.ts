import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseFilters } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '@common/auth/authenticated-user';
import { ApiStandardErrors } from '@common/decorators/api-standard-errors.decorator';
import { Auth } from '@common/decorators/auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ApiEnvelope } from '@common/dto/api-envelope.dto';
import { buildErrorExample } from '@common/dto/error-example.factory';
import { ErrorResponseDto, ValidationErrorResponseDto } from '@common/dto/error-response.dto';

import { CancelOrderUseCase } from '../../application/use-cases/cancel-order.use-case';
import { PlaceOrderUseCase } from '../../application/use-cases/place-order.use-case';

import { OrderResponseDto } from './dto/order-response.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { OrdersDomainExceptionFilter } from './orders-domain-exception.filter';

/** Id de ejemplo. Es un UUID v4 válido: `OrderId.from()` rechaza cualquier otra cosa con 400. */
const ORDER_ID_EXAMPLE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const COLLECTION_PATH = '/api/v1/orders';
const CANCEL_PATH = `${COLLECTION_PATH}/${ORDER_ID_EXAMPLE}/cancel`;

/** Lo que `TransformInterceptor` añade a toda respuesta de éxito — mismos valores fijos que users. */
const requestMeta = (path: string) => ({
  timestamp: '2026-08-01T10:15:00.000Z',
  path,
  requestId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
});

const ORDER_EXAMPLE = {
  id: ORDER_ID_EXAMPLE,
  customerId: '9d2a1c7e-1f6b-4a2e-9c3d-77a1b0e5f012',
  concept: 'Suscripción anual plan Pro',
  amountCents: 149_900,
  placedAt: '2026-08-01T10:15:00.000Z',
  status: 'placed',
} as const;

/** `cancelledAt` solo aparece aquí: un pedido colocado no lleva la clave (ver el DTO). */
const CANCELLED_ORDER_EXAMPLE = {
  ...ORDER_EXAMPLE,
  status: 'cancelled',
  cancelledAt: '2026-08-01T12:30:00.000Z',
} as const;

/** Los ejemplos de error salen SIEMPRE de la factoría: `error` se deriva del status. */
const errorExample = (statusCode: number, message: string, path: string) =>
  buildErrorExample(statusCode, { path, message });

/**
 * Adaptador de entrada. Primer consumidor real de `@CurrentUser()`: el `customerId` sale
 * del `sub` del token y JAMÁS del body (anti-spoof, spec §2 — el DTO ni declara el campo
 * y `forbidNonWhitelisted` rechaza al que lo mande).
 */
@ApiTags('Orders')
@Controller('orders')
@UseFilters(OrdersDomainExceptionFilter)
export class OrdersController {
  constructor(
    private readonly placeOrder: PlaceOrderUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
  ) {}

  @Auth()
  @Post()
  @ApiOperation({
    operationId: 'placeOrder',
    summary: 'Coloca una orden a nombre del usuario autenticado',
    description:
      'Registra una orden mínima (concepto + importe en céntimos) para el usuario del token. ' +
      'Antes de guardar se re-verifica que el usuario siga existiendo y activo: un JWT válido ' +
      'puede sobrevivir a su usuario, y en ese caso la respuesta es 403. La orden y su evento ' +
      'OrderPlaced se persisten en la misma transacción (outbox).',
  })
  // El contract guard NO valida los examples de request contra el schema: completos a mano.
  @ApiBody({
    type: PlaceOrderDto,
    examples: {
      standard: {
        summary: 'Orden típica',
        value: { concept: 'Suscripción anual plan Pro', amountCents: 149_900 },
      },
      minimumAmount: {
        summary: 'Importe en el límite inferior (1 céntimo)',
        value: { concept: 'Ajuste de saldo', amountCents: 1 },
      },
    },
  })
  @ApiEnvelope(OrderResponseDto, {
    status: HttpStatus.CREATED,
    description: 'Orden colocada.',
    example: {
      success: true,
      data: ORDER_EXAMPLE,
      request: requestMeta(COLLECTION_PATH),
    },
  })
  // `@Auth()` sin roles no declara 403 — este es del endpoint: token válido cuyo usuario
  // ya no existe o está inactivo. El mensaje es el canónico que publica el filter.
  @ApiForbiddenResponse({
    description: 'El usuario del token ya no existe o está inactivo.',
    type: ErrorResponseDto,
    example: errorExample(403, 'Forbidden', COLLECTION_PATH),
  })
  @ApiBadRequestResponse({
    description: 'El cuerpo no supera la validación de entrada.',
    type: ValidationErrorResponseDto,
    example: errorExample(
      400,
      'concept must be longer than or equal to 1 characters, amountCents must not be less than 1',
      COLLECTION_PATH,
    ),
  })
  @ApiStandardErrors()
  async place(
    @Body() dto: PlaceOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderResponseDto> {
    const order = await this.placeOrder.execute({
      customerId: user.sub,
      concept: dto.concept,
      amountCents: dto.amountCents,
    });
    return OrderResponseDto.fromDomain(order);
  }

  // `POST /orders/:id/cancel` no choca con `POST /orders`: son dos segmentos contra uno, así
  // que `routeConflictPolicy` no ve ni duplicado ni sombra.
  @Auth()
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'cancelOrder',
    summary: 'Cancela un pedido del usuario autenticado',
    description:
      'Pasa un pedido colocado a `cancelled`, sella `cancelledAt` y persiste el evento ' +
      'OrderCancelled en la misma transacción (outbox). Es idempotente: cancelar un pedido ya ' +
      'cancelado devuelve 200 con el pedido tal cual, su `cancelledAt` original y sin un segundo ' +
      'evento. El pedido de otro cliente responde 404, idéntico al de un pedido inexistente. ' +
      'Como en la colocación, se re-verifica que el usuario del token siga existiendo y activo.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador del pedido, en formato UUID v4.',
    format: 'uuid',
    example: ORDER_ID_EXAMPLE,
  })
  @ApiEnvelope(OrderResponseDto, {
    description: 'Pedido cancelado, o que ya lo estaba: la respuesta es la misma.',
    example: {
      success: true,
      data: CANCELLED_ORDER_EXAMPLE,
      request: requestMeta(CANCEL_PATH),
    },
  })
  @ApiForbiddenResponse({
    description: 'El usuario del token ya no existe o está inactivo.',
    type: ErrorResponseDto,
    example: errorExample(403, 'Forbidden', CANCEL_PATH),
  })
  @ApiNotFoundResponse({
    description: 'El pedido no existe o es de otro cliente: las dos respuestas son idénticas.',
    type: ErrorResponseDto,
    example: errorExample(404, `Order ${ORDER_ID_EXAMPLE} was not found`, CANCEL_PATH),
  })
  // Sin 409, a propósito: hoy ninguna petición lo produce. La única escritura posible sobre un
  // pedido existente es otra cancelación, así que el reintento de `CancelOrderUseCase` siempre
  // relee un pedido ya cancelado y responde 200. Publicarlo sería un contrato imposible
  // (CLAUDE.md, «Endpoint documentation»). Cuando exista un tercer estado, el 409 será alcanzable
  // y habrá que declararlo aquí: el filter ya lo traduce.
  // Como en `GET /users/:id`: el 400 no lo produce `ValidationPipe` sino `OrderId.from()`,
  // que el filter traduce. Mismo código y misma forma de cuerpo, mensaje propio.
  @ApiBadRequestResponse({
    description: 'El id no es un UUID v4.',
    type: ValidationErrorResponseDto,
    example: errorExample(
      400,
      '"no-es-uuid" is not a valid order id',
      `${COLLECTION_PATH}/no-es-uuid/cancel`,
    ),
  })
  @ApiStandardErrors()
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrderResponseDto> {
    const order = await this.cancelOrder.execute({ customerId: user.sub, orderId: id });
    return OrderResponseDto.fromDomain(order);
  }
}
