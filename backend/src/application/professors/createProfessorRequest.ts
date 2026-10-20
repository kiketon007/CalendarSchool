import { z } from 'zod';
import { cleanName } from '../../domain/course/courseNames.js';
import type { ProfessorPosition } from '../../domain/professor/professor.js';
import { USER_FIELD_SCHEMAS } from '../registration/userFields.js';
import type { FieldError, FieldErrorCode } from '../validationError.js';

const POSITIONS = ['DIRECTOR', 'JEFE_ESTUDIOS'] as const satisfies readonly ProfessorPosition[];
const POSITION = z.enum(POSITIONS, { error: 'INVALID_FORMAT' });
const CLASS_ID = z.uuid({ error: 'INVALID_FORMAT' });

/** Profesor nuevo ya validado: nombres limpios, sin colegio ni asignaturas (no los decide el cliente). */
export interface CreateProfessorInput {
  firstName: string;
  lastName: string;
  position: ProfessorPosition | null;
  classId: string | null;
}

export type ParseCreateProfessorResult =
  { success: true; data: CreateProfessorInput } | { success: false; details: FieldError[] };

/**
 * Colapsa los espacios repetidos de un texto (y lo recorta, con la forma compuesta de los acentos) antes
 * de validarlo, como los nombres de cursos y clases: la longitud se mide sobre lo que se guarda. Lo que no
 * es texto pasa tal cual y lo rechaza el esquema.
 */
const tidy = (value: unknown) => (typeof value === 'string' ? cleanName(value) : value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Valida y limpia el cuerpo de `POST /api/professors` con las reglas de la historia US09. El nombre y el
 * apellido siguen las mismas reglas que el registro (`USER_FIELD_SCHEMAS`); el cargo y la clase son
 * opcionales (ausentes o `null` significan «sin cargo» y «sin clase»). Devuelve un `{ field, code }` por
 * cada campo inválido, sin detenerse en el primero y en el orden del formulario: `firstName`, `lastName`,
 * `position` y `classId`. Ignora las propiedades desconocidas (el colegio, las asignaturas y el email no
 * se leen nunca del cuerpo).
 */
export function parseCreateProfessorRequest(body: unknown): ParseCreateProfessorResult {
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

  let position: ProfessorPosition | null = null;
  if (source.position !== undefined && source.position !== null) {
    const parsed = POSITION.safeParse(source.position);
    if (parsed.success) {
      position = parsed.data;
    } else {
      details.push({ field: 'position', code: 'INVALID_FORMAT' });
    }
  }

  let classId: string | null = null;
  if (source.classId !== undefined && source.classId !== null) {
    const parsed = CLASS_ID.safeParse(source.classId);
    if (parsed.success) {
      classId = parsed.data;
    } else {
      details.push({ field: 'classId', code: 'INVALID_FORMAT' });
    }
  }

  if (details.length > 0 || !firstName.success || !lastName.success) {
    return { success: false, details };
  }
  return {
    success: true,
    data: { firstName: firstName.data, lastName: lastName.data, position, classId },
  };
}
