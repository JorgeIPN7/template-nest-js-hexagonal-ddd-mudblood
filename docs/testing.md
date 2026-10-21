# Tests: el porqué de las convenciones

Este documento guarda el porqué, las mediciones y la historia de las reglas de test de
[`CLAUDE.md`](../CLAUDE.md): el «Flujo de trabajo» y las convenciones de test de
«Code conventions». Al final recoge también el porqué y la historia de las demás convenciones de
«Code conventions» y de «Deferred work», que no son de test pero comparten bloque en `CLAUDE.md`.
La regla vigente está en `CLAUDE.md`: si este documento y `CLAUDE.md` discrepan, gana `CLAUDE.md`.

## Modelo de colaboración

Regla ([`CLAUDE.md`, «Flujo de trabajo»](../CLAUDE.md#flujo-de-trabajo), y el skill
[`/feature`](../.claude/skills/feature/SKILL.md)): casos primero, TDD después, mutación como
auditor.

La definición vigente del modelo son esa sección de `CLAUDE.md` y el skill. La spec donde nació
(`2026-08-04-roadmap-and-collaboration-model-design.md`) se quedó en el historial anterior a la
reconstrucción del 2026-08-08 y no existe en el repo (backlog #29).

### Las tres fases

Las tres fases —contrato, ejecución (IA) y validación— se definen solo en los pasos 3 a 8 del
skill [`/feature`](../.claude/skills/feature/SKILL.md): copiarlas aquí abriría la segunda fuente
que backlog #29 decidió no abrir. Aquí queda lo que el skill no cuenta:

- **Sin confirmación rutinaria antes de cada tarea (fase 2):** medido, 3 confirmaciones y 0
  cambios; es la medición de la decisión D1 de
  [`development-workflows.md`, §12](./development-workflows.md#12-de-dónde-sale-todo-esto-el-experimento-del-2026-09-30).
- **El módulo entero, sin llaves:** el CLI de Stryker parte `--mutate` por comas ANTES de
  expandirlas, así que `{domain,application}` daba dos patrones que no casan con nada, cero
  mutantes, un score `NaN` que pasa cualquier umbral y salida 0 (medido con Stryker 10). Sin
  `--mutate`, `pnpm test:mutation` muta todos los módulos.
- **Por qué el resto de convenciones de testing (AAA, 1:1 spec↔archivo, mocking por capa) no
  cambia:** el modelo añade el origen de los casos y el auditor, no cómo se escribe un test.

### Referencias históricas en `src/`

Los comentarios y tests que citan «Tabla D…R», «fila R11», «caso E5» o «spec §N» apuntan a planes y
specs de aquel ciclo, perdidos en la misma reconstrucción del 2026-08-08: no los busques. El caso
vive en el texto del `it`; de esas tablas, la suite es la única fuente que queda.

## La mutación como gate

Regla ([`CLAUDE.md`, «Flujo de trabajo»](../CLAUDE.md#flujo-de-trabajo)): la mutación es gate, no sugerencia: `thresholds.break: 90` en
[`stryker.config.mjs`](../stryker.config.mjs) y job `mutation` propio en
[`ci.yml`](../.github/workflows/ci.yml).

- **Desde cuándo:** 2026-08-06 (backlog #9).
- **De dónde sale el 90:** el 85 original salió del baseline medido el 2026-08-06 —90.14 %
  global—, y el margen está dominado por el peso de cada módulo en mutantes, no por su score.
  Subió a 90 el 2026-10-19, con el censo al 100 % y sin supervivientes. El racional completo, con
  la aritmética, vive en el comentario de cabecera de [`stryker.config.mjs`](../stryker.config.mjs).
- **Qué protege:** bajar el score por debajo del umbral rompe la CI, así que un módulo nuevo sin
  casos no entra en silencio.

El comando para medir un módulo entero y su ⚠️ están en `CLAUDE.md`; el porqué del ⚠️, en
[Las tres fases](#las-tres-fases). Cómo se audita la mutación del código nuevo de cada cambio:
[`development-workflows.md`, §9](./development-workflows.md#9-mutación-del-código-nuevo).

## Un test debe fallar sin el arreglo

Regla ([`CLAUDE.md`, «Code conventions»](../CLAUDE.md#code-conventions)): antes de fiarte de un
test de regresión, verifícalo.

### Tests que parecían cubrir un defecto y pasaban igual

Varios tests de este repo parecían cubrir un defecto y pasaban en verde de todos modos:

- el caso de subcadena de `isHealthPath` eligió la única URL que esquivaba el bug;
- al test de POST concurrentes lo atrapaba la comprobación previa, y nunca llegaba a la traducción
  del `23505`;
- el primer E2E de cancelaciones simultáneas de pedidos seguía en verde bajo `REPEATABLE READ`, la
  regresión que su propio comentario decía vigilar.

El tercer caso, con la versión corregida del E2E, está contado en
[`development-workflows.md`, §8](./development-workflows.md#8-las-dos-comprobaciones-que-comparten-todos-los-flujos).

### Tests de guarda: la comprobación es obligatoria

Para un **test de guarda** —concurrencia, propiedad del recurso, autorización, atomicidad,
anti-enumeración, idempotencia— la comprobación es obligatoria:

1. quita la protección un momento;
2. observa que el test falla por aserción;
3. restaura la protección.

### Guardas de arquitectura: detector, árbol y rotura puntual

Un test de arquitectura (una regla sobre el código del repo, no sobre su comportamiento) tiene un
modo de fallo propio: si solo comprueba que el árbol está limpio, pasa igual de verde con un
detector que no detecta nada. Por eso se escribe en tres capas, y
[`module-contract.spec.ts`](../src/__tests__/module-contract.spec.ts) es el ejemplo completo:

- **El detector** trabaja sobre un fixture sintético: un contexto `billing` que cumple el
  contrato, y una fila por regla que rompe solo esa regla. Cada fila compara con igualdad exacta,
  así que una regla que se dispara de más también la pone en rojo. Su rojo por aserción se
  demuestra con el checker como stub (`() => []`): todas las filas que esperan una violación
  fallan.
- **El árbol** compara el repo real con igualdad exacta (`toEqual([])`, no un `length`). Una fila
  de no vacuidad comprueba que hay algo que mirar —al menos un contexto descubierto—, sin nombrar
  los módulos de ejemplo, que el usuario del template puede quitar.
- **La rotura puntual** demuestra que la fila árbol lee el repo de verdad: se rompe un módulo
  real a mano (un `ManyToOne` en una entidad ORM, un module file de un contexto vacío), se ve la
  fila en rojo y se restaura.

Los precedentes son los bloques `describe('el detector')` y `describe('el árbol')` de
[`language-convention.spec.ts`](../src/__tests__/language-convention.spec.ts) y de
[`migration-conventions.spec.ts`](../src/database/__tests__/migration-conventions.spec.ts).

**El trinquete, para una migración larga.** Cuando la regla nueva falla hoy en varios sitios que
se arreglarán en tareas distintas, la fila árbol nace comparando con igualdad exacta contra una
constante con las violaciones de hoy (`PENDING_VIOLATIONS`, en el caso del contrato de módulo).
Cada tarea empieza quitando sus líneas de la lista, y la fila se pone roja por aserción; al
terminar, vuelve a verde. La suite no se queda en rojo entre tareas, y una violación arreglada
sin quitarla de la lista también la pone en rojo. Cuando la lista se vacía, la fila pasa a
`toEqual([])` y la constante se borra.

## Mocking por capa y cobertura

Regla ([`CLAUDE.md`, «Code conventions»](../CLAUDE.md#code-conventions)): sin mocks en `domain/`;
fakes de puertos escritos a mano en `application/` (ver
[`__tests__/helpers/in-memory-user.repository.ts`](../src/modules/users/__tests__/helpers/in-memory-user.repository.ts)),
nunca `jest.mock`; los repositorios se prueban contra PostgreSQL real en la suite E2E.

### Qué queda fuera de la cobertura unitaria, y quién lo mide

Los módulos, los repositorios TypeORM, `data-source.ts`, los seeds, el CLI del outbox y las
migraciones quedan fuera de la cobertura _unitaria_ a propósito, y
[`test/jest-e2e.config.mjs`](../test/jest-e2e.config.mjs) los mide con su propio umbral,
**salvo `src/database/migrations/**`, que no mide ninguna suite**.

- **Por qué esa excepción:** es deliberada y ahora está escrita. Las migraciones son DDL de un solo
  uso que ejecuta el CLI, y que nada las ejercite directamente es deuda abierta con su propia
  entrada (backlog #17), no algo que la configuración E2E cubra en silencio.
- **Historia:** hasta el 2026-08-19, la frase de `CLAUDE.md` afirmaba que la suite E2E medía
  «exactly those files» mientras su lista tenía dos de los seis patrones, así que cuatro grupos no
  los medía ninguna de las dos suites.

### La base de datos del E2E

Regla ([`CLAUDE.md`, «Commands»](../CLAUDE.md#commands) y «Code conventions»): la suite E2E corre
contra la base de test que fija [`test/setup-env.ts`](../test/setup-env.ts), no contra la de
desarrollo.

- **Cómo:** ese archivo fuerza `NODE_ENV=test` y el nombre de la base antes de que arranque el
  `AppModule`.
- **Por qué el `TRUNCATE`:** el de cada `beforeEach` es necesario para que la suite sea repetible.
- **Por qué un clon nuevo muere con `relation "auth_credentials" does not exist`:**
  `docker/initdb/` crea la base de test, pero nunca la migra. Medido contra una base recién creada:
  `auth.e2e-spec.ts` corre primero, y su `beforeEach` trunca esa tabla antes que ninguna otra.
  Parece un fallo del código y es un esquema que nadie migró: lo arregla `pnpm db:migrate:test`, y
  `pnpm db:reset` migra las dos bases (backlog #18).

## AAA y un spec por archivo

### AAA: los tres comentarios, siempre

Regla ([`CLAUDE.md`, «Code conventions»](../CLAUDE.md#code-conventions)): `// Arrange`, `// Act`
y `// Assert` en cada `it`, cada uno en su propia línea, aunque una fase no tenga código.

- Sin nada que preparar, `// Arrange` se queda, vacío.
- Cuando lo que comprueba la aserción es la propia acción (un throw), se captura bajo `// Act` y
  se afirma bajo `// Assert`. Un `// Act + Assert` combinado no se admite.

```ts
// Arrange

// Act
const act = () => OrderAmount.from(-1);

// Assert
expect(act).toThrow(InvalidOrderAmountError);
```

Los 194 tests heredados que la incumplían se pusieron al día el 2026-10-20 (backlog #30).

### Un spec por archivo (1:1), dentro de `__tests__/`

Regla ([`CLAUDE.md`, «Code conventions»](../CLAUDE.md#code-conventions)): un spec por archivo
fuente, con el mismo nombre base y la misma ruta relativa dentro de `__tests__/`; no se agrupan
varios SUT en un archivo.

- **Por qué `__tests__/` va en la raíz de cada módulo, replicando su estructura interna:** así,
  mover un módulo mueve sus tests con él.
- **Por qué los puertos sin lógica están exentos:** una clase abstracta sin lógica no tiene nada que
  mutar; si el archivo del puerto exporta algo más (`DUMMY_PASSWORD_HASH` en `password-hasher.ts`),
  lleva su spec 1:1.
- **Por qué los errores y los eventos no lo están:** llevan mensajes y datos que Stryker muta. Los
  huecos heredados se cerraron el 2026-10-19 (backlog #30).

### Fixtures compartidos

Regla ([`CLAUDE.md`, «Code conventions»](../CLAUDE.md#code-conventions)): los helpers de todo un
módulo van en `<module>/__tests__/helpers/`; los transversales, en `test/helpers/`, importados vía
`@test/`. Nunca se copia un builder en varios specs.

Ejemplos: [`user.factory.ts`](../src/modules/users/__tests__/helpers/user.factory.ts) y
[`arbitraries.ts`](../src/modules/users/__tests__/helpers/arbitraries.ts) en el módulo `users`;
[`config.factory.ts`](../test/helpers/config.factory.ts) en `test/helpers/`.

### `describe` en código, `it` en español

Regla ([`CLAUDE.md`, «Code conventions»](../CLAUDE.md#code-conventions)): el `describe` raíz lleva
el identificador real; uno anidado lleva el nombre del método que agrupa (`describe('cancel()')`),
o una frase en español cuando agrupa por escenario y no por método; cada `it` es una frase en
español que empieza por `debería…`.

Por qué los títulos de `it` en español no necesitan excepción: la convención de idioma
(«Code in English, prose in Spanish») la hace cumplir
[`language-convention.spec.ts`](../src/__tests__/language-convention.spec.ts) afirmando sobre
**identificadores, nunca sobre strings**. Una excepción escrita a esa convención: los mensajes
de error de [`env.schema.ts`](../src/config/env.schema.ts) y
[`validate-env.ts`](../src/config/validate-env.ts) van en inglés porque comparten un string con
los textos por defecto de Zod, que no se pueden traducir.

### El resto de «Code conventions» y «Deferred work»

No son convenciones de test, pero comparten bloque con ellas en `CLAUDE.md`; aquí queda su porqué
y su historia, y la regla sigue en `CLAUDE.md`.

- **`type`, nunca `interface`.** Los archivos de referencia de las skills usan `interface` como
  pseudocódigo agnóstico del lenguaje: tradúcelo antes de escribir código real. Los puertos son el
  único sitio que no es ni lo uno ni lo otro: son `abstract class`, porque tienen que sobrevivir a
  la compilación para actuar como su propio token de DI (ver
  [«Architecture rules»](../CLAUDE.md#architecture-rules)).
- **Dentro de un módulo, imports relativos** (`../../domain/user.entity`, no
  `@modules/users/domain/user.entity`): una ruta relativa sobrevive a que el módulo se mueva.
- **Sin barrels en `src/`.** Las 6 reglas de fronteras viven en
  [`eslint.boundaries.js`](../eslint.boundaries.js), compartido con su suite,
  [`eslint-boundaries.spec.ts`](../src/__tests__/eslint-boundaries.spec.ts). Su spec de diseño
  original se perdió en la reconstrucción del historial del 2026-08-08 (backlog #29), así que esos
  dos archivos son la única fuente.
- **Solo es importable la raíz de un paquete `@nestjs/*`.** `no-restricted-imports`, en
  [`eslint.config.mjs`](../eslint.config.mjs), prohíbe todo subpath (`^@nestjs/[^/]+/`, sin
  distinguir mayúsculas, `import type` incluido). Por qué: el mapa `exports` de Nest 12 mantiene
  hoy resolubles `./*` y `./internal`, pero un parche puede cerrarlos, como hizo
  `@nestjs/swagger` 11.4.3. Las claves de metadatos viven copiadas en
  [`nest-metadata.constants.ts`](../src/common/nest-metadata.constants.ts), y un tipo que la raíz
  no exporta se deriva de uno que sí (`CorsConfig` en
  [`cors.config.ts`](../src/config/cors.config.ts)). La prohibición alcanza también a los pocos
  subpaths que un paquete declara a propósito (`@nestjs/swagger/plugin`): hoy no se importa
  ninguno, y el día que haga falta, lleva un `eslint-disable-next-line` justificado. El
  `import()` dinámico es la única forma que la regla no ve. Spec:
  [`eslint-config.spec.ts`](../src/__tests__/eslint-config.spec.ts).
- **El pre-commit busca secretos.** lint-staged ejecuta `secretlint` (preset recommend,
  `enableIDScanRule: true`) sobre **todos** los archivos preparados para el commit, mediante la
  entrada comodín `"*": "secretlint --maskSecrets"`. Por qué: un secreto detectado bloquea el
  commit antes de que entre en el historial. La configuración es
  [`.secretlintrc.json`](../.secretlintrc.json), y su contrato vive en
  [`secretlint.spec.ts`](../src/__tests__/secretlint.spec.ts) (Tabla S, backlog #6).
- **«Deferred work»: el backlog.** [`docs/backlog.md`](./backlog.md) guarda el trabajo aplazado
  **con una decisión adjunta**, no olvidado. Es el gestor de incidencias, un papel que conserva
  ahora que el repo tiene remoto (`origin`, desde agosto de 2026), porque sus entradas llevan un
  razonamiento que el título de una issue de GitHub no lleva. Cada entrada registra qué pasa, el
  enfoque ya elegido y cómo se sabrá que está hecho: lee la entrada antes de reabrir la discusión.
  También registra lo que se cerró al verificarlo, para que nadie vuelva a investigar un
  no-problema.
