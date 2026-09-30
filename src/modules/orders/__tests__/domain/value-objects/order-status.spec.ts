import { ORDER_STATUSES } from '../../../domain/value-objects/order-status';

describe('ORDER_STATUSES', () => {
  it('debería definir exactamente los estados placed y cancelled', () => {
    // Arrange

    // Act
    const statuses = [...ORDER_STATUSES];

    // Assert
    expect(statuses).toEqual(['placed', 'cancelled']);
  });
});
