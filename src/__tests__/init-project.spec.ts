import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Gate del manifiesto de `scripts/init-project.mjs`.
 *
 * El script renombra el template a partir de una lista fija de archivos. Esa lista es lo único
 * que puede pudrirse: el día que alguien escriba `nest_base_template` en un archivo nuevo, el
 * script seguirá diciendo «hecho» y dejará una marca del template dentro del proyecto derivado
 * —normalmente un nombre de base de datos, que es de los restos que más tardan en dar la cara.
 *
 * Por eso este spec recorre el repositorio de verdad, igual que `eslint-boundaries.spec.ts`
 * ejercita la configuración real: busca los tokens y exige que TODO archivo que los contenga
 * esté declarado en el manifiesto, en una de sus tres listas.
 */

const REPO_ROOT = resolve(__dirname, '..', '..');

/**
 * Los tokens que delatan al template. Este archivo está en `exempt` precisamente porque los
 * necesita literales; si no, se encontraría a sí mismo.
 */
const TEMPLATE_TOKENS = [
  'nest_base_template',
  'nest-base-template',
  'template-nest-js-hexagonal-ddd-mudblood',
  'Nest Base Template',
];

/**
 * Los metadatos de git se excluyen por NOMBRE, sea directorio o archivo. En un clon, `.git` es
 * un directorio; en un `git worktree` es un ARCHIVO de una línea, `gitdir: <clon>/.git/worktrees/…`,
 * y esa ruta lleva el nombre de la carpeta del clon —uno de los tokens, si se clonó con el nombre
 * por defecto—. Excluirlo solo como directorio ponía el gate rojo en cualquier worktree.
 *
 * Un `.git` dentro de un SUBdirectorio marca además otro checkout (un worktree de
 * `.claude/worktrees/`, un clon anidado), y `collectRepositoryFiles` no desciende a él. Sin esa
 * poda, mientras exista un worktree de Claude Code dentro del repo, el gate del checkout
 * principal ve una copia entera del proyecto sin declarar. La regla es más amplia que la de git
 * —git solo se detiene ante un repo válido sin rastrear; aquí basta cualquier entrada `.git`—,
 * pero como git no versiona rutas llamadas `.git`, en un clon limpio nunca poda contenido
 * versionado: lo peor que puede hacer es ocultar en local algo que tampoco estaría en la CI.
 */
const GIT_METADATA = '.git';

/** Directorios que nunca contienen fuente versionada: artefactos, dependencias o caches. */
const SKIPPED_DIRECTORIES = new Set([
  '.stryker-tmp',
  '.swc',
  '.temp',
  '.tmp',
  '_', // .husky/_ — internals que instala Husky
  'build',
  'coverage',
  'coverage-e2e',
  'dist',
  'logs',
  'node_modules',
  'public', // bundle de Scalar, generado
  'reports',
]);

/** Archivos grandes o binarios que no aportan y sí ralentizan. */
const MAX_BYTES = 5_000_000;

type Manifest = {
  replace: string[];
  optional: string[];
  handled: Record<string, string>;
  exempt: Record<string, string>;
};

describe('scripts/init-project.targets.json', () => {
  it('debería declarar todos los archivos del repositorio que contienen marcas del template', () => {
    // Arrange
    const declared = new Set(declaredPaths(readManifest()));
    const files = collectRepositoryFiles(REPO_ROOT);

    // Act
    const withTokens = files.filter((relativePath) => containsTemplateToken(relativePath));
    const undeclared = withTokens.filter((relativePath) => !declared.has(relativePath));

    // Assert
    expect(undeclared).toEqual([]);
  });

  it('debería listar en "replace" solo rutas que existen', () => {
    // Arrange
    const paths = readManifest().replace;

    // Act
    const missing = paths.filter((relativePath) => !existsSync(join(REPO_ROOT, relativePath)));

    // Assert
    expect(missing).toEqual([]);
  });

  it('debería listar en "handled" y "exempt" solo rutas que existen', () => {
    // Arrange
    const manifest = readManifest();
    const paths = [...Object.keys(manifest.handled), ...Object.keys(manifest.exempt)];

    // Act
    const missing = paths.filter((relativePath) => !existsSync(join(REPO_ROOT, relativePath)));

    // Assert
    expect(missing).toEqual([]);
  });

  it('debería mantener las tres listas sin solapamiento', () => {
    // Arrange
    const paths = declaredPaths(readManifest());

    // Act
    const duplicated = paths.filter((path, index) => paths.indexOf(path) !== index);

    // Assert
    expect(duplicated).toEqual([]);
  });
});

/**
 * El recorrido del gate, probado sobre un árbol temporal. El gate de arriba solo ve el `.git`
 * del checkout en el que corre, y la CI hace un clon normal (directorio): sin este bloque, ni la
 * forma de ARCHIVO que tiene `.git` en un `git worktree` ni un checkout anidado dentro del repo
 * los ejercitaría ninguna ejecución.
 */
describe('collectRepositoryFiles', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'init-project-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('debería ignorar el archivo .git de un worktree aunque su gitdir contenga el nombre del repositorio', () => {
    // Arrange — el contenido literal que `git worktree add` escribe en `.git`.
    writeTree(root, {
      '.git': 'gitdir: /home/dev/template-nest-js-hexagonal-ddd-mudblood/.git/worktrees/wt\n',
      'README.md': '# proyecto\n',
    });

    // Act
    const files = collectRepositoryFiles(root);

    // Assert
    expect(files.sort()).toEqual(['README.md']);
  });

  // No nace en rojo: es la guarda de la otra mitad del arreglo. Si `.git` sale de
  // SKIPPED_DIRECTORIES sin la exclusión por nombre, o si se quita la condición `prefix !== ''`
  // de la poda de checkouts anidados, este caso cae y el gate de arriba pasaría en vacío.
  it('debería ignorar el directorio .git de un clon normal', () => {
    // Arrange — en un clon, la URL del remoto lleva el nombre del repositorio.
    writeTree(root, {
      '.git/config':
        '[remote "origin"]\n\turl = https://github.com/JorgeIPN7/template-nest-js-hexagonal-ddd-mudblood.git\n',
      'src/main.ts': 'export {};\n',
    });

    // Act
    const files = collectRepositoryFiles(root);

    // Assert
    expect(files.sort()).toEqual(['src/main.ts']);
  });

  it('debería saltarse un checkout anidado, como los worktrees de .claude/worktrees', () => {
    // Arrange — Claude Code crea sus worktrees DENTRO del repo, en `.claude/worktrees/<nombre>/`,
    // y `.gitignore` no los excluye. `.claude/settings.json` demuestra que la poda es por checkout
    // anidado, no por carpeta `.claude`.
    writeTree(root, {
      '.claude/settings.json': '{}\n',
      '.claude/worktrees/agent-x/.git': 'gitdir: /elsewhere/.git/worktrees/agent-x\n',
      '.claude/worktrees/agent-x/README.md': '# copia del repo\n',
      'README.md': '# proyecto\n',
    });

    // Act
    const files = collectRepositoryFiles(root);

    // Assert
    expect(files.sort()).toEqual(['.claude/settings.json', 'README.md']);
  });

  it('debería saltarse un clon anidado cuyo .git es un directorio', () => {
    // Arrange — la otra forma de checkout anidado: un `git clone` dentro de una subcarpeta.
    writeTree(root, {
      'vendor/lib/.git/HEAD': 'ref: refs/heads/main\n',
      'vendor/lib/README.md': '# clon anidado\n',
      'README.md': '# proyecto\n',
    });

    // Act
    const files = collectRepositoryFiles(root);

    // Assert
    expect(files.sort()).toEqual(['README.md']);
  });
});

// Helpers

/** Crea `files` bajo `root`; las claves son rutas relativas con `/`. */
const writeTree = (root: string, files: Record<string, string>): void => {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
};

const declaredPaths = (manifest: Manifest): string[] => [
  ...manifest.replace,
  ...Object.keys(manifest.handled),
  ...Object.keys(manifest.exempt),
];

const readManifest = (): Manifest =>
  JSON.parse(
    readFileSync(join(REPO_ROOT, 'scripts', 'init-project.targets.json'), 'utf-8'),
  ) as Manifest;

/**
 * Los `.env` reales no se versionan y sí contienen el nombre de la base: incluirlos haría que
 * el gate fallara en la máquina de quien tiene el proyecto en marcha, y en ninguna otra.
 */
const isVersioned = (fileName: string): boolean =>
  !fileName.startsWith('.env') || fileName === '.env.example';

const collectRepositoryFiles = (directory: string, prefix = ''): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  // Un subdirectorio con su propio `.git` —archivo o directorio— es OTRO checkout: sus archivos
  // no son de este repositorio. La raíz (`prefix === ''`) sí lo tiene y sí se recorre.
  if (prefix !== '' && entries.some((entry) => entry.name === GIT_METADATA)) {
    return [];
  }
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === GIT_METADATA) {
      continue;
    }
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(
          ...collectRepositoryFiles(join(directory, entry.name), `${prefix}${entry.name}/`),
        );
      }
      continue;
    }
    if (!entry.isFile() || !isVersioned(entry.name)) {
      continue;
    }
    if (statSync(join(directory, entry.name)).size > MAX_BYTES) {
      continue;
    }
    files.push(`${prefix}${entry.name}`);
  }

  return files;
};

const containsTemplateToken = (relativePath: string): boolean => {
  const content = readFileSync(join(REPO_ROOT, relativePath), 'utf-8');
  return TEMPLATE_TOKENS.some((token) => content.includes(token));
};
