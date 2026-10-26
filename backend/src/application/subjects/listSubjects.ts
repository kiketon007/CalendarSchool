import type { Subject } from '../../domain/subject/subject.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import { byName } from '../courses/courseOrdering.js';

/**
 * Caso de uso: lista las asignaturas de un colegio con los cursos en los que se imparten y sus sesiones
 * semanales (US-SUBJECT). Las asignaturas van ordenadas por nombre y, los cursos de cada una, en orden
 * natural («2º» antes que «10º»), con la comparación del castellano de `courseOrdering`: la colación de
 * PostgreSQL depende de cómo se creó la base de datos, así que el orden es de la aplicación. Una asignatura
 * cuyos cursos se borraron se devuelve con la lista vacía. El colegio lo toma el router de la identidad de
 * la petición y nunca de lo que envía el cliente.
 */
export class ListSubjects {
  constructor(
    private readonly dependencies: {
      subjectRepository: Pick<SubjectRepository, 'listBySchool'>;
    },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<Subject[]> {
    const subjects = await this.dependencies.subjectRepository.listBySchool(schoolId);
    return subjects
      .map((subject) => ({ ...subject, courses: [...subject.courses].sort(byName) }))
      .sort(byName);
  }
}
