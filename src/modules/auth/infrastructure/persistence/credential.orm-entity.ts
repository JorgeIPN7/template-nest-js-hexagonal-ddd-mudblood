import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Modelo de persistencia de la credencial. Tabla PROPIA de `auth` (`auth_credentials`): el
 * hash dejó de ser una columna de `users` en este ciclo, porque el dato es de quien lo usa.
 *
 * Las fechas las fija el dominio (`Credential.create()`) y el adaptador las escribe siempre:
 * `@Column` y no `CreateDateColumn`/`UpdateDateColumn`, y el `DEFAULT now()` solo cubre un INSERT
 * que no las nombre. Sin `name`: las columnas nacieron `"createdAt"` y `"updatedAt"`.
 *
 * El índice sobre `user_id` es ÚNICO y no hay un segundo índice plano al lado: un índice
 * único ya es un índice, y `user_id` es la clave de acceso del login (`findByUserId`).
 * Añadir uno no-único encima solo pagaría escrituras sin acelerar ninguna lectura.
 */
@Entity({ name: 'auth_credentials' })
export class CredentialOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Index('idx_auth_credentials_user_id', { unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
