import { z } from 'zod';
import { MAX_SESSIONS_PER_WEEK, MIN_SESSIONS_PER_WEEK } from '../../domain/subject/subject.js';
import type { CourseWorkloadChange } from '../../domain/workload/courseWorkload.js';
import { isRecord } from '../courses/courseFields.js';
import type { FieldError } from '../validationError.js';

/** Máximo de cambios en una petición: caben de sobra todas las asignaturas de un colegio. */
export const MAX_WORKLOAD_CHANGES = 200;

const subjectIdSchema = z.uuid();

/** Cambios de la carga de un curso ya validados: ids en minúsculas y sin repetir. */
export interface UpdateCourseWorkloadInput {
  changes: CourseWorkloadChange[];
}

export type ParseUpdateCourseWorkloadResult =
  { success: true; data: UpdateCourseWorkloadInput } | { success: false; details: FieldError[] };

/**
 * Lee las sesiones de un cambio: un entero de 1 a 5 (`OUT_OF_RANGE` fuera, `INVALID_FORMAT` si no es un
 * entero) o `null`, que quita la asignatura del curso. Ausente es `REQUIRED`: un cambio dice siempre qué
 * hace. Devuelve `undefined` (con el error en `details`) si no vale.
 */
function parseSessions(
  value: unknown,
  field: string,
  details: FieldError[],
): number | null | undefined {
  if (value === undefined) {
    details.push({ field, code: 'REQUIRED' });
    return undefined;
  }
  if (value === null) {
    return null;
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
 * Valida el cuerpo de `PATCH /api/courses/{id}/workload` (US19): `{ changes: [{ subjectId, sessionsPerWeek }] }`
 * con **solo las filas que cambian**. Devuelve un `{ field, code }` por cada campo inválido, sin detenerse en
 * el primero y en el orden del cuerpo (en cada cambio, `subjectId` y después `sessionsPerWeek`): `changes`
 * (`REQUIRED`, `INVALID_FORMAT` o `INVALID_LENGTH` si está vacía o pasa de 200) y `changes[<i>]…`
 * (`INVALID_FORMAT`, `REQUIRED`, `DUPLICATE` desde la segunda aparición de una asignatura y `OUT_OF_RANGE`).
 * Ignora las propiedades desconocidas: el colegio y el curso nunca salen del cuerpo.
 */
export function parseUpdateCourseWorkloadRequest(body: unknown): ParseUpdateCourseWorkloadResult {
  const value = isRecord(body) ? body.changes : undefined;
  if (value === undefined || value === null) {
    return { success: false, details: [{ field: 'changes', code: 'REQUIRED' }] };
  }
  if (!Array.isArray(value)) {
    return { success: false, details: [{ field: 'changes', code: 'INVALID_FORMAT' }] };
  }
  if (value.length === 0 || value.length > MAX_WORKLOAD_CHANGES) {
    return { success: false, details: [{ field: 'changes', code: 'INVALID_LENGTH' }] };
  }

  const details: FieldError[] = [];
  const seen = new Set<string>();
  const changes: CourseWorkloadChange[] = [];
  value.forEach((raw: unknown, index) => {
    const prefix = `changes[${String(index)}]`;
    if (!isRecord(raw)) {
      details.push({ field: prefix, code: 'INVALID_FORMAT' });
      return;
    }

    let subjectId: string | undefined;
    if (raw.subjectId === undefined || raw.subjectId === null) {
      details.push({ field: `${prefix}.subjectId`, code: 'REQUIRED' });
    } else {
      const parsed = subjectIdSchema.safeParse(raw.subjectId);
      if (!parsed.success) {
        details.push({ field: `${prefix}.subjectId`, code: 'INVALID_FORMAT' });
      } else if (seen.has(parsed.data.toLowerCase())) {
        details.push({ field: `${prefix}.subjectId`, code: 'DUPLICATE' });
      } else {
        subjectId = parsed.data.toLowerCase();
        seen.add(subjectId);
      }
    }

    const sessionsPerWeek = parseSessions(
      raw.sessionsPerWeek,
      `${prefix}.sessionsPerWeek`,
      details,
    );
    if (subjectId !== undefined && sessionsPerWeek !== undefined) {
      changes.push({ subjectId, sessionsPerWeek });
    }
  });

  return details.length > 0 ? { success: false, details } : { success: true, data: { changes } };
}
