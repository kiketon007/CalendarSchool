import type { components } from '../api/generated/schema';

export type FieldErrorCode = components['schemas']['FieldErrorCode'];
type FieldError = components['schemas']['FieldError'];

/** Máximo de clases de un curso. */
export const MAX_CLASSES = 12;
/** Máximo de caracteres del nombre de un curso, tras limpiarlo. */
export const MAX_COURSE_NAME = 100;
/** Máximo de caracteres del nombre de una clase, tras limpiarlo. */
export const MAX_CLASS_NAME = 10;

// Las reglas son las mismas que valida el backend (createCourseRequest.ts). Ambos lados recorren la
// tabla test-fixtures/course-fields.json para que no diverjan.

// Letras del castellano y del valenciano, con sus mayúsculas.
const LETTERS = 'A-Za-záéíóúàèòïüçñÁÉÍÓÚÀÈÒÏÜÇÑ';
/** Curso: letras, dígitos, `º`, `ª`, `-`, `/` y espacios. */
const COURSE_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9ºª/ -]+$`);
/** Clase: letras, dígitos, `º`, `ª`, `-` y espacios. */
const CLASS_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9ºª -]+$`);

/** NFC, sin espacios en los extremos y con cada tramo de espacios colapsado en uno. */
const cleaned = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ');

/** Para comparar nombres: limpio y en minúsculas, sin quitar acentos ni signos. */
const comparable = (value: string) => cleaned(value).toLocaleLowerCase('es');

type Rule = (value: string) => FieldErrorCode | undefined;

/** Texto obligatorio con longitud máxima y caracteres permitidos; la primera regla incumplida gana. */
function nameRule(max: number, characters: RegExp): Rule {
  return (raw) => {
    const value = cleaned(raw);
    if (value.length === 0) {
      return 'REQUIRED';
    }
    if (value.length > max) {
      return 'INVALID_LENGTH';
    }
    return characters.test(value) ? undefined : 'INVALID_CHARACTERS';
  };
}

export const validateCourseName: Rule = nameRule(MAX_COURSE_NAME, COURSE_NAME_CHARACTERS);
export const validateClassName: Rule = nameRule(MAX_CLASS_NAME, CLASS_NAME_CHARACTERS);

/** Lo que escribe la persona en el formulario de un curso. */
export interface CourseFormValues {
  name: string;
  classNames: string[];
}

/** Errores del formulario: el del nombre, el de la lista de clases y uno por fila de clase. */
export interface CourseErrors {
  name?: FieldErrorCode;
  /** Número de clases no válido (ninguna o más del máximo). */
  classes?: FieldErrorCode;
  /** Un elemento por fila, `undefined` si la fila es válida. */
  classNames: (FieldErrorCode | undefined)[];
}

/**
 * Valida el formulario completo como el backend: el nombre, el número de clases y, solo si el número
 * es válido, cada nombre de clase. Una clase repetida en el curso (sin distinguir mayúsculas ni
 * espacios) es `DUPLICATE` desde la segunda aparición. Devuelve `null` si todo es válido.
 */
export function validateCourse({ name, classNames }: CourseFormValues): CourseErrors | null {
  const errors: CourseErrors = { classNames: [] };
  let hasErrors = false;

  const nameError = validateCourseName(name);
  if (nameError) {
    errors.name = nameError;
    hasErrors = true;
  }

  if (classNames.length < 1 || classNames.length > MAX_CLASSES) {
    errors.classes = 'INVALID_LENGTH';
    return { ...errors };
  }

  const seen = new Set<string>();
  errors.classNames = classNames.map((className) => {
    const error = validateClassName(className);
    if (error) {
      hasErrors = true;
      return error;
    }
    const key = comparable(className);
    if (seen.has(key)) {
      hasErrors = true;
      return 'DUPLICATE';
    }
    seen.add(key);
    return undefined;
  });

  return hasErrors ? errors : null;
}

const CLASS_FIELD = /^classes\[(\d+)\]\.name$/;

/**
 * Traduce los errores de campo de una respuesta `400` del servidor a los del formulario. Ignora lo
 * que no es un campo del formulario o una fila que ya no existe.
 */
export function courseErrorsFromServer(details: FieldError[], rowCount: number): CourseErrors {
  const errors: CourseErrors = {
    classNames: Array.from({ length: rowCount }, (): FieldErrorCode | undefined => undefined),
  };
  for (const { field, code } of details) {
    if (field === 'name') {
      errors.name = code;
    } else if (field === 'classes') {
      errors.classes = code;
    } else {
      const row = CLASS_FIELD.exec(field);
      const index = row ? Number(row[1]) : -1;
      if (index >= 0 && index < rowCount) {
        errors.classNames[index] = code;
      }
    }
  }
  return errors;
}
