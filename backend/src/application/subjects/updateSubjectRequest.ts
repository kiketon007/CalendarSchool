import {
  parseCreateSubjectRequest,
  type ParseCreateSubjectResult,
} from './createSubjectRequest.js';

/** Estado final de una asignatura ya validado: tiene la misma forma que una nueva. */
export type ParseUpdateSubjectResult = ParseCreateSubjectResult;

/**
 * Lee el cuerpo de `PUT /api/subjects/{id}` (US-SUBJECT_b): el estado final de la asignatura, con la misma
 * forma, las mismas reglas y el mismo orden de errores que el alta. Como en el alta, `courses` lleva al menos
 * un curso, así que una asignatura que se quedó sin cursos no se guarda sin marcar alguno. Delega en el
 * parser del alta para que la tabla compartida con el frontend (`test-fixtures/subject-fields.json`) valga
 * para las dos operaciones.
 */
export function parseUpdateSubjectRequest(body: unknown): ParseUpdateSubjectResult {
  return parseCreateSubjectRequest(body);
}
