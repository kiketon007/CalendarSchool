import type { FieldError } from '../validationError.js';
import { isRecord, parseCourseBody } from './courseFields.js';

/** Curso nuevo ya validado: nombres limpios, sin colegio ni tutor (no los decide el cliente). */
export interface CreateCourseInput {
  name: string;
  classes: { name: string }[];
}

export type ParseCreateCourseResult =
  { success: true; data: CreateCourseInput } | { success: false; details: FieldError[] };

/**
 * Valida y limpia el cuerpo de `POST /api/courses` con las reglas de la historia US05 (las de
 * `parseCourseBody`). Devuelve un `{ field, code }` por cada campo inválido, sin detenerse en el primero.
 * Ignora las propiedades desconocidas (el colegio y el tutor no se leen nunca del cuerpo).
 */
export function parseCreateCourseRequest(body: unknown): ParseCreateCourseResult {
  const source = isRecord(body) ? body : {};
  const details: FieldError[] = [];

  const { name, classes } = parseCourseBody(source, details, () => ({}));

  if (details.length > 0 || name === undefined) {
    return { success: false, details };
  }
  return { success: true, data: { name, classes } };
}
