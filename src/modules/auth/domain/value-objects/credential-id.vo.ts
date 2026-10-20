import { UuidIdentifier } from '@shared/domain/uuid-identifier.base';

import { InvalidCredentialIdError } from '../errors/auth.errors';

/**
 * Identidad de la credencial, patrón de `user-id.vo.ts`. La regex del uuid v4, el `randomUUID()`,
 * la normalización a minúsculas y la marca nominal, que impide pasar un id de otra clase donde va
 * este, los pone `UuidIdentifier`.
 *
 * Toda credencial que escribe el sistema es v4: el alta (`generate()`), el seed del admin y la
 * migración que las mudó desde `users`. `from()` solo rechaza lo que deja un SQL externo, y su
 * `InvalidCredentialIdError` acaba en el 500 saneado del filtro de `auth`.
 */
export class CredentialId extends UuidIdentifier<'CredentialId'> {
  static generate(): CredentialId {
    return new CredentialId(UuidIdentifier.newUuid());
  }

  static from(value: string): CredentialId {
    if (!UuidIdentifier.isUuidV4(value)) {
      throw new InvalidCredentialIdError(value);
    }
    return new CredentialId(value);
  }
}
