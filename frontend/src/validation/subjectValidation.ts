import type { components } from '../api/generated/schema';
import type { CreateSubjectInput } from '../services/subjectsService';
import { SUBJECT_COLORS, SUBJECT_STATUSES, SUBJECT_TYPES } from '../utils/subjectOptions';
import { cleaned, LETTERS, validateCourseName, type FieldErrorCode } from './courseValidation';

type FieldError = components['schemas']['FieldError'];
type SubjectType = components['schemas']['SubjectType'];
type SubjectStatus = components['schemas']['SubjectStatus'];
type SubjectColor = components['schemas']['SubjectColor'];

/** Máximo de caracteres del código de una asignatura, tras limpiarlo. */
export const MAX_SUBJECT_CODE = 10;
/** Máximo de caracteres de la descripción de una asignatura, tras recortarla. */
export const MAX_SUBJECT_DESCRIPTION = 500;
/** Máximo de cursos en los que se imparte una asignatura. */
export const MAX_SUBJECT_COURSES = 100;
/** Sesiones semanales mínimas y máximas de una asignatura en un curso. */
export const MIN_SESSIONS_PER_WEEK = 1;
export const MAX_SESSIONS_PER_WEEK = 5;
/** Sesiones semanales con las que empieza un curso al marcarlo en el formulario. */
export const DEFAULT_SESSIONS_PER_WEEK = 2;

// Las reglas son las mismas que valida el backend (createSubjectRequest.ts). Ambos lados recorren la tabla
// test-fixtures/subject-fields.json para que no diverjan.

/** Código: letras, dígitos, `-` y `/`, sin espacios. */
const CODE_CHARACTERS = new RegExp(`^[${LETTERS}0-9/-]+$`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** NFC y sin espacios en los extremos (el código y la descripción no colapsan los espacios de dentro). */
const trimmed = (value: string) => value.normalize('NFC').trim();

/** El nombre de una asignatura tiene las reglas del nombre de un curso. */
export const validateSubjectName = validateCourseName;

/**
 * El código es opcional: ausente, `null`, vacío o solo con espacios es válido (se guarda como `null`). Si
 * hay valor, de 1 a 10 caracteres entre letras, dígitos, `-` y `/`. Acepta `unknown` porque la tabla
 * compartida incluye valores que no son texto.
 */
export function validateSubjectCode(value: unknown): FieldErrorCode | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return 'INVALID_FORMAT';
  }
  const code = trimmed(value);
  if (code === '') {
    return undefined;
  }
  if (code.length > MAX_SUBJECT_CODE) {
    return 'INVALID_LENGTH';
  }
  return CODE_CHARACTERS.test(code) ? undefined : 'INVALID_CHARACTERS';
}

/** La descripción es opcional y de hasta 500 caracteres; vacía o solo con espacios es válida. */
export function validateSubjectDescription(value: unknown): FieldErrorCode | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return 'INVALID_FORMAT';
  }
  return trimmed(value).length > MAX_SUBJECT_DESCRIPTION ? 'INVALID_LENGTH' : undefined;
}

/**
 * Un valor de una lista cerrada. Ausente, `null` y la opción vacía de un desplegable (`''`) son `REQUIRED`;
 * cualquier otro que no esté en la lista, `INVALID_FORMAT`.
 */
function validateOption(value: unknown, allowed: readonly string[]): FieldErrorCode | undefined {
  if (value === undefined || value === null || value === '') {
    return 'REQUIRED';
  }
  return typeof value === 'string' && allowed.includes(value) ? undefined : 'INVALID_FORMAT';
}

export const validateSubjectType = (value: unknown) => validateOption(value, SUBJECT_TYPES);
export const validateSubjectStatus = (value: unknown) => validateOption(value, SUBJECT_STATUSES);
export const validateSubjectColor = (value: unknown) => validateOption(value, SUBJECT_COLORS);

/** Las sesiones semanales: un entero de 1 a 5 (`OUT_OF_RANGE` fuera, `INVALID_FORMAT` si no es entero). */
export function validateSubjectSessions(value: unknown): FieldErrorCode | undefined {
  if (value === undefined || value === null) {
    return 'REQUIRED';
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return 'INVALID_FORMAT';
  }
  return value < MIN_SESSIONS_PER_WEEK || value > MAX_SESSIONS_PER_WEEK
    ? 'OUT_OF_RANGE'
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * La lista de cursos en los que se imparte, como la valida el backend: al menos uno y como mucho 100, cada uno
 * con un `courseId` UUID sin repetir (sin distinguir mayúsculas) y sus sesiones semanales. Devuelve un
 * `{ field, code }` por problema, en el orden del backend: los de la lista y, por cada curso, `courseId` y
 * después `sessionsPerWeek`.
 */
export function validateSubjectCourses(value: unknown): FieldError[] {
  if (value === undefined || value === null) {
    return [{ field: 'courses', code: 'REQUIRED' }];
  }
  if (!Array.isArray(value)) {
    return [{ field: 'courses', code: 'INVALID_FORMAT' }];
  }
  if (value.length === 0) {
    return [{ field: 'courses', code: 'REQUIRED' }];
  }
  if (value.length > MAX_SUBJECT_COURSES) {
    return [{ field: 'courses', code: 'INVALID_LENGTH' }];
  }

  const issues: FieldError[] = [];
  const seen = new Set<string>();
  value.forEach((raw: unknown, index) => {
    const prefix = `courses[${String(index)}]`;
    if (!isRecord(raw)) {
      issues.push({ field: prefix, code: 'INVALID_FORMAT' });
      return;
    }

    if (raw.courseId === undefined || raw.courseId === null) {
      issues.push({ field: `${prefix}.courseId`, code: 'REQUIRED' });
    } else if (typeof raw.courseId !== 'string' || !UUID.test(raw.courseId)) {
      issues.push({ field: `${prefix}.courseId`, code: 'INVALID_FORMAT' });
    } else if (seen.has(raw.courseId.toLowerCase())) {
      issues.push({ field: `${prefix}.courseId`, code: 'DUPLICATE' });
    } else {
      seen.add(raw.courseId.toLowerCase());
    }

    const sessionsError = validateSubjectSessions(raw.sessionsPerWeek);
    if (sessionsError) {
      issues.push({ field: `${prefix}.sessionsPerWeek`, code: sessionsError });
    }
  });
  return issues;
}

/** Curso marcado en el formulario, con sus sesiones semanales. */
export interface DraftSubjectCourse {
  courseId: string;
  sessionsPerWeek: number;
}

/** Lo que hay en el formulario: las opciones vacías de los desplegables son `''`. */
export interface SubjectDraft {
  name: string;
  code: string;
  type: '' | SubjectType;
  status: '' | SubjectStatus;
  description: string;
  color: '' | SubjectColor;
  courses: readonly DraftSubjectCourse[];
}

/** El formulario de alta al abrirlo: activa, con el color que se propone y nada más elegido. */
export function emptySubjectDraft(color: SubjectColor): SubjectDraft {
  return {
    name: '',
    code: '',
    type: '',
    status: 'ACTIVE',
    description: '',
    color,
    courses: [],
  };
}

/**
 * Valida la asignatura del formulario con las mismas reglas que el backend y devuelve un `{ field, code }`
 * por campo inválido, en el mismo orden: `name`, `code`, `type`, `status`, `description`, `color` y los
 * cursos. El orden es el de la pantalla, así que el primero es el que recibe el foco.
 */
export function validateSubject(draft: SubjectDraft): FieldError[] {
  const checks: [string, FieldErrorCode | undefined][] = [
    ['name', validateSubjectName(draft.name)],
    ['code', validateSubjectCode(draft.code)],
    ['type', validateSubjectType(draft.type)],
    ['status', validateSubjectStatus(draft.status)],
    ['description', validateSubjectDescription(draft.description)],
    ['color', validateSubjectColor(draft.color)],
  ];
  const details: FieldError[] = [];
  for (const [field, code] of checks) {
    if (code) {
      details.push({ field, code });
    }
  }
  details.push(...validateSubjectCourses(draft.courses));
  return details;
}

/** El error de cada campo de un curso marcado. */
export interface SubjectCourseRowErrors {
  courseId?: FieldErrorCode;
  sessionsPerWeek?: FieldErrorCode;
  /** El curso entero no es válido (`courses[<i>]`): solo lo produce una petición hecha a mano. */
  whole?: FieldErrorCode;
}

/** Los errores del formulario de una asignatura, repartidos por campo para pintarlos bajo cada uno. */
export interface SubjectErrors {
  name?: FieldErrorCode;
  code?: FieldErrorCode;
  type?: FieldErrorCode;
  status?: FieldErrorCode;
  description?: FieldErrorCode;
  color?: FieldErrorCode;
  /** Error de la lista de cursos entera: ninguno marcado o demasiados. */
  courses?: FieldErrorCode;
  /** Errores por posición del curso en `courses`. */
  rows: Record<number, SubjectCourseRowErrors>;
}

const SIMPLE_FIELDS = [
  'name',
  'code',
  'type',
  'status',
  'description',
  'color',
  'courses',
] as const;
const COURSE_FIELD = /^courses\[(\d+)\](?:\.(courseId|sessionsPerWeek))?$/u;

/**
 * Reparte una lista de errores (los de `validateSubject` o los de un `400` del servidor) por campo. De cada
 * campo se conserva el primer error, y un campo que no se conoce se ignora.
 */
export function groupSubjectErrors(details: readonly FieldError[]): SubjectErrors {
  const errors: SubjectErrors = { rows: {} };

  for (const { field, code } of details) {
    if ((SIMPLE_FIELDS as readonly string[]).includes(field)) {
      const key = field as (typeof SIMPLE_FIELDS)[number];
      errors[key] ??= code;
      continue;
    }
    const course = COURSE_FIELD.exec(field);
    if (course) {
      const row = (errors.rows[Number(course[1])] ??= {});
      const key = course[2] as 'courseId' | 'sessionsPerWeek' | undefined;
      row[key ?? 'whole'] ??= code;
    }
  }
  return errors;
}

/**
 * Lo que se envía al servidor para una asignatura ya validada: el nombre limpio, el código y la descripción
 * recortados y, si quedan vacíos, `null` (nunca un texto vacío).
 */
export function toCreateSubjectInput(draft: SubjectDraft): CreateSubjectInput {
  const code = trimmed(draft.code);
  const description = trimmed(draft.description);
  return {
    name: cleaned(draft.name),
    code: code === '' ? null : code,
    type: draft.type as SubjectType,
    status: draft.status as SubjectStatus,
    description: description === '' ? null : description,
    color: draft.color as SubjectColor,
    courses: draft.courses.map(({ courseId, sessionsPerWeek }) => ({ courseId, sessionsPerWeek })),
  };
}
