import { maxLength, minLength } from 'class-validator';

/**
 * Longitud de la contraseña: una sola fuente para los DTO de `auth` (`@MinLength`,
 * `@MaxLength`, `@ApiProperty` y el ejemplo del 400 del login) y para `ADMIN_PASSWORD` en
 * `env.schema.ts`. Así el seed del primer admin no puede crear una contraseña que el login
 * rechace (backlog #34).
 *
 * Este archivo solo importa class-validator, y tiene que seguir así: `auth.config.ts` importa
 * `env.schema.ts`, así que si la constante viviera allí el ciclo de imports revienta al cargar
 * el seed (medido con SWC y con tsc).
 *
 * Dos avisos antes de tocar los números:
 *
 * - **Subir el mínimo exige antes quitárselo al login.** No hay endpoint para cambiar la
 *   contraseña, así que una cuenta creada con 12 caracteres recibiría 400 en cada login, para
 *   siempre. Primero el login deja de exigirlo; después sube el alta.
 * - **class-validator no cuenta un selector de variación** (U+FE0E, U+FE0F) detrás de otro
 *   carácter, y cuenta un par sustituto como un carácter: `'❤️'.repeat(6)` mide 6, no 12. NIST
 *   SP 800-63B pide contar cada punto de código. Es una desviación consciente, y se decide en
 *   backlog #35.
 */
export const PASSWORD_LENGTH = { min: 12, max: 128 } as const;

/**
 * Lo mismo que aplican `@MinLength(PASSWORD_LENGTH.min)` y `@MaxLength(PASSWORD_LENGTH.max)`,
 * con las mismas funciones de class-validator: la equivalencia sale de usar el mismo
 * validador, no de imitar su forma de contar.
 */
export function hasValidPasswordLength(value: string): boolean {
  return minLength(value, PASSWORD_LENGTH.min) && maxLength(value, PASSWORD_LENGTH.max);
}
