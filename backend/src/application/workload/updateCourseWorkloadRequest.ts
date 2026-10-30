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

/** Máximo de sesiones sueltas al día que admite una regla `MAX_PER_DAY`. */
const MAX_PER_DAY_RANGE = { min: 2, max: 5 } as const;
/** Tamaños de bloque que admite una regla `BLOCK`. */
const BLOCK_SIZE_RANGE = { min: 2, max: 3 } as const;

/**
 * Lee un entero de un cambio dentro de `[min, max]` (`OUT_OF_RANGE` fuera, `INVALID_FORMAT` si no es un
 * entero) o `null`. Ausente es `REQUIRED`: un cambio dice siempre la fila entera. Devuelve `undefined` (con
 * el error en `details`) si no vale.
 */
function parseBoundedInteger(
  value: unknown,
  field: string,
  range: { readonly min: number; readonly max: number },
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
  if (value < range.min || value > range.max) {
    details.push({ field, code: 'OUT_OF_RANGE' });
    return undefined;
  }
  return value;
}

/**
 * Valida el cuerpo de `PATCH /api/courses/{id}/workload` (US19, US19_b):
 * `{ changes: [{ subjectId, sessionsPerWeek, maxPerDay, blockSize }] }` con **solo las filas que cambian**, cada
 * una entera. Devuelve un `{ field, code }` por cada campo inválido, sin detenerse en el primero y en el orden
 * del cuerpo (en cada cambio, `subjectId`, `sessionsPerWeek`, `maxPerDay` y `blockSize`): `changes`
 * (`REQUIRED`, `INVALID_FORMAT` o `INVALID_LENGTH` si está vacía o pasa de 200) y `changes[<i>]…`
 * (`INVALID_FORMAT`, `REQUIRED`, `DUPLICATE` desde la segunda aparición de una asignatura, `OUT_OF_RANGE` y
 * `NOT_ALLOWED` para una regla de una asignatura que deja de impartirse).
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

    /** Una regla: su rango y, si la asignatura deja de impartirse, solo admite `null` (`NOT_ALLOWED`). */
    const parseRule = (
      ruleValue: unknown,
      field: string,
      range: { readonly min: number; readonly max: number },
    ) => {
      const parsed = parseBoundedInteger(ruleValue, field, range, details);
      if (parsed !== null && parsed !== undefined && raw.sessionsPerWeek === null) {
        details.push({ field, code: 'NOT_ALLOWED' });
        return undefined;
      }
      return parsed;
    };

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

    const sessionsPerWeek = parseBoundedInteger(
      raw.sessionsPerWeek,
      `${prefix}.sessionsPerWeek`,
      { min: MIN_SESSIONS_PER_WEEK, max: MAX_SESSIONS_PER_WEEK },
      details,
    );
    const maxPerDay = parseRule(raw.maxPerDay, `${prefix}.maxPerDay`, MAX_PER_DAY_RANGE);
    const blockSize = parseRule(raw.blockSize, `${prefix}.blockSize`, BLOCK_SIZE_RANGE);
    if (
      subjectId !== undefined &&
      sessionsPerWeek !== undefined &&
      maxPerDay !== undefined &&
      blockSize !== undefined
    ) {
      changes.push({ subjectId, sessionsPerWeek, maxPerDay, blockSize });
    }
  });

  return details.length > 0 ? { success: false, details } : { success: true, data: { changes } };
}
