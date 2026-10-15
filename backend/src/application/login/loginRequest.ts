import { z } from 'zod';
import {
  emailField,
  MAX_PASSWORD_BYTES,
  text,
  utf8ByteLength,
} from '../credentials/credentialFields.js';
import type { FieldError, FieldErrorCode } from '../validationError.js';

/** Credenciales del login ya validadas y normalizadas (sin el captcha, que verifica otro paso). */
export interface LoginInput {
  email: string;
  password: string;
}

export type ParseLoginResult =
  { success: true; data: LoginInput } | { success: false; details: FieldError[] };

const FIELD_SCHEMAS = {
  email: emailField,
  // La contraseña no se recorta ni se normaliza: se compara tal como llega. No lleva las reglas de
  // mínimo y variedad del registro, que solo valen para contraseñas nuevas: una cuenta puede tener
  // una anterior a ellas, y rechazarla aquí revelaría la política en lugar de dar el 401 genérico.
  password: text().pipe(
    z
      .string()
      .min(1, { error: 'REQUIRED' })
      .refine((password) => utf8ByteLength(password) <= MAX_PASSWORD_BYTES, {
        error: 'INVALID_LENGTH',
      }),
  ),
} as const;

type FieldName = keyof typeof FIELD_SCHEMAS;
const FIELD_NAMES = Object.keys(FIELD_SCHEMAS) as FieldName[];

/**
 * Valida y normaliza el cuerpo del login. Devuelve un `{ field, code }` por cada campo inválido, sin
 * detenerse en el primero. Ignora las propiedades desconocidas, como `captcha`, que verifica otro paso.
 */
export function parseLoginRequest(body: unknown): ParseLoginResult {
  const source: Record<string, unknown> =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const details: FieldError[] = [];
  const data: Record<string, unknown> = {};
  for (const field of FIELD_NAMES) {
    const result = FIELD_SCHEMAS[field].safeParse(source[field]);
    if (result.success) {
      data[field] = result.data;
    } else {
      details.push({ field, code: result.error.issues[0]?.message as FieldErrorCode });
    }
  }

  return details.length === 0
    ? { success: true, data: data as unknown as LoginInput }
    : { success: false, details };
}
