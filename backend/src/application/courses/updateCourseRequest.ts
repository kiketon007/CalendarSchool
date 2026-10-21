import { z } from 'zod';
import type { FieldError } from '../validationError.js';
import { isRecord, parseCourseBody } from './courseFields.js';

const CLASS_ID = z.uuid();

/** Clase del estado final pedido: con `id` si ya la tiene el curso, sin él si es nueva. */
export interface UpdateClassInput {
  id?: string;
  name: string;
  /**
   * Tutor pedido (US09_b): ausente, el tutor de la clase no cambia; `null`, se quita; un UUID (en
   * minúsculas), ese profesor pasa a ser su tutor.
   */
  tutorId?: string | null;
}

/** Estado final pedido del curso ya validado: nombres limpios y sin colegio. */
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
 * errores de `classes[<i>].id` salen antes que los de `classes[<i>].name` de la misma clase.
 *
 * El `tutorId` de cada clase (US09_b) es opcional y distingue tres casos: ausente (el tutor no cambia),
 * `null` (se quita) y un UUID (se asigna, y se devuelve en minúsculas). Cualquier otro valor es
 * `INVALID_FORMAT` y el mismo profesor en dos clases es `DUPLICATE` desde la segunda, sin distinguir
 * mayúsculas; sus errores salen después de los del `id` y antes de los del nombre. Ignora las propiedades
 * desconocidas (el colegio no se lee nunca del cuerpo).
 */
export function parseUpdateCourseRequest(body: unknown): ParseUpdateCourseResult {
  const source = isRecord(body) ? body : {};
  const details: FieldError[] = [];
  const seenIds = new Set<string>();
  const seenTutors = new Set<string>();

  /** El `id` de la clase, si lo trae y es válido y nuevo en el cuerpo. */
  function readId(rawClass: unknown, index: number, errors: FieldError[]): { id?: string } {
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
  }

  /** El `tutorId` de la clase: ausente, `null` o un UUID en minúsculas que no esté en otra clase. */
  function readTutor(
    rawClass: unknown,
    index: number,
    errors: FieldError[],
  ): { tutorId?: string | null } {
    const rawTutor = isRecord(rawClass) ? rawClass.tutorId : undefined;
    if (rawTutor === undefined) {
      return {};
    }
    if (rawTutor === null) {
      return { tutorId: null };
    }
    const field = `classes[${String(index)}].tutorId`;
    const parsed = CLASS_ID.safeParse(rawTutor);
    if (!parsed.success) {
      errors.push({ field, code: 'INVALID_FORMAT' });
      return {};
    }
    const tutorId = parsed.data.toLowerCase();
    if (seenTutors.has(tutorId)) {
      errors.push({ field, code: 'DUPLICATE' });
      return {};
    }
    seenTutors.add(tutorId);
    return { tutorId };
  }

  const { name, classes } = parseCourseBody<{ id?: string; tutorId?: string | null }>(
    source,
    details,
    (rawClass, index, errors) => ({
      ...readId(rawClass, index, errors),
      ...readTutor(rawClass, index, errors),
    }),
  );

  if (details.length > 0 || name === undefined) {
    return { success: false, details };
  }
  return { success: true, data: { name, classes } };
}
