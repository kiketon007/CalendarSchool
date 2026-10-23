import { z } from 'zod';
import { cleanName, normalizeName } from '../../domain/course/courseNames.js';
import { text } from '../credentials/credentialFields.js';
import { LETTERS } from '../registration/userFields.js';
import type { FieldError, FieldErrorCode } from '../validationError.js';

/** Máximo de caracteres del nombre de un curso, tras limpiarlo. */
export const MAX_COURSE_NAME = 100;
/** Máximo de caracteres del nombre de una clase, tras limpiarlo. */
export const MAX_CLASS_NAME = 10;
/** Máximo de clases de un curso. */
export const MAX_CLASSES = 12;

/** Curso: letras, dígitos, `º`, `ª`, `-`, `/` y espacios. */
const COURSE_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9ºª/ -]+$`);
/** Clase: letras, dígitos, `º`, `ª`, `-` y espacios. */
const CLASS_NAME_CHARACTERS = new RegExp(`^[${LETTERS}0-9ºª -]+$`);

/** Nombre obligatorio, limpio (NFC, sin espacios de más) y con su longitud y sus caracteres. */
function nameField(max: number, characters: RegExp) {
  return text()
    .transform(cleanName)
    .pipe(
      z
        .string()
        .min(1, { error: 'REQUIRED' })
        .max(max, { error: 'INVALID_LENGTH' })
        .regex(characters, { error: 'INVALID_CHARACTERS' }),
    );
}

/** Nombre de un curso; también el de un calendario base (US-BASE), con las mismas reglas. */
export const COURSE_NAME = nameField(MAX_COURSE_NAME, COURSE_NAME_CHARACTERS);
const CLASS_NAME = nameField(MAX_CLASS_NAME, CLASS_NAME_CHARACTERS);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Resultado de leer el cuerpo: el nombre del curso y las clases que han salido válidas. */
export interface ParsedCourseBody<TClass> {
  /** `undefined` si el nombre no es válido (el error ya está en `details`). */
  readonly name: string | undefined;
  readonly classes: TClass[];
}

/** Lee el nombre del curso: añade `name` a `details` si no es válido. */
function parseCourseName(source: Record<string, unknown>, details: FieldError[]) {
  const name = COURSE_NAME.safeParse(source.name);
  if (!name.success) {
    details.push({ field: 'name', code: name.error.issues[0]?.message as FieldErrorCode });
    return undefined;
  }
  return name.data;
}

/**
 * Lee el nombre del curso y su lista de clases con las reglas de US05, que comparten la creación y la
 * edición. Devuelve un `{ field, code }` por cada campo inválido en `details`, sin detenerse en el primero:
 * `name`, `classes` y `classes[<i>].name` (con `i` desde 0). Los nombres de las clases solo se comprueban si
 * el número de clases (de 1 a 12) es válido, y una clase repetida (sin distinguir mayúsculas ni espacios) es
 * `DUPLICATE` desde la segunda aparición.
 *
 * `readClass` permite a quien llama leer otros campos de cada clase: recibe la clase tal como llegó, su
 * posición y `details`, y devuelve lo que quiere conservar de ella (junto al nombre limpio, que añade esta
 * función). Se llama antes de comprobar el nombre, así que sus errores salen antes que los del nombre.
 */
export function parseCourseBody<TClass extends object>(
  source: Record<string, unknown>,
  details: FieldError[],
  readClass: (rawClass: unknown, index: number, details: FieldError[]) => TClass,
): ParsedCourseBody<TClass & { name: string }> {
  const name = parseCourseName(source, details);

  const rawClasses = source.classes;
  const classes: (TClass & { name: string })[] = [];
  if (rawClasses === undefined) {
    details.push({ field: 'classes', code: 'REQUIRED' });
  } else if (!Array.isArray(rawClasses)) {
    details.push({ field: 'classes', code: 'INVALID_FORMAT' });
  } else if (rawClasses.length < 1 || rawClasses.length > MAX_CLASSES) {
    details.push({ field: 'classes', code: 'INVALID_LENGTH' });
  } else {
    const seen = new Set<string>();
    rawClasses.forEach((rawClass: unknown, index) => {
      const extra = readClass(rawClass, index, details);
      const field = `classes[${String(index)}].name`;
      const parsed = CLASS_NAME.safeParse(isRecord(rawClass) ? rawClass.name : undefined);
      if (!parsed.success) {
        details.push({ field, code: parsed.error.issues[0]?.message as FieldErrorCode });
        return;
      }
      const normalizedName = normalizeName(parsed.data);
      if (seen.has(normalizedName)) {
        details.push({ field, code: 'DUPLICATE' });
        return;
      }
      seen.add(normalizedName);
      classes.push({ ...extra, name: parsed.data });
    });
  }

  return { name, classes };
}
