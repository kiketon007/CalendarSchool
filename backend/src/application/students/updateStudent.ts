import type { Student } from '../../domain/student/student.js';
import { StudentNotFound } from '../../domain/student/studentErrors.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { ValidationError } from '../validationError.js';
import { missingReferenceOf } from './missingReference.js';
import { parseUpdateStudentRequest } from './updateStudentRequest.js';

export interface UpdateStudentDependencies {
  studentRepository: Pick<StudentRepository, 'update'>;
  logger: ApplicationLogger;
}

export interface UpdateStudentInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que edita el alumno, de la identidad de la petición. */
  actorId: string;
  /** Identificador de la ruta, ya validado como UUID. */
  studentId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Campos de un alumno cuyo valor se compara para decir qué cambió, en el orden del alta. Solo se
 * guardan sus nombres: ni los valores ni los textos sensibles llegan nunca al log.
 */
const COMPARED_FIELDS: readonly (readonly [string, (student: Student) => unknown])[] = [
  ['firstName', (student) => student.firstName],
  ['lastName', (student) => student.lastName],
  ['courseId', (student) => student.course?.id ?? null],
  ['classId', (student) => student.class?.id ?? null],
  ['cafeteria', (student) => student.cafeteria],
  ['scholarship', (student) => student.scholarship],
  ['foodType', (student) => student.foodType],
  ['observations', (student) => student.observations],
];

/** Nombres de los campos cuyo valor es distinto entre `before` y `after`. */
function changedFields(before: Student, after: Student): string[] {
  return COMPARED_FIELDS.filter(([, read]) => read(before) !== read(after)).map(([name]) => name);
}

/**
 * Caso de uso: guarda el estado final de un alumno del colegio (US17). Valida y limpia el cuerpo
 * (`ValidationError` con un `{ field, code }` por campo inválido, las mismas reglas que el alta) y delega
 * en el repositorio, que comprueba el curso y la clase y lo guarda todo en una transacción. Un alumno de
 * otro colegio o inexistente lanza `StudentNotFound` (`404`, sin distinguir); un curso o una clase que no
 * existen se devuelven como error de su campo (`NOT_FOUND`, `400`). Ambos dejan
 * `STUDENT_UPDATE_REJECTED`. El colegio y el identificador no se leen nunca del cuerpo. Registra
 * `STUDENT_UPDATED` con los **nombres** de los campos que cambiaron y dos datos sin valor personal: ni
 * los nombres de la persona, ni el tipo de comida ni las observaciones (datos sensibles) van al log.
 */
export class UpdateStudent {
  constructor(private readonly dependencies: UpdateStudentDependencies) {}

  async execute({ schoolId, actorId, studentId, body }: UpdateStudentInput): Promise<Student> {
    const { studentRepository, logger } = this.dependencies;

    const parsed = parseUpdateStudentRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { courseId, classId, ...changes } = parsed.data;

    let result;
    try {
      result = await studentRepository.update(schoolId, studentId, changes, courseId, classId);
    } catch (error) {
      const missing = missingReferenceOf(error);
      if (missing) {
        logger.warn(
          {
            event: 'STUDENT_UPDATE_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: missing.reason,
          },
          missing.field === 'courseId'
            ? 'Edición de alumno rechazada: el curso no existe en el colegio'
            : 'Edición de alumno rechazada: la clase no existe en el curso',
        );
        throw new ValidationError([{ field: missing.field, code: 'NOT_FOUND' }]);
      }
      throw error;
    }

    if (result === null) {
      logger.warn(
        {
          event: 'STUDENT_UPDATE_REJECTED',
          school_id: schoolId,
          actor_id: actorId,
          reason: 'not_found',
        },
        'Edición de alumno rechazada: el alumno no existe en el colegio',
      );
      throw new StudentNotFound();
    }

    const { before, after } = result;
    logger.info(
      {
        event: 'STUDENT_UPDATED',
        school_id: schoolId,
        actor_id: actorId,
        student_id: after.id,
        changed_fields: changedFields(before, after),
        has_class: after.class !== null,
        cafeteria: after.cafeteria,
      },
      'Alumno actualizado',
    );
    return after;
  }
}
