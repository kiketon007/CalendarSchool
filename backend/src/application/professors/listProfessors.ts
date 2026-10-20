import type { Professor } from '../../domain/professor/professor.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import { compareText } from '../courses/courseOrdering.js';

/** Apellido y después nombre, con la comparación del castellano (sin distinguir mayúsculas ni acentos). */
const byLastNameThenFirstName = (a: Professor, b: Professor) =>
  compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName);

/**
 * Caso de uso: lista los profesores de un colegio con la clase que tutoriza cada uno, ordenados por
 * apellido y nombre (US09). El colegio lo toma el router de la identidad de la petición y nunca de lo que
 * envía el cliente. El orden es de la aplicación y no de la base de datos, como el de los cursos: la
 * colación de PostgreSQL depende de cómo se creó la base de datos.
 */
export class ListProfessors {
  constructor(
    private readonly dependencies: {
      professorRepository: Pick<ProfessorRepository, 'listBySchool'>;
    },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<Professor[]> {
    const professors = await this.dependencies.professorRepository.listBySchool(schoolId);
    return [...professors].sort(byLastNameThenFirstName);
  }
}
