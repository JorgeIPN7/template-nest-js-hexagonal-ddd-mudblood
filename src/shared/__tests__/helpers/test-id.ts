import { ValueObject } from '../../domain/value-object.base';

/**
 * Id de prueba de las bases del kernel: un `ValueObject<string>` sin validación, para que los
 * specs de `Entity` y `AggregateRoot` no dependan del id de ningún módulo (quitar un módulo de
 * ejemplo es borrar su carpeta entera). `of()` sustituye al `from()` de un id real porque el
 * constructor es `protected`.
 */
export class TestId extends ValueObject<string> {
  static of(value: string): TestId {
    return new TestId(value);
  }
}
