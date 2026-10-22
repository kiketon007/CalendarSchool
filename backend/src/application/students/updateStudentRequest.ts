import {
  parseCreateStudentRequest,
  type CreateStudentInput,
  type ParseCreateStudentResult,
} from './createStudentRequest.js';

/** Estado final de un alumno ya validado: los mismos campos que el alta, con textos limpios. */
export type UpdateStudentInput = CreateStudentInput;

export type ParseUpdateStudentResult = ParseCreateStudentResult;

/**
 * Valida y limpia el cuerpo de `PUT /api/students/{id}` (US17). Es el **estado final** del alumno, con
 * las mismas reglas que el alta (mismos códigos, mismo orden de errores: `firstName`, `lastName`,
 * `courseId`, `classId`, `cafeteria`, `scholarship`, `foodType` y `observations`), así que se reutiliza su
 * validación entera. A diferencia de la edición de un profesor, lo que falta o es `null` (`classId`,
 * `foodType`, `observations`) deja el campo vacío: no hay un «no tocar».
 */
export function parseUpdateStudentRequest(body: unknown): ParseUpdateStudentResult {
  return parseCreateStudentRequest(body);
}
