import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

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

  /**
   * Gate de la regla de `CLAUDE.md` («Auth»): cero claves foráneas en todo el esquema, porque los
   * contextos pueden dejar de compartir base de datos, y una FK entre tablas de dos contextos
   * impediría separarlos. Hasta ahora la regla solo estaba escrita.
   *
   * Busca dos cosas, en TODAS las migraciones y sin corte por fecha: `FOREIGN KEY` o `REFERENCES`,
   * como palabra completa y sin distinguir mayúsculas, en los literales de texto (una columna
   * `preferences` no cuenta, y un `FOREIGN` y un `KEY` partidos en dos líneas del mismo literal
   * sí), y los nombres de la API de esquema de TypeORM: `createForeignKey(s)`, `TableForeignKey` y
   * `foreignKeys`. Lo separa la API de TypeScript, no un filtro por líneas: un comentario de
   * TypeScript no es un nodo del árbol, así que no cuenta, y un comentario SQL dentro de la consulta
   * es parte del literal, así que cuenta y falla en cerrado. Mira todos los literales del archivo,
   * no solo el argumento de `queryRunner.query()`, para que un SQL guardado antes en una variable
   * también cuente.
   *
   * Límites conocidos: una FK escrita en trozos que no forman un literal entero no se detecta, y
   * tampoco un salto de línea escapado entre `FOREIGN` y `KEY` dentro de una cadena con comillas
   * simples.
   */
  describe('sin claves foráneas', () => {
    describe('el detector', () => {
      it('debería marcar FOREIGN KEY en un literal SQL', () => {
        // Arrange
        const source = migrationSource({
          up: [
            'await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_customer" FOREIGN KEY ("customer_id")`);',
          ],
          down: [],
        });

        // Act
        const matches = foreignKeysIn(source);

        // Assert
        expect(matches).toEqual(['fixture.ts:5 FOREIGN KEY']);
      });

      it.each([['REFERENCES'], ['references']])(
        'debería marcar %s sin distinguir mayúsculas',
        (word) => {
          // Arrange
          const source = migrationSource({
            up: [
              `await queryRunner.query(\`ALTER TABLE "orders" ADD "customer_id" uuid ${word} "users"\`);`,
            ],
            down: [],
          });

          // Act
          const matches = foreignKeysIn(source);

          // Assert
          expect(matches).toEqual([`fixture.ts:5 ${word}`]);
        },
      );

      it('debería marcar FOREIGN KEY aunque esté partido en dos líneas del literal', () => {
        // Arrange
        const source = migrationSource({
          up: [
            'await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_customer" FOREIGN',
            '  KEY ("customer_id")`);',
          ],
          down: [],
        });

        // Act
        const matches = foreignKeysIn(source);

        // Assert
        expect(matches).toEqual(['fixture.ts:5 FOREIGN KEY']);
      });

      it('debería no marcar una columna cuyo nombre contiene references, como preferences', () => {
        // Arrange
        const source = migrationSource({
          up: ['await queryRunner.query(`ALTER TABLE "users" ADD "preferences" jsonb`);'],
          down: [],
        });

        // Act
        const matches = foreignKeysIn(source);

        // Assert
        expect(matches).toEqual([]);
      });

      it.each([
        ['createForeignKey', "await queryRunner.createForeignKey('orders', foreignKey);"],
        ['createForeignKeys', "await queryRunner.createForeignKeys('orders', foreignKeyList);"],
        ['TableForeignKey', 'const foreignKey = new TableForeignKey(options);'],
        [
          'foreignKeys',
          "await queryRunner.createTable(new Table({ name: 'orders', foreignKeys: [] }));",
        ],
      ])('debería marcar %s de la API de esquema de TypeORM', (name, statement) => {
        // Arrange
        const source = migrationSource({ up: [statement], down: [] });

        // Act
        const matches = foreignKeysIn(source);

        // Assert
        expect(matches).toEqual([`fixture.ts:5 ${name}`]);
      });

      it('debería ignorar los comentarios de TypeScript aunque nombren una clave foránea', () => {
        // Arrange
        const source = migrationSource({
          up: [
            '// Sin FOREIGN KEY ni REFERENCES, ni createForeignKey: cero FKs.',
            '/* TableForeignKey, foreignKeys */',
            ALTER,
          ],
          down: [],
        });

        // Act
        const matches = foreignKeysIn(source);

        // Assert
        expect(matches).toEqual([]);
      });

      it('debería marcar un comentario SQL dentro del literal, porque falla en cerrado', () => {
        // Arrange
        const source = migrationSource({
          up: [
            'await queryRunner.query(`',
            '  -- REFERENCES "users" ("id")',
            '  ALTER TABLE "orders" ADD "status" character varying(20)',
            '`);',
          ],
          down: [],
        });

        // Act
        const matches = foreignKeysIn(source);

        // Assert
        expect(matches).toEqual(['fixture.ts:6 REFERENCES']);
      });
    });

    describe('el árbol', () => {
      // Sin nombrar ninguna migración: el README manda borrar las de un módulo de ejemplo al
      // quitarlo, y esta fila solo se pone roja si desaparecen todas.
      it('debería tener al menos una migración que revisar', () => {
        // Arrange

        // Act
        const files = migrationFiles();

        // Assert
        expect(files.length).toBeGreaterThan(0);
      });

      it('debería no declarar ninguna clave foránea en ninguna migración, sin corte por fecha', () => {
        // Arrange

        // Act
        const matches = foreignKeysInMigrations();

        // Assert
        expect(matches).toEqual([]);
      });
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

/** Sobre el texto crudo de cada trozo de literal: palabra completa y sin distinguir mayúsculas. */
const FOREIGN_KEY_PATTERNS: readonly RegExp[] = [/\bforeign\s+key\b/gi, /\breferences\b/gi];

/** Los nombres de la API de esquema de TypeORM que declaran una clave foránea. */
const FOREIGN_KEY_IDENTIFIERS: ReadonlySet<string> = new Set([
  'createForeignKey',
  'createForeignKeys',
  'TableForeignKey',
  'foreignKeys',
]);

/**
 * `archivo:línea coincidencia` por cada clave foránea de `source`, en orden de aparición. La
 * coincidencia conserva la capitalización y junta los espacios en uno (`FOREIGN KEY`). Mira los
 * trozos de literal (`StringLiteral` y los de una plantilla) y los identificadores; un comentario de
 * TypeScript nunca es un nodo, así que no cuenta.
 */
const foreignKeysIn = (source: string, file = 'fixture.ts'): string[] => {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const matches: { position: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isTemplateLiteralToken(node)) {
      const raw = node.getText(sourceFile);
      for (const pattern of FOREIGN_KEY_PATTERNS) {
        for (const match of raw.matchAll(pattern)) {
          matches.push({
            position: node.getStart(sourceFile) + match.index,
            text: match[0].replace(/\s+/g, ' '),
          });
        }
      }
    } else if (ts.isIdentifier(node) && FOREIGN_KEY_IDENTIFIERS.has(node.text)) {
      matches.push({ position: node.getStart(sourceFile), text: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches
    .sort((a, b) => a.position - b.position)
    .map(
      ({ position, text }) =>
        `${file}:${sourceFile.getLineAndCharacterOfPosition(position).line + 1} ${text}`,
    );
};

/** Todas las migraciones, sin corte por fecha. */
const migrationFiles = (): string[] =>
  readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.ts'));

const foreignKeysInMigrations = (): string[] =>
  migrationFiles().flatMap((file) =>
    foreignKeysIn(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'), file),
  );

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
