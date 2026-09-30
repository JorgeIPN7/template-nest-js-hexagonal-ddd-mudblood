import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Modelo de persistencia, deliberadamente distinto del agregado `Order` — dos modelos,
 * un mapper (convención del repo). Sin `CreateDateColumn`: `placed_at` lo sella el
 * dominio en `Order.place()`, no la base. Sin `updatedAt`: el único cambio posible, la
 * cancelación, ya queda sellado en `cancelled_at`.
 *
 * `version` es una columna normal y no un `@VersionColumn`: TypeORM la incrementaría en su
 * `save()` sin comprobar nada. La comprobación es el `WHERE version = …` que escribe el
 * adaptador.
 */
@Entity({ name: 'orders' })
export class OrderOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'varchar', length: 140 })
  concept!: string;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({ name: 'placed_at', type: 'timestamptz' })
  placedAt!: Date;

  // Los DEFAULT no son decorativos: con ellos la migración es aditiva y una réplica vieja,
  // cuyo INSERT solo enumera las columnas que conoce, sigue insertando durante el despliegue.
  @Column({ type: 'varchar', length: 20, default: 'placed' })
  status!: string;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;
}
