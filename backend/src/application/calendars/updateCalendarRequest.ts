import {
  parseCreateCalendarRequest,
  type ParseCreateCalendarResult,
} from './createCalendarRequest.js';

/** Estado final de un calendario ya validado: tiene la misma forma que uno nuevo. */
export type ParseUpdateCalendarResult = ParseCreateCalendarResult;

/**
 * Lee el cuerpo de `PUT /api/calendars/{id}` (US-BASE_b): el estado final del calendario, con la misma forma,
 * las mismas reglas y el mismo orden de errores que el alta. Un `courseIds` ausente es la lista vacía: el
 * calendario se queda sin cursos. Delega en el parser del alta para que la tabla compartida con el
 * frontend (`test-fixtures/calendar-fields.json`) valga para las dos operaciones.
 */
export function parseUpdateCalendarRequest(body: unknown): ParseUpdateCalendarResult {
  return parseCreateCalendarRequest(body);
}
