import { StudentNotFound } from '../../domain/student/studentErrors.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface DeleteStudentDependencies {
  studentRepository: Pick<StudentRepository, 'delete'>;
  logger: ApplicationLogger;
}

export interface DeleteStudentInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que borra al alumno, de la identidad de la petición. */
  actorId: string;
  studentId: string;
}

/**
 * Caso de uso: borra de verdad a un alumno del colegio (US18). El repositorio lo hace en una transacción
 * con la fila del alumno bloqueada y dice si lo borró; un alumno de otro colegio, inexistente o ya borrado
 * lanza `StudentNotFound` (`404`) y no deja traza. No lee ni recibe los datos del alumno, así que no puede
 * registrarlos: `STUDENT_DELETED` lleva solo identificadores (nunca nombres, curso, clase, comedor, tipo de
 * comida ni observaciones).
 */
export class DeleteStudent {
  constructor(private readonly dependencies: DeleteStudentDependencies) {}

  async execute({ schoolId, actorId, studentId }: DeleteStudentInput): Promise<{ id: string }> {
    const { studentRepository, logger } = this.dependencies;

    const deleted = await studentRepository.delete(schoolId, studentId);
    if (!deleted) {
      throw new StudentNotFound();
    }

    logger.info(
      {
        event: 'STUDENT_DELETED',
        school_id: schoolId,
        actor_id: actorId,
        student_id: studentId,
      },
      'Alumno borrado',
    );
    return { id: studentId };
  }
}
