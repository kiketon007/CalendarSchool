import type { ProfessorPosition } from '../../domain/professor/professor.js';
import type { FieldError } from '../validationError.js';
import { parseCreateProfessorRequest } from './createProfessorRequest.js';

/** Estado final de un profesor ya validado: nombres limpios y `classId` con tres estados. */
export interface UpdateProfessorInput {
  firstName: string;
  lastName: string;
  position: ProfessorPosition | null;
  /** UUID: asigna la clase; `null`: sin clase; `undefined` (ausente): no toca la tutoría. */
  classId: string | null | undefined;
}

export type ParseUpdateProfessorResult =
  { success: true; data: UpdateProfessorInput } | { success: false; details: FieldError[] };

/**
 * Valida y limpia el cuerpo de `PUT /api/professors/{id}` (US12). Las reglas de los campos son las de la
 * creación, así que se reutiliza su validación entera (mismos códigos y mismo orden de errores:
 * `firstName`, `lastName`, `position` y `classId`). La diferencia es que, al editar, un `classId`
 * ausente significa «no tocar la tutoría» y no «sin clase», como el `tutorId` de la edición de un curso.
 */
export function parseUpdateProfessorRequest(body: unknown): ParseUpdateProfessorResult {
  const classIdProvided =
    typeof body === 'object' && body !== null && 'classId' in body && body.classId !== undefined;

  const parsed = parseCreateProfessorRequest(body);
  if (!parsed.success) {
    return parsed;
  }
  return {
    success: true,
    data: { ...parsed.data, classId: classIdProvided ? parsed.data.classId : undefined },
  };
}
