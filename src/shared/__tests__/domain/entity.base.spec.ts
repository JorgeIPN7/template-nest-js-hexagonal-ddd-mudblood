import { fc, test as fcTest } from '@fast-check/jest';

import { Entity, type BaseEntityProps } from '../../domain/entity.base';
import { TestId } from '../helpers/test-id';

const T0 = new Date('2026-07-27T08:00:00.000Z');
const T1 = new Date('2026-07-27T09:00:00.000Z');
const T2 = new Date('2026-07-27T10:00:00.000Z');
const TM = new Date('2026-07-27T08:30:00.000Z');

describe('Entity', () => {
  describe('constructor', () => {
    it('debería exponer el id y las fechas de creación y de actualización con que se construye', () => {
      // Arrange
      const id = TestId.of('w-1');
      // Act
      const widget = Widget.create({ id, createdAt: T0, updatedAt: T1 });
      // Assert
      expect(widget.id).toBe(id);
      expect(widget.createdAt).toEqual(T0);
      expect(widget.updatedAt).toEqual(T1);
    });
  });

  describe('touch()', () => {
    it('debería fijar la fecha de actualización en el instante exacto que recibe touch', () => {
      // Arrange
      const widget = Widget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      // Act
      widget.bump(T2);
      // Assert
      expect(widget.updatedAt).toEqual(T2);
    });

    it('debería fijar la fecha de actualización en el instante recibido aunque sea anterior a la actual', () => {
      // Arrange
      const widget = Widget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      // Act
      widget.bump(TM);
      // Assert
      expect(widget.updatedAt).toEqual(TM);
    });

    it('debería conservar la fecha de creación al tocar la entidad', () => {
      // Arrange
      const widget = Widget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      // Act
      widget.bump(T2);
      // Assert
      expect(widget.createdAt).toEqual(T0);
    });
  });

  describe('equals()', () => {
    it('debería devolver false ante null', () => {
      // Arrange
      const widget = Widget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      // Act
      const result = widget.equals(null);
      // Assert
      expect(result).toBe(false);
    });

    it('debería devolver false ante undefined', () => {
      // Arrange
      const widget = Widget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      // Act
      const result = widget.equals(undefined);
      // Assert
      expect(result).toBe(false);
    });

    it('debería considerar igual a una entidad consigo misma', () => {
      // Arrange
      const widget = Widget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      // Act
      const result = widget.equals(widget);
      // Assert
      expect(result).toBe(true);
    });

    it('debería considerar iguales dos instancias de la misma clase con el mismo id aunque difieran sus fechas', () => {
      // Arrange
      const one = Widget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      const another = Widget.create({ id: TestId.of('w-1'), createdAt: T2, updatedAt: T2 });
      // Act
      const result = one.equals(another);
      // Assert
      expect(result).toBe(true);
    });

    it('debería considerar distintas dos instancias de la misma clase con ids distintos', () => {
      // Arrange
      const one = Widget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      const another = Widget.create({ id: TestId.of('w-2'), createdAt: T0, updatedAt: T1 });
      // Act
      const result = one.equals(another);
      // Assert
      expect(result).toBe(false);
    });

    // Las dos clases comparten `TestId` a propósito: con ids de clases distintas, `id.equals`
    // ya daría `false` por la clase del VO y esta fila no vería si `equals` compara la clase
    // de la entidad.
    it('debería considerar distintas dos entidades de clases distintas aunque compartan id', () => {
      // Arrange
      const widget = Widget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      const gadget = Gadget.create({ id: TestId.of('w-1'), createdAt: T0, updatedAt: T1 });
      // Act
      const result = widget.equals(gadget);
      // Assert
      expect(result).toBe(false);
    });

    fcTest.prop([entityPairCase()])(
      'debería considerar iguales dos entidades si y solo si coinciden su clase y el valor de su id',
      ({ first, second, sameId }) => {
        // Arrange
        const firstId = TestId.of(first.idValue);
        const secondId = TestId.of(sameId ? first.idValue : `${first.idValue}-otro`);
        const a = buildEntity(first.kind, {
          id: firstId,
          createdAt: first.createdAt,
          updatedAt: first.updatedAt,
        });
        const b = buildEntity(second.kind, {
          id: secondId,
          createdAt: second.createdAt,
          updatedAt: second.updatedAt,
        });
        const expected = first.kind === second.kind && sameId;
        // Act
        const results = [a.equals(b), b.equals(a)];
        // Assert
        expect(results).toEqual([expected, expected]);
      },
    );
  });
});

// Helpers
//
// Dobles de prueba y no entidades reales: la base se prueba contra sí misma. `touch()` es
// `protected` —solo los métodos de intención de la propia entidad mueven `updatedAt`—, así que
// `Widget` expone un `bump()` público que lo delega. `create()` sustituye a las factorías de una
// entidad real porque el constructor es `protected`.

class Widget extends Entity<TestId> {
  static create(props: BaseEntityProps<TestId>): Widget {
    return new Widget(props);
  }

  bump(now: Date): void {
    this.touch(now);
  }
}

class Gadget extends Entity<TestId> {
  static create(props: BaseEntityProps<TestId>): Gadget {
    return new Gadget(props);
  }
}

type EntityKind = 'widget' | 'gadget';

function buildEntity(kind: EntityKind, props: BaseEntityProps<TestId>): Entity<TestId> {
  return kind === 'widget' ? Widget.create(props) : Gadget.create(props);
}

/** Un instante entre 2000 y 2100, nunca `Invalid Date`. */
function instant() {
  return fc.date({
    min: new Date('2000-01-01T00:00:00.000Z'),
    max: new Date('2100-12-31T23:59:59.999Z'),
    noInvalidDate: true,
  });
}

/** Un lado del par: su clase, el valor de su id y sus dos fechas, independientes. */
function entitySide() {
  return fc.record({
    kind: fc.constantFrom<EntityKind>('widget', 'gadget'),
    idValue: fc.string(),
    createdAt: instant(),
    updatedAt: instant(),
  });
}

/**
 * Arbitraria CONSTRUIDA (no filtrada): `sameId` decide si el segundo id copia el primero o le
 * añade un sufijo, así que «distinto» lo es por construcción. Solo se usa el `idValue` del
 * primer lado; el del segundo se ignora.
 */
function entityPairCase() {
  return fc.record({ first: entitySide(), second: entitySide(), sameId: fc.boolean() });
}
