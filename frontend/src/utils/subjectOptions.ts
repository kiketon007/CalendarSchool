import type { components } from '../api/generated/schema';

type Schemas = components['schemas'];

/** Tipos de asignatura, en el orden en que se ofrecen: troncal, optativa y propia del centro. */
export const SUBJECT_TYPES = [
  'CORE',
  'ELECTIVE',
  'CUSTOM',
] as const satisfies readonly Schemas['SubjectType'][];

/** Estados de una asignatura, en el orden en que se ofrecen. */
export const SUBJECT_STATUSES = [
  'ACTIVE',
  'INACTIVE',
] as const satisfies readonly Schemas['SubjectStatus'][];

/**
 * Claves de la paleta cerrada de colores de una asignatura, en el orden en que se proponen. El aspecto de cada
 * una (fondo y texto, con contraste AA) vive en `subjectColors.ts`. Un test fija que coinciden con el enum
 * `SubjectColor` del contrato.
 */
export const SUBJECT_COLORS = [
  'blue',
  'indigo',
  'purple',
  'pink',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'cyan',
  'brown',
  'gray',
] as const satisfies readonly Schemas['SubjectColor'][];
