import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cancelación de pedidos: estado, fecha de cancelación y versión optimista sobre `orders`.
 *
 * **Aditiva, sin expand/contract** (ver «Migraciones destructivas» en `CLAUDE.md`): no suelta
 * ni renombra nada, así que es segura con `DB_MIGRATIONS_RUN=true` mientras las réplicas
 * viejas siguen sirviendo. Los `DEFAULT` son los que lo hacen posible: el `INSERT` del código
 * viejo solo enumera las columnas que conoce, y sin ellos `status` y `version` —`NOT NULL`—
 * rechazarían cada pedido nuevo durante el despliegue. Por el mismo motivo las filas que ya
 * existen quedan como `placed` en la versión 1, que es lo que eran.
 */
export class AddCancellationToOrders1790796856575 implements MigrationInterface {
  name = 'AddCancellationToOrders1790796856575';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "status" character varying(20) NOT NULL DEFAULT 'placed'`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD "cancelled_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "version" integer NOT NULL DEFAULT '1'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ Destructivo: pierde qué pedidos estaban cancelados. Revertir es volver a un código
    // que no conoce la cancelación, y para ese código todos los pedidos están colocados.
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "version"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "cancelled_at"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
  }
}
