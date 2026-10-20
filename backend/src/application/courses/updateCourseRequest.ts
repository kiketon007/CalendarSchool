import { z } from 'zod';
import type { FieldError } from '../validationError.js';
import { isRecord, parseCourseBody } from './courseFields.js';

const CLASS_ID = z.uuid();

/** Clase del estado final pedido: con `id` si ya la tiene el curso, sin él si es nueva. */
export interface UpdateClassInput {
  id?: string;
  name: string;
}

/** Estado final pedido del curso ya validado: nombres limpios, sin colegio ni tutor. */
export interface UpdateCourseInput {
  name: string;
  classes: UpdateClassInput[];
}

export type ParseUpdateCourseResult =
  { success: true; data: UpdateCourseInput } | { success: false; details: FieldError[] };

/**
 * Valida y limpia el cuerpo de `PUT /api/courses/{id}` (US07): las reglas del nombre y de las clases de
 * `POST /api/courses` y, además, el `id` opcional de cada clase, que debe ser un UUID (`INVALID_FORMAT`) y
 * no repetirse en el cuerpo (`DUPLICATE` desde la segunda aparición, sin distinguir mayúsculas). Los
 * errores de `classes[<i>].id` salen antes que los de `classes[<i>].name` de la misma clase. Ignora las
 * propiedades desconocidas (el colegio y el tutor no se leen nunca del cuerpo).
 */
export function parseUpdateCourseRequest(body: unknown): ParseUpdateCourseResult {
  const source = isRecord(body) ? body : {};
  const details: FieldError[] = [];
  const seenIds = new Set<string>();

  const { name, classes } = parseCourseBody<{ id?: string }>(
    source,
    details,
    (rawClass, index, errors) => {
      const rawId = isRecord(rawClass) ? rawClass.id : undefined;
      if (rawId === undefined) {
        return {};
      }
      const field = `classes[${String(index)}].id`;
      const parsed = CLASS_ID.safeParse(rawId);
      if (!parsed.success) {
        errors.push({ field, code: 'INVALID_FORMAT' });
        return {};
      }
      const id = parsed.data.toLowerCase();
      if (seenIds.has(id)) {
        errors.push({ field, code: 'DUPLICATE' });
        return {};
      }
      seenIds.add(id);
      return { id: parsed.data };
    },
  );

  if (details.length > 0 || name === undefined) {
    return { success: false, details };
  }
  return { success: true, data: { name, classes } };
}
