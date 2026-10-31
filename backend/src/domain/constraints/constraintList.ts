import type { SubjectColor, SubjectStatus } from '../subject/subject.js';
import type { SlotCell, WorkloadWarning } from '../workload/workloadWarnings.js';

/**
 * Tipo de regla de reparto de una asignatura en un curso. Debe coincidir con `ConstraintType` de
 * `docs/api-spec.yml` y con el enum de `scheduling_constraints`. El orden es el del listado.
 */
export const CONSTRAINT_TYPES = [
  'MAX_PER_DAY',
  'BLOCK',
  'FORBIDDEN_SLOTS',
  'PREFERRED_SLOTS',
] as const;

export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

/** Una regla tal como la lee el repositorio: con **todas** sus celdas guardadas, dentro del calendario o no. */
export interface StoredConstraint {
  /** UUIDv7 de la regla. */
  readonly id: string;
  readonly type: ConstraintType;
  /** Solo en `MAX_PER_DAY`. */
  readonly maxPerDay: number | null;
  /** Solo en `BLOCK`. */
  readonly blockSize: number | null;
  /** Celdas guardadas de las reglas de franjas; vacía en las demás. */
  readonly slots: readonly SlotCell[];
}

/**
 * Una asignatura en un curso con alguna regla: lo necesario para calcular los avisos de todas sus reglas.
 * Sin ordenar; lo ordena y completa `buildConstraintList`.
 */
export interface ConstraintPair {
  readonly course: { readonly id: string; readonly name: string };
  readonly subject: {
    readonly id: string;
    readonly name: string;
    /** Código corto tal como se escribió, o `null` si no tiene. */
    readonly code: string | null;
    readonly color: SubjectColor;
    readonly status: SubjectStatus;
  };
  /** Sesiones semanales de la asignatura en el curso. */
  readonly sessionsPerWeek: number;
  /**
   * La jornada del calendario del curso: los tamaños de sus tramos de sesiones seguidas entre recreos, en
   * orden (`sessionGroups` de la carga), o `null` si el curso no tiene calendario.
   */
  readonly calendar: { readonly sessionGroups: readonly number[] } | null;
  /** Todas las reglas de la pareja (de una a cuatro, una por tipo). */
  readonly rules: readonly StoredConstraint[];
}

/** Lo que lee el repositorio: las parejas con reglas del colegio, sin ordenar. */
export type ConstraintListSnapshot = readonly ConstraintPair[];

/**
 * Una regla del listado, con sus avisos. Solo uno de `maxPerDay`, `blockSize` y `slotCount` tiene valor, el de
 * su tipo. Debe coincidir con `SchedulingConstraint` de `docs/api-spec.yml`.
 */
export interface ListedConstraint {
  readonly id: string;
  readonly type: ConstraintType;
  readonly course: ConstraintPair['course'];
  readonly subject: ConstraintPair['subject'];
  readonly maxPerDay: number | null;
  readonly blockSize: number | null;
  /** Celdas que existen en el calendario actual (0 sin calendario); `null` si no es una regla de franjas. */
  readonly slotCount: number | null;
  /** Solo los avisos que afectan a esta regla. */
  readonly warnings: readonly WorkloadWarning[];
}
