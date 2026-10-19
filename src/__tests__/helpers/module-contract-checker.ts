// src/__tests__/helpers/module-contract-checker.ts
import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { collectTsFiles } from './language-scanner';

export type ContractKey =
  | 'structure'
  | 'errors'
  | 'filter'
  | 'controller-filter'
  | 'entities'
  | 'value-objects'
  | 'use-cases'
  | 'suffixes'
  | 'orm-relations'
  | 'orm-managed-columns';

export type ContractViolation = {
  readonly key: ContractKey;
  readonly file: string;
  readonly message: string;
};

/**
 * Módulos planos, sin capas, exentos del contrato. LISTA CERRADA y a propósito: si los contextos
 * se descubrieran por tener `domain/`, la regla que exige `domain/` no podría fallar nunca. Un
 * módulo plano nuevo entra aquí con su porqué.
 */
export const FLAT_MODULES: readonly string[] = ['health'];

/**
 * Los contextos de `sources`, ordenados: cada `<n>` con algún archivo bajo `src/modules/<n>/`,
 * salvo los de `FLAT_MODULES`. Un archivo suelto en `src/modules/` no es un contexto.
 */
export const discoverContexts = (sources: ReadonlyMap<string, string>): string[] => {
  const names = new Set<string>();
  for (const file of sources.keys()) {
    if (!file.startsWith(MODULES_DIR)) {
      continue;
    }
    const [name, ...rest] = file.slice(MODULES_DIR.length).split('/');
    if (name !== undefined && rest.length > 0 && !FLAT_MODULES.includes(name)) {
      names.add(name);
    }
  }
  return [...names].sort();
};

/**
 * Las violaciones del contrato base de módulo en `sources` (`{ ruta POSIX → fuente }`). Es una
 * función pura: la lectura del disco vive en `readModuleSources`, así que el spec puede montar un
 * contexto sintético en memoria y leer el repo con la misma función.
 *
 * El análisis es SINTÁCTICO, sin type-check, con el mismo patrón que `language-scanner.ts`. Lo que
 * hace falta saber para leer sus resultados:
 *
 * - Cada base se reconoce por el nombre importado y su especificador EXACTO (`@shared/domain/…`,
 *   `@common/filters/…`), así que no engañan un `DomainError` declarado a mano, uno de un archivo
 *   del contexto ni el del kernel importado por ruta relativa, que no sobreviviría a mover el
 *   módulo. Un alias o un `import * as` se deshacen.
 * - Como máximo hay una violación por (clave, archivo); si un archivo incumple una regla por varios
 *   motivos, `message` los une con `; `. Así el trinquete del spec no depende de cuántos motivos
 *   tenga cada archivo.
 * - Sin cascadas: un contexto que falla `structure` no recibe el resto de comprobaciones; `filter`
 *   no compara con la raíz si `errors` no encontró exactamente una, y `controller-filter` no mira
 *   nada si el filtro falta o no declara exactamente una clase.
 * - Los comentarios no cuentan en ninguna regla: se mira el AST, no el texto.
 * - Salvo `structure`, ninguna regla mira `src/modules/<ctx>/__tests__/`.
 */
export const checkModuleContract = (sources: ReadonlyMap<string, string>): ContractViolation[] =>
  discoverContexts(sources).flatMap((name) => checkContext(contextOf(name, sources)));

/** Todos los `.ts` bajo `<root>/src/modules`, con la ruta POSIX relativa a `root` como clave. */
export const readModuleSources = (root: string): ReadonlyMap<string, string> =>
  new Map(
    collectTsFiles(path.join(root, 'src', 'modules')).map((file): [string, string] => [
      path.relative(root, file).split(path.sep).join('/'),
      readFileSync(file, 'utf-8'),
    ]),
  );

// ── Bases y listas ──────────────────────────────────────────────────────────────────────────

const MODULES_DIR = 'src/modules/';

type Binding = { readonly specifier: string; readonly name: string };

const DOMAIN_ERROR: Binding = { specifier: '@shared/domain/domain-error', name: 'DomainError' };
const ENTITY_BASES: readonly Binding[] = [
  { specifier: '@shared/domain/entity.base', name: 'Entity' },
  { specifier: '@shared/domain/aggregate-root', name: 'AggregateRoot' },
];
const VALUE_OBJECT: Binding = {
  specifier: '@shared/domain/value-object.base',
  name: 'ValueObject',
};
const UUID_IDENTIFIER: Binding = {
  specifier: '@shared/domain/uuid-identifier.base',
  name: 'UuidIdentifier',
};
const FILTER_BASE: Binding = {
  specifier: '@common/filters/domain-exception.filter',
  name: 'DomainExceptionFilter',
};
const CATCH: Binding = { specifier: '@nestjs/common', name: 'Catch' };
const USE_FILTERS: Binding = { specifier: '@nestjs/common', name: 'UseFilters' };

const RELATION_DECORATORS: readonly string[] = [
  'ManyToOne',
  'OneToMany',
  'OneToOne',
  'ManyToMany',
  'JoinColumn',
  'JoinTable',
  'RelationId',
  'ForeignKey',
  'Tree',
  'TreeParent',
  'TreeChildren',
];

/** Columnas que TypeORM rellena por su cuenta: el dominio es el dueño de las fechas. */
const MANAGED_COLUMNS: readonly string[] = [
  'CreateDateColumn',
  'UpdateDateColumn',
  'DeleteDateColumn',
  'VersionColumn',
];

const LAYERS: readonly string[] = ['domain', 'application', 'infrastructure', '__tests__'];

const SUFFIXED_FOLDERS: readonly (readonly [folder: string, suffix: string])[] = [
  ['domain/entities/', '.entity.ts'],
  ['domain/value-objects/', '.vo.ts'],
  ['domain/errors/', '.errors.ts'],
  ['application/use-cases/', '.use-case.ts'],
];

const KEY_ORDER: readonly ContractKey[] = [
  'structure',
  'errors',
  'filter',
  'controller-filter',
  'entities',
  'value-objects',
  'use-cases',
  'suffixes',
  'orm-relations',
  'orm-managed-columns',
];

// ── El contexto y sus reglas ────────────────────────────────────────────────────────────────

type Context = {
  readonly name: string;
  /** `src/modules/<name>/`. */
  readonly root: string;
  /** Sus archivos, con la ruta completa y ordenados. */
  readonly files: readonly string[];
  readonly parse: (file: string) => ParsedFile;
};

/** Una clase concreta: el archivo que la declara y su nombre. */
type ClassTarget = { readonly file: string; readonly name: string };

const contextOf = (name: string, sources: ReadonlyMap<string, string>): Context => {
  const root = `${MODULES_DIR}${name}/`;
  const cache = new Map<string, ParsedFile>();
  return {
    name,
    root,
    files: [...sources.keys()].filter((file) => file.startsWith(root)).sort(),
    parse: (file) => {
      const cached = cache.get(file);
      if (cached !== undefined) {
        return cached;
      }
      const text = sources.get(file);
      if (text === undefined) {
        throw new Error(`No existe ${file}`);
      }
      const parsed = parseFile(file, text);
      cache.set(file, parsed);
      return parsed;
    },
  };
};

/** Los archivos del contexto, fuera de su `__tests__/`, cuya ruta relativa cumple `matches`. */
const filesWhere = (context: Context, matches: (relative: string) => boolean): string[] =>
  context.files.filter((file) => {
    const relative = file.slice(context.root.length);
    return !relative.startsWith('__tests__/') && matches(relative);
  });

const violation = (
  key: ContractKey,
  file: string,
  reasons: readonly string[],
): ContractViolation[] =>
  reasons.length === 0 ? [] : [{ key, file, message: reasons.join('; ') }];

const checkContext = (context: Context): ContractViolation[] => {
  const structure = checkStructure(context);
  if (structure.length > 0) {
    return ordered(structure);
  }
  const errors = checkErrors(context);
  const filter = checkFilter(context, errors.root);
  return ordered([
    ...errors.violations,
    ...filter.violations,
    ...checkControllerFilter(context, filter.target),
    ...checkEntities(context),
    ...checkValueObjects(context),
    ...checkUseCases(context),
    ...checkSuffixes(context),
    ...checkOrmNames(context, 'orm-relations', RELATION_DECORATORS),
    ...checkOrmNames(context, 'orm-managed-columns', MANAGED_COLUMNS),
  ]);
};

const checkStructure = (context: Context): ContractViolation[] => {
  const moduleFile = `${context.root}${context.name}.module.ts`;
  return [
    ...violation(
      'structure',
      moduleFile,
      context.files.includes(moduleFile) ? [] : ['falta el module file del contexto'],
    ),
    ...LAYERS.flatMap((layer) => {
      const folder = `${context.root}${layer}/`;
      const present = context.files.some((file) => file.startsWith(folder) && file.endsWith('.ts'));
      return violation(
        'structure',
        folder,
        present ? [] : [`falta la carpeta \`${layer}/\` o no tiene ningún \`.ts\``],
      );
    }),
  ];
};

const checkErrors = (
  context: Context,
): { violations: ContractViolation[]; root: ClassTarget | undefined } => {
  const files = filesWhere(
    context,
    (relative) => relative.startsWith('domain/errors/') && relative.endsWith('.errors.ts'),
  );
  if (files.length === 0) {
    return {
      violations: violation('errors', `${context.root}domain/errors/`, [
        'falta un `*.errors.ts` con la raíz de errores del contexto',
      ]),
      root: undefined,
    };
  }
  const roots = files.flatMap((file) => {
    const parsed = context.parse(file);
    return parsed.classes
      .filter(
        (cls) =>
          hasModifier(cls, ts.SyntaxKind.AbstractKeyword) &&
          isImportOf(resolve(extendsClause(cls)?.expression, parsed), DOMAIN_ERROR),
      )
      .map((cls): ClassTarget => ({ file, name: nameOf(cls) }));
  });
  const root = roots.length === 1 ? roots[0] : undefined;
  const errorFiles = new Set(files);
  const violations = files.flatMap((file) => {
    const parsed = context.parse(file);
    const reasons: string[] = [];
    if (roots.length === 0) {
      reasons.push(
        'ninguna clase abstracta de los `*.errors.ts` del contexto extiende `DomainError` de `@shared/domain/domain-error`',
      );
    }
    if (roots.length > 1 && roots.some((candidate) => candidate.file === file)) {
      const names = roots.map((candidate) => candidate.name).join(', ');
      reasons.push(
        `hay ${roots.length} raíces abstractas que extienden \`DomainError\` (${names}); debe haber una`,
      );
    }
    if (root !== undefined) {
      for (const name of exportedClasses(parsed)) {
        if (!descendsFrom({ file, name }, root, context, errorFiles, new Set())) {
          reasons.push(`\`${name}\` no desciende de la raíz \`${root.name}\``);
        }
      }
    }
    reasons.push(
      ...nonClassExports(parsed).map((name) => `exporta \`${name}\`, que no es una clase`),
    );
    return violation('errors', file, reasons);
  });
  return { violations, root };
};

/** Sigue `extends` por las clases de los `*.errors.ts`, también a través de imports relativos. */
const descendsFrom = (
  candidate: ClassTarget,
  root: ClassTarget,
  context: Context,
  errorFiles: ReadonlySet<string>,
  visited: Set<string>,
): boolean => {
  if (candidate.file === root.file && candidate.name === root.name) {
    return true;
  }
  const seen = `${candidate.file}#${candidate.name}`;
  if (visited.has(seen) || !errorFiles.has(candidate.file)) {
    return false;
  }
  visited.add(seen);
  const parsed = context.parse(candidate.file);
  const cls = parsed.classes.find((declaration) => nameOf(declaration) === candidate.name);
  const parent = resolve(cls === undefined ? undefined : extendsClause(cls)?.expression, parsed);
  if (parent.kind === 'local') {
    return descendsFrom(
      { file: candidate.file, name: parent.name },
      root,
      context,
      errorFiles,
      visited,
    );
  }
  if (parent.kind === 'import' && isRelative(parent.specifier)) {
    return descendsFrom(
      { file: resolveRelative(candidate.file, parent.specifier), name: parent.name },
      root,
      context,
      errorFiles,
      visited,
    );
  }
  return false;
};

const checkFilter = (
  context: Context,
  root: ClassTarget | undefined,
): { violations: ContractViolation[]; target: ClassTarget | undefined } => {
  const file = `${context.root}infrastructure/http/${context.name}-domain-exception.filter.ts`;
  if (!context.files.includes(file)) {
    return {
      violations: violation('filter', file, ['falta el filtro de dominio del contexto']),
      target: undefined,
    };
  }
  const parsed = context.parse(file);
  const cls = parsed.classes[0];
  if (parsed.classes.length !== 1 || cls === undefined) {
    return {
      violations: violation('filter', file, [
        `declara ${parsed.classes.length} clases; debe declarar exactamente una`,
      ]),
      target: undefined,
    };
  }
  const name = nameOf(cls);
  const heritage = extendsClause(cls);
  const extendsBase = isImportOf(resolve(heritage?.expression, parsed), FILTER_BASE);
  const catches = decoratorsOf(cls).filter((decorator) =>
    isImportOf(resolve(callOf(decorator).callee, parsed), CATCH),
  );
  const [onlyCatch] = catches;
  const catchArgs = catches.length === 1 && onlyCatch !== undefined ? callOf(onlyCatch).args : [];
  const reasons: string[] = [];
  if (!extendsBase) {
    reasons.push(
      `\`${name}\` no extiende \`DomainExceptionFilter\` de \`@common/filters/domain-exception.filter\``,
    );
  }
  if (catches.length === 0) {
    reasons.push(`\`${name}\` no lleva \`@Catch\``);
  }
  if (catches.length > 1) {
    reasons.push(`\`${name}\` lleva ${catches.length} \`@Catch\``);
  }
  if (catches.length === 1 && catchArgs.length !== 1) {
    reasons.push(
      `\`@Catch\` recibe ${catchArgs.length} argumentos; debe recibir exactamente uno, la raíz`,
    );
  }
  if (root !== undefined) {
    if (catchArgs.length === 1 && !pointsTo(resolve(catchArgs[0], parsed), file, root)) {
      reasons.push(`\`@Catch\` no recibe la raíz \`${root.name}\``);
    }
    if (extendsBase && !onlyTypeArgumentPointsTo(heritage, parsed, root)) {
      reasons.push(`el tipo de \`DomainExceptionFilter<…>\` no es la raíz \`${root.name}\``);
    }
  }
  return { violations: violation('filter', file, reasons), target: { file, name } };
};

const checkControllerFilter = (
  context: Context,
  filter: ClassTarget | undefined,
): ContractViolation[] => {
  if (filter === undefined) {
    return [];
  }
  return filesWhere(
    context,
    (relative) =>
      relative.startsWith('infrastructure/http/') && relative.endsWith('.controller.ts'),
  ).flatMap((file) => {
    const parsed = context.parse(file);
    const unfiltered = parsed.classes.filter(
      (cls) =>
        !decoratorsOf(cls).some((decorator) => {
          const { callee, args } = callOf(decorator);
          return (
            isImportOf(resolve(callee, parsed), USE_FILTERS) &&
            args.some((arg) => pointsTo(resolve(arg, parsed), file, filter))
          );
        }),
    );
    return violation(
      'controller-filter',
      file,
      unfiltered.map(
        (cls) => `\`${nameOf(cls)}\` no lleva \`@UseFilters(${filter.name})\` a nivel de clase`,
      ),
    );
  });
};

const checkEntities = (context: Context): ContractViolation[] =>
  filesWhere(
    context,
    (relative) => relative.startsWith('domain/') && relative.endsWith('.entity.ts'),
  ).flatMap((file) => {
    const parsed = context.parse(file);
    const cls = parsed.classes[0];
    if (parsed.classes.length !== 1 || cls === undefined) {
      return violation('entities', file, [
        `declara ${parsed.classes.length} clases; debe declarar exactamente una`,
      ]);
    }
    const name = nameOf(cls);
    const base = resolve(extendsClause(cls)?.expression, parsed);
    const constructors = cls.members.filter(ts.isConstructorDeclaration);
    const reasons: string[] = [];
    if (!ENTITY_BASES.some((candidate) => isImportOf(base, candidate))) {
      reasons.push(`\`${name}\` no extiende \`Entity\` ni \`AggregateRoot\` del kernel`);
    }
    if (constructors.length === 0) {
      reasons.push(`\`${name}\` no declara constructor; debe tener uno \`private\``);
    } else if (!constructors.every((ctor) => hasModifier(ctor, ts.SyntaxKind.PrivateKeyword))) {
      reasons.push(`el constructor de \`${name}\` no es \`private\``);
    }
    if (!cls.members.some((member) => isMethodNamed(member, 'rehydrate') && isStatic(member))) {
      reasons.push(`\`${name}\` no tiene un método \`static rehydrate\``);
    }
    if (
      !cls.members.some(
        (member) => isMethodNamed(member, 'toSnapshot') && !isStatic(member) && isPublic(member),
      )
    ) {
      reasons.push(`\`${name}\` no tiene un método de instancia público \`toSnapshot\``);
    }
    return violation('entities', file, reasons);
  });

const checkValueObjects = (context: Context): ContractViolation[] =>
  filesWhere(
    context,
    (relative) => relative.startsWith('domain/') && relative.endsWith('.vo.ts'),
  ).flatMap((file) => {
    const parsed = context.parse(file);
    if (parsed.classes.length === 0) {
      return violation('value-objects', file, ['no declara ninguna clase']);
    }
    return violation(
      'value-objects',
      file,
      parsed.classes.flatMap((cls) => valueObjectReasons(cls, parsed)),
    );
  });

const valueObjectReasons = (cls: ts.ClassDeclaration, parsed: ParsedFile): string[] => {
  const name = nameOf(cls);
  const heritage = extendsClause(cls);
  const base = resolve(heritage?.expression, parsed);
  const isUuid = isImportOf(base, UUID_IDENTIFIER);
  const reasons: string[] = [];
  if (!isUuid && !isImportOf(base, VALUE_OBJECT)) {
    reasons.push(`\`${name}\` no extiende \`ValueObject\` ni \`UuidIdentifier\` del kernel`);
  }
  if (cls.members.some((member) => ts.isConstructorDeclaration(member) && isPublic(member))) {
    reasons.push(`\`${name}\` declara un constructor público`);
  }
  if (!cls.members.some((member) => isMethodNamed(member, 'from') && isStatic(member))) {
    reasons.push(`\`${name}\` no declara su propio \`static from\``);
  }
  if (isUuid && !hasBrand(heritage, name)) {
    const brand = (heritage?.typeArguments ?? []).map((argument) => argument.getText()).join(', ');
    reasons.push(
      brand === ''
        ? `\`${name}\` no lleva marca; debe ser \`'${name}'\``
        : `la marca de \`${name}\` es \`${brand}\`; debe ser \`'${name}'\``,
    );
  }
  return reasons;
};

const checkUseCases = (context: Context): ContractViolation[] =>
  filesWhere(
    context,
    (relative) => relative.startsWith('application/') && relative.endsWith('.use-case.ts'),
  ).flatMap((file) => {
    const parsed = context.parse(file);
    const cls = parsed.classes[0];
    if (parsed.classes.length !== 1 || cls === undefined) {
      return violation('use-cases', file, [
        `declara ${parsed.classes.length} clases; debe declarar exactamente una`,
      ]);
    }
    const stem = path.posix
      .basename(file, '.use-case.ts')
      .split('-')
      .map((piece) => `${piece.charAt(0).toUpperCase()}${piece.slice(1)}`)
      .join('');
    return violation('use-cases', file, useCaseReasons(cls, parsed, stem));
  });

/** `stem` es el nombre del archivo en PascalCase: `find-user-by-id` da `FindUserById`. */
const useCaseReasons = (cls: ts.ClassDeclaration, parsed: ParsedFile, stem: string): string[] => {
  const expectedClass = `${stem}UseCase`;
  const expectedInput = `${stem}Input`;
  const reasons: string[] = [];
  if (nameOf(cls) !== expectedClass) {
    reasons.push(`la clase se llama \`${nameOf(cls)}\`; debe llamarse \`${expectedClass}\``);
  }
  const exportsInput = parsed.source.statements.some(
    (statement) =>
      ts.isTypeAliasDeclaration(statement) &&
      isExported(statement) &&
      statement.name.text === expectedInput,
  );
  if (!exportsInput) {
    reasons.push(`falta \`export type ${expectedInput}\``);
  }
  // Público es lo que no lleva `private` ni `protected` y no tiene un nombre `#`. Una propiedad
  // flecha `execute = …` cuenta como otro miembro, no como el método.
  const publicMembers = cls.members.filter(
    (member) =>
      !ts.isConstructorDeclaration(member) &&
      !ts.isSemicolonClassElement(member) &&
      isPublic(member),
  );
  const [onlyMember] = publicMembers;
  const onlyExecute =
    publicMembers.length === 1 &&
    onlyMember !== undefined &&
    isMethodNamed(onlyMember, 'execute') &&
    !isStatic(onlyMember);
  if (!onlyExecute) {
    const listed = publicMembers.map((member) => `\`${memberName(member)}\``).join(', ');
    reasons.push(
      publicMembers.length === 0
        ? 'no tiene ningún miembro público; debe tener solo el método de instancia `execute`'
        : `sus miembros públicos son ${listed}; debe tener solo el método de instancia \`execute\``,
    );
  }
  const execute = cls.members.find((member): member is ts.MethodDeclaration =>
    isMethodNamed(member, 'execute'),
  );
  if (execute !== undefined && !takesOnly(execute, expectedInput)) {
    reasons.push(`\`execute\` debe recibir un único parámetro de tipo \`${expectedInput}\``);
  }
  for (const ctor of cls.members.filter(ts.isConstructorDeclaration)) {
    for (const parameter of ctor.parameters) {
      if (
        ts.isParameterPropertyDeclaration(parameter, ctor) &&
        !hasModifier(parameter, ts.SyntaxKind.PrivateKeyword) &&
        !hasModifier(parameter, ts.SyntaxKind.ProtectedKeyword)
      ) {
        reasons.push(`la dependencia \`${parameter.name.getText()}\` del constructor es pública`);
      }
    }
  }
  return reasons;
};

const checkSuffixes = (context: Context): ContractViolation[] =>
  filesWhere(context, () => true).flatMap((file) => {
    const relative = file.slice(context.root.length);
    const folder = SUFFIXED_FOLDERS.find(([prefix]) => relative.startsWith(prefix));
    if (folder === undefined || relative.endsWith(folder[1])) {
      return [];
    }
    return violation(
      'suffixes',
      file,
      exportedClasses(context.parse(file)).map(
        (name) => `exporta la clase \`${name}\` y no termina en \`${folder[1]}\``,
      ),
    );
  });

const checkOrmNames = (
  context: Context,
  key: ContractKey,
  banned: readonly string[],
): ContractViolation[] =>
  filesWhere(context, (relative) => relative.endsWith('.orm-entity.ts')).flatMap((file) => {
    const usages = bannedUsages(context.parse(file), banned);
    const listed = [...usages].map(([name, alias]) =>
      alias === undefined ? `\`${name}\`` : `\`${name}\` (importado como \`${alias}\`)`,
    );
    return violation(key, file, listed.length === 0 ? [] : [`usa ${listed.join(', ')}`]);
  });

/**
 * Los nombres de `banned` que usa el archivo, en orden de aparición y con el alias con que
 * llegan: un import de `'typeorm'` que los trae (aunque no se usen), un `ns.Nombre` sobre un
 * `typeorm` importado con `* as` o por defecto, y un decorador que se llama así una vez deshecho el
 * alias, venga del módulo que venga.
 */
const bannedUsages = (
  parsed: ParsedFile,
  banned: readonly string[],
): Map<string, string | undefined> => {
  const found = new Map<string, string | undefined>();
  const note = (name: string, alias?: string): void => {
    if (banned.includes(name) && !found.has(name)) {
      found.set(name, alias);
    }
  };
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'typeorm'
    ) {
      const bindings = node.importClause?.namedBindings;
      for (const element of bindings !== undefined && ts.isNamedImports(bindings)
        ? bindings.elements
        : []) {
        note(
          (element.propertyName ?? element.name).text,
          element.propertyName && element.name.text,
        );
      }
    } else if (ts.isPropertyAccessExpression(node) || ts.isQualifiedName(node)) {
      const left = ts.isPropertyAccessExpression(node) ? node.expression : node.left;
      const right = ts.isPropertyAccessExpression(node) ? node.name.text : node.right.text;
      const binding = ts.isIdentifier(left) ? parsed.imports.get(left.text) : undefined;
      if (binding?.specifier === 'typeorm' && binding.name === '*') {
        note(right);
      }
    } else if (ts.isDecorator(node)) {
      const { callee } = callOf(node);
      if (ts.isIdentifier(callee)) {
        const name = parsed.imports.get(callee.text)?.name ?? callee.text;
        note(name, name === callee.text ? undefined : callee.text);
      } else if (ts.isPropertyAccessExpression(callee)) {
        note(callee.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.source);
  return found;
};

const ordered = (violations: readonly ContractViolation[]): ContractViolation[] =>
  [...violations].sort(
    (a, b) => KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key) || compareText(a.file, b.file),
  );

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ── Resolución de referencias ───────────────────────────────────────────────────────────────

type ParsedFile = {
  readonly file: string;
  readonly source: ts.SourceFile;
  /** Nombre local → lo que importa: (especificador, nombre importado), o `*` para `* as` y default. */
  readonly imports: ReadonlyMap<string, Binding>;
  /** Las clases que son sentencia directa del archivo, en orden. */
  readonly classes: readonly ts.ClassDeclaration[];
};

const parseFile = (file: string, text: string): ParsedFile => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = new Map<string, Binding>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause?.name !== undefined) {
      imports.set(clause.name.text, { specifier, name: '*' });
    }
    const bindings = clause?.namedBindings;
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, { specifier, name: '*' });
    }
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, {
          specifier,
          name: (element.propertyName ?? element.name).text,
        });
      }
    }
  }
  return { file, source, imports, classes: source.statements.filter(ts.isClassDeclaration) };
};

type Reference =
  | { readonly kind: 'import'; readonly specifier: string; readonly name: string }
  | { readonly kind: 'local'; readonly name: string }
  | { readonly kind: 'unresolved' };

const UNRESOLVED: Reference = { kind: 'unresolved' };

/**
 * A qué apunta un `extends`, el callee de un decorador, un argumento o el nombre de un tipo: un
 * identificador importado da su (especificador, nombre importado), deshaciendo el alias; uno que
 * nombra una clase del propio archivo es local; `ns.Nombre` con `ns` de un `* as` da
 * (especificador de `ns`, `Nombre`). Cualquier otra cosa queda sin resolver y nunca coincide.
 */
const resolve = (node: ts.Node | undefined, file: ParsedFile): Reference => {
  if (node === undefined) {
    return UNRESOLVED;
  }
  if (ts.isIdentifier(node)) {
    const binding = file.imports.get(node.text);
    if (binding !== undefined) {
      return { kind: 'import', ...binding };
    }
    return file.classes.some((cls) => cls.name?.text === node.text)
      ? { kind: 'local', name: node.text }
      : UNRESOLVED;
  }
  const qualified = ts.isPropertyAccessExpression(node)
    ? { left: node.expression, right: node.name.text }
    : ts.isQualifiedName(node)
      ? { left: node.left, right: node.right.text }
      : undefined;
  if (qualified !== undefined && ts.isIdentifier(qualified.left)) {
    const binding = file.imports.get(qualified.left.text);
    if (binding?.name === '*') {
      return { kind: 'import', specifier: binding.specifier, name: qualified.right };
    }
  }
  return UNRESOLVED;
};

const isImportOf = (reference: Reference, base: Binding): boolean =>
  reference.kind === 'import' &&
  reference.specifier === base.specifier &&
  reference.name === base.name;

const isRelative = (specifier: string): boolean =>
  specifier.startsWith('./') || specifier.startsWith('../');

const resolveRelative = (from: string, specifier: string): string =>
  `${path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))}.ts`;

/**
 * Si `reference`, leída en `from`, apunta a la clase `target`: es local y `from` es su archivo, o su
 * especificador es relativo y, resuelto contra la carpeta de `from`, da el archivo de `target`.
 */
const pointsTo = (reference: Reference, from: string, target: ClassTarget): boolean => {
  if (reference.kind === 'local') {
    return from === target.file && reference.name === target.name;
  }
  return (
    reference.kind === 'import' &&
    isRelative(reference.specifier) &&
    resolveRelative(from, reference.specifier) === target.file &&
    reference.name === target.name
  );
};

/** Si el único argumento de tipo del `extends` apunta a `target`, leído en el archivo de `parsed`. */
const onlyTypeArgumentPointsTo = (
  heritage: ts.ExpressionWithTypeArguments | undefined,
  parsed: ParsedFile,
  target: ClassTarget,
): boolean => {
  const [only, ...rest] = heritage?.typeArguments ?? [];
  return (
    only !== undefined &&
    rest.length === 0 &&
    ts.isTypeReferenceNode(only) &&
    pointsTo(resolve(only.typeName, parsed), parsed.file, target)
  );
};

/** Si el único argumento de tipo del `extends` es el literal `'<name>'`. */
const hasBrand = (heritage: ts.ExpressionWithTypeArguments | undefined, name: string): boolean => {
  const [only, ...rest] = heritage?.typeArguments ?? [];
  return (
    only !== undefined &&
    rest.length === 0 &&
    ts.isLiteralTypeNode(only) &&
    ts.isStringLiteral(only.literal) &&
    only.literal.text === name
  );
};

// ── Clases, miembros y exports ──────────────────────────────────────────────────────────────

const nameOf = (cls: ts.ClassDeclaration): string => cls.name?.text ?? 'default';

const extendsClause = (cls: ts.ClassDeclaration): ts.ExpressionWithTypeArguments | undefined =>
  cls.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);

const isExported = (node: ts.Node): boolean => hasModifier(node, ts.SyntaxKind.ExportKeyword);

const isStatic = (member: ts.ClassElement): boolean =>
  hasModifier(member, ts.SyntaxKind.StaticKeyword);

const isPublic = (member: ts.ClassElement): boolean =>
  !hasModifier(member, ts.SyntaxKind.PrivateKeyword) &&
  !hasModifier(member, ts.SyntaxKind.ProtectedKeyword) &&
  !(member.name !== undefined && ts.isPrivateIdentifier(member.name));

const memberName = (member: ts.ClassElement): string => {
  const name = member.name;
  if (name === undefined) {
    return '';
  }
  return ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : name.getText();
};

const isMethodNamed = (member: ts.ClassElement, name: string): boolean =>
  ts.isMethodDeclaration(member) && memberName(member) === name;

/** Si `method` recibe un único parámetro cuyo tipo es exactamente el alias `typeName`. */
const takesOnly = (method: ts.MethodDeclaration, typeName: string): boolean => {
  const [only, ...rest] = method.parameters;
  const type = only?.type;
  return (
    rest.length === 0 &&
    type !== undefined &&
    ts.isTypeReferenceNode(type) &&
    ts.isIdentifier(type.typeName) &&
    type.typeName.text === typeName &&
    type.typeArguments === undefined
  );
};

const decoratorsOf = (node: ts.Node): readonly ts.Decorator[] =>
  (ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined) ?? [];

const callOf = (
  decorator: ts.Decorator,
): { callee: ts.Expression; args: readonly ts.Expression[] } =>
  ts.isCallExpression(decorator.expression)
    ? { callee: decorator.expression.expression, args: decorator.expression.arguments }
    : { callee: decorator.expression, args: [] };

/** `export class`, `export default class` o una clase nombrada en un `export { … }` sin `from`. */
const exportedClasses = (parsed: ParsedFile): string[] => {
  const local = new Set(parsed.classes.map(nameOf));
  const named = parsed.source.statements.flatMap((statement) =>
    ts.isExportDeclaration(statement) &&
    statement.moduleSpecifier === undefined &&
    statement.exportClause !== undefined &&
    ts.isNamedExports(statement.exportClause)
      ? statement.exportClause.elements
          .map((element) => (element.propertyName ?? element.name).text)
          .filter((name) => local.has(name))
      : [],
  );
  return [...new Set([...parsed.classes.filter(isExported).map(nameOf), ...named])];
};

/**
 * Lo que el archivo exporta y no es una clase: `const`, función, `type`, `interface`, `enum`,
 * `namespace`, un `export default` de una expresión, un `export *` o una reexportación.
 */
const nonClassExports = (parsed: ParsedFile): string[] => {
  const local = new Set(parsed.classes.map(nameOf));
  return parsed.source.statements.flatMap((statement): string[] => {
    if (ts.isClassDeclaration(statement)) {
      return [];
    }
    if (ts.isExportAssignment(statement)) {
      return ['default'];
    }
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause === undefined) {
        return ['*'];
      }
      if (ts.isNamespaceExport(clause)) {
        return [clause.name.text];
      }
      return clause.elements
        .filter(
          (element) =>
            statement.moduleSpecifier !== undefined ||
            !local.has((element.propertyName ?? element.name).text),
        )
        .map((element) => element.name.text);
    }
    if (!isExported(statement)) {
      return [];
    }
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.map((declaration) =>
        declaration.name.getText(),
      );
    }
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement)
    ) {
      return [statement.name?.getText() ?? 'default'];
    }
    return ['default'];
  });
};
