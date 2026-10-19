import { fc, test as fcTest } from '@fast-check/jest';

import { UuidIdentifier } from '../../domain/uuid-identifier.base';

// Tres uuid v4 válidos, con variantes distintas. Las filas de rechazo alteran el primero en un
// solo punto, para que solo falle lo que la fila nombra.
const LOWERCASE_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UPPERCASE_UUID = 'F47AC10B-58CC-4372-A567-0E02B2C3D479';
const MIXED_CASE_UUID = '6Ba7B810-9dAd-41D1-80b4-00C04fD430c8';

describe('UuidIdentifier', () => {
  describe('isUuidV4()', () => {
    it('debería aceptar un uuid v4 escrito en minúsculas', () => {
      // Arrange
      const value = LOWERCASE_UUID;
      // Act
      const result = AlphaId.accepts(value);
      // Assert
      expect(result).toBe(true);
    });

    it('debería aceptar un uuid v4 escrito en mayúsculas', () => {
      // Arrange
      const value = UPPERCASE_UUID;
      // Act
      const result = AlphaId.accepts(value);
      // Assert
      expect(result).toBe(true);
    });

    it('debería aceptar un uuid v4 que mezcla mayúsculas y minúsculas', () => {
      // Arrange
      const value = MIXED_CASE_UUID;
      // Act
      const result = AlphaId.accepts(value);
      // Assert
      expect(result).toBe(true);
    });

    it('debería rechazar un uuid de otra versión', () => {
      // Arrange
      const values = ['1', '3', '5', '7'].map((version) => replaceAt(LOWERCASE_UUID, 14, version));
      // Act
      const results = values.map((value) => AlphaId.accepts(value));
      // Assert
      expect(results).toEqual([false, false, false, false]);
    });

    it('debería rechazar un uuid con la variante fuera de 8, 9, a y b', () => {
      // Arrange
      const values = ['7', 'c'].map((variant) => replaceAt(LOWERCASE_UUID, 19, variant));
      // Act
      const results = values.map((value) => AlphaId.accepts(value));
      // Assert
      expect(results).toEqual([false, false]);
    });

    it('debería rechazar un uuid v4 válido con texto delante', () => {
      // Arrange
      const value = `x${LOWERCASE_UUID}`;
      // Act
      const result = AlphaId.accepts(value);
      // Assert
      expect(result).toBe(false);
    });

    it('debería rechazar un uuid v4 válido con texto detrás', () => {
      // Arrange
      const value = `${LOWERCASE_UUID}x`;
      // Act
      const result = AlphaId.accepts(value);
      // Assert
      expect(result).toBe(false);
    });

    it('debería rechazar la cadena vacía', () => {
      // Arrange
      const value = '';
      // Act
      const result = AlphaId.accepts(value);
      // Assert
      expect(result).toBe(false);
    });

    it('debería rechazar un uuid v4 sin guiones', () => {
      // Arrange
      const value = '3f2504e04f8941d39a0c0305e82c3301';
      // Act
      const result = AlphaId.accepts(value);
      // Assert
      expect(result).toBe(false);
    });

    fcTest.prop([uuidV4AnyCase()])(
      'debería aceptar cualquier uuid v4 con cualquier capitalización',
      (sample) => {
        // Arrange
        const { written } = sample;
        // Act
        const result = AlphaId.accepts(written);
        // Assert
        expect(result).toBe(true);
      },
    );

    fcTest.prop([uuidV4WithNonHexChar()])(
      'debería rechazar cualquier uuid v4 con un carácter no hexadecimal en una posición hexadecimal',
      (sample) => {
        // Arrange
        const { altered } = sample;
        // Act
        const result = AlphaId.accepts(altered);
        // Assert
        expect(result).toBe(false);
      },
    );
  });

  describe('constructor', () => {
    it('debería guardar el valor en minúsculas', () => {
      // Arrange
      const value = UPPERCASE_UUID;
      // Act
      const id = AlphaId.of(value);
      // Assert
      expect(id.value).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    });

    it('debería considerar iguales dos ids de la misma clase con el mismo uuid escrito con distinta capitalización', () => {
      // Arrange
      const upper = AlphaId.of(UPPERCASE_UUID);
      const lower = AlphaId.of('f47ac10b-58cc-4372-a567-0e02b2c3d479');
      // Act
      const result = upper.equals(lower);
      // Assert
      expect(result).toBe(true);
    });

    fcTest.prop([uuidV4AnyCase()])(
      'debería guardar en minúsculas cualquier uuid v4, lo escriba como lo escriba',
      (sample) => {
        // Arrange
        const { original, written } = sample;
        // Act
        const id = AlphaId.of(written);
        // Assert
        expect(id.value).toBe(original.toLowerCase());
      },
    );
  });

  describe('newUuid()', () => {
    // El oráculo es la forma del RFC 4122, no `isUuidV4`: comprobarlo con la misma regex que
    // usa la base sería probar la regex contra sí misma.
    fcTest.prop([fc.integer({ min: 1, max: 10 })])(
      'debería generar siempre un uuid v4 en minúsculas',
      (count) => {
        // Arrange
        const calls = Array.from({ length: count }, () => AlphaId);
        // Act
        const values = calls.map((idClass) => idClass.fresh());
        // Assert
        for (const value of values) {
          expect(value).toHaveLength(36);
          expect([value[8], value[13], value[18], value[23]]).toEqual(['-', '-', '-', '-']);
          expect(value[14]).toBe('4');
          expect(['8', '9', 'a', 'b']).toContain(value[19]);
          expect(value).toBe(value.toLowerCase());
        }
      },
    );
  });

  describe('marca', () => {
    // Garantía de tipos: SWC no comprueba tipos, así que el rojo de esta fila lo da
    // `pnpm typecheck` (TS2578 si la directiva deja de tener un error que esperar), no Jest.
    it('debería impedir en compilación usar un id de una marca donde se espera otra', () => {
      // Arrange
      const beta = BetaId.of(LOWERCASE_UUID);
      // Act
      // @ts-expect-error -- marca nominal: un BetaId no es un AlphaId
      const value = takesAlpha(beta);
      // Assert
      expect(value).toBe(LOWERCASE_UUID);
    });
  });
});

// Helpers
//
// Dobles de prueba y no ids reales de un módulo: el `from()` y el `generate()` de cada id
// pertenecen a su contexto, que lanza su propio error. `AlphaId` expone en estáticos públicos lo
// que la base deja protegido: `of()` construye sin validar (para probar la normalización),
// `accepts()` es `isUuidV4` y `fresh()` devuelve el string crudo de `newUuid()`, sin pasar por el
// constructor, cuyo `toLowerCase()` taparía un `newUuid()` en mayúsculas.

class AlphaId extends UuidIdentifier<'AlphaId'> {
  static of(value: string): AlphaId {
    return new AlphaId(value);
  }

  static accepts(value: string): boolean {
    return UuidIdentifier.isUuidV4(value);
  }

  static fresh(): string {
    return UuidIdentifier.newUuid();
  }
}

class BetaId extends UuidIdentifier<'BetaId'> {
  static of(value: string): BetaId {
    return new BetaId(value);
  }
}

function takesAlpha(id: AlphaId): string {
  return id.value;
}

function replaceAt(value: string, position: number, char: string): string {
  return `${value.slice(0, position)}${char}${value.slice(position + 1)}`;
}

/**
 * Arbitraria CONSTRUIDA: un uuid v4 de `fc.uuid` (sale en minúsculas) y una máscara que pone en
 * mayúsculas cada posición marcada. Devuelve el original y el escrito.
 */
function uuidV4AnyCase() {
  return fc
    .tuple(fc.uuid({ version: 4 }), fc.array(fc.boolean(), { minLength: 36, maxLength: 36 }))
    .map(([original, mask]) => ({
      original,
      written: [...original]
        .map((char, index) => (mask[index] ? char.toUpperCase() : char))
        .join(''),
    }));
}

/**
 * Arbitraria CONSTRUIDA: un uuid v4 con un carácter que no es hexadecimal en una de sus 32
 * posiciones hexadecimales (todas menos las de los guiones).
 */
function uuidV4WithNonHexChar() {
  const dashPositions = [8, 13, 18, 23];
  const hexPositions = Array.from({ length: 36 }, (_, index) => index).filter(
    (index) => !dashPositions.includes(index),
  );
  return fc
    .tuple(
      fc.uuid({ version: 4 }),
      fc.constantFrom(...hexPositions),
      fc.constantFrom('g', 'G', 'z', 'x', '-', ' ', '_'),
    )
    .map(([uuid, position, char]) => ({ altered: replaceAt(uuid, position, char) }));
}
