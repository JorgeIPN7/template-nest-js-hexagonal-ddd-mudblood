import { PASSWORD_LENGTH, hasValidPasswordLength } from '../password-policy';

describe('password-policy', () => {
  describe('PASSWORD_LENGTH', () => {
    // Fija la decisión de B1 (2026-10-01): subir el mínimo pasa a romper un test, porque antes
    // hay que quitárselo al login — ver el comentario de cabecera de `password-policy.ts`.
    it('debería fijar la contraseña entre 12 y 128 caracteres', () => {
      // Arrange

      // Act
      const limits = { ...PASSWORD_LENGTH };

      // Assert
      expect(limits).toEqual({ min: 12, max: 128 });
    });
  });

  // Las fronteras van en literales y no como `PASSWORD_LENGTH.min - 1`: el caso de arriba ya
  // fija 12 y 128, y derivarlas de la constante hacía que el stub (0/0) fallara en el Arrange
  // con un `RangeError` de `repeat(-1)` en vez de hacerlo en la aserción.
  describe('hasValidPasswordLength()', () => {
    it('debería aceptar una contraseña de exactamente el mínimo y otra de exactamente el máximo', () => {
      // Arrange
      const shortest = 'a'.repeat(12);
      const longest = 'a'.repeat(128);

      // Act
      const accepted = [hasValidPasswordLength(shortest), hasValidPasswordLength(longest)];

      // Assert
      expect(accepted).toEqual([true, true]);
    });

    it('debería rechazar una contraseña de un carácter menos que el mínimo y otra de uno más que el máximo', () => {
      // Arrange
      const tooShort = 'a'.repeat(11);
      const tooLong = 'a'.repeat(129);

      // Act
      const accepted = [hasValidPasswordLength(tooShort), hasValidPasswordLength(tooLong)];

      // Assert
      expect(accepted).toEqual([false, false]);
    });

    // '❤️' es U+2764 seguido del selector de variación U+FE0F: dos puntos de código, y
    // class-validator cuenta uno. Zod, que cuenta puntos de código, ve doce y lo dejaría pasar.
    it('debería rechazar seis emojis con selector de variación aunque sumen doce puntos de código', () => {
      // Arrange
      const sixHearts = '\u2764\uFE0F'.repeat(6);

      // Act
      const accepted = hasValidPasswordLength(sixHearts);

      // Assert
      expect(accepted).toBe(false);
    });
  });
});
