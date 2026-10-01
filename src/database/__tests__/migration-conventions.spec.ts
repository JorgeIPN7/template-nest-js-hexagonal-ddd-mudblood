import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

/**
 * La primera migración escrita con la regla. Las anteriores ya corrieron en todos los entornos
 * que existen: retocarlas no cambiaría nada donde importa, y solo una base vacía las ejecuta hoy.
 */
const FIRST_WITH_LOCK_TIMEOUT = 1_790_796_856_575;

const LOCK_TIMEOUT_STATEMENT = /^await queryRunner\.query\(`SET LOCAL lock_timeout = '\d+s'`\);/;

/**
 * Gate de la regla de `CLAUDE.md` («Destructive migrations»): cada `up()` y cada `down()` empiezan
 * con `SET LOCAL lock_timeout`. Un `ALTER TABLE` pide `ACCESS EXCLUSIVE`; sin límite, con
 * `DB_MIGRATIONS_RUN=true` espera indefinidamente detrás de cualquier sesión que tenga la tabla,
 * el pod nuevo no arranca y todo el tráfico de esa tabla se encola detrás. `migration:generate`
 * no la escribe, así que sin este gate la regla dependería de acordarse.
 *
 * El bloque «detector» es control positivo Y negativo: un gate que solo mira el árbol pasaría
 * igual de verde si el detector no detectara nada.
 */
describe('src/database/migrations', () => {
  describe('el detector', () => {
    it('debería aceptar una migración cuyo up y down empiezan acotando la espera', () => {
      // Arrange
      const source = migrationSource({
        up: ["await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);", ALTER],
        down: [
          '// ⚠️ Destructivo: el comentario de delante no es una sentencia.',
          "await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);",
          DROP,
        ],
      });

      // Act
      const violations = methodsWithoutLockTimeout(source);

      // Assert
      expect(violations).toEqual([]);
    });

    it('debería marcar el up cuya primera sentencia es el ALTER', () => {
      // Arrange: la acotación existe, pero después del ALTER ya no protege nada.
      const source = migrationSource({
        up: [ALTER, "await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);"],
        down: ["await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);", DROP],
      });

      // Act
      const violations = methodsWithoutLockTimeout(source);

      // Assert
      expect(violations).toEqual(['up']);
    });

    it('debería marcar el down que no acota la espera', () => {
      // Arrange: es la mitad que se olvida, y también pide `ACCESS EXCLUSIVE`.
      const source = migrationSource({
        up: ["await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);", ALTER],
        down: [DROP],
      });

      // Act
      const violations = methodsWithoutLockTimeout(source);

      // Assert
      expect(violations).toEqual(['down']);
    });
  });

  describe('el árbol', () => {
    it('debería tener al menos una migración sujeta a la regla', () => {
      // Arrange

      // Act
      const files = migrationsUnderTheRule();

      // Assert: si el corte dejara fuera todas, el test de abajo pasaría sin mirar nada.
      expect(files).toContain('1790796856575-add-cancellation-to-orders.ts');
    });

    it('debería acotar la espera de bloqueos en cada migración desde la de la cancelación', () => {
      // Arrange

      // Act
      const violations = migrationsBreakingTheRule();

      // Assert
      expect(violations).toEqual([]);
    });
  });
});

// Helpers

/**
 * Los métodos (`up`, `down`) cuya PRIMERA sentencia no acota la espera de bloqueos. Las líneas de
 * comentario de delante no cuentan como sentencia.
 */
const methodsWithoutLockTimeout = (source: string): string[] =>
  (['up', 'down'] as const).filter((method) => {
    const header = new RegExp(`async ${method}\\(queryRunner: QueryRunner\\): Promise<void> \\{`);
    const match = header.exec(source);
    if (!match) {
      return true;
    }
    const firstStatement = source
      .slice(match.index + match[0].length)
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '' && !line.startsWith('//'));
    return !LOCK_TIMEOUT_STATEMENT.test(firstStatement ?? '');
  });

/** `<archivo>: <método>`, que es lo que se quiere leer cuando el gate se pone rojo. */
const migrationsBreakingTheRule = (): string[] =>
  migrationsUnderTheRule().flatMap((file) =>
    methodsWithoutLockTimeout(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')).map(
      (method) => `${file}: ${method}()`,
    ),
  );

const migrationsUnderTheRule = (): string[] =>
  readdirSync(MIGRATIONS_DIR).filter((file) => {
    const timestamp = Number(/^(\d+)-/.exec(file)?.[1]);
    return timestamp >= FIRST_WITH_LOCK_TIMEOUT;
  });

const ALTER = 'await queryRunner.query(`ALTER TABLE "orders" ADD "status" character varying(20)`);';
const DROP = 'await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);';

const migrationSource = ({ up, down }: { up: string[]; down: string[] }): string =>
  [
    "import type { MigrationInterface, QueryRunner } from 'typeorm';",
    '',
    'export class Fixture1790796856576 implements MigrationInterface {',
    '  public async up(queryRunner: QueryRunner): Promise<void> {',
    ...up.map((line) => `    ${line}`),
    '  }',
    '',
    '  public async down(queryRunner: QueryRunner): Promise<void> {',
    ...down.map((line) => `    ${line}`),
    '  }',
    '}',
  ].join('\n');
