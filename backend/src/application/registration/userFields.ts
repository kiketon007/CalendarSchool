import { z } from 'zod';
import {
  emailField,
  MAX_PASSWORD_BYTES,
  normalized,
  text,
  utf8ByteLength,
} from '../credentials/credentialFields.js';
import type { FieldError, FieldErrorCode } from '../validationError.js';

// Letras del castellano y del valenciano, con sus mayúsculas.
export const LETTERS = 'A-Za-záéíóúàèòïüçñÁÉÍÓÚÀÈÒÏÜÇÑ';
/** Personas: letras, dígitos, `·`, espacios, guiones y apóstrofos. */
const PERSON_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9· '’-]+$`);
const PASSWORD_SYMBOLS = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/;

const MAX_PERSON_NAME = 100;
const MIN_PASSWORD = 8;

/** Campo de texto libre: obligatorio, normalizado (NFC y espacios recortados), con longitud y caracteres. */
export function textField(min: number, max: number, characters: RegExp) {
  let checks = z.string().min(1, { error: 'REQUIRED' });
  if (min > 1) {
    checks = checks.min(min, { error: 'INVALID_LENGTH' });
  }
  return text()
    .transform(normalized)
    .pipe(
      checks
        .max(max, { error: 'INVALID_LENGTH' })
        .regex(characters, { error: 'INVALID_CHARACTERS' }),
    );
}

/**
 * Reglas de los campos de la persona que se da de alta, las mismas en el registro de un colegio
 * (US01_b) y en la aceptación de una invitación (US02_b4). Las comprueba el test compartido con la
 * tabla `test-fixtures/registration-fields.json`.
 */
export const USER_FIELD_SCHEMAS = {
  firstName: textField(1, MAX_PERSON_NAME, PERSON_NAME_CHARACTERS),
  lastName: textField(1, MAX_PERSON_NAME, PERSON_NAME_CHARACTERS),
  email: emailField,
  // La contraseña no se recorta ni se normaliza: se hashea tal como llega.
  password: text().pipe(
    z
      .string()
      .min(1, { error: 'REQUIRED' })
      .min(MIN_PASSWORD, { error: 'INVALID_LENGTH' })
      .refine((password) => utf8ByteLength(password) <= MAX_PASSWORD_BYTES, {
        error: 'INVALID_LENGTH',
      })
      .refine(
        (password) =>
          /[A-Z]/.test(password) &&
          /[a-z]/.test(password) &&
          /\d/.test(password) &&
          PASSWORD_SYMBOLS.test(password),
        { error: 'WEAK_PASSWORD' },
      ),
  ),
  // Solo vale `true`: ausente, `false` o de cualquier otro tipo es REQUIRED (no se acepta «por defecto»).
  privacyPolicyAccepted: z.literal(true, { error: 'REQUIRED' }),
} as const;

export type ParsedFields =
  { success: true; data: Record<string, unknown> } | { success: false; details: FieldError[] };

/**
 * Valida cada campo de `schemas` contra el cuerpo y devuelve un `{ field, code }` por cada campo
 * inválido, sin detenerse en el primero. Un cuerpo que no es un objeto se trata como vacío y las
 * propiedades que no figuran en `schemas` se ignoran.
 */
export function parseFields(body: unknown, schemas: Record<string, z.ZodType>): ParsedFields {
  const source: Record<string, unknown> =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const details: FieldError[] = [];
  const data: Record<string, unknown> = {};
  for (const [field, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(source[field]);
    if (result.success) {
      data[field] = result.data;
    } else {
      details.push({ field, code: result.error.issues[0]?.message as FieldErrorCode });
    }
  }

  return details.length === 0 ? { success: true, data } : { success: false, details };
}
