import { validateField, type FieldErrorCode } from './registrationValidation';

/** Campos del formulario de inicio de sesión, en el orden en que se muestran. */
export const LOGIN_FIELDS = ['email', 'password'] as const;

export type LoginField = (typeof LOGIN_FIELDS)[number];
export type LoginFormValues = Record<LoginField, string>;
export type LoginErrors = Partial<Record<LoginField, FieldErrorCode>>;

// Las reglas son las que valida el backend (loginRequest.ts). El email es el del registro, que
// comparten la tabla test-fixtures/registration-fields.json y los dos lados.

/** Bcrypt solo usa los primeros 72 bytes: se rechaza lo que exceda en lugar de truncarlo. */
const MAX_PASSWORD_BYTES = 72;

const utf8Encoder = new TextEncoder();

/**
 * La contraseña solo debe tener valor y caber en Bcrypt. No lleva el mínimo ni la variedad del
 * registro, que valen para contraseñas nuevas: una cuenta puede tener una anterior a ellas, y
 * rechazarla aquí daría pistas de la política en lugar del mensaje genérico del servidor. Tampoco
 * se recorta: se compara tal como se escribió.
 */
function passwordRule(value: string): FieldErrorCode | undefined {
  if (value.length === 0) {
    return 'REQUIRED';
  }
  return utf8Encoder.encode(value).length > MAX_PASSWORD_BYTES ? 'INVALID_LENGTH' : undefined;
}

/** Código del primer error de un campo, o `undefined` si es válido. */
export function validateLoginField(field: LoginField, value: string): FieldErrorCode | undefined {
  return field === 'email' ? validateField('email', value) : passwordRule(value);
}

/** Errores de todos los campos inválidos, uno por campo. */
export function validateLogin(values: LoginFormValues): LoginErrors {
  const errors: LoginErrors = {};
  for (const field of LOGIN_FIELDS) {
    const code = validateLoginField(field, values[field]);
    if (code) {
      errors[field] = code;
    }
  }
  return errors;
}
