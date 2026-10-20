# Guarda de NESTJS-MAPPING — spec exprés

**Fecha:** 2026-10-19 · **Alcance:** `src/__tests__/` y
`.claude/skills/clean-ddd-hexagonal/references/NESTJS-MAPPING.md` · **Commit base:** `1423807`

## Objetivo

Que la referencia de código del repo no pueda dejar de cumplir el contrato de módulo ni dejar de
compilar sin que `pnpm test` se ponga rojo.

## Decisiones

### Del usuario

- **B1. Guarda completa** (C17 del cierre del contrato de módulo, opción B): el contrato y además
  `tsc`, con los tres bloques que la referencia importaba sin enseñarlos (el mapper, el DTO de
  respuesta y la entidad ORM del outbox). El coste, unos segundos más en cada `pnpm test`, está
  aceptado.
- **B2. Una sola ronda de preguntas**, junto con los casos del cierre (C1 y C22).

### Técnicas (mías)

- **T1. Extracción.** Cuenta cada valla ` ```ts ` cuya primera línea sea
  `// src/modules/billing/<ruta>`; la ruta es la clave del mapa. Se parte por `\r?\n`, porque un
  clon con `core.autocrlf=true` daría CRLF. Un bloque `ts` sin ruta, o una ruta repetida, pone el
  test en rojo: el mapa sobrescribiría en silencio.
- **T2. Un `__tests__` sintético**, `src/modules/billing/__tests__/billing.spec.ts` vacío. La clave
  `structure` exige un `.ts` en cada capa, y la referencia no enseña tests. Es lo único que se
  añade a lo extraído.
- **T3. `tsc` en memoria.**
  - Configuración: `ts.parseJsonConfigFileContent` sobre el `tsconfig.json` del repo, con
    `noEmit: true` y sin `incremental`.
  - Host: sirve las rutas virtuales bajo la raíz del repo y delega todo lo demás en el disco. Así
    los alias resuelven al kernel y a `common/` reales, y los paquetes a `node_modules`.
  - Raíces: solo los bloques. Se esperan cero diagnósticos en todo el programa.
  - Los archivos del disco (kernel, `common/`, declaraciones de `node_modules`) se parsean una
    sola vez para las dos compilaciones: con `oldProgram` la segunda costaba casi lo mismo que la
    primera (2,9 s frente a 3,4 s, medido); con la caché, 1,6 s.
- **T4. La rotura puntual se hace en memoria**, sobre el mapa extraído. El md no se toca para
  probarla.
- **T5. Lo que la guarda no ve queda escrito en la referencia.** Ni ESLint ni Prettier pasan por
  los bloques: `.claude/` está en `.prettierignore`, y ESLint solo mira `{src,test}`. Un
  `import type` de un puerto en un archivo con decoradores, por ejemplo, no lo detecta nadie.
- **T6. Los tres bloques nuevos calcan los reales:**
  - el mapper, de `order.mapper.ts`: guarda del `status`, que es un `varchar` sin `CHECK`, y
    `failClosed`;
  - el DTO, de `order-response.dto.ts`: `@ApiProperty` por campo y `fromDomain()` sobre
    `toSnapshot()`;
  - la entidad del outbox, de `outbox-message.orm-entity.ts`, con la tabla `billing_outbox`, que
    es del contexto;
  - tras la revisión adversarial, un cuarto bloque, `invoice-status.ts` (de `order-status.ts`),
    como fuente única de los estados para la entidad, el mapper y el DTO, y el `readVersion` del
    mapper (`version < 1` falla cerrado), que el primer borrador omitía. La guarda no puede ver
    ninguno de los dos: es comportamiento, no contrato ni tipos.
- **T7. El checker no se toca.** El spec usa `checkModuleContract` tal cual. Para la fila por clave
  lleva su propia tabla de qué ruta revisa cada clave: duplica un dato del checker, pero solo como
  fixture.

## Casos acordados

Tests de arquitectura: `CLAUDE.md` los deja exentos de la tabla, y aun así la llevan, a petición
del usuario. Los títulos van tal cual a los `it` de `src/__tests__/nestjs-mapping.spec.ts`.

| #   | Caso (se vuelve el it)                                                                            | Entrada / estado                                          | Resultado                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| N1  | debería declarar en cada bloque ts la ruta del archivo de billing que enseña, sin repetir ninguna | los bloques ` ```ts ` de la referencia                    | al menos uno; todos con ruta bajo `src/modules/billing/` y ninguna repetida                                  |
| N2  | debería darle a cada clave del contrato al menos un archivo que revisar                           | las rutas extraídas                                       | las diez claves casan con una ruta como mínimo (errores, filtro, controller, entidad, VO, caso de uso, ORM…) |
| N3  | debería cumplir el contrato de módulo como un módulo recién copiado                               | los bloques más el `__tests__` sintético                  | `checkModuleContract` devuelve `[]`                                                                          |
| N4  | debería ver la violación cuando un bloque rompe el contrato                                       | el filtro sin su `@Catch(InvoiceDomainError)`, en memoria | exactamente una violación: `filter` sobre `billing-domain-exception.filter.ts`                               |
| N5  | debería compilar sin diagnósticos con el tsconfig del repo                                        | los bloques en memoria, con el kernel y `common/` reales  | cero diagnósticos                                                                                            |
| N6  | debería ver el diagnóstico cuando falta el archivo que un bloque importa                          | el mapa sin el bloque del mapper                          | un `TS2307` en `invoice.typeorm.repository.ts` sobre `./invoice.mapper`                                      |

**Rojo por aserción:**

| Fila    | Cómo se pone roja                                                               | Por qué                                                                                    |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| N1 y N2 | con el extractor como stub (`() => new Map()`)                                  | el mapa vacío no tiene ningún bloque                                                       |
| N3      | con el stub, y además con un mutante a mano en el md (sin `@Catch`), restaurado | el `__tests__` sintético solo deja un contexto incompleto; el mutante prueba que lee el md |
| N5      | de verdad, antes de añadir los tres bloques: 4 `TS2307`                         | el md importa archivos que no enseña                                                       |
| N4 y N6 | con el stub, por la misma razón que N1                                          | sin bloques no hay nada que romper                                                         |

## Casos del cierre aprobados en la misma ronda

`.tmp/` no entra en git, así que se dejan escritos aquí.

| #   | Spec                                         | Caso (se vuelve el it)                                                          | Resultado                                                       |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| C1a | `users/…/email.vo.spec.ts`                   | debería rechazar una dirección válida seguida de texto extra                    | `Email.from('user@example.com@otro')` lanza `InvalidEmailError` |
| C1b | `orders/…/order-concept.vo.spec.ts`          | debería aceptar un concepto de exactamente 140 caracteres                       | `not.toThrow()` y el valor intacto                              |
| C1c | `orders/…/order-amount.vo.spec.ts`           | debería aceptar un importe igual al tope de 10 000 000 céntimos                 | `not.toThrow()` y el valor intacto                              |
| E1  | `orders/…/events/order-placed.event.spec.ts` | debería llevar el pedido, el cliente, el importe y el instante de la colocación | `{ ...event }` igual a los cuatro campos, `occurredAt` incluido |
| E2  | `orders/…/events/order-placed.event.spec.ts` | debería llamarse OrderPlaced, que es el event_type que escribe el outbox        | `event.constructor.name` igual a `'OrderPlaced'`                |

- Los tres de C1 se aprobaron el 2026-10-19 y matan los supervivientes del censo: el `$`, el `>=`
  de 140 y el `>=` del tope.
- C1b y C1c aceptan un valor. Con el mutante, `VO.from()` lanzaría en `// Act`, y el fallo sería
  por excepción. Por eso afirman `expect(act).not.toThrow()`, que falla por aserción (decidido el
  2026-10-19).
- El rojo de cada uno se demuestra con su mutante aplicado a mano, de uno en uno.
- E1 calca `order-cancelled.event.spec.ts`. Su rojo se ve quitando a mano una parameter property
  del evento.
- E2 lo pidió el usuario en la ronda del 2026-10-19: el nombre de la clase es el `event_type` de la
  fila del outbox, y hasta ahora solo lo fijaban los E2E. Su rojo se ve renombrando la clase a mano
  y exportándola con el nombre de antes (`keepClassNames` está en `.swcrc`). `OrderCancelled` sigue
  sin esa fila: añadírsela sería otro caso nuevo.

## Contrato

No aplica: no hay endpoint. El controller de `billing` es documentación y no se monta.

## Persistencia

No hay migración. La entidad ORM del outbox es documentación: no existe la tabla
`billing_outbox`, y el glob `*.orm-entity.ts` solo mira `src/modules/`, donde el md no está.

## Fuera de alcance

- El generador `pnpm module:new` (#38), que tendrá esta guarda como base.
- Lint y Prettier de los bloques (T5).
- La clave `filter` condicionada a que haya controllers, anotada en #38 para el primer contexto
  sin HTTP.
