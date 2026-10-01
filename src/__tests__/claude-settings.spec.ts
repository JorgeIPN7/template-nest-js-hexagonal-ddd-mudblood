import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Gate de `.claude/settings.json`: la política de git de `CLAUDE.md` («never commit on the
 * user's behalf») deja de depender de que cada agente la lea y la respete. Claude Code aplica los
 * `deny` a la sesión principal, a sus subagentes y a los agentes de un Workflow.
 *
 * **Por qué hace falta.** En el experimento de skills del 2026-09-30, un agente sin skills
 * intentó `git stash push/pop` en mitad de la tarea: `CLAUDE.md` no nombraba `stash`, y solo lo
 * paró el `deny` del arnés. Esta lista es ese arnés, versionado en el repo.
 *
 * **Qué cubre.** Cada subcomando que escribe historia, mueve `HEAD` o una ref, toca el índice o
 * descarta trabajo va en TRES formas: `git <sub> *`, `git * <sub> *` y `git * <sub>`. Las dos
 * últimas cubren cualquier opción global delante (`-C <dir>`, `-c k=v`, `--no-pager`,
 * `--git-dir=…`). La tercera hace falta por la semántica del arnés: el ` *` final solo es opcional
 * cuando es el ÚNICO comodín de la regla, así que `git * stash *` no ve `git -C <dir> stash` a
 * secas. Hasta el 2026-10-01 había dos formas, `git <sub> *` y `git -C * <sub> *`, y este spec
 * trataba el ` *` final como opcional siempre: daba por bloqueado justo lo que el arnés dejaba
 * pasar, y no veía nada que fuera entre `git` y el subcomando salvo `-C`.
 *
 * Medido con Claude Code 2.1.283 sobre un repo desechable, con la lista de hoy: quedan denegados
 * `git -C <dir> stash`, `git -c user.email=… -C <dir> commit …`, `git -C <dir> branch -q -D x`,
 * `git -C <dir> symbolic-ref …`, `git -C <dir> read-tree -u --reset HEAD` y `git -C <dir> mv a b`;
 * `git --no-pager -C <dir> log`, `git merge-base` y `git reflog` siguen permitidos. Los comandos
 * compuestos (`cd <dir> && git commit`) se evalúan por partes.
 *
 * **Lo que cuesta.** `git branch` y `git stash` quedan denegados enteros, también para leer
 * (`--show-current`, `list`: las alternativas son `git rev-parse --abbrev-ref HEAD` y
 * `git log -g refs/stash`), y una búsqueda cuyo término es un subcomando (`git log -S reset`) da
 * un falso positivo. **Lo que no cubre:** es una barandilla, no un sandbox, y solo ve comandos que
 * empiezan por `git`. La norma sigue siendo la de `CLAUDE.md`.
 */

const SETTINGS_PATH = resolve(__dirname, '..', '..', '.claude', 'settings.json');

/** Cada subcomando denegado, con unos argumentos de ejemplo. */
const MUTATING_COMMANDS: readonly (readonly [string, string])[] = [
  ['add', 'src/main.ts'],
  ['stage', 'src/main.ts'],
  ['apply', '--cached 0001.patch'],
  ['commit', '-m "feat: x"'],
  ['push', 'origin HEAD'],
  ['pull', '--rebase'],
  ['tag', 'v1.0.0'],
  ['rebase', 'main'],
  ['merge', '--ff-only other'],
  ['cherry-pick', 'abc123'],
  ['revert', 'HEAD'],
  ['am', '0001.patch'],
  ['branch', '-D feature'],
  ['update-ref', 'refs/heads/main HEAD~1'],
  ['symbolic-ref', 'HEAD refs/heads/other'],
  ['notes', 'add -m nota'],
  ['replace', 'abc123 def456'],
  ['bisect', 'start'],
  ['worktree', 'add ../wt'],
  ['stash', 'pop'],
  ['reset', '--hard HEAD'],
  ['checkout', '-- src/main.ts'],
  ['switch', '-c feature'],
  ['restore', 'src/main.ts'],
  ['clean', '-fd'],
  ['mv', 'src/a.ts src/b.ts'],
  ['rm', 'src/a.ts'],
  ['checkout-index', '-f -a'],
  ['read-tree', '-u --reset HEAD'],
  ['update-index', '--assume-unchanged src/main.ts'],
  ['filter-branch', '--tree-filter true'],
  ['gc', '--prune=now'],
  ['prune', '--expire=now'],
  ['reflog expire', '--expire=now --all'],
  ['reflog delete', 'HEAD@{0}'],
];

/** Lo que puede ir entre `git` y el subcomando sin cambiar lo que hace. */
const GLOBAL_OPTIONS = [
  '-C /repo',
  '-c user.email=a@b.c',
  '--no-pager',
  '--git-dir=/repo/.git',
  '-C /repo -c commit.gpgsign=false',
];

/** Lo que los flujos y la revisión adversarial necesitan poder ejecutar. */
const READ_ONLY_COMMANDS = [
  'git status --porcelain',
  'git diff --stat main',
  'git log --oneline -5',
  'git show HEAD:README.md',
  'git merge-base HEAD main',
  'git rev-parse HEAD',
  'git rev-parse --abbrev-ref HEAD',
  'git ls-files --others --exclude-standard',
  'git for-each-ref refs/heads',
  'git reflog -n 5',
  'git log -g refs/stash',
  'git grep -n useCase src',
  'git --no-pager log --oneline -3',
  'git -C /repo log --oneline -1',
  'git -C /repo diff --name-status main',
];

describe('.claude/settings.json', () => {
  describe('permissions.deny', () => {
    it('debería bloquear cada subcomando mutante de git, a secas y con argumentos', () => {
      // Arrange
      const deny = readDenyRules();
      const commands = MUTATING_COMMANDS.flatMap(([sub, args]) => [
        `git ${sub}`,
        `git ${sub} ${args}`,
      ]);

      // Act
      const allowed = commands.filter((command) => !isDenied(deny, command));

      // Assert
      expect(allowed).toEqual([]);
    });

    it('debería bloquear cada subcomando mutante tras cualquier opción global, a secas y con argumentos', () => {
      // Arrange
      const deny = readDenyRules();
      const commands = GLOBAL_OPTIONS.flatMap((options) =>
        MUTATING_COMMANDS.flatMap(([sub, args]) => [
          `git ${options} ${sub}`,
          `git ${options} ${sub} ${args}`,
        ]),
      );

      // Act
      const allowed = commands.filter((command) => !isDenied(deny, command));

      // Assert
      expect(allowed).toEqual([]);
    });

    it('debería bloquear git branch con sus banderas en cualquier posición', () => {
      // Arrange: las formas que pasaban cuando solo se denegaba la bandera pegada a `branch`.
      const deny = readDenyRules();
      const commands = [
        'git branch -q -D feature',
        'git branch -qD feature',
        'git branch feature -D',
        'git branch --del feature',
        'git branch -C feature main',
        'git -C /repo branch -D feature',
      ];

      // Act
      const allowed = commands.filter((command) => !isDenied(deny, command));

      // Assert
      expect(allowed).toEqual([]);
    });

    it('debería permitir los comandos de solo lectura que usan los flujos', () => {
      // Arrange
      const deny = readDenyRules();

      // Act
      const blocked = READ_ONLY_COMMANDS.filter((command) => isDenied(deny, command));

      // Assert
      expect(blocked).toEqual([]);
    });
  });

  // El modelo es la mitad del gate: si volviera a tratar el ` *` final como opcional siempre,
  // los tests de arriba darían por bloqueado lo que el arnés deja pasar.
  describe('el modelo de las reglas del arnés', () => {
    it('debería casar el comando a secas cuando el " *" final es el único comodín', () => {
      // Arrange

      // Act
      const matches = matchesRule('Bash(git stash *)', 'git stash');

      // Assert
      expect(matches).toBe(true);
    });

    it('debería exigir algo tras el " *" final cuando la regla tiene más de un comodín', () => {
      // Arrange

      // Act
      const matches = [
        matchesRule('Bash(git * stash *)', 'git -C /repo stash'),
        matchesRule('Bash(git * stash *)', 'git -C /repo stash pop'),
      ];

      // Assert
      expect(matches).toEqual([false, true]);
    });

    it('debería no casar un subcomando que solo empieza igual', () => {
      // Arrange

      // Act
      const matches = [
        matchesRule('Bash(git merge *)', 'git merge-base HEAD main'),
        matchesRule('Bash(git * merge)', 'git log --merges'),
      ];

      // Assert
      expect(matches).toEqual([false, false]);
    });
  });
});

// Helpers

const readDenyRules = (): string[] => {
  const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) as {
    permissions?: { deny?: string[] };
  };
  return settings.permissions?.deny ?? [];
};

const isDenied = (deny: readonly string[], command: string): boolean =>
  deny.some((rule) => matchesRule(rule, command));

/**
 * La semántica de una regla `Bash(…)` en Claude Code 2.1.283, medida y no supuesta: `*` casa con
 * cualquier texto, espacios incluidos, y un ` *` final casa también con el comando a secas SOLO
 * si es el único comodín de la regla.
 */
const matchesRule = (rule: string, command: string): boolean => {
  const pattern = /^Bash\((.*)\)$/.exec(rule)?.[1];
  if (pattern === undefined) {
    return false;
  }
  const escape = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const wildcards = pattern.split('*').length - 1;
  const body =
    pattern.endsWith(' *') && wildcards === 1
      ? `${escape(pattern.slice(0, -2))}(?: .*)?`
      : escape(pattern).replaceAll('*', '.*');
  return new RegExp(`^${body}$`).test(command);
};
