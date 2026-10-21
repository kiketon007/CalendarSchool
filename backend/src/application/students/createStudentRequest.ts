import { z } from 'zod';
import { cleanName } from '../../domain/course/courseNames.js';
import { USER_FIELD_SCHEMAS } from '../registration/userFields.js';
import type { FieldError, FieldErrorCode } from '../validationError.js';

/** Máximo de caracteres del tipo de comida (`VARCHAR(255)`). */
export const FOOD_TYPE_MAX_LENGTH = 255;
/** Máximo de caracteres de las observaciones. */
export const OBSERVATIONS_MAX_LENGTH = 5000;

const UUID = z.uuid({ error: 'INVALID_FORMAT' });

/** Alumno nuevo ya validado: textos limpios, sin colegio ni estado (no los decide el cliente). */
export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  courseId: string;
  classId: string | null;
  cafeteria: boolean;
  /** `null` si no come en el comedor; con comedor, siempre un booleano. */
  scholarship: boolean | null;
  foodType: string | null;
  observations: string | null;
}

export type ParseCreateStudentResult =
  { success: true; data: CreateStudentInput } | { success: false; details: FieldError[] };

/**
 * Colapsa los espacios repetidos de un texto (y lo recorta, con la forma compuesta de los acentos) antes
 * de validarlo, como los nombres: la longitud se mide sobre lo que se guarda. Lo que no es texto pasa tal
 * cual y lo rechaza el esquema.
 */
const tidy = (value: unknown) => (typeof value === 'string' ? cleanName(value) : value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Longitud en caracteres (puntos de código), como la mide el navegador con `Array.from`. */
const lengthOf = (text: string) => Array.from(text).length;

/**
 * Texto libre opcional con un máximo: ausente o `null` es «ninguno», un texto vacío tras limpiarlo también
 * y cualquier otro tipo es `INVALID_FORMAT`. `observations` solo se recorta (conserva los saltos de línea y
 * los espacios interiores); el tipo de comida colapsa además los espacios repetidos.
 */
function optionalText(
  value: unknown,
  maxLength: number,
  clean: (text: string) => string,
): { text: string | null } | { code: FieldErrorCode } {
  if (value === undefined || value === null) {
    return { text: null };
  }
  if (typeof value !== 'string') {
    return { code: 'INVALID_FORMAT' };
  }
  const text = clean(value);
  if (text === '') {
    return { text: null };
  }
  return lengthOf(text) > maxLength ? { code: 'INVALID_LENGTH' } : { text };
}

/**
 * Valida y limpia el cuerpo de `POST /api/students` con las reglas de la historia US14. El nombre y el
 * apellido siguen las mismas reglas que el registro (`USER_FIELD_SCHEMAS`); el curso y el comedor son
 * obligatorios y la clase, opcional. La beca solo existe con comedor (obligatoria con él, `NOT_ALLOWED`
 * sin él) y el tipo de comida solo se admite con comedor. Devuelve un `{ field, code }` por cada campo
 * inválido, sin detenerse en el primero y en el orden del formulario: `firstName`, `lastName`, `courseId`,
 * `classId`, `cafeteria`, `scholarship`, `foodType` y `observations`; mientras `cafeteria` no es válido no
 * juzga la beca ni el tipo de comida. Ignora las propiedades desconocidas (el colegio y el estado no se
 * leen nunca del cuerpo).
 */
export function parseCreateStudentRequest(body: unknown): ParseCreateStudentResult {
  const source = isRecord(body) ? body : {};
  const details: FieldError[] = [];

  const firstName = USER_FIELD_SCHEMAS.firstName.safeParse(tidy(source.firstName));
  if (!firstName.success) {
    details.push({
      field: 'firstName',
      code: firstName.error.issues[0]?.message as FieldErrorCode,
    });
  }
  const lastName = USER_FIELD_SCHEMAS.lastName.safeParse(tidy(source.lastName));
  if (!lastName.success) {
    details.push({ field: 'lastName', code: lastName.error.issues[0]?.message as FieldErrorCode });
  }

  let courseId = '';
  if (source.courseId === undefined || source.courseId === null) {
    details.push({ field: 'courseId', code: 'REQUIRED' });
  } else {
    const parsed = UUID.safeParse(source.courseId);
    if (parsed.success) {
      courseId = parsed.data;
    } else {
      details.push({ field: 'courseId', code: 'INVALID_FORMAT' });
    }
  }

  let classId: string | null = null;
  if (source.classId !== undefined && source.classId !== null) {
    const parsed = UUID.safeParse(source.classId);
    if (parsed.success) {
      classId = parsed.data;
    } else {
      details.push({ field: 'classId', code: 'INVALID_FORMAT' });
    }
  }

  let cafeteria: boolean | undefined;
  if (source.cafeteria === undefined || source.cafeteria === null) {
    details.push({ field: 'cafeteria', code: 'REQUIRED' });
  } else if (typeof source.cafeteria === 'boolean') {
    cafeteria = source.cafeteria;
  } else {
    details.push({ field: 'cafeteria', code: 'INVALID_FORMAT' });
  }

  let scholarship: boolean | null = null;
  let foodType: string | null = null;
  if (cafeteria === true) {
    if (source.scholarship === undefined || source.scholarship === null) {
      details.push({ field: 'scholarship', code: 'REQUIRED' });
    } else if (typeof source.scholarship === 'boolean') {
      scholarship = source.scholarship;
    } else {
      details.push({ field: 'scholarship', code: 'INVALID_FORMAT' });
    }
    const parsed = optionalText(source.foodType, FOOD_TYPE_MAX_LENGTH, cleanName);
    if ('code' in parsed) {
      details.push({ field: 'foodType', code: parsed.code });
    } else {
      foodType = parsed.text;
    }
  } else if (cafeteria === false) {
    // Sin comedor no hay beca ni tipo de comida: un valor es un error del cliente, no se ignora.
    if (source.scholarship !== undefined && source.scholarship !== null) {
      details.push({ field: 'scholarship', code: 'NOT_ALLOWED' });
    }
    const blank = typeof source.foodType === 'string' && cleanName(source.foodType) === '';
    if (source.foodType !== undefined && source.foodType !== null && !blank) {
      details.push({ field: 'foodType', code: 'NOT_ALLOWED' });
    }
  }

  const observations = optionalText(source.observations, OBSERVATIONS_MAX_LENGTH, (text) =>
    text.trim(),
  );
  if ('code' in observations) {
    details.push({ field: 'observations', code: observations.code });
  }

  if (
    details.length > 0 ||
    !firstName.success ||
    !lastName.success ||
    cafeteria === undefined ||
    'code' in observations
  ) {
    return { success: false, details };
  }
  return {
    success: true,
    data: {
      firstName: firstName.data,
      lastName: lastName.data,
      courseId,
      classId,
      cafeteria,
      scholarship,
      foodType,
      observations: observations.text,
    },
  };
}
