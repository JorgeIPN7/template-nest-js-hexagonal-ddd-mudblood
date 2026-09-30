import { InvalidOrderIdError } from '../../../domain/errors/order.errors';
import { OrderId } from '../../../domain/value-objects/order-id.vo';

/** Desde la cancelación, `from()` es la única validación del `:id` de `POST /orders/:id/cancel`. */
const VALID_UUID_V4 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('OrderId', () => {
  describe('from()', () => {
    it('debería rechazar un id que no sea uuid v4', () => {
      // Act + Assert
      expect(() => OrderId.from('nope')).toThrow(InvalidOrderIdError);
    });

    it('debería rechazar un uuid v4 válido con texto delante', () => {
      // Arrange: sin el ancla `^` pasaría, y PostgreSQL rechazaría el cast a uuid con un 500.
      const value = `x${VALID_UUID_V4}`;

      // Act
      const act = () => OrderId.from(value);

      // Assert
      expect(act).toThrow(InvalidOrderIdError);
    });

    it('debería rechazar un uuid v4 válido con texto detrás', () => {
      // Arrange: lo mismo con el ancla `$`.
      const value = `${VALID_UUID_V4}x`;

      // Act
      const act = () => OrderId.from(value);

      // Assert
      expect(act).toThrow(InvalidOrderIdError);
    });
  });
});
