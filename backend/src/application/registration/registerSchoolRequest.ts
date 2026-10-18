import { z } from 'zod';
import { text } from '../credentials/credentialFields.js';
import type { FieldError } from '../validationError.js';
import { LETTERS, parseFields, textField, USER_FIELD_SCHEMAS } from './userFields.js';

/** Datos del registro ya validados y normalizados (sin el captcha, que verifica otro paso). */
export interface RegisterSchoolInput {
  schoolName: string;
  municipalityCode: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** Siempre `true`: sin la aceptación expresa de la política de privacidad no hay registro. */
  privacyPolicyAccepted: true;
}

export type ParseRegisterSchoolResult =
  { success: true; data: RegisterSchoolInput } | { success: false; details: FieldError[] };

/** Colegio: letras, dígitos, `·`, espacios, guiones, apóstrofos, puntos y `º`/`ª`. */
const SCHOOL_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9· '’.ºª-]+$`);
const MUNICIPALITY_CODE_FORMAT = /^\d{5}$/;

const MAX_SCHOOL_NAME = 150;

const FIELD_SCHEMAS = {
  schoolName: textField(2, MAX_SCHOOL_NAME, SCHOOL_NAME_CHARACTERS),
  municipalityCode: text().pipe(
    z
      .string()
      .min(1, { error: 'REQUIRED' })
      .regex(MUNICIPALITY_CODE_FORMAT, { error: 'INVALID_FORMAT' }),
  ),
  ...USER_FIELD_SCHEMAS,
} as const;

/**
 * Valida y normaliza el cuerpo del registro con las reglas de la historia US01_b. Devuelve un
 * `{ field, code }` por cada campo inválido, sin detenerse en el primero. Ignora las propiedades
 * desconocidas, como `captcha`, que verifica otro paso.
 */
export function parseRegisterSchoolRequest(body: unknown): ParseRegisterSchoolResult {
  const result = parseFields(body, FIELD_SCHEMAS);
  return result.success
    ? { success: true, data: result.data as unknown as RegisterSchoolInput }
    : result;
}
