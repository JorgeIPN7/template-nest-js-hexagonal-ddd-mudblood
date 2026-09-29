// src/__tests__/renovate.spec.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

const readJson = <T>(relative: string): T =>
  JSON.parse(readFileSync(path.join(ROOT, relative), 'utf-8')) as T;

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type PackageRule = {
  groupName?: string;
  matchPackageNames?: string[];
  matchUpdateTypes?: string[];
  [option: string]: unknown;
};

const renovate = readJson<{ packageRules: PackageRule[] }>('renovate.json');
const manifest = readJson<Manifest>('package.json');

const NEST_GROUP = 'ecosistema NestJS';
const NEST_CORE = ['@nestjs/common', '@nestjs/core'];

/**
 * Criterio de pertenencia al grupo: toda dependencia directa que sea `@nestjs/*` o cuyo
 * `package.json` INSTALADO declare `peerDependencies` sobre el core. Se lee del árbol y no de
 * una lista escrita a mano, porque la lista es justo lo que se queda vieja: una dependencia
 * acoplada a Nest que llegue mañana entra en la cuenta sola y pone este spec en rojo hasta que
 * la regla la cubra.
 */
const isCoupledToNest = (name: string): boolean => {
  if (name.startsWith('@nestjs/')) {
    return true;
  }
  const installed = readJson<Manifest>(path.join('node_modules', name, 'package.json'));
  return NEST_CORE.some((core) => core in (installed.peerDependencies ?? {}));
};

const coupledToNest = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
].filter(isCoupledToNest);

/**
 * Réplica de `matchRegexOrGlob` (renovate `lib/util/string-match.ts`): `/…/` o `/…/i` es una
 * regex; cualquier otra cosa, un glob de minimatch con `nocase: true`. `path.posix.matchesGlob`
 * usa el mismo minimatch, que Node lleva vendorizado; la diferencia de mayúsculas se iguala
 * pasando las dos cadenas a minúsculas, y la de `dot` no aplica porque ningún nombre de paquete
 * npm empieza por punto. `!` niega, en las dos formas.
 */
const matchesPattern = (input: string, pattern: string): boolean => {
  if (pattern === '*') {
    return true;
  }
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const regex = /^\/(.*)\/(i?)$/s.exec(body);
  const hit =
    regex === null
      ? path.posix.matchesGlob(input.toLowerCase(), body.toLowerCase())
      : new RegExp(regex[1] ?? '', regex[2]).test(input);
  return negated ? !hit : hit;
};

/** `matchRegexOrGlobList`: si hay positivos, casa alguno; si hay negativos, no casa ninguno. */
const matchesPatternList = (input: string, patterns: string[]): boolean => {
  const positive = patterns.filter((pattern) => !pattern.startsWith('!'));
  const negative = patterns.filter((pattern) => pattern.startsWith('!'));
  return (
    patterns.length > 0 &&
    (positive.length === 0 || positive.some((pattern) => matchesPattern(input, pattern))) &&
    negative.every((pattern) => matchesPattern(input, pattern))
  );
};

const nestGroupRules = renovate.packageRules.filter((rule) => rule.groupName === NEST_GROUP);

/**
 * Contrato del grupo de majors del ecosistema NestJS (backlog #27). El preset de monorepo que
 * trae `config:recommended` agrupa por repositorio de origen, y su lista para `nest` no incluye
 * `@nestjs/jwt`, `swagger`, `typeorm` ni `throttler`, ni a `nestjs-pino` o `nestjs-cls`. Con
 * Nest 12 eso fueron cuatro PR en rojo, cada una por su lado (#40, #41, #43, #44):
 * `@nestjs/swagger@12` exige el core 12 por peer estricto, y jwt y typeorm, ya ESM, pedían el
 * mismo cambio de toolchain que el core. La migración acabó entrando de una vez.
 *
 * `renovate.json` no tiene otro gate: el JSON Schema oficial acepta claves desconocidas, así que
 * un `matchPackageName` mal escrito dejaría la regla inerte y en verde. Este spec lee las claves
 * por su nombre exacto.
 */
describe('renovate.json', () => {
  describe('grupo de majors del ecosistema NestJS', () => {
    describe('el criterio de acoplamiento', () => {
      it('debería detectar por peerDependencies una dependencia sin el scope @nestjs', () => {
        // Arrange — `nestjs-pino` declara peers sobre `@nestjs/common` y `@nestjs/core`.
        const name = 'nestjs-pino';

        // Act
        const coupled = isCoupledToNest(name);

        // Assert
        expect(coupled).toBe(true);
      });

      it('debería dejar fuera un paquete que solo lleva nestjs en el nombre', () => {
        // Arrange — el adaptador de Scalar no declara peers ni importa `@nestjs/*`: es un
        // middleware de Express, y su major no arrastra al core.
        const name = '@scalar/nestjs-api-reference';

        // Act
        const coupled = isCoupledToNest(name);

        // Assert
        expect(coupled).toBe(false);
      });
    });

    it('debería declarar una sola regla con ese grupo, acotada a major y solo por nombre', () => {
      // Arrange — cualquier otro `match*` (depType, manager, archivo…) estrecharía la regla en
      // silencio: una devDependency como `@nestjs/cli` podría quedarse fuera sin que este spec
      // lo viera.
      const allowedMatchers = ['matchPackageNames', 'matchUpdateTypes'];

      // Act
      const matchers = nestGroupRules.map((rule) =>
        Object.keys(rule)
          .filter((option) => option.startsWith('match'))
          .sort(),
      );

      // Assert
      expect(matchers).toEqual([allowedMatchers]);
      expect(nestGroupRules[0]?.matchUpdateTypes).toEqual(['major']);
    });

    // En Renovate las `packageRules` posteriores pisan a las anteriores: una regla con otro
    // `groupName` colocada detrás —p.ej. una que agrupe todas las devDependencies— sacaría del
    // grupo a `@nestjs/cli` o `@nestjs/testing` sin que el caso de abajo lo notara, porque ese
    // solo mira la regla del grupo. Se exige la posición, que es más estricto que evaluar el
    // solapamiento y no depende de replicar todos los `match*` de Renovate.
    it('debería ser la última regla que fija un groupName, para que ninguna posterior la pise', () => {
      // Arrange
      const withGroup = renovate.packageRules
        .map((rule, index) => ({ groupName: rule.groupName, index }))
        .filter((rule) => rule.groupName !== undefined);

      // Act
      const last = withGroup.at(-1);

      // Assert
      expect(last?.groupName).toBe(NEST_GROUP);
    });

    it.each(coupledToNest)('debería meter el major de %s en ese grupo', (name) => {
      // Arrange
      const rules = nestGroupRules.filter((rule) => rule.matchUpdateTypes?.includes('major'));

      // Act
      const covering = rules.filter((rule) =>
        matchesPatternList(name, rule.matchPackageNames ?? []),
      );

      // Assert
      expect(covering).toHaveLength(1);
    });
  });
});
