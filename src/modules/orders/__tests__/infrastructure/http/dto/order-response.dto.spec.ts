import { modelPropertiesOf } from '@common/__tests__/helpers/swagger-metadata';

import { OrderResponseDto } from '../../../../infrastructure/http/dto/order-response.dto';

/**
 * Solo lo que el DTO publica en el documento OpenAPI: `fromDomain` ya lo cubren las filas de
 * claves de `orders.controller.spec.ts`. Se lee la metadata real de `@ApiProperty`, como en
 * `authenticated-user.dto.spec.ts`.
 */
describe('OrderResponseDto', () => {
  it('debería publicar createdAt y updatedAt como cadenas date-time', () => {
    // Arrange

    // Act
    const properties = modelPropertiesOf(OrderResponseDto);

    // Assert
    expect(properties.createdAt?.type).toBe(String);
    expect(properties.createdAt?.format).toBe('date-time');
    expect(properties.updatedAt?.type).toBe(String);
    expect(properties.updatedAt?.format).toBe('date-time');
  });

  it('debería publicar exactamente los campos del pedido, sin placedAt ni la versión', () => {
    // Arrange

    // Act
    const fields = Object.keys(modelPropertiesOf(OrderResponseDto)).sort();

    // Assert
    expect(fields).toEqual([
      'amountCents',
      'cancelledAt',
      'concept',
      'createdAt',
      'customerId',
      'id',
      'status',
      'updatedAt',
    ]);
  });
});
