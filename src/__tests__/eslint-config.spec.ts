import { ESLint, type Linter } from 'eslint';

/**
 * Spec de `eslint.config.mjs` — hoy, de su `no-restricted-imports` contra las subrutas de
 * `@nestjs/*` que el mapa `exports` de Nest 12 deja resolubles: el comodín `./*` (y `./*.js`)
 * abre cualquier archivo del paquete, y `./internal` reexporta lo que no es API pública. El
 * porqué completo está en el comentario de la regla.
 *
 * Ejercita la config REAL, no una copia: `calculateConfigForFile` carga `eslint.config.mjs`
 * igual que lo hace `pnpm lint:check` y devuelve la regla ya resuelta para un archivo concreto,
 * con el merge por clave de flat config aplicado. Una copia de las opciones pegada aquí seguiría
 * en verde el día que alguien afloje la regla.
 *
 * Lo que sí se aísla es la ejecución: cada fragmento se lintea SOLO con esa regla resuelta y con
 * el parser de la config, reutilizado sin sus `parserOptions` (`projectService`,
 * `tsconfigRootDir`); el resto de la config se descarta. No es por necesidad: con la config
 * completa `lintText` también funciona sobre `SUBJECT`, porque existe en el proyecto (solo una
 * ruta que el `projectService` no conoce da `Parsing error`). Es por limpieza y coste, ambos
 * medidos: sobre un fragmento de una línea la config completa añade mensajes de otras reglas
 * (`@typescript-eslint/no-unused-vars`) que cada caso tendría que filtrar, y el primer lint paga
 * ~1,3 s de arranque del `projectService` frente a ~1 ms de la regla aislada.
 */
describe('eslint.config', () => {
  describe('no-restricted-imports: solo la raíz de un paquete @nestjs es API', () => {
    it('debería rechazar `@nestjs/common/constants`, el import profundo que se retiró', async () => {
      // Arrange
      const code = "import { SSE_METADATA } from '@nestjs/common/constants';";
      // Act
      const messages = await lintRestrictedImports(code);
      // Assert
      expect(ruleIds(messages)).toEqual(['no-restricted-imports']);
    });

    it('debería rechazar `@nestjs/common/constants.js`, la misma subruta por la clave `./*.js`', async () => {
      // Arrange
      const code = "import { SSE_METADATA } from '@nestjs/common/constants.js';";
      // Act
      const messages = await lintRestrictedImports(code);
      // Assert
      expect(ruleIds(messages)).toEqual(['no-restricted-imports']);
    });

    it('debería rechazar `@nestjs/common/internal`, que reexporta `constants.js` sin ser API pública', async () => {
      // Arrange
      const code = "import { SSE_METADATA } from '@nestjs/common/internal';";
      // Act
      const messages = await lintRestrictedImports(code);
      // Assert
      expect(ruleIds(messages)).toEqual(['no-restricted-imports']);
    });

    it('debería rechazar un `import type` de una subruta, que también se rompe si el comodín se cierra', async () => {
      // Arrange
      const code =
        "import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';";
      // Act
      const messages = await lintRestrictedImports(code);
      // Assert
      expect(ruleIds(messages)).toEqual(['no-restricted-imports']);
    });

    it('debería aceptar la raíz de `@nestjs/common`', async () => {
      // Arrange
      const code = "import { Injectable, type NestApplicationOptions } from '@nestjs/common';";
      // Act
      const messages = await lintRestrictedImports(code);
      // Assert
      expect(messages).toHaveLength(0);
    });

    it('debería aceptar la raíz de otro paquete, `@nestjs/config`', async () => {
      // Arrange
      const code = "import { ConfigService } from '@nestjs/config';";
      // Act
      const messages = await lintRestrictedImports(code);
      // Assert
      expect(messages).toHaveLength(0);
    });

    it('debería llevar en el mensaje a `src/common/nest-metadata.constants.ts`', async () => {
      // Arrange
      const code = "import { SSE_METADATA } from '@nestjs/common/constants';";
      // Act
      const messages = await lintRestrictedImports(code);
      // Assert
      expect(messages[0]?.message).toContain('src/common/nest-metadata.constants.ts');
    });

    // El merge de flat config es por clave de regla: un bloque posterior que declarase su propio
    // `no-restricted-imports` para un glob REEMPLAZARÍA estas opciones en esos archivos, y la
    // prohibición desaparecería allí sin que ningún caso de arriba —todos sobre `SUBJECT`— lo
    // notara. Este caso fija que la regla resuelta es la misma en cada capa y en los tests.
    it('debería resolver la misma regla en todas las capas, en los tests y fuera de los módulos', async () => {
      // Arrange
      const reference = await resolvedRule(SUBJECT);
      // Act
      const perFile = await Promise.all(LAYER_SAMPLES.map((filePath) => resolvedRule(filePath)));
      // Assert
      for (const rule of perFile) {
        expect(rule).toEqual(reference);
      }
    });
  });
});

// Helpers

/** El único archivo de `src/` que importaba una subruta de `@nestjs` (`CorsOptions`) hasta 2026-09-28. */
const SUBJECT = 'src/config/cors.config.ts';

/** Archivos reales de cada zona con bloques propios en `eslint.config.mjs` o `eslint.boundaries.js`. */
const LAYER_SAMPLES = [
  'src/main.ts',
  'src/common/nest-metadata.constants.ts',
  'src/modules/users/domain/entities/user.entity.ts',
  'src/modules/users/application/users.facade.ts',
  'src/modules/users/infrastructure/http/users.controller.ts',
  'src/modules/users/users.module.ts',
  'src/database/seeds/seed-admin.ts',
  'src/database/outbox/relay-orders-outbox.ts',
  'src/database/migrations/1785165436853-create-users-table.ts',
  'src/bootstrap/openapi.ts',
  'src/__tests__/eslint-config.spec.ts',
  'src/modules/users/__tests__/application/users.facade.spec.ts',
  'src/modules/users/__tests__/users.e2e-spec.ts',
  'test/helpers/create-test-app.ts',
];

const realConfig = new ESLint({ cwd: process.cwd() });

const resolvedRule = async (filePath: string): Promise<Linter.RuleEntry | undefined> => {
  const config = (await realConfig.calculateConfigForFile(filePath)) as Linter.Config | undefined;
  return config?.rules?.['no-restricted-imports'];
};

let isolated: Promise<ESLint> | undefined;

/** Un ESLint con SOLO la regla real resuelta para `SUBJECT` y el parser de la config, sin sus `parserOptions`. */
const isolatedRule = (): Promise<ESLint> =>
  (isolated ??= (async () => {
    const config = (await realConfig.calculateConfigForFile(SUBJECT)) as Linter.Config | undefined;
    const rule = config?.rules?.['no-restricted-imports'];
    if (rule === undefined) {
      throw new Error(`eslint.config.mjs ya no declara no-restricted-imports para ${SUBJECT}`);
    }
    return new ESLint({
      cwd: process.cwd(),
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: config?.languageOptions?.parser },
          rules: { 'no-restricted-imports': rule },
        },
      ],
    });
  })());

const lintRestrictedImports = async (code: string): Promise<Linter.LintMessage[]> => {
  const eslint = await isolatedRule();
  const [result] = await eslint.lintText(code, { filePath: SUBJECT });
  return result?.messages ?? [];
};

const ruleIds = (messages: Linter.LintMessage[]): (string | null)[] =>
  messages.map((m) => m.ruleId);
