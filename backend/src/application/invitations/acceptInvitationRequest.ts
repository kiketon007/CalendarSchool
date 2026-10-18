import type { FieldError } from '../validationError.js';
import { parseFields, USER_FIELD_SCHEMAS } from '../registration/userFields.js';

/** Datos de la persona invitada ya validados y normalizados (sin el token, que se lee aparte). */
export interface AcceptInvitationInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Siempre `true`: sin la aceptación expresa de la política de privacidad no hay alta. */
  privacyPolicyAccepted: true;
}

export type ParseAcceptInvitationResult =
  { success: true; data: AcceptInvitationInput } | { success: false; details: FieldError[] };

/**
 * Valida y normaliza los datos de la persona invitada con las mismas reglas del registro (US01_b).
 * Devuelve un `{ field, code }` por cada campo inválido, sin detenerse en el primero. Ignora las
 * propiedades desconocidas: el colegio y el rol salen de la invitación, nunca del cuerpo.
 */
export function parseAcceptInvitationRequest(body: unknown): ParseAcceptInvitationResult {
  const result = parseFields(body, USER_FIELD_SCHEMAS);
  return result.success
    ? { success: true, data: result.data as unknown as AcceptInvitationInput }
    : result;
}

/** Token del enlace del cuerpo: una cadena no vacía, o `undefined` si falta o tiene otra forma. */
export function readInvitationToken(body: unknown): string | undefined {
  const token =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).token
      : undefined;
  return typeof token === 'string' && token !== '' ? token : undefined;
}
