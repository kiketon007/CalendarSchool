import { isRecord } from '../../application/courses/courseFields.js';
import type { FieldError } from '../../application/validationError.js';

/** El cuerpo de `POST /api/schedule/generate` ya validado. */
export interface StartGenerationRequest {
  /** Si, tras encontrar un horario válido, se mejora con las preferencias. */
  improve: boolean;
}

export type ParseStartGenerationResult =
  { success: true; data: StartGenerationRequest } | { success: false; details: FieldError[] };

/**
 * Valida el cuerpo, **opcional**, de `POST /api/schedule/generate` (US-ALGO-RUN_b): `{ improve?: boolean }`. Sin
 * cuerpo, con `{}` o sin `improve`, se mejora (`true`). Es estricto: un campo desconocido es `NOT_ALLOWED` (así el
 * cliente no puede mandar el colegio ni quien actúa, que salen de la sesión) y un `improve` que no es booleano,
 * `INVALID_FORMAT`. Devuelve un `{ field, code }` por campo inválido, `improve` primero y después los desconocidos.
 */
export function parseStartGenerationRequest(body: unknown): ParseStartGenerationResult {
  if (body === undefined) {
    return { success: true, data: { improve: true } };
  }
  if (!isRecord(body)) {
    return { success: false, details: [{ field: 'body', code: 'INVALID_FORMAT' }] };
  }

  const details: FieldError[] = [];
  const improve = body.improve;
  if ('improve' in body && typeof improve !== 'boolean') {
    details.push({ field: 'improve', code: 'INVALID_FORMAT' });
  }
  for (const field of Object.keys(body)) {
    if (field !== 'improve') {
      details.push({ field, code: 'NOT_ALLOWED' });
    }
  }
  if (details.length > 0) {
    return { success: false, details };
  }
  return { success: true, data: { improve: improve !== false } };
}
