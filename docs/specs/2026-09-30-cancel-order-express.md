# Cancelar un pedido — spec exprés

**Fecha:** 2026-09-30 · **Contexto:** `orders` · **Commit base:** `5263e50`

## Objetivo

Que un cliente autenticado pueda cancelar sus propios pedidos colocados, dejando constancia del
instante y publicando `OrderCancelled` por el outbox.

## Decisiones

### De negocio (del usuario)

- **B1.** Dos estados: `placed` y `cancelled`. Cualquier pedido `placed` se puede cancelar, sin ventana temporal.
- **B2.** Cancelar un pedido ya cancelado es idempotente: 200 con el pedido tal cual, su `cancelledAt` original y sin segundo evento.
- **B3.** Un cliente desactivado o borrado con un token todavía válido no puede cancelar: 403, como en `POST /orders`.
- **B4.** Concurrencia con versión optimista en el agregado.
- **B5.** El pedido de otro cliente responde 404, idéntico al de un pedido inexistente.
- **B6.** `POST /orders/:id/cancel`, que responde 200 con el pedido. Sin motivo de cancelación. Migración aditiva.

### Técnicas (mías)

- **T1. Versión esperada.** El agregado lleva la `version` con la que se leyó (0 = nunca guardado). El adaptador: con versión 0 hace `INSERT` con versión 1; si no, `UPDATE … SET status, cancelled_at, version = v + 1 WHERE id = … AND version = v`. Con 0 filas afectadas lanza `OrderVersionConflictError` dentro de la transacción, así que el outbox tampoco se escribe.
- **T2. ⚠️ Quien pierde la carrera recibe 200, no 409.** Al combinar B2 y B4, el caso de uso reintenta **una vez** ante `OrderVersionConflictError`: relee el pedido y vuelve a aplicar `cancel()`. Como `cancel()` es idempotente, el perdedor de un doble clic recibe 200 con el `cancelledAt` del ganador y no se emite un segundo evento. Solo si el reintento también choca responde 409. Solo se reintenta ante un conflicto; cualquier otro fallo se propaga tal cual.
- **T3. La idempotencia vive en el dominio:** `cancel()` sobre un pedido cancelado no hace nada. El caso de uso solo guarda si el agregado produjo eventos.
- **T4. La propiedad del pedido se comprueba en el caso de uso, no en el dominio.** Que el pedido de otro no exista para ti es una regla de visibilidad. Los dos caminos lanzan el mismo `OrderNotFoundError`, con el mismo mensaje, y cuestan lo mismo: una lectura.
- **T5. El directorio de clientes se consulta antes que nada**, igual que en `PlaceOrderUseCase`.
- **T6. `cancelledAt` se omite en vez de valer `null`.** El contract guard (Ajv) ignora `nullable`, como documenta su propio comentario, así que un ejemplo con `null` rompería la build. La clave solo aparece cuando `status` vale `cancelled`.
- **T7. `ORDER_STATUSES`** es una constante más una unión, con el patrón de `USER_ROLES`. La columna es un `varchar` sin `CHECK` y el mapper confía en ella, como hace con `role`.
- **T8. El payload del outbox es el propio evento expandido** (`{ ...event }`) en vez de listar los campos, porque ahora hay dos tipos de evento. Las dos clases son planas y `JSON.stringify` convierte las fechas a ISO.
- **T9. `version` no se expone en la respuesta**, así que no hay `ETag` ni `If-Match`.

## Casos acordados

### Dominio

| #   | Caso (se vuelve el it)                                                                                          | Entrada / estado                              | Resultado                                                 |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| D1  | debería colocar el pedido en estado placed, sin fecha de cancelación y sin versión guardada                     | `Order.place()`                               | `status: 'placed'`, `cancelledAt: null`, `version: 0`     |
| D2  | debería cancelar un pedido colocado con el instante de la cancelación                                           | pedido `placed`, `cancel(T)`                  | `status: 'cancelled'`, `cancelledAt: T`                   |
| D3  | debería emitir OrderCancelled con el pedido, el cliente y el instante al cancelar                               | pedido `placed`, `cancel(T)`                  | `[OrderCancelled(id, customerId, T)]`                     |
| D4  | debería dejar intacto un pedido ya cancelado, con su fecha de cancelación original y sin emitir evento          | cancelado en T1, `cancel(T2)`                 | `cancelledAt: T1`, sin eventos                            |
| D5  | debería reconstruir un pedido cancelado con su estado, su fecha de cancelación y su versión, sin emitir eventos | `rehydrate(cancelled, T, versión 3)`          | snapshot con esos valores, sin eventos                    |
| P1  | debería emitir un único OrderCancelled y conservar la primera fecha por muchas veces que se cancele             | `placed`, `cancel(t1…tn)` con n ≥ 1 instantes | un solo evento, `cancelledAt: t1`                         |
| D6  | debería definir exactamente los estados placed y cancelled                                                      | `ORDER_STATUSES`                              | `['placed', 'cancelled']`                                 |
| D7  | debería llevar el pedido, el cliente y el instante de la cancelación                                            | `new OrderCancelled(…)`                       | los tres campos                                           |
| D8  | debería identificar en su mensaje el pedido que no se encontró                                                  | `OrderNotFoundError(id)`                      | `Order <id> was not found`, `orderId`                     |
| D9  | debería identificar en su mensaje el pedido que cambió a la vez                                                 | `OrderVersionConflictError(id)`               | `Order <id> was modified concurrently, retry the request` |

### Aplicación: `CancelOrderUseCase`

| #   | Caso (se vuelve el it)                                                                                | Entrada / estado                                 | Resultado                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| A1  | debería cancelar el pedido del cliente y guardarlo con su OrderCancelled en la misma llamada          | pedido propio `placed`                           | 1 `save(order, [OrderCancelled])`                                |
| A2  | debería devolver el pedido cancelado con su fecha de cancelación                                      | pedido propio `placed`                           | `status: 'cancelled'`, `cancelledAt` es una `Date`               |
| A3  | debería devolver tal cual un pedido ya cancelado, con su fecha original y sin guardar nada            | pedido propio cancelado en T1                    | `cancelledAt: T1`, 0 `save`                                      |
| A4  | debería rechazar como inexistente un pedido que no existe                                             | id desconocido                                   | `OrderNotFoundError`                                             |
| P2  | debería rechazar el pedido de otro cliente con el mismo error y el mismo mensaje que uno inexistente  | cualquier pedido ajeno                           | misma clase y mismo mensaje que con ese id inexistente; 0 `save` |
| A5  | debería rechazar al cliente que ya no existe o está inactivo sin tocar el pedido                      | el directorio responde `false`                   | `CustomerGoneError`; el pedido sigue `placed`; 0 `save`          |
| A6  | debería rechazar un id de pedido mal formado                                                          | `'no-es-uuid'`                                   | `InvalidOrderIdError`                                            |
| A7  | debería devolver el pedido ya cancelado sin un segundo evento cuando otro proceso lo cancela a la vez | lectura obsoleta en v1; el ganador lo dejó en v2 | `cancelledAt` del ganador; ningún `save` más                     |
| A8  | debería rendirse con un conflicto si el pedido vuelve a cambiar durante el reintento                  | `save` choca dos veces                           | `OrderVersionConflictError`; exactamente 2 intentos              |
| A9  | debería propagar sin reintentar un fallo de guardado que no es de concurrencia                        | `save` falla con otro error                      | ese error; 1 solo intento                                        |
| A10 | debería rechazar al cliente que ya no existe antes de validar o leer el pedido                        | directorio vacío, id `'no-es-uuid'`              | `CustomerGoneError`; `findById` no se llama                      |

A10 se añadió tras la revisión adversarial y fue aprobado: fija T5, que ningún caso fijaba.

La infraestructura (mapper, adaptador, filter, DTO, controller y E2E) no lleva tabla, pero sí
tests: el adaptador contra PostgreSQL real, con dos copias obsoletas del mismo pedido para la
versión optimista.

## Contrato

`POST /api/v1/orders/:id/cancel`, con `@Auth()` y sin body. `operationId: cancelOrder`.

| Código    | Motivo                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------- |
| 200       | Pedido cancelado, o ya lo estaba (B2). Envelope con el pedido: `status: 'cancelled'` y `cancelledAt` |
| 400       | El `id` no es un UUID v4: `"no-es-uuid" is not a valid order id`                                     |
| 401       | Sin token o con un token inválido (`@Auth()`)                                                        |
| 403       | El cliente del token ya no existe o está inactivo: `Forbidden`                                       |
| 404       | El pedido no existe o es de otro cliente, con el mismo cuerpo: `Order <id> was not found`            |
| 409       | El pedido cambió a la vez durante el reintento (T2)                                                  |
| 429 / 500 | Estándar (`@ApiStandardErrors()`)                                                                    |

**⚠️ Cambio en una respuesta que ya existe:** `OrderResponseDto` gana `status` (`'placed' |
'cancelled'`), siempre presente, y `cancelledAt`, solo cuando está cancelado. El 201 de
`POST /orders` pasa a incluir `status: 'placed'`. Es un cambio aditivo.

## Persistencia

Migración **aditiva** sobre `orders`, sin expand/contract:

- `status varchar(20) NOT NULL DEFAULT 'placed'`
- `cancelled_at timestamptz NULL`
- `version integer NOT NULL DEFAULT 1`

Los `DEFAULT` hacen que las réplicas viejas sobrevivan durante el despliegue, porque su `INSERT`
solo enumera las columnas que conocen. `OrderCancelled` va a la misma tabla `orders_outbox`, y el
relay no cambia.

## Fuera de alcance

- Motivo de cancelación, cancelación por un admin y ventana temporal.
- `GET /orders` y `GET /orders/:id`.
- `ETag` / `If-Match`.
- Consumidores de `OrderCancelled`, como reembolsos.
- Un E2E HTTP de la carrera: no sería determinista. La cubren el E2E del adaptador y A7.
