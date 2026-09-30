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
 * **Qué cubre y qué no.** Cada subcomando que escribe historia, mueve ramas o descarta trabajo va
 * en sus dos formas, `git <sub> *` y `git -C * <sub> *`. Medido con Claude Code 2.1.283 en un repo
 * desechable: quedan bloqueados `git commit`, `git -C <dir> commit` y `cd <dir> && git commit`
 * (los comandos compuestos se evalúan por partes), y `git status`, `git log`, `git merge-base` y
 * `git -C <dir> log` siguen permitidos. No es un sandbox: `bash -c "git commit"` o un script que
 * llame a git lo esquivan, y la norma sigue siendo la de `CLAUDE.md`.
 *
 * `matchesRule` reproduce la semántica documentada de las reglas `Bash(…)`: `*` casa con
 * cualquier texto, espacios incluidos, y un ` *` final casa también con el comando a secas
 * (`Bash(git stash *)` bloquea `git stash`, pero no `git stash-foo`). Es una aproximación para
 * razonar sobre la lista; la medición de arriba es la que manda.
 */

const SETTINGS_PATH = resolve(__dirname, '..', '..', '.claude', 'settings.json');

/** Un comando por subcomando que escribe historia, mueve `HEAD` o descarta trabajo. */
const MUTATING_COMMANDS = [
  'git add src/main.ts',
  'git commit -m "feat: x"',
  'git push origin HEAD',
  'git pull --rebase',
  'git tag v1.0.0',
  'git rebase main',
  'git merge --ff-only other',
  'git cherry-pick abc123',
  'git revert HEAD',
  'git am 0001.patch',
  'git stash',
  'git reset --hard HEAD',
  'git checkout -- src/main.ts',
  'git switch -c feature',
  'git restore src/main.ts',
  'git clean -fd',
];

/** Lo que los flujos y la revisión adversarial necesitan poder ejecutar. */
const READ_ONLY_COMMANDS = [
  'git status --porcelain',
  'git diff --stat main',
  'git log --oneline -5',
  'git show HEAD:README.md',
  'git merge-base HEAD main',
  'git rev-parse HEAD',
  'git ls-files --others --exclude-standard',
  'git branch --show-current',
  'git branch -a',
  'git -C /repo log --oneline -1',
  'git -C /repo diff --name-status main',
];

describe('.claude/settings.json', () => {
  describe('permissions.deny', () => {
    it('debería bloquear cada subcomando mutante de git', () => {
      // Arrange
      const deny = readDenyRules();

      // Act
      const allowed = MUTATING_COMMANDS.filter((command) => !isDenied(deny, command));

      // Assert
      expect(allowed).toEqual([]);
    });

    it('debería bloquear también los subcomandos mutantes lanzados con -C', () => {
      // Arrange
      const deny = readDenyRules();
      const withDirectory = MUTATING_COMMANDS.map((command) =>
        command.replace(/^git /, 'git -C /repo '),
      );

      // Act
      const allowed = withDirectory.filter((command) => !isDenied(deny, command));

      // Assert
      expect(allowed).toEqual([]);
    });

    it('debería bloquear borrar, renombrar o forzar una rama', () => {
      // Arrange
      const deny = readDenyRules();
      const rewrites = ['-d', '-D', '--delete', '-m', '-M', '--move', '-f', '--force'].map(
        (flag) => `git branch ${flag} feature`,
      );

      // Act
      const allowed = rewrites.filter((command) => !isDenied(deny, command));

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

const matchesRule = (rule: string, command: string): boolean => {
  const pattern = /^Bash\((.*)\)$/.exec(rule)?.[1];
  if (pattern === undefined) {
    return false;
  }
  const escape = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const body = pattern.endsWith(' *')
    ? `${escape(pattern.slice(0, -2)).replaceAll('*', '.*')}(?: .*)?`
    : escape(pattern).replaceAll('*', '.*');
  return new RegExp(`^${body}$`).test(command);
};
