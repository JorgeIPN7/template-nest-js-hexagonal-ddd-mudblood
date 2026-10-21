import { test as fcTest } from '@fast-check/jest';

import { InvalidOrderAmountError } from '../../../domain/errors/order.errors';
import { OrderAmount } from '../../../domain/value-objects/order-amount.vo';
import { orderAmountCentsArb } from '../../helpers/arbitraries';

describe('OrderAmount', () => {
  describe('from()', () => {
    it('debería rechazar un importe no entero', () => {
      // Arrange

      // Act
      const act = () => OrderAmount.from(10.5);

      // Assert
      expect(act).toThrow(InvalidOrderAmountError);
    });

    it('debería rechazar un importe de cero o negativo', () => {
      // Arrange

      // Act
      const actZero = () => OrderAmount.from(0);
      const actNegative = () => OrderAmount.from(-1);

      // Assert
      expect(actZero).toThrow(InvalidOrderAmountError);
      expect(actNegative).toThrow(InvalidOrderAmountError);
    });

    it('debería rechazar un importe mayor al tope', () => {
      // Arrange

      // Act
      const act = () => OrderAmount.from(10_000_001);

      // Assert
      expect(act).toThrow(InvalidOrderAmountError);
    });

    // El tope exacto, por el mismo motivo que el límite de 140 del concepto: sin él, ninguna fila
    // fija distinguía un `>=` en vez de `>`, y solo podía matarlo la de propiedad si la semilla
    // generaba justo el tope (en el censo del 2026-10-19 sobrevivió).
    it('debería aceptar un importe igual al tope de 10 000 000 céntimos', () => {
      // Arrange
      const cap = 10_000_000;

      // Act
      const act = () => OrderAmount.from(cap);

      // Assert
      expect(act).not.toThrow();
      expect(act().value).toBe(cap);
    });
  });

  describe('from() (property-based)', () => {
    fcTest.prop([orderAmountCentsArb])(
      'debería aceptar cualquier importe entero del rango (propiedad)',
      (cents) => {
        // Arrange

        // Act
        const amount = OrderAmount.from(cents);

        // Assert
        expect(amount.value).toBe(cents);
      },
    );
  });
});
