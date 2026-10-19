import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * REESCRITA el 2026-10-17: `orders` nace con `created_at` y `updated_at`, las fechas que el kernel
 * da a toda entidad, en lugar de `placed_at`, que siempre valía lo mismo que la creación (colocar
 * un pedido es crearlo).
 *
 * Se reescribió en vez de añadir un par expand/contract porque el template no está desplegado en
 * ningún sitio. NO es un precedente para una migración ya aplicada en un entorno desplegado: ahí
 * se acaban las reescrituras y manda expand/contract.
 *
 * ⚠️ Toda base existente necesita `pnpm db:reset`: TypeORM da esta migración por aplicada, y sin
 * el reset toda consulta de `orders` falla con un error de columna inexistente (`42703`) sobre
 * `created_at`. El porqué y su precedente (la mudanza de credenciales, partida a posteriori) están
 * en `docs/database.md`, «Expand/contract: el ejemplo trabajado».
 */
export class CreateOrdersAndOutbox1786076763455 implements MigrationInterface {
  name = 'CreateOrdersAndOutbox1786076763455';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "concept" character varying(140) NOT NULL,
        "amount_cents" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_orders" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "orders_outbox" (
        "id" uuid NOT NULL,
        "event_type" character varying(120) NOT NULL,
        "payload" jsonb NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "processed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_orders_outbox" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Sin cualificar el schema, como todas las migraciones del repo: ambos sentidos
    // heredan el `search_path` de la conexión (lección de `create-users-table`).
    await queryRunner.query(`DROP TABLE "orders_outbox"`);
    await queryRunner.query(`DROP TABLE "orders"`);
  }
}
