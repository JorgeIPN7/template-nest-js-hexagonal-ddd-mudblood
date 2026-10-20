// stryker.config.mjs
/**
 * Mutation testing — el auditor del modelo «casos primero» (ver CLAUDE.md, sección «Flujo de
 * trabajo», y el skill /feature; la spec original, §4.5, se perdió en la reconstrucción del
 * historial del 2026-08-08 — backlog #29).
 *
 * `mutate` apunta solo a domain/ y application/ —de los módulos y del shared
 * kernel—: es donde viven los casos de negocio. Infra, config y wiring quedan
 * fuera a propósito — mutarlos mediría ruido, no contratos.
 *
 * `thresholds.break` YA no es null: el baseline existe y el umbral se fijó con
 * él (backlog #9). Medición del 2026-08-06 sobre el scope completo de `mutate`,
 * copiada de la salida de Stryker: **90.14 %** global — 192 killed, 0 timeout,
 * 19 survived, 2 sin cobertura, 5 error (el score es detectados/válidos =
 * 192/213; los `error` quedan fuera del denominador). Por módulo: `users`
 * 92.11 % (140/152) y `orders` 85.25 % (52/61).
 *
 * `break: 85` — el margen NO se reparte como sugiere la lista de scores por
 * módulo, porque cada uno pesa según su número de mutantes válidos, no según su
 * porcentaje. `users` aporta 152 de 213 (71 %) y `orders` 61 (29 %), así que:
 * `orders` tendría que desplomarse a ~67 % para tumbar el global él solo,
 * mientras que a `users` le bastaría con caer a ~84.9 % — 7 puntos. La amenaza
 * más cercana al umbral es una regresión en el módulo GRANDE, no en el que hoy
 * tiene el score más bajo. Ese es el margen real, y por eso 85 y no 88.
 *
 * Los 19 supervivientes conocidos están documentados con sus casos PROPUESTOS en
 * los planes de auth y orders: al aprobarse esas filas el score sube y el margen
 * crece — entonces, y solo entonces, tiene sentido subir el umbral.
 *
 * Remedición del 2026-08-07 (ciclo 1 del refactor de arquitectura, al entrar
 * `src/shared/domain/` en el scope): **91.48 %** — 204 killed, 0 timeout, 19
 * survived, 0 sin cobertura, 5 error (204/223). Los MISMOS 19 supervivientes: el
 * ciclo no tocó ningún caso de negocio. El kernel entra al 100 % (22/22:
 * `value-object.base.ts` 19, `aggregate-root.ts` 3), y por eso el global sube
 * pese a que `modules` baja de 192 a 182 mutantes matados — los ~10 que faltan no
 * se perdieron, se mudaron con `equals()`/`toString()` de `Email` y `UserId` a la
 * base. El umbral se queda en 85: la aritmética del margen no cambia, y subirlo a
 * cuenta de una capa nueva sería premiar una mudanza, no una mejora de casos.
 *
 * Remedición del 2026-08-07 (ciclo 2, puertos a `abstract class`): **91.48 %**, censo
 * de mutantes IDÉNTICO al de arriba (204 killed, 0 timeout, 19 survived, 0 sin
 * cobertura, 5 error). Se esperaba una subida —los 6 `Symbol('X')` salían del scope y
 * su literal parecía mutable— y NO la hubo. Motivo, medido y no supuesto: Stryker no
 * muta el argumento string de `Symbol(...)`. Comprobado reintroduciendo
 * `Symbol('PASSWORD_HASHER')` en `password-hasher.ts` y corriendo con `--mutate` sobre
 * ese único archivo: sigue dando 1 mutante (el de `DUMMY_PASSWORD_HASH`), no 2. Esos
 * seis tokens nunca estuvieron en el censo, así que quitarlos no podía mover el score.
 * Lo que sí cambia es la forma del scope: los cuatro puertos que hoy son `abstract
 * class` pura ya no aparecen en el informe — cero mutantes, nada que auditar en ellos.
 *
 * Remedición del 2026-08-07 (ciclo 4, `auth` como bounded context propio con la credencial):
 * **92.78 %** — 257 killed, 0 timeout, 20 survived, 0 sin cobertura, 8 error (257/277). Sube
 * 1.3 puntos y el censo CRECE por primera vez en el refactor: +54 mutantes válidos, todos del
 * módulo nuevo (`auth` entra al **100 %**, 41/41). Los survivors bajan de 19 a 20… y luego a
 * 20 tras matar uno: el primer pase dejó vivo el mensaje de `InvalidPasswordHashError`
 * —`not.toContain(password)` se satisface igual con la cadena vacía— y se mató fijando la
 * igualdad exacta, que además es contrato (ese texto viaja en el 400 del filtro de auth). Los
 * 20 restantes son los MISMOS de siempre, ahora repartidos entre `users` (11) y `orders` (9):
 * mensajes de error sin aserción de igualdad y regex a las que se les quita el ancla.
 *
 * El umbral se queda en 85. La aritmética del margen mejora —`users` pasa de aportar el 71 %
 * de los mutantes al 56 %, así que ya no puede tumbar el global él solo con una caída de 7
 * puntos— pero subir el techo a cuenta de un módulo que nace con casos frescos premiaría el
 * momento, no la disciplina. Se revisa cuando los 20 survivors conocidos tengan casos
 * aprobados.
 *
 * Remedición del 2026-08-07 (ciclo 3, `commands/`+`queries/`+`handlers/` colapsados en
 * `use-cases/` con el input colocado): **91.48 %**, censo de nuevo IDÉNTICO (204 killed, 0
 * timeout, 19 survived, 0 sin cobertura, 5 error) y los MISMOS 19 supervivientes. Era lo
 * esperado por partida doble: los 6 command/query borrados eran constructores con
 * parameter properties —cuerpo vacío, nada que mutar— y los `XInput` que los sustituyen son
 * `type`, borrados en compilación. El scope sí cambia de forma: `application/` de users pasa
 * a leerse `use-cases/` (29 mutantes, 100 %) + `users.facade.ts` (9, 90 %), que es
 * exactamente la separación que el ciclo quería hacer visible.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Remedición del 2026-08-19. **El censo de arriba estaba caduco y nadie lo había notado**, que
 * es el defecto que esta entrada arregla: las cuatro remediciones anteriores razonan sobre 277
 * mutantes válidos y el número real es **296**. La causa es `42ea415`, el bump de
 * `@stryker-mutator/core` 9.6.1 → 10.0.0 — un MAJOR que tocó solo `package.json` y el lockfile,
 * sin rehacer la aritmética que este archivo declara obligatoria por ciclo. Un cambio de major
 * en el instrumentador es exactamente el evento que mueve el censo.
 *
 * Medido con `pnpm test:mutation` sobre el scope completo, copiado de la salida de Stryker:
 * **93.24 %** global — 276 killed, 0 timeout, 20 survived, 0 sin cobertura, 7 error (276/296).
 * Por módulo, con su peso en mutantes válidos, que es lo que de verdad reparte el margen:
 *
 *     auth     100.00 %   47/47     ( 47 válidos, 15.9 % del censo)
 *     users     93.21 %  151/162    (162 válidos, 54.7 %)
 *     orders    85.94 %   55/64     ( 64 válidos, 21.6 %)
 *     shared   100.00 %   23/23     ( 23 válidos,  7.8 %)
 *
 * Los +19 mutantes respecto al censo documentado están TODOS matados (killed 257 → 276,
 * survived 20 → 20), así que caen en código que los casos ya cubrían. La hipótesis es que
 * Stryker 10 añadió mutadores; no se ha comprobado cuál, y se deja escrito como hipótesis y no
 * como hecho.
 *
 * Los 20 supervivientes siguen siendo los mismos de siempre y con la misma forma —mensajes de
 * error sin aserción de igualdad y regex a las que se les quita el ancla—, repartidos entre
 * `users` (11: `users.facade.ts` 5, `user.errors.ts` 3, `email.vo.ts` 1, `user-id.vo.ts` 2) y
 * `orders` (9: `order.errors.ts` 4, `order-concept.vo.ts` 2, `order-id.vo.ts` 2,
 * `order-amount.vo.ts` 1).
 *
 * ⚠️ Los timeouts: **0 en esta corrida, pero no siempre.** El informe HTML de la corrida
 * ANTERIOR registraba 4 timeouts en `shared/domain/value-object.base.ts`, y esta corrida los
 * mata. El score no se mueve un ápice —Stryker cuenta el timeout como detectado, así que los
 * dos casos dan 276 detectados de 296 y 93.24 %— pero conviene tenerlo escrito: esos mutantes
 * son sensibles a la carga de la máquina y su estado bascula entre Killed y Timeout entre
 * corridas. Si un día aparecen como timeout, no es una regresión ni un caso perdido.
 *
 * **El umbral se queda en `break: 85`.** Con 93.24 % el margen es de 8.24 puntos y, a diferencia
 * de lo que se temía, es margen de kills y no de timeouts. Aritmética del margen: hacen falta
 * ≥252 detectados para no romper (85 % de 296), así que caben 24 kills perdidos antes del rojo.
 * Ningún módulo puede tumbar el global él solo sin un desplome grande —`orders` tendría que caer
 * de 85.94 % a ~48 %, `users` de 93.21 % a ~78 %—, pero ya no hay ninguno inofensivo: llevar
 * `auth` a 0 bastaría, porque sus 47 mutantes superan los 24 de holgura. Subir el techo se sigue
 * aplazando hasta que los 20 supervivientes conocidos tengan casos aprobados: subirlo antes
 * premiaría el momento del censo, no la disciplina.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Remedición del 2026-09-25 (NestJS 11 → 12, que obliga a correr Jest con
 * `--experimental-vm-modules` — ver `testRunnerNodeArgs` abajo). Cambia el runtime de cada
 * corrida, que es justo el evento que esta cabecera manda remedir. Tres corridas, copiadas de la
 * salida de Stryker:
 *
 *     corrida 1   93.24 %   258 killed, 18 timeout, 20 survived, 0 sin cobertura, 7 error
 *     corrida 2   93.24 %   259 killed, 17 timeout, 20 survived, 0 sin cobertura, 7 error
 *     corrida 3   93.24 %   262 killed, 14 timeout, 20 survived, 0 sin cobertura, 7 error
 *
 * (la tercera, ya con todo el PR aplicado: el reparto killed/timeout baila con la carga).
 *
 * **Censo y score idénticos a la medición del 2026-08-19** (276 detectados de 296, los MISMOS
 * 20 supervivientes, mismos scores por módulo). Lo que cambia es el reparto entre killed y
 * timeout: 14-18 mutantes que antes morían por aserción ahora agotan el timeout, en los mismos
 * archivos en las dos primeras corridas (`user.entity.ts` 6, `email.vo.ts` 3, `shared/domain` 8-9). Stryker los
 * cuenta como detectados, así que no mueven el score. Solo los de `shared/domain`
 * (`value-object.base.ts`) son la familia que ya basculaba entre Killed y Timeout (⚠️ de
 * arriba, que registraba 4); los 9 de `user.entity.ts` y `email.vo.ts` salen como timeout por
 * primera vez con el cambio a VM modules. La causa medida es de coste, no de casos: el dry run
 * pasa de 1.4 s a 2.5-2.7 s de overhead y la corrida entera de ~40 s a ~1 min 30 s — el
 * cargador de VM modules es más lento que el CJS de antes.
 *
 * El umbral y su aritmética no cambian (≥252 detectados de 296). Si un día esos timeouts se
 * volvieran «survived», eso sí sería una regresión: significaría que el test dejó de detectar
 * el mutante, no que tardó más.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Remedición del 2026-09-30 (cancelación de pedidos, `POST /orders/:id/cancel`). El censo crece
 * por primera vez desde el ciclo 4: **+37 mutantes válidos, todos de `orders`**. Medido con
 * `pnpm test:mutation` sobre el scope completo y la máquina sin otra carga —una corrida anterior,
 * con la suite unitaria en paralelo, subió los timeouts y contó como detectados 2 supervivientes
 * de `users`—, copiado de la salida de Stryker:
 * **95.20 %** global — 295 killed, 22 timeout, 16 survived, 0 sin cobertura, 7 error (317/333).
 *
 *     auth     100.00 %   47/47     ( 47 válidos, 14.1 % del censo)
 *     users     93.21 %  151/162    (162 válidos, 48.6 %)
 *     orders    95.05 %   96/101    (101 válidos, 30.3 %)
 *     shared   100.00 %   23/23     ( 23 válidos,  6.9 %)
 *
 * Los supervivientes bajan de 20 a 16, todos en `orders`:
 *
 * - `order-id.vo.ts` pasa de 2 a 0: dos casos nuevos fijan las anclas de la regex, que ahora
 *   valida el `:id` del endpoint.
 * - `order.errors.ts` pasa de 4 a 2: los tests del filter y del mapper publican los mensajes de
 *   `InvalidOrderIdError` e `InvalidOrderAmountError`.
 *
 * Los 11 de `users` son los mismos de siempre. El código nuevo de la cancelación entra al 100 %
 * (`pnpm test:mutation:changed`: 36/36).
 *
 * **El umbral se queda en `break: 85`, y el margen crece.** Hacen falta ≥284 detectados (85 % de
 * 333), así que caben 33 kills perdidos antes del rojo, frente a los 24 de antes. Para tumbar el
 * global él solo:
 *
 * - `orders` tendría que caer de 95.05 % a ~61 %;
 * - `users`, de 93.21 % a ~72 %;
 * - `auth`, a ~28 %;
 * - `shared`, con 23 mutantes, ya no puede.
 *
 * Subir el techo sigue aplazado hasta que los 16 supervivientes conocidos tengan casos
 * aprobados.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Remedición del 2026-10-01 (arreglos de las revisiones de los PR #90 y #91). Cambió la mecánica
 * de la corrida, que es el evento que esta cabecera manda remedir: `test/stryker-setup.ts` fija la
 * semilla de fast-check, y sin ella las filas `P` no mataban nada bajo `perTest` —el título del test
 * llevaba la semilla de Jest, cambiaba de una corrida a otra y Stryker no lo encontraba—. Copiado
 * de la salida de Stryker: **96.70 %** global — 288 killed, 34 timeout, 11 survived, 0 sin
 * cobertura, 6 error (322/333).
 *
 *     auth     100.00 %   47/47     ( 47 válidos, 14.1 % del censo)
 *     users     95.09 %  155/163    (163 válidos, 48.9 %)
 *     orders    97.00 %   97/100    (100 válidos, 30.0 %)
 *     shared   100.00 %   23/23     ( 23 válidos,  6.9 %)
 *
 * Los supervivientes bajan de 16 a 11 **sin un solo caso nuevo**: eran mutantes que una fila de
 * propiedad ya mataba y Stryker daba por vivos. Murieron `email.vo.ts` 1, `user.errors.ts` 2,
 * `order.errors.ts` 1 y el `< 1` de `order-concept.vo.ts`. Quedan `users.facade.ts` 5,
 * `user-id.vo.ts` 2 (las anclas de la regex), `user.errors.ts` 1, `order-concept.vo.ts` 1 (`> 140` →
 * `>= 140`: ningún caso usa exactamente 140 caracteres), `order-amount.vo.ts` 1 (el tope) y
 * `order.errors.ts` 1. `orders` pasa de 101 a 100 mutantes válidos porque su código cambió —el caso
 * de uso de la cancelación lee ahora acotado por dueño—, así que ese módulo no es comparable
 * mutante a mutante con la medición anterior. Los 34 timeouts (22 el 2026-09-30) son la familia
 * sensible a la carga de arriba y cuentan como detectados.
 *
 * El umbral se queda en `break: 85`: hacen falta ≥284 detectados (85 % de 333), así que caben 38
 * kills perdidos antes del rojo. Subirlo sigue aplazado hasta que los 11 supervivientes tengan casos
 * aprobados.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Remedición del 2026-10-19 (contrato base de módulo: el kernel gana `DomainError`, `Entity` y
 * `UuidIdentifier`, y `users`, `orders` y `auth` pasan al contrato). Cambia el código que muta el
 * scope en los cuatro módulos, que es el evento que esta cabecera manda remedir. Medido con
 * `pnpm test:mutation --concurrency 6` y la máquina sin otra carga: con la concurrencia por
 * defecto (11 workers de ~1,8 GB) la corrida se quedó sin memoria y no terminó. Copiado de la
 * salida de Stryker: **99.15 %** global — 346 killed, 6 timeout, 3 survived, 0 sin cobertura,
 * 5 error (352/355).
 *
 *     auth     100.00 %   57/57     ( 57 válidos, 16.1 % del censo)
 *     users     99.33 %  149/150    (150 válidos, 42.3 %)
 *     orders    97.78 %   88/90     ( 90 válidos, 25.4 %)
 *     shared   100.00 %   58/58     ( 58 válidos, 16.3 %)
 *
 * Los supervivientes bajan de 11 a 3:
 *
 * - `users.facade.ts` pasa de 5 a 0. Uno ya había muerto antes de esta remedición (la primera
 *   pasada de `test:mutation:changed` de hoy daba 4); por el diff, lo mata el caso de la Task 7
 *   que fija que una búsqueda previa con un error que no es de dominio se relanza. Otro lo mata un
 *   caso nuevo: un email malformado no llega a consultar el repositorio, cuyo fake en memoria
 *   tapaba el `catch` vacío. Los otros tres son equivalentes y van marcados con `Stryker disable`: el `if (true)` de los dos
 *   `catch` (`Email.from` y `UserId.from` solo lanzan su propio error) y el `catch` vacío de
 *   `parseUserId`, que devuelve `undefined` y sus llamadores tratan como `null`. La directiva
 *   excluye también el `if (false)` de esas dos líneas, que sí muere: por eso hay 2 válidos menos
 *   de los que quita la equivalencia.
 * - `user-id.vo.ts` pasa de 2 a 0: la regex se fue a `uuid-identifier.base.ts`, donde los casos
 *   del kernel matan sus anclas.
 * - `user.errors.ts` (1) y `order.errors.ts` (1) pasan a 0: sus specs fijan ya cada mensaje.
 * - Siguen `order-concept.vo.ts` 1 (`> 140` → `>= 140`) y `order-amount.vo.ts` 1 (el tope).
 * - **Aparece `email.vo.ts` 1**, el `$` de la regex: ningún caso fijo lleva texto válido seguido
 *   de algo más (`user@example.com@otro`). El 2026-10-01 estaba muerto. Hipótesis, sin medir: lo
 *   mataba por azar una fila de propiedad, y las propiedades nuevas de este cambio desplazaron la
 *   secuencia de la semilla fija (`test/stryker-setup.ts`). Este cambio no tocó ese archivo.
 *
 * El censo crece en 22 válidos (333 → 355). Por módulo, los conteos están medidos y el reparto
 * sale de leer el diff, no de comparar mutante a mutante: `shared` gana 35 con las tres bases
 * nuevas; `users` pierde 13 y `orders` 10, porque la regex y el `randomUUID()` de `UserId` y
 * `OrderId` pasan a `UuidIdentifier`, el `this.name = new.target.name` de sus raíces pasa a
 * `DomainError`, `placedAt` desaparece y la fachada deja 5 ignorados; `auth` gana 10 con
 * `CredentialId` e `InvalidCredentialIdError`. Los timeouts bajan de 34 a 6 por la concurrencia
 * menor: es la familia sensible a la carga de arriba.
 *
 * El umbral se queda en `break: 85`: hacen falta ≥302 detectados (85 % de 355), así que caben 50
 * kills perdidos antes del rojo. Para tumbar el global él solo:
 *
 * - `users` tendría que caer de 99.33 % a ~65 %;
 * - `orders`, de 97.78 % a ~41 %;
 * - `shared`, a ~12 %;
 * - `auth`, a ~11 %.
 *
 * Subirlo sigue aplazado hasta que los 3 supervivientes tengan casos aprobados.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Remedición del 2026-10-19, cierre del contrato de módulo: los casos de los 3 supervivientes (el
 * `$` de `email.vo.ts` con `user@example.com@otro`, el concepto de 140 y el tope de 10 000 000),
 * las factorías de los specs que construían errores al recolectar y la config de abajo
 * (`concurrency` y `timeoutMS`). Medido con `pnpm test:mutation` SIN flag y la máquina sin otra
 * carga: la concurrencia la pone ya la config (6 workers en esta máquina de 12 CPU), y la corrida
 * terminó en 13 min 11 s. Copiado de la salida de Stryker: **100.00 %** global — 354 killed,
 * 6 timeout, 0 survived, 0 sin cobertura, 0 error (360/360).
 *
 *     auth     100.00 %   61/61     ( 61 válidos, 16.9 % del censo)
 *     users    100.00 %  150/150    (150 válidos, 41.7 %)
 *     orders   100.00 %   90/90     ( 90 válidos, 25.0 %)
 *     shared   100.00 %   59/59     ( 59 válidos, 16.4 %)
 *
 * - Los 3 supervivientes mueren con sus casos nuevos; el rojo por aserción de cada uno se comprobó
 *   aplicando el mutante a mano.
 * - Los 5 errores pasan a válidos y muertos (`auth` gana 4 y `shared` 1): los specs construían el
 *   error o el VO al recolectar, y un mutante que lanzaba tumbaba la carga del archivo.
 * - Siguen 6 timeouts, pero no los mismos. Los 3 de `user.errors.ts` salen ahora muertos; quedan 4
 *   de `entity.base.ts` (líneas 49, 53, 57 y 58), el constructor vacío de `domain-error.ts`, que
 *   antes era uno de los errores, y el `throw` vaciado de `email.vo.ts:18`. No son cuelgues ni
 *   tests lentos, medido: aplicados a mano, en Jest sin Stryker los seis caen en segundos (7-9 s de
 *   pared para todos los specs relacionados, ningún test pasa de 0,7 s), casi todos por aserción,
 *   y `entity.base.ts` solo, con `--timeoutMS 60000`, da 18 de 18 muertos. Lo lento es la corrida
 *   dentro de Stryker con el censo entero cargando la máquina; la causa exacta en el runner no está
 *   aislada (Stryker no guarda la duración de cada mutante). El presupuesto no sube más: cuentan
 *   como detectados igual, ya se sabe qué test mata a cada uno, y subirlo solo alargaría un cuelgue
 *   de verdad.
 *
 * Dos correcciones a la entrada anterior, sin reescribirla:
 *
 * - Ninguna fila de propiedad pudo matar nunca el `$` de `email.vo.ts`, por mucho que la semilla
 *   se desplazara: las arbitrarias solo generan direcciones válidas, y el mutante es estático. Lo
 *   compatible con los datos es que el 2026-10-01 saliera Timeout y contara como detectado (aquel
 *   día hubo 34), pero no queda informe para comprobarlo.
 * - Los 6 timeouts de aquella corrida no eran «la familia sensible a la carga de arriba»: estaban
 *   en `entity.base.ts` (3) y `user.errors.ts` (3), no en los VOs. Que bajaran de 34 a 6 por la
 *   concurrencia menor tampoco está medido: la corrida del 2026-10-01 no dejó constancia de la
 *   suya.
 *
 * El umbral sube a `break: 90`, con `high: 95` y `low: 90`: hacen falta ≥324 detectados (90 % de
 * 360), así que caben 36 kills perdidos antes del rojo. Para tumbar el global él solo:
 *
 * - `users` tendría que caer de 100 % a ~75 %;
 * - `orders`, a ~59 %;
 * - `auth`, a ~39 %;
 * - `shared`, a ~37 %.
 *
 * `pnpm test:mutation:changed` aplica el mismo umbral a los mutantes de un cambio: con 90, un solo
 * superviviente lo tumba con 9 válidos o menos (con 85 era con 6 o menos). El aviso de ese caso
 * sale ya de este número (`singleSurvivorBreaks` en `scripts/mutation-targets.mjs`), no de un 85
 * escrito a mano.
 */
import { availableParallelism } from 'node:os';

import unitJestConfig from './jest.config.mjs';

const cpus = availableParallelism();

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  // El default (`['@stryker-mutator/*']`) expande el glob contra el realpath de
  // @stryker-mutator/core, que con el layout aislado de pnpm es su carpeta de
  // `.pnpm` — allí solo viven las dependencias de core, nunca el jest-runner.
  // Un nombre explícito evita el glob: se resuelve con `import()` normal, que sí
  // alcanza el `node_modules` raíz del proyecto. Sin esta línea: «Cannot find
  // TestRunner plugin "jest"».
  plugins: ['@stryker-mutator/jest-runner'],
  testRunner: 'jest',
  // Mismo flag que los scripts `test*` de `package.json`, y por el mismo motivo: desde NestJS
  // 12 los `@nestjs/*` 12.x son ESM puro, y el loader de Jest solo hace `require()` de un ESM si
  // Node arranca con `--experimental-vm-modules` (ver el comentario de `jest.config.mjs`). El
  // runner vive en un proceso hijo que NO hereda los flags del `node` que lanza `stryker run`,
  // así que hay que pasárselo aquí; sin él, el dry run inicial aborta al cargar el primer spec.
  testRunnerNodeArgs: ['--experimental-vm-modules'],
  jest: {
    projectType: 'custom',
    configFile: 'jest.config.mjs',
    enableFindRelatedTests: true,
    // El jest-runner mezcla `config` sobre la del archivo de forma SUPERFICIAL: un `setupFiles`
    // aquí sustituye al de `jest.config.mjs`, así que se parte del suyo. `stryker-setup.ts` fija
    // la semilla de fast-check, sin la que las filas de propiedad no matan nada (ver el archivo).
    //
    // `cacheDirectory` dentro del sandbox (`<rootDir>` es el sandbox): cada corrida tiene una
    // ruta distinta, así que su caché de Jest nunca se reutiliza, y en el temp del sistema se
    // acumulaba sin que nadie la borrara (422 MB medidos el 2026-10-01). Aquí se va con él.
    config: {
      setupFiles: [...unitJestConfig.setupFiles, '<rootDir>/test/stryker-setup.ts'],
      cacheDirectory: '<rootDir>/.jest-cache',
    },
  },
  mutate: [
    'src/modules/*/domain/**/*.ts',
    'src/modules/*/application/**/*.ts',
    // El shared kernel es dominio: mismo criterio que `src/modules/*/domain`, solo que sin
    // dueño. Dejarlo fuera no habría sido «no medir código nuevo» sino PERDER auditoría ya
    // conseguida: `equals()` y `toString()` vivían en `Email` y `UserId` —dentro del scope— y
    // al subirlos a `ValueObject` se habrían salido de él. El score habría subido sin que
    // nadie probara nada más, que es exactamente el fallo de un auditor mal apuntado.
    'src/shared/domain/**/*.ts',
  ],
  // Techo de workers. El default de Stryker 10 es n-1 con más de 4 CPU: en una máquina de 12
  // son 11 workers de ~1,8 GB, y el 2026-10-19 la corrida completa se quedó sin memoria y no
  // terminó (cabecera, «Remedición del 2026-10-19»); con 6 terminó. Se replica la fórmula del
  // default y solo se le pone techo, así que con pocas CPU no cambia nada: el runner público de
  // GitHub (4 CPU según su documentación) sigue en 4, donde un `'50%'` lo habría bajado a 2. Lo
  // heredan `test:mutation:changed` y todas las skills, y `--concurrency N` sigue mandando.
  concurrency: Math.min(6, cpus > 4 ? cpus - 1 : cpus),
  // Presupuesto fijo por mutante, por encima del default de 5000 ms (el total es
  // `timeoutFactor × netTime + timeoutMS` más el overhead del dry run). Con la máquina cargada,
  // mutantes que mueren por aserción en pocos segundos se pasaban de tiempo y salían Timeout: se
  // contaban como detectados sin que ningún test los distinguiera (cabecera, remedición del
  // cierre). Solo alarga la corrida en un mutante que cuelgue de verdad.
  timeoutMS: 10_000,
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html'],
  thresholds: { high: 95, low: 90, break: 90 },
  tempDirName: '.stryker-tmp',
  // `true` (el default) solo borra los sandboxes tras una corrida con éxito, y una que no llega al
  // umbral cuenta como fallida: cada `break` dejaba una copia del repo en `.stryker-tmp/`.
  cleanTempDir: 'always',
};

export default config;
