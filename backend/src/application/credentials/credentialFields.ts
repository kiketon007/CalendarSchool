import { z } from 'zod';
import type { FieldErrorCode } from '../validationError.js';

/**
 * Reglas de los campos de credenciales que comparten el registro y el inicio de sesión, para que el
 * mismo email no se valide de dos formas. Las reglas de la contraseña nueva (mínimo y variedad) son
 * solo del registro.
 */

/** Regex de email de la historia US01_b (RFC 5321). */
const EMAIL_FORMAT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const MAX_EMAIL = 320;

/** Bcrypt solo usa los primeros 72 bytes: se rechaza lo que exceda en lugar de truncarlo (D5). */
export const MAX_PASSWORD_BYTES = 72;

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).length;
}

/** Un campo ausente es REQUIRED; uno que no es texto, INVALID_FORMAT. */
function typeError(issue: { input?: unknown }): FieldErrorCode {
  return issue.input === undefined ? 'REQUIRED' : 'INVALID_FORMAT';
}

export const text = () => z.string({ error: typeError });

/** NFC y `trim()` antes de validar, para que los acentos descompuestos (NFD) no fallen. */
export const normalized = (value: string) => value.normalize('NFC').trim();

/** Una dirección IP (`usuario@192.168.1.1`) casa con la regex, pero la historia la rechaza. */
function hasNumericTopLevelDomain(email: string): boolean {
  return /^\d+$/.test(email.slice(email.lastIndexOf('.') + 1));
}

/** Email normalizado (recortado y en minúsculas) y validado con la regla de la historia US01_b. */
export const emailField = text()
  .transform((value) => normalized(value).toLowerCase())
  .pipe(
    z
      .string()
      .min(1, { error: 'REQUIRED' })
      .max(MAX_EMAIL, { error: 'INVALID_LENGTH' })
      .regex(EMAIL_FORMAT, { error: 'INVALID_FORMAT' })
      .refine((email) => !hasNumericTopLevelDomain(email), { error: 'INVALID_FORMAT' }),
  );
