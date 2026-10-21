import type { components } from '../api/generated/schema';
import { validateField } from './registrationValidation';

export type FieldErrorCode = components['schemas']['FieldErrorCode'];
type FieldError = components['schemas']['FieldError'];

/** Cargos que puede tener un profesor, en el orden del desplegable. */
export const PROFESSOR_POSITIONS = ['DIRECTOR', 'JEFE_ESTUDIOS'] as const;

/** Campos del formulario de un profesor. */
export const PROFESSOR_FIELDS = ['firstName', 'lastName', 'position', 'classId'] as const;
export type ProfessorField = (typeof PROFESSOR_FIELDS)[number];

/** Lo que hay en el formulario: el cargo y la clase vacíos significan «sin cargo» y «sin clase». */
export type ProfessorFormValues = Record<ProfessorField, string>;
export type ProfessorErrors = Partial<Record<ProfessorField, FieldErrorCode>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// Las reglas son las mismas que valida el backend (createProfessorRequest.ts). Ambos lados recorren la
// tabla test-fixtures/professor-fields.json para que no diverjan.

/** El cargo es opcional; si hay valor, debe ser uno de los conocidos. */
export function validateProfessorPosition(value: string): FieldErrorCode | undefined {
  return value === '' || (PROFESSOR_POSITIONS as readonly string[]).includes(value)
    ? undefined
    : 'INVALID_FORMAT';
}

/** La clase es opcional; si hay valor, debe ser un UUID. */
export function validateProfessorClass(value: string): FieldErrorCode | undefined {
  return value === '' || UUID.test(value) ? undefined : 'INVALID_FORMAT';
}

/**
 * Valida el formulario como el backend: el nombre y el apellido con las reglas del registro. Devuelve
 * `null` si todo es válido.
 */
export function validateProfessor(values: ProfessorFormValues): ProfessorErrors | null {
  const errors: ProfessorErrors = {};
  const checks: Record<ProfessorField, FieldErrorCode | undefined> = {
    firstName: validateField('firstName', values.firstName),
    lastName: validateField('lastName', values.lastName),
    position: validateProfessorPosition(values.position),
    classId: validateProfessorClass(values.classId),
  };
  for (const field of PROFESSOR_FIELDS) {
    const code = checks[field];
    if (code) {
      errors[field] = code;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/** Traduce los errores de campo de una respuesta `400` del servidor a los del formulario; ignora los demás. */
export function professorErrorsFromServer(details: FieldError[]): ProfessorErrors {
  const errors: ProfessorErrors = {};
  for (const { field, code } of details) {
    if ((PROFESSOR_FIELDS as readonly string[]).includes(field)) {
      errors[field as ProfessorField] = code;
    }
  }
  return errors;
}

/** NFC, sin espacios en los extremos y con cada tramo de espacios colapsado en uno. */
const cleaned = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ');

/**
 * Indica si el formulario de edición tiene cambios reales respecto a los valores iniciales: el nombre y
 * el apellido se comparan ya limpios (un espacio de más no cuenta), y el cargo y la clase tal cual
 * (la clase sin distinguir mayúsculas). Deshacer un cambio deja de contarlo.
 */
export function hasProfessorChanges(
  initial: ProfessorFormValues,
  current: ProfessorFormValues,
): boolean {
  return (
    cleaned(initial.firstName) !== cleaned(current.firstName) ||
    cleaned(initial.lastName) !== cleaned(current.lastName) ||
    initial.position !== current.position ||
    initial.classId.toLowerCase() !== current.classId.toLowerCase()
  );
}
