import { UuidIdentifier } from '@shared/domain/uuid-identifier.base';

import { InvalidUserIdError } from '../errors/user.errors';

/**
 * Identidad del agregado. Es un value object para que un `string` cualquiera no pueda pasar por
 * un id de usuario: el tipo obliga a construirlo por `from()` o `generate()`. La regex del uuid
 * v4, el `randomUUID()`, la normalización a minúsculas y la marca nominal, que impide pasar un id
 * de otra clase donde va este, los pone `UuidIdentifier`.
 */
export class UserId extends UuidIdentifier<'UserId'> {
  static generate(): UserId {
    return new UserId(UuidIdentifier.newUuid());
  }

  static from(value: string): UserId {
    if (!UuidIdentifier.isUuidV4(value)) {
      throw new InvalidUserIdError(value);
    }
    return new UserId(value);
  }
}
