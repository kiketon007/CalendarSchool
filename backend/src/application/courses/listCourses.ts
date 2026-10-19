import type { Course } from '../../domain/course/course.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';

/**
 * Comparación del castellano con los números en orden natural («2º» antes que «10º») y sin distinguir
 * mayúsculas ni acentos. La colación de PostgreSQL depende de cómo se creó la base de datos, así que
 * el orden es de la aplicación, como el de los municipios y el de los usuarios.
 */
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name);

/**
 * Caso de uso: lista los cursos de un colegio con sus clases, ordenados por nombre. El colegio lo
 * toma el router de la identidad de la petición y nunca de lo que envía el cliente.
 */
export class ListCourses {
  constructor(
    private readonly dependencies: { courseRepository: Pick<CourseRepository, 'listBySchool'> },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<Course[]> {
    const courses = await this.dependencies.courseRepository.listBySchool(schoolId);
    return courses
      .map((course) => ({ ...course, classes: [...course.classes].sort(byName) }))
      .sort(byName);
  }
}
