import { Entity, type BaseEntityProps } from '@shared/domain/entity.base';

import type { Email } from '../value-objects/email.vo';
import { InvalidUserNameError } from '../errors/user.errors';
import type { UserId } from '../value-objects/user-id.vo';
import type { UserRole } from '../value-objects/user-role';

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 120;

export type UserSnapshot = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Raíz del agregado. Sin decoradores, sin ORM y sin dependencias de framework: sus
 * invariantes se garantizan en el constructor y en los métodos, no en un validador
 * externo. El adaptador de persistencia lo traduce desde y hacia la fila de la tabla.
 *
 * `id`, `createdAt`, `updatedAt` e `equals()` los pone `Entity`, la base del kernel, y aquí no
 * se redeclaran: un campo redeclarado no compila, pero una parameter property redeclarada sí, y
 * dejaría dos fuentes de verdad. `updatedAt` solo se mueve con `touch(now)`, que llaman los
 * métodos de intención después de su guarda de no-op: una transición que no cambia nada no toca
 * la fecha. `rename` no tiene guarda: renombrar es siempre una escritura que se pidió.
 *
 * **Sin `passwordHash` desde el ciclo 4.** El usuario es un PERFIL: identidad, nombre, rol y
 * vigencia. La credencial es el agregado `Credential` del bounded context `auth`, con su
 * propia tabla. El corte no es estético — mientras el hash vivía aquí, cualquier consulta de
 * perfil arrastraba el secreto y cualquier `toSnapshot()` podía filtrarlo.
 */
export class User extends Entity<UserId> {
  private constructor(
    base: BaseEntityProps<UserId>,
    private _email: Email,
    private _name: string,
    private _role: UserRole,
    private _active: boolean,
  ) {
    super(base);
  }

  static create(params: { id: UserId; email: Email; name: string; now: Date }): User {
    const name = User.assertName(params.name);
    return new User(
      { id: params.id, createdAt: params.now, updatedAt: params.now },
      params.email,
      name,
      'user',
      true,
    );
  }

  /** Reconstituye el agregado desde persistencia sin volver a aplicar reglas de creación. */
  static rehydrate(
    params: BaseEntityProps<UserId> & {
      email: Email;
      name: string;
      role: UserRole;
      active: boolean;
    },
  ): User {
    return new User(
      { id: params.id, createdAt: params.createdAt, updatedAt: params.updatedAt },
      params.email,
      params.name,
      params.role,
      params.active,
    );
  }

  get email(): Email {
    return this._email;
  }

  get name(): string {
    return this._name;
  }

  get role(): UserRole {
    return this._role;
  }

  get active(): boolean {
    return this._active;
  }

  rename(name: string, now: Date): void {
    this._name = User.assertName(name);
    this.touch(now);
  }

  changeEmail(email: Email, now: Date): void {
    if (this._email.equals(email)) {
      return;
    }
    this._email = email;
    this.touch(now);
  }

  deactivate(now: Date): void {
    if (!this._active) {
      return;
    }
    this._active = false;
    this.touch(now);
  }

  activate(now: Date): void {
    if (this._active) {
      return;
    }
    this._active = true;
    this.touch(now);
  }

  /** Único camino de dominio hacia admin. Idempotente: repetirlo no toca updatedAt. */
  promoteToAdmin(now: Date): void {
    if (this._role === 'admin') {
      return;
    }
    this._role = 'admin';
    this.touch(now);
  }

  toSnapshot(): UserSnapshot {
    return {
      id: this.id.value,
      email: this._email.value,
      name: this._name,
      role: this._role,
      active: this._active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  private static assertName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN_LENGTH || trimmed.length > NAME_MAX_LENGTH) {
      throw new InvalidUserNameError(name);
    }
    return trimmed;
  }
}
