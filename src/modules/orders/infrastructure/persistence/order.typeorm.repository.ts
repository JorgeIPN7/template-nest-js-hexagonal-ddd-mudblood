import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository, type QueryDeepPartialEntity } from 'typeorm';

import type { Order, OrderEvent } from '../../domain/entities/order.entity';
import { OrderVersionConflictError } from '../../domain/errors/order.errors';
import type { OrderId } from '../../domain/value-objects/order-id.vo';
import { OrderRepository } from '../../domain/ports/order.repository';

import { OrderMapper } from './order.mapper';
import { OrderOrmEntity } from './order.orm-entity';
import { OutboxMessageOrmEntity } from './outbox-message.orm-entity';

/** `unique_violation` de PostgreSQL: https://www.postgresql.org/docs/current/errcodes-appendix.html */
const PG_UNIQUE_VIOLATION = '23505';

// Copia de la de `user.typeorm.repository.ts`: un módulo no puede importar de otro, y tres
// líneas no justifican un módulo compartido de infraestructura.
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION;

/**
 * Adaptador de salida. `save` escribe la orden Y sus filas de outbox dentro de
 * `dataSource.transaction` (`db-use-transactions`): si cualquiera de las dos escrituras
 * falla, ninguna queda — eso es lo que convierte la tabla en un outbox y no en un log
 * optimista. El E2E lo verifica con una fila envenenada, no por fe.
 *
 * Concurrencia optimista: la primera escritura (`version` 0) es un INSERT que deja la fila
 * en la versión 1; las siguientes, un UPDATE condicionado a la versión con la que se leyó el
 * pedido. Si otro proceso guardó entre medias, el UPDATE no casa ninguna fila —PostgreSQL
 * re-evalúa el WHERE tras esperar el bloqueo de la fila— y lanzar dentro de la transacción la
 * revierte entera: ni fila ni outbox, así que nunca hay un segundo `OrderCancelled`.
 *
 * Eso solo pasa en READ COMMITTED: en REPEATABLE READ o SERIALIZABLE el UPDATE que esperaba
 * recibe un `40001` en vez de re-evaluar, el caso de uso no lo reintenta y el doble clic acaba
 * en 500. Por eso la transacción pide el nivel EXPLÍCITAMENTE en vez de heredar el que tengan
 * por defecto el servidor, la base o el rol (un parameter group de RDS, un `ALTER DATABASE …
 * SET`): el E2E abre una conexión cuyo defecto es SERIALIZABLE para comprobarlo.
 *
 * Un INSERT cuyo id ya existe (`23505`) es el mismo conflicto visto desde la versión 0: alguien
 * guardó ese pedido después de que esta instancia naciera. Se traduce igual que el UPDATE que no
 * casa, que es lo que ya hace el fake de los tests de aplicación. Solo ese código: cualquier otro
 * fallo del INSERT sube tal cual, o un error de infraestructura se publicaría como un 409 que
 * invita a reintentar algo que nunca va a funcionar.
 */
@Injectable()
export class OrderTypeOrmRepository implements OrderRepository {
  constructor(
    @InjectRepository(OrderOrmEntity)
    private readonly orders: Repository<OrderOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async save(order: Order, events: readonly OrderEvent[]): Promise<void> {
    const orderRow = OrderMapper.toPersistence(order);
    const outboxRows = events.map((event): QueryDeepPartialEntity<OutboxMessageOrmEntity> => ({
      id: randomUUID(),
      // `keepClassNames: true` en `.swcrc` garantiza el nombre real de la clase (README
      // documenta que Nest ya depende de ello), así que no hace falta un registro de tipos.
      eventType: event.constructor.name,
      // El payload es el evento expandido: las dos clases son planas y serializables tal
      // cual (spec §3), y JSON.stringify convierte los Date a ISO-8601 dentro del jsonb.
      payload: { ...event },
      occurredAt: event.occurredAt,
      processedAt: null,
    }));

    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      if (orderRow.version === 0) {
        orderRow.version = 1;
        try {
          await manager.insert(OrderOrmEntity, orderRow);
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new OrderVersionConflictError(orderRow.id);
          }
          throw error;
        }
      } else {
        // Solo lo mutable: concepto, importe y cliente no cambian después de colocar.
        const result = await manager.update(
          OrderOrmEntity,
          { id: orderRow.id, version: orderRow.version },
          {
            status: orderRow.status,
            cancelledAt: orderRow.cancelledAt,
            version: orderRow.version + 1,
          },
        );
        if (result.affected !== 1) {
          throw new OrderVersionConflictError(orderRow.id);
        }
      }
      // `insert` y no `save`: con el id ya asignado, `save` es un upsert que primero busca esos
      // ids —siempre en vano— con el bloqueo de la fila tomado, y ante un id repetido
      // sobrescribiría el mensaje ajeno en vez de fallar. Con la lista vacía no hace nada.
      await manager.insert(OutboxMessageOrmEntity, outboxRows);
    });
  }

  async findByIdAndCustomer(id: OrderId, customerId: string): Promise<Order | null> {
    // El cliente va en el WHERE, no en una comparación posterior: así la fila ajena no pasa por el
    // mapper (ver el puerto).
    const row = await this.orders.findOne({ where: { id: id.value, customerId } });
    return row ? OrderMapper.toDomain(row) : null;
  }
}
