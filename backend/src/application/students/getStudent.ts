import type { Student } from '../../domain/student/student.js';
import { StudentNotFound } from '../../domain/student/studentErrors.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';

export interface GetStudentInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  studentId: string;
}

/**
 * Caso de uso: devuelve un alumno del colegio con todos sus datos, también los sensibles (US17). Uno de
 * otro colegio o inexistente lanza `StudentNotFound`, sin distinguir el caso (`404`). No registra nada:
 * leer no deja evento y los datos sensibles nunca van al log.
 */
export class GetStudent {
  constructor(
    private readonly dependencies: { studentRepository: Pick<StudentRepository, 'findById'> },
  ) {}

  async execute({ schoolId, studentId }: GetStudentInput): Promise<Student> {
    const student = await this.dependencies.studentRepository.findById(schoolId, studentId);
    if (student === null) {
      throw new StudentNotFound();
    }
    return student;
  }
}
