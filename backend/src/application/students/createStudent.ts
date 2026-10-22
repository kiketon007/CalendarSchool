import type { Student } from '../../domain/student/student.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import { ValidationError } from '../validationError.js';
import { parseCreateStudentRequest } from './createStudentRequest.js';
import { missingReferenceOf } from './missingReference.js';

export interface CreateStudentDependencies {
  studentRepository: Pick<StudentRepository, 'create'>;
  idGenerator: IdGenerator;
  logger: ApplicationLogger;
}

export interface CreateStudentInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que crea el alumno, de la identidad de la petición. */
  actorId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: crea un alumno en el colegio de la identidad, en su curso y, si se indica, en su clase
 * (US14). Valida y limpia el cuerpo (`ValidationError` con un `{ field, code }` por campo inválido), genera
 * el identificador y delega en el repositorio, que comprueba el curso y la clase y lo guarda todo en una
 * transacción. Un curso o una clase que no existen en el colegio se devuelven como error de su campo
 * (`NOT_FOUND`, `400`) y dejan `STUDENT_CREATION_REJECTED`. El colegio y el estado no se leen nunca del
 * cuerpo. Registra `STUDENT_CREATED` solo con identificadores y dos booleanos: ni el nombre, ni el tipo de
 * comida ni las observaciones (datos sensibles) van al log.
 */
export class CreateStudent {
  constructor(private readonly dependencies: CreateStudentDependencies) {}

  async execute({ schoolId, actorId, body }: CreateStudentInput): Promise<Student> {
    const { studentRepository, idGenerator, logger } = this.dependencies;

    const parsed = parseCreateStudentRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { courseId, classId, ...fields } = parsed.data;

    let student: Student;
    try {
      student = await studentRepository.create(
        schoolId,
        { id: idGenerator.generate(), ...fields },
        courseId,
        classId,
      );
    } catch (error) {
      const missing = missingReferenceOf(error);
      if (missing) {
        logger.warn(
          {
            event: 'STUDENT_CREATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: missing.reason,
          },
          missing.field === 'courseId'
            ? 'Alumno rechazado: el curso no existe en el colegio'
            : 'Alumno rechazado: la clase no existe en el curso',
        );
        throw new ValidationError([{ field: missing.field, code: 'NOT_FOUND' }]);
      }
      throw error;
    }

    logger.info(
      {
        event: 'STUDENT_CREATED',
        school_id: schoolId,
        actor_id: actorId,
        student_id: student.id,
        has_class: student.class !== null,
        cafeteria: student.cafeteria,
      },
      'Alumno creado',
    );
    return student;
  }
}
