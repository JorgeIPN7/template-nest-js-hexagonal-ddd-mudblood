import { test as fcTest } from '@fast-check/jest';

import { InvalidOrderConceptError } from '../../../domain/errors/order.errors';
import { OrderConcept } from '../../../domain/value-objects/order-concept.vo';
import { orderConceptArb } from '../../helpers/arbitraries';

describe('OrderConcept', () => {
  describe('from()', () => {
    it('debería rechazar un concepto vacío tras trim', () => {
      // Act + Assert
      expect(() => OrderConcept.from('   ')).toThrow(InvalidOrderConceptError);
    });

    it('debería rechazar un concepto de más de 140 caracteres', () => {
      // Arrange
      const tooLong = 'a'.repeat(141);

      // Act + Assert
      expect(() => OrderConcept.from(tooLong)).toThrow(InvalidOrderConceptError);
    });

    // El límite exacto: con solo el caso de 141, un `>=` en vez de `>` pasaría desapercibido. Se
    // afirma que no lanza, y no solo el valor, para que ese mutante caiga en la aserción y no en
    // la línea `// Act`.
    it('debería aceptar un concepto de exactamente 140 caracteres', () => {
      // Arrange
      const exact = 'a'.repeat(140);

      // Act
      const act = () => OrderConcept.from(exact);

      // Assert
      expect(act).not.toThrow();
      expect(act().value).toBe(exact);
    });
  });

  describe('from() (property-based)', () => {
    fcTest.prop([orderConceptArb])(
      'debería aceptar cualquier concepto válido (propiedad)',
      (raw) => {
        // Act
        const concept = OrderConcept.from(raw);

        // Assert: nunca lanza, el value queda recortado y re-parsearlo es estable.
        expect(concept.value).toBe(raw.trim());
        expect(OrderConcept.from(concept.value).value).toBe(concept.value);
      },
    );
  });
});
