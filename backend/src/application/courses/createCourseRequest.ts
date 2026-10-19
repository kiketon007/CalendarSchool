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

const COURSE_NAME = nameField(MAX_COURSE_NAME, COURSE_NAME_CHARACTERS);
const CLASS_NAME = nameField(MAX_CLASS_NAME, CLASS_NAME_CHARACTERS);

/** Curso nuevo ya validado: nombres limpios, sin colegio ni tutor (no los decide el cliente). */
export interface CreateCourseInput {
  name: string;
  classes: { name: string }[];
}

export type ParseCreateCourseResult =
  { success: true; data: CreateCourseInput } | { success: false; details: FieldError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Valida y limpia el cuerpo de `POST /api/courses` con las reglas de la historia US05. Devuelve un
 * `{ field, code }` por cada campo inválido, sin detenerse en el primero: `name`, `classes` y
 * `classes[<i>].name` (con `i` desde 0). Una clase repetida en el curso (sin distinguir mayúsculas ni
 * espacios) es `DUPLICATE` desde la segunda aparición. Los nombres de las clases solo se comprueban
 * si el número de clases es válido. Ignora las propiedades desconocidas (el colegio y el tutor no se
 * leen nunca del cuerpo).
 */
export function parseCreateCourseRequest(body: unknown): ParseCreateCourseResult {
  const source = isRecord(body) ? body : {};
  const details: FieldError[] = [];

  const name = COURSE_NAME.safeParse(source.name);
  if (!name.success) {
    details.push({ field: 'name', code: name.error.issues[0]?.message as FieldErrorCode });
  }

  const rawClasses = source.classes;
  const classes: { name: string }[] = [];
  if (rawClasses === undefined) {
    details.push({ field: 'classes', code: 'REQUIRED' });
  } else if (!Array.isArray(rawClasses)) {
    details.push({ field: 'classes', code: 'INVALID_FORMAT' });
  } else if (rawClasses.length < 1 || rawClasses.length > MAX_CLASSES) {
    details.push({ field: 'classes', code: 'INVALID_LENGTH' });
  } else {
    const seen = new Set<string>();
    rawClasses.forEach((rawClass: unknown, index) => {
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
      classes.push({ name: parsed.data });
    });
  }

  if (details.length > 0 || !name.success) {
    return { success: false, details };
  }
  return { success: true, data: { name: name.data, classes } };
}
