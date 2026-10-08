import type { components } from '../api/generated/schema';

export type FieldErrorCode = components['schemas']['FieldErrorCode'];

/** Campos del formulario de registro, en el orden en que se muestran. */
export const REGISTRATION_FIELDS = [
  'schoolName',
  'municipalityCode',
  'firstName',
  'lastName',
  'email',
  'password',
] as const;

export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];
export type RegistrationFormValues = Record<RegistrationField, string>;
export type RegistrationErrors = Partial<Record<RegistrationField, FieldErrorCode>>;

// Las reglas son las mismas que valida el backend (registerSchoolRequest.ts). Ambos lados
// recorren la tabla test-fixtures/registration-fields.json para que no diverjan.

// Letras del castellano y del valenciano, con sus mayúsculas.
const LETTERS = 'A-Za-záéíóúàèòïüçñÁÉÍÓÚÀÈÒÏÜÇÑ';
const SCHOOL_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9· '’.ºª-]+$`);
const PERSON_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9· '’-]+$`);
const EMAIL_FORMAT =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const MUNICIPALITY_CODE_FORMAT = /^\d{5}$/;
const PASSWORD_SYMBOLS = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/;

const MAX_SCHOOL_NAME = 150;
const MAX_PERSON_NAME = 100;
const MAX_EMAIL = 320;
const MIN_PASSWORD = 8;
/** Bcrypt solo usa los primeros 72 bytes: se rechaza lo que exceda en lugar de truncarlo. */
const MAX_PASSWORD_BYTES = 72;

const utf8Encoder = new TextEncoder();

/** NFC y `trim()` antes de validar, para que los acentos descompuestos (NFD) no fallen. */
const normalized = (value: string) => value.normalize('NFC').trim();

type Rule = (value: string) => FieldErrorCode | undefined;

/** Texto obligatorio con longitud y caracteres permitidos; la primera regla incumplida gana. */
function textRule(min: number, max: number, characters: RegExp): Rule {
  return (raw) => {
    const value = normalized(raw);
    if (value.length === 0) {
      return 'REQUIRED';
    }
    if (value.length < min || value.length > max) {
      return 'INVALID_LENGTH';
    }
    return characters.test(value) ? undefined : 'INVALID_CHARACTERS';
  };
}

/** Una dirección IP (`usuario@192.168.1.1`) casa con la regex, pero la historia la rechaza. */
function hasNumericTopLevelDomain(email: string): boolean {
  return /^\d+$/.test(email.slice(email.lastIndexOf('.') + 1));
}

const emailRule: Rule = (raw) => {
  const value = normalized(raw).toLowerCase();
  if (value.length === 0) {
    return 'REQUIRED';
  }
  if (value.length > MAX_EMAIL) {
    return 'INVALID_LENGTH';
  }
  return EMAIL_FORMAT.test(value) && !hasNumericTopLevelDomain(value)
    ? undefined
    : 'INVALID_FORMAT';
};

// La contraseña no se recorta ni se normaliza: se hashea tal como llega.
const passwordRule: Rule = (value) => {
  if (value.length === 0) {
    return 'REQUIRED';
  }
  if (value.length < MIN_PASSWORD || utf8Encoder.encode(value).length > MAX_PASSWORD_BYTES) {
    return 'INVALID_LENGTH';
  }
  const hasVariety =
    /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && PASSWORD_SYMBOLS.test(value);
  return hasVariety ? undefined : 'WEAK_PASSWORD';
};

const RULES: Record<RegistrationField, Rule> = {
  schoolName: textRule(2, MAX_SCHOOL_NAME, SCHOOL_NAME_CHARACTERS),
  municipalityCode: (value) => {
    if (value.length === 0) {
      return 'REQUIRED';
    }
    return MUNICIPALITY_CODE_FORMAT.test(value) ? undefined : 'INVALID_FORMAT';
  },
  firstName: textRule(1, MAX_PERSON_NAME, PERSON_NAME_CHARACTERS),
  lastName: textRule(1, MAX_PERSON_NAME, PERSON_NAME_CHARACTERS),
  email: emailRule,
  password: passwordRule,
};

/** Código del primer error de un campo, o `undefined` si es válido. */
export function validateField(field: RegistrationField, value: string): FieldErrorCode | undefined {
  return RULES[field](value);
}

/** Errores de todos los campos inválidos, uno por campo. */
export function validateRegistration(values: RegistrationFormValues): RegistrationErrors {
  const errors: RegistrationErrors = {};
  for (const field of REGISTRATION_FIELDS) {
    const code = validateField(field, values[field]);
    if (code) {
      errors[field] = code;
    }
  }
  return errors;
}
