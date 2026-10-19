import { Entity, type BaseEntityProps } from '@shared/domain/entity.base';

import { CredentialId } from '../value-objects/credential-id.vo';
import type { PasswordHash } from '../value-objects/password-hash.vo';

export type CredentialSnapshot = {
  id: string;
  userId: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Raíz del agregado de `auth`: la credencial de acceso de una cuenta. Sin decoradores, sin
 * ORM y sin framework — el adaptador de persistencia la traduce desde y hacia la fila de
 * `auth_credentials`.
 *
 * `userId` es un `string` y NO un value object: el identificador del usuario pertenece a
 * `users`, y copiar aquí su `UserId` duplicaría una invariante ajena que este contexto no
 * puede mantener sincronizada. Mismo criterio que `Order.customerId` en `orders`.
 *
 * La única invariante real del agregado la lleva `PasswordHash` (forma PHC de argon2id), y
 * por eso vive en el VO y no aquí: lo que hay que impedir es persistir un password en claro,
 * no que la credencial cambie de estado — hoy no tiene transiciones (no hay caso de uso de
 * cambio de contraseña). Cuando lo haya, `changePassword(hash, now)` es su sitio, y llamará a
 * `touch(now)`.
 *
 * `id` (un `CredentialId`), `createdAt` y `updatedAt` vienen de `Entity` y no se redeclaran aquí.
 */
export class Credential extends Entity<CredentialId> {
  private constructor(
    base: BaseEntityProps<CredentialId>,
    readonly userId: string,
    readonly passwordHash: PasswordHash,
  ) {
    super(base);
  }

  /** Alta de la credencial. El id lo acuña el propio agregado con `CredentialId.generate()`. */
  static create(params: { userId: string; passwordHash: PasswordHash; now: Date }): Credential {
    return new Credential(
      { id: CredentialId.generate(), createdAt: params.now, updatedAt: params.now },
      params.userId,
      params.passwordHash,
    );
  }

  /** Reconstituye el agregado desde persistencia sin volver a aplicar reglas de creación. */
  static rehydrate(params: {
    id: CredentialId;
    userId: string;
    passwordHash: PasswordHash;
    createdAt: Date;
    updatedAt: Date;
  }): Credential {
    return new Credential(
      { id: params.id, createdAt: params.createdAt, updatedAt: params.updatedAt },
      params.userId,
      params.passwordHash,
    );
  }

  toSnapshot(): CredentialSnapshot {
    return {
      id: this.id.value,
      userId: this.userId,
      passwordHash: this.passwordHash.value,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
