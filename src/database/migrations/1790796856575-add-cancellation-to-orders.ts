import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cancelación de pedidos: estado, fecha de cancelación y versión optimista sobre `orders`.
 *
 * **Aditiva, sin expand/contract** (ver «Destructive migrations» en `CLAUDE.md`): no suelta
 * ni renombra nada, así que es segura con `DB_MIGRATIONS_RUN=true` mientras las réplicas
 * viejas siguen sirviendo. Los `DEFAULT` son los que lo hacen posible: el `INSERT` del código
 * viejo solo enumera las columnas que conoce, y sin ellos `status` y `version` —`NOT NULL`—
 * rechazarían cada pedido nuevo durante el despliegue. Por el mismo motivo las filas que ya
 * existen quedan como `placed` en la versión 1, que es lo que eran.
 *
 * **Con la espera de bloqueos acotada.** Aditiva no quiere decir inocua: cada `ADD COLUMN` pide
 * `ACCESS EXCLUSIVE` sobre `orders`. Si otra sesión tiene la tabla (un `idle in transaction`, un
 * informe largo, un `pg_dump`), el `ALTER` espera sin límite, el primer pod nuevo no llega a
 * arrancar y, detrás del bloqueo pendiente, se encola cada lectura y escritura de `orders` de las
 * réplicas viejas. Con `lock_timeout` falla a los 5 s con un `55P03` y el arranque lo reintenta.
 * `SET LOCAL` dura lo que la transacción en la que TypeORM envuelve las migraciones pendientes.
 */
export class AddCancellationToOrders1790796856575 implements MigrationInterface {
  name = 'AddCancellationToOrders1790796856575';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "status" character varying(20) NOT NULL DEFAULT 'placed'`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD "cancelled_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "version" integer NOT NULL DEFAULT '1'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ Destructivo: pierde qué pedidos estaban cancelados. Revertir es volver a un código
    // que no conoce la cancelación, y para ese código todos los pedidos están colocados.
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "version"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "cancelled_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
  }
}
