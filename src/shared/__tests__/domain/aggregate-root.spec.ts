import { AggregateRoot } from '../../domain/aggregate-root';
import type { BaseEntityProps } from '../../domain/entity.base';
import { TestId } from '../helpers/test-id';

const T0 = new Date('2026-07-27T08:00:00.000Z');
const T1 = new Date('2026-07-27T09:00:00.000Z');

describe('AggregateRoot', () => {
  describe('constructor', () => {
    it('debería exponer el id, la fecha de creación y la de modificación con que se construyó', () => {
      // Arrange
      const id = TestId.of('agg-1');

      // Act
      const aggregate = RecordingAggregate.of({ id, createdAt: T0, updatedAt: T1 });

      // Assert
      expect(aggregate.id).toBe(id);
      expect(aggregate.createdAt).toEqual(T0);
      expect(aggregate.updatedAt).toEqual(T1);
    });
  });

  describe('pullEvents()', () => {
    it('debería devolver una lista vacía cuando el agregado no ha recolectado nada', () => {
      // Arrange
      const aggregate = buildAggregate();
      // Act
      const events = aggregate.pullEvents();
      // Assert
      expect(events).toEqual([]);
    });

    it('debería devolver los eventos recolectados en el orden en que se registraron', () => {
      // Arrange
      const aggregate = buildAggregate();
      aggregate.emit('first');
      aggregate.emit('second');
      // Act
      const events = aggregate.pullEvents();
      // Assert
      expect(events).toEqual(['first', 'second']);
    });

    it('debería drenar la colección: el segundo drenaje devuelve vacío', () => {
      // Arrange
      const aggregate = buildAggregate();
      aggregate.emit('only');
      aggregate.pullEvents();
      // Act
      const events = aggregate.pullEvents();
      // Assert
      expect(events).toEqual([]);
    });

    it('debería volver a recolectar después de un drenaje', () => {
      // Arrange
      const aggregate = buildAggregate();
      aggregate.emit('first');
      aggregate.pullEvents();
      aggregate.emit('second');
      // Act
      const events = aggregate.pullEvents();
      // Assert
      expect(events).toEqual(['second']);
    });
  });
});

// Helpers
//
// `record()` es `protected` a propósito —solo el propio agregado decide qué emite—, así que
// el doble expone un `emit()` público que lo delega. Los eventos son strings y no clases de
// evento reales: la base es genérica en `TEvent` y no toca su contenido. `of()` sustituye a las
// factorías de un agregado real, porque el constructor que hereda de `Entity` es `protected`.

class RecordingAggregate extends AggregateRoot<TestId, string> {
  static of(props: BaseEntityProps<TestId>): RecordingAggregate {
    return new RecordingAggregate(props);
  }

  emit(event: string): void {
    this.record(event);
  }
}

function buildAggregate(): RecordingAggregate {
  return RecordingAggregate.of({ id: TestId.of('agg-1'), createdAt: T0, updatedAt: T1 });
}
