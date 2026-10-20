import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Modelo de persistencia. Es deliberadamente distinto de `User` del dominio: aquí viven
 * los decoradores del ORM y la forma de la tabla, y puede evolucionar (índices, columnas
 * desnormalizadas) sin arrastrar al dominio. `UserMapper` traduce entre ambos.
 *
 * Sin `password_hash` desde el ciclo 4: la credencial vive en `auth_credentials`, tabla del
 * bounded context `auth`. El par expand/contract la mudó: `MoveCredentialsToAuthExpand` copió
 * los datos y aflojó el `NOT NULL` —sin eso, un INSERT desde aquí, que ya no nombra la
 * columna, sería rechazado— y `MoveCredentialsToAuthContract` la dejó caer en un despliegue
 * posterior.
 *
 * Las fechas las fija el dominio, así que son `@Column` y no `@CreateDateColumn` ni
 * `@UpdateDateColumn`: con este último, si el dominio no movió la fecha pero sí otra columna,
 * TypeORM añadiría `"updatedAt" = CURRENT_TIMESTAMP` al UPDATE y taparía un `touch()` olvidado.
 * La clave `orm-managed-columns` del test de contrato de módulo lo vigila. El `default: () =>
 * 'now()'` no es para el dominio, que siempre escribe las dos: hace que la entidad describa el
 * mismo `DEFAULT now()` con que nació la tabla, y sin él `migration:generate` vería una
 * diferencia de esquema.
 */
@Entity({ name: 'users' })
export class UserOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Index('idx_users_email', { unique: true })
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  role!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
