import { z } from 'zod';
import type { FieldError, FieldErrorCode } from '../validationError.js';

/** Datos del registro ya validados y normalizados (sin el captcha, que verifica otro paso). */
export interface RegisterSchoolInput {
  schoolName: string;
  municipalityCode: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export type ParseRegisterSchoolResult =
  { success: true; data: RegisterSchoolInput } | { success: false; details: FieldError[] };

// Letras del castellano y del valenciano, con sus mayúsculas.
const LETTERS = 'A-Za-záéíóúàèòïüçñÁÉÍÓÚÀÈÒÏÜÇÑ';
/** Colegio: letras, dígitos, `·`, espacios, guiones, apóstrofos, puntos y `º`/`ª`. */
const SCHOOL_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9· '’.ºª-]+$`);
/** Personas: como el colegio, sin puntos ni `º`/`ª`. */
const PERSON_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9· '’-]+$`);
/** Regex de email de la historia US01_b (RFC 5321). */
const EMAIL_FORMAT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const MUNICIPALITY_CODE_FORMAT = /^\d{5}$/;
const PASSWORD_SYMBOLS = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/;

const MAX_SCHOOL_NAME = 150;
const MAX_PERSON_NAME = 100;
const MAX_EMAIL = 320;
const MIN_PASSWORD = 8;
/** Bcrypt solo usa los primeros 72 bytes: se rechaza lo que exceda en lugar de truncarlo (D5). */
const MAX_PASSWORD_BYTES = 72;

const utf8Encoder = new TextEncoder();

function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value).length;
}

/** Un campo ausente es REQUIRED; uno que no es texto, INVALID_FORMAT. */
function typeError(issue: { input?: unknown }): FieldErrorCode {
  return issue.input === undefined ? 'REQUIRED' : 'INVALID_FORMAT';
}

const text = () => z.string({ error: typeError });
/** NFC y `trim()` antes de validar, para que los acentos descompuestos (NFD) no fallen. */
const normalized = (value: string) => value.normalize('NFC').trim();

function textField(min: number, max: number, characters: RegExp) {
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

/** Una dirección IP (`usuario@192.168.1.1`) casa con la regex, pero la historia la rechaza. */
function hasNumericTopLevelDomain(email: string): boolean {
  return /^\d+$/.test(email.slice(email.lastIndexOf('.') + 1));
}

const FIELD_SCHEMAS = {
  schoolName: textField(2, MAX_SCHOOL_NAME, SCHOOL_NAME_CHARACTERS),
  municipalityCode: text().pipe(
    z
      .string()
      .min(1, { error: 'REQUIRED' })
      .regex(MUNICIPALITY_CODE_FORMAT, { error: 'INVALID_FORMAT' }),
  ),
  firstName: textField(1, MAX_PERSON_NAME, PERSON_NAME_CHARACTERS),
  lastName: textField(1, MAX_PERSON_NAME, PERSON_NAME_CHARACTERS),
  email: text()
    .transform((value) => normalized(value).toLowerCase())
    .pipe(
      z
        .string()
        .min(1, { error: 'REQUIRED' })
        .max(MAX_EMAIL, { error: 'INVALID_LENGTH' })
        .regex(EMAIL_FORMAT, { error: 'INVALID_FORMAT' })
        .refine((email) => !hasNumericTopLevelDomain(email), { error: 'INVALID_FORMAT' }),
    ),
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
} as const;

type FieldName = keyof typeof FIELD_SCHEMAS;
const FIELD_NAMES = Object.keys(FIELD_SCHEMAS) as FieldName[];

/**
 * Valida y normaliza el cuerpo del registro con las reglas de la historia US01_b. Devuelve un
 * `{ field, code }` por cada campo inválido, sin detenerse en el primero. Ignora las propiedades
 * desconocidas, como `captcha`, que verifica otro paso.
 */
export function parseRegisterSchoolRequest(body: unknown): ParseRegisterSchoolResult {
  const source: Record<string, unknown> =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  const details: FieldError[] = [];
  const data: Record<string, string> = {};
  for (const field of FIELD_NAMES) {
    const result = FIELD_SCHEMAS[field].safeParse(source[field]);
    if (result.success) {
      data[field] = result.data;
    } else {
      details.push({ field, code: result.error.issues[0]?.message as FieldErrorCode });
    }
  }

  return details.length === 0
    ? { success: true, data: data as unknown as RegisterSchoolInput }
    : { success: false, details };
}
