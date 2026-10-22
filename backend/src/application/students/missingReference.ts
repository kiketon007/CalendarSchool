import { ClassNotFound, CourseNotFound } from '../../domain/student/studentErrors.js';

/** El curso o la clase que el alumno pide y que no existen en el colegio, tal como los ve el cliente. */
export interface MissingReference {
  /** Campo del cuerpo que se marca con `NOT_FOUND` (`400`). */
  field: 'courseId' | 'classId';
  /** Motivo que se escribe en el evento de rechazo. */
  reason: 'course_not_found' | 'class_not_found';
}

/**
 * Traduce los errores de dominio del curso y de la clase de un alumno (los lanzan el alta y la edición)
 * al campo que se marca y al motivo del log; `undefined` si el error es de otra cosa y debe seguir su
 * camino.
 */
export function missingReferenceOf(error: unknown): MissingReference | undefined {
  if (error instanceof CourseNotFound) {
    return { field: 'courseId', reason: 'course_not_found' };
  }
  if (error instanceof ClassNotFound) {
    return { field: 'classId', reason: 'class_not_found' };
  }
  return undefined;
}
