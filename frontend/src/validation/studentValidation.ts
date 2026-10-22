import type { components } from '../api/generated/schema';
import { toStudentBody } from '../services/studentsService';
import { validateField } from './registrationValidation';

export type FieldErrorCode = components['schemas']['FieldErrorCode'];
type FieldError = components['schemas']['FieldError'];

/** Máximo de caracteres del tipo de comida y de las observaciones (como el backend). */
export const FOOD_TYPE_MAX_LENGTH = 255;
export const OBSERVATIONS_MAX_LENGTH = 5000;

/** Campos del formulario de un alumno (la beca es una casilla: solo el servidor puede rechazarla). */
export const STUDENT_FIELDS = [
  'firstName',
  'lastName',
  'courseId',
  'classId',
  'cafeteria',
  'scholarship',
  'foodType',
  'observations',
] as const;
export type StudentField = (typeof STUDENT_FIELDS)[number];

/**
 * Lo que hay en el formulario. La clase vacía es «sin clase»; el comedor empieza sin elegir (`''`) y
 * se exige elegir; la beca y el tipo de comida solo cuentan con comedor.
 */
export interface StudentFormValues {
  firstName: string;
  lastName: string;
  courseId: string;
  classId: string;
  cafeteria: '' | 'yes' | 'no';
  scholarship: boolean;
  foodType: string;
  observations: string;
}
export type StudentErrors = Partial<Record<StudentField, FieldErrorCode>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

// Las reglas son las mismas que valida el backend (createStudentRequest.ts). Ambos lados recorren la
// tabla test-fixtures/student-fields.json para que no diverjan.

/** NFC, sin espacios en los extremos y con cada tramo de espacios colapsado en uno. */
const cleaned = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ');

/** Longitud en caracteres (puntos de código), como la mide el backend. */
const lengthOf = (value: string) => Array.from(value).length;

/** El curso es obligatorio y debe ser un UUID. */
export function validateStudentCourse(value: string): FieldErrorCode | undefined {
  if (value === '') {
    return 'REQUIRED';
  }
  return UUID.test(value) ? undefined : 'INVALID_FORMAT';
}

/** La clase es opcional; si hay valor, debe ser un UUID. */
export function validateStudentClass(value: string): FieldErrorCode | undefined {
  return value === '' || UUID.test(value) ? undefined : 'INVALID_FORMAT';
}

/** El comedor es obligatorio: hay que elegir «Sí» o «No». */
export function validateStudentCafeteria(value: string): FieldErrorCode | undefined {
  if (value === '') {
    return 'REQUIRED';
  }
  return value === 'yes' || value === 'no' ? undefined : 'INVALID_FORMAT';
}

/** El tipo de comida es opcional y tiene un máximo de caracteres tras limpiarlo. */
export function validateStudentFoodType(value: string): FieldErrorCode | undefined {
  return lengthOf(cleaned(value)) > FOOD_TYPE_MAX_LENGTH ? 'INVALID_LENGTH' : undefined;
}

/** Las observaciones son opcionales; solo se recortan los extremos y tienen un máximo de caracteres. */
export function validateStudentObservations(value: string): FieldErrorCode | undefined {
  return lengthOf(value.trim()) > OBSERVATIONS_MAX_LENGTH ? 'INVALID_LENGTH' : undefined;
}

/**
 * Valida el formulario como el backend: el nombre y los apellidos con las reglas del registro, el curso
 * y el comedor obligatorios, y el tipo de comida solo si el alumno come en el comedor (si no, se
 * descarta). Devuelve `null` si todo es válido.
 */
export function validateStudent(values: StudentFormValues): StudentErrors | null {
  const errors: StudentErrors = {};
  const checks: Record<StudentField, FieldErrorCode | undefined> = {
    firstName: validateField('firstName', values.firstName),
    lastName: validateField('lastName', values.lastName),
    courseId: validateStudentCourse(values.courseId),
    classId: validateStudentClass(values.classId),
    cafeteria: validateStudentCafeteria(values.cafeteria),
    scholarship: undefined,
    foodType: values.cafeteria === 'yes' ? validateStudentFoodType(values.foodType) : undefined,
    observations: validateStudentObservations(values.observations),
  };
  for (const field of STUDENT_FIELDS) {
    const code = checks[field];
    if (code) {
      errors[field] = code;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/** Traduce los errores de campo de una respuesta `400` del servidor a los del formulario; ignora los demás. */
export function studentErrorsFromServer(details: FieldError[]): StudentErrors {
  const errors: StudentErrors = {};
  for (const { field, code } of details) {
    if ((STUDENT_FIELDS as readonly string[]).includes(field)) {
      errors[field as StudentField] = code;
    }
  }
  return errors;
}

/** Lo que se enviaría al guardar estos valores (ya limpios), como texto para poder compararlo. */
function bodyToSend(values: StudentFormValues): string {
  return JSON.stringify(
    toStudentBody({
      firstName: cleaned(values.firstName),
      lastName: cleaned(values.lastName),
      courseId: values.courseId,
      classId: values.classId,
      cafeteria: values.cafeteria === 'yes',
      scholarship: values.scholarship,
      foodType: cleaned(values.foodType),
      observations: values.observations.trim(),
    }),
  );
}

/**
 * Si los valores del formulario cambian algo respecto a los cargados: compara **lo que se enviaría**
 * (`toStudentBody` sobre valores ya limpios), así que un espacio de más, deshacer un cambio o la beca y el
 * tipo de comida de un alumno que no come en el comedor no cuentan, y la regla no puede divergir del envío.
 */
export function hasStudentChanges(initial: StudentFormValues, current: StudentFormValues): boolean {
  return bodyToSend(initial) !== bodyToSend(current);
}
