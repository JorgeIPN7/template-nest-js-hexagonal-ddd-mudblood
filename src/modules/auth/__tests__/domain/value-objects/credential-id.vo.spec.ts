import { fc, test as fcTest } from '@fast-check/jest';

import { InvalidCredentialIdError } from '../../../domain/errors/auth.errors';
import { CredentialId } from '../../../domain/value-objects/credential-id.vo';

const VALID_UUID_V4 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

/**
 * Las anclas y el resto de formas que rechaza `isUuidV4` las cubre el spec del kernel
 * (`uuid-identifier.base.spec.ts`): aquí basta un rechazo de cada clase para fijar `from()`.
 */
describe('CredentialId', () => {
  describe('from()', () => {
    it('debería aceptar un uuid v4 y conservarlo como valor', () => {
      // Arrange

      // Act
      const id = CredentialId.from(VALID_UUID_V4);

      // Assert
      expect(id.value).toBe(VALID_UUID_V4);
    });

    it('debería guardar en minúsculas un uuid v4 escrito en mayúsculas', () => {
      // Arrange
      const value = VALID_UUID_V4.toUpperCase();

      // Act
      const id = CredentialId.from(value);

      // Assert
      expect(id.value).toBe(VALID_UUID_V4);
    });

    it('debería rechazar un uuid válido que no es de la versión 4', () => {
      // Arrange: un v1, lo que dejaría un SQL externo a la aplicación.
      const value = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

      // Act
      const act = () => CredentialId.from(value);

      // Assert
      expect(act).toThrow(InvalidCredentialIdError);
    });

    it('debería rechazar un texto que no es un uuid', () => {
      // Arrange
      const value = 'not-a-uuid';

      // Act
      const act = () => CredentialId.from(value);

      // Assert
      expect(act).toThrow(InvalidCredentialIdError);
    });
  });

  describe('generate()', () => {
    // El formato se comprueba contra la especificación del uuid v4 y no con la regex de `from()`,
    // que se estaría probando contra sí misma: la versión vive en la posición 14 y la variante
    // en la 19, según RFC 4122.
    fcTest.prop([fc.integer({ min: 1, max: 20 })])(
      'debería generar siempre un uuid v4 en minúsculas y distinto en cada llamada',
      (count) => {
        // Arrange

        // Act
        const values = Array.from({ length: count }, () => CredentialId.generate().value);

        // Assert
        for (const value of values) {
          expect(value).toHaveLength(36);
          expect(value[14]).toBe('4');
          expect(['8', '9', 'a', 'b']).toContain(value[19]);
          expect(value).toBe(value.toLowerCase());
        }
        expect(new Set(values).size).toBe(count);
      },
    );
  });
});
