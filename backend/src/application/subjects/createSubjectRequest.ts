import { z } from 'zod';
import {
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  SUBJECT_COLORS,
  SUBJECT_STATUSES,
  SUBJECT_TYPES,
  type SubjectColor,
  type SubjectStatus,
  type SubjectType,
} from '../../domain/subject/subject.js';
import { cleanCode } from '../../domain/subject/subjectCode.js';
import type { NewSubjectCourse } from '../../domain/subject/subjectRepository.js';
import { COURSE_NAME, isRecord } from '../courses/courseFields.js';
import { LETTERS } from '../registration/userFields.js';
import type { FieldError, FieldErrorCode } from '../validationError.js';

/** Máximo de caracteres del código de una asignatura, tras limpiarlo. */
export const MAX_SUBJECT_CODE = 10;
/** Máximo de caracteres de la descripción de una asignatura, tras recortarla. */
export const MAX_SUBJECT_DESCRIPTION = 500;
/** Máximo de cursos en los que se imparte una asignatura. */
export const MAX_SUBJECT_COURSES = 100;

/** Código: letras, dígitos, `-` y `/`, sin espacios. */
const CODE_CHARACTERS = new RegExp(`^[${LETTERS}0-9/-]+$`);

const courseIdSchema = z.uuid();

/** Asignatura nueva ya validada: textos limpios, los opcionales vacíos a `null` y cursos en minúsculas. */
export interface CreateSubjectInput {
  name: string;
  code: string | null;
  type: SubjectType;
  status: SubjectStatus;
  description: string | null;
  color: SubjectColor;
  courses: NewSubjectCourse[];
}

export type ParseCreateSubjectResult =
  { success: true; data: CreateSubjectInput } | { success: false; details: FieldError[] };

/** Lee el nombre con las reglas del nombre de un curso: añade `name` a `details` si no vale. */
function parseName(source: Record<string, unknown>, details: FieldError[]): string | undefined {
  const name = COURSE_NAME.safeParse(source.name);
  if (!name.success) {
    details.push({ field: 'name', code: name.error.issues[0]?.message as FieldErrorCode });
    return undefined;
  }
  return name.data;
}

/**
 * Lee un texto opcional ya limpio: ausente, `null`, vacío o solo con espacios es `null`. Un valor que no es un
 * texto es `INVALID_FORMAT`; si se pasa de `max`, `INVALID_LENGTH`; y, con `characters`, un carácter que no
 * encaja es `INVALID_CHARACTERS`. Devuelve `undefined` (con el error en `details`) si no vale.
 */
function parseOptionalText(
  value: unknown,
  field: string,
  rules: { clean: (text: string) => string; max: number; characters?: RegExp },
  details: FieldError[],
): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    details.push({ field, code: 'INVALID_FORMAT' });
    return undefined;
  }
  const cleaned = rules.clean(value);
  if (cleaned === '') {
    return null;
  }
  if (cleaned.length > rules.max) {
    details.push({ field, code: 'INVALID_LENGTH' });
    return undefined;
  }
  if (rules.characters && !rules.characters.test(cleaned)) {
    details.push({ field, code: 'INVALID_CHARACTERS' });
    return undefined;
  }
  return cleaned;
}

/** Lee un valor de una lista cerrada: `REQUIRED` si falta, `INVALID_FORMAT` si no es uno de los admitidos. */
function parseOption<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  details: FieldError[],
): T | undefined {
  if (value === undefined || value === null) {
    details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  details.push({ field, code: 'INVALID_FORMAT' });
  return undefined;
}

/** Lee las sesiones semanales: un entero de 1 a 5 (`OUT_OF_RANGE` fuera, `INVALID_FORMAT` si no es entero). */
function parseSessions(value: unknown, field: string, details: FieldError[]): number | undefined {
  if (value === undefined || value === null) {
    details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    details.push({ field, code: 'INVALID_FORMAT' });
    return undefined;
  }
  if (value < MIN_SESSIONS_PER_WEEK || value > MAX_SESSIONS_PER_WEEK) {
    details.push({ field, code: 'OUT_OF_RANGE' });
    return undefined;
  }
  return value;
}

/**
 * Lee la lista de cursos en los que se imparte: al menos uno y como mucho 100, cada uno con su `courseId`
 * (UUID, sin repetir sin distinguir mayúsculas) y sus sesiones semanales. Los errores de cada curso salen
 * en su orden (`courseId` y después `sessionsPerWeek`). Devuelve `undefined` si hay algún error.
 */
function parseCourses(value: unknown, details: FieldError[]): NewSubjectCourse[] | undefined {
  if (value === undefined || value === null) {
    details.push({ field: 'courses', code: 'REQUIRED' });
    return undefined;
  }
  if (!Array.isArray(value)) {
    details.push({ field: 'courses', code: 'INVALID_FORMAT' });
    return undefined;
  }
  if (value.length === 0) {
    details.push({ field: 'courses', code: 'REQUIRED' });
    return undefined;
  }
  if (value.length > MAX_SUBJECT_COURSES) {
    details.push({ field: 'courses', code: 'INVALID_LENGTH' });
    return undefined;
  }

  const before = details.length;
  const seen = new Set<string>();
  const courses: NewSubjectCourse[] = [];
  value.forEach((raw: unknown, index) => {
    const prefix = `courses[${String(index)}]`;
    if (!isRecord(raw)) {
      details.push({ field: prefix, code: 'INVALID_FORMAT' });
      return;
    }

    let courseId: string | undefined;
    if (raw.courseId === undefined || raw.courseId === null) {
      details.push({ field: `${prefix}.courseId`, code: 'REQUIRED' });
    } else {
      const parsed = courseIdSchema.safeParse(raw.courseId);
      if (!parsed.success) {
        details.push({ field: `${prefix}.courseId`, code: 'INVALID_FORMAT' });
      } else if (seen.has(parsed.data.toLowerCase())) {
        details.push({ field: `${prefix}.courseId`, code: 'DUPLICATE' });
      } else {
        courseId = parsed.data.toLowerCase();
        seen.add(courseId);
      }
    }

    const sessionsPerWeek = parseSessions(
      raw.sessionsPerWeek,
      `${prefix}.sessionsPerWeek`,
      details,
    );
    if (courseId !== undefined && sessionsPerWeek !== undefined) {
      courses.push({ courseId, sessionsPerWeek });
    }
  });
  return details.length > before ? undefined : courses;
}

/**
 * Valida y limpia el cuerpo de `POST /api/subjects` con las reglas de US-SUBJECT. Devuelve un `{ field, code }`
 * por cada campo inválido, sin detenerse en el primero y en el orden del cuerpo: `name`, `code`, `type`,
 * `status`, `description`, `color` y `courses` (y `courses[<i>].…`). El código y la descripción vacíos se
 * guardan como `null`. Ignora las propiedades desconocidas (el colegio nunca se lee del cuerpo).
 */
export function parseCreateSubjectRequest(body: unknown): ParseCreateSubjectResult {
  const source = isRecord(body) ? body : {};
  const details: FieldError[] = [];

  const name = parseName(source, details);
  const code = parseOptionalText(
    source.code,
    'code',
    { clean: cleanCode, max: MAX_SUBJECT_CODE, characters: CODE_CHARACTERS },
    details,
  );
  const type = parseOption(source.type, 'type', SUBJECT_TYPES, details);
  const status = parseOption(source.status, 'status', SUBJECT_STATUSES, details);
  const description = parseOptionalText(
    source.description,
    'description',
    { clean: (text) => text.normalize('NFC').trim(), max: MAX_SUBJECT_DESCRIPTION },
    details,
  );
  const color = parseOption(source.color, 'color', SUBJECT_COLORS, details);
  const courses = parseCourses(source.courses, details);

  if (
    details.length > 0 ||
    name === undefined ||
    code === undefined ||
    type === undefined ||
    status === undefined ||
    description === undefined ||
    color === undefined ||
    courses === undefined
  ) {
    return { success: false, details };
  }
  return { success: true, data: { name, code, type, status, description, color, courses } };
}
