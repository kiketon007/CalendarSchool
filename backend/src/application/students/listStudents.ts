import type { StudentSummary } from '../../domain/student/student.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import { compareText } from '../courses/courseOrdering.js';

/** Apellido y después nombre, con la comparación del castellano (sin distinguir mayúsculas ni acentos). */
const byLastNameThenFirstName = (a: StudentSummary, b: StudentSummary) =>
  compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName);

/**
 * Caso de uso: lista los alumnos de un colegio con su curso y su clase, ordenados por apellido y nombre
 * (US14). El colegio lo toma el router de la identidad de la petición y nunca de lo que envía el cliente.
 * El orden es de la aplicación y no de la base de datos, como el de los profesores: la colación de
 * PostgreSQL depende de cómo se creó la base de datos. Sin los datos sensibles (tipo de comida y
 * observaciones): el repositorio no los devuelve.
 */
export class ListStudents {
  constructor(
    private readonly dependencies: {
      studentRepository: Pick<StudentRepository, 'listBySchool'>;
    },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<StudentSummary[]> {
    const students = await this.dependencies.studentRepository.listBySchool(schoolId);
    return [...students].sort(byLastNameThenFirstName);
  }
}
