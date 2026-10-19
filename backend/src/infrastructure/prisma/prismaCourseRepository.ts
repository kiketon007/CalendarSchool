import { CourseAlreadyExists } from '../../domain/course/courseErrors.js';
import type { Course } from '../../domain/course/course.js';
import type { CourseRepository, NewCourse } from '../../domain/course/courseRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';
import { COURSE_UNIQUE_INDEX, violatedUniqueIndex } from './uniqueViolation.js';

/** Solo lo que muestra el listado: nunca los nombres normalizados ni las fechas. */
const LIST_FIELDS = {
  id: true,
  name: true,
  classes: { select: { id: true, name: true } },
} as const;

/** Cursos y clases en PostgreSQL. */
export class PrismaCourseRepository implements CourseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(schoolId: string, course: NewCourse): Promise<Course> {
    try {
      // Un único `create` anidado: Prisma lo ejecuta en una transacción, así que si falla cualquier
      // clase no queda ni el curso. La unicidad del nombre la garantiza el índice, no una consulta
      // previa, para que dos envíos simultáneos no creen dos cursos.
      await translateDatabaseErrors(() =>
        this.prisma.course.create({
          data: {
            id: course.id,
            schoolId,
            name: course.name,
            normalizedName: course.normalizedName,
            classes: {
              create: course.classes.map(({ id, name, normalizedName }) => ({
                id,
                name,
                normalizedName,
              })),
            },
          },
          select: { id: true },
        }),
      );
    } catch (error) {
      if (violatedUniqueIndex(error) === COURSE_UNIQUE_INDEX) {
        throw new CourseAlreadyExists();
      }
      throw error;
    }
    return {
      id: course.id,
      name: course.name,
      classes: course.classes.map(({ id, name }) => ({ id, name, tutor: null })),
    };
  }

  async listBySchool(schoolId: string): Promise<Course[]> {
    const courses = await translateDatabaseErrors(() =>
      this.prisma.course.findMany({ where: { schoolId }, select: LIST_FIELDS }),
    );
    return courses.map(({ id, name, classes }) => ({
      id,
      name,
      classes: classes.map((schoolClass) => ({
        id: schoolClass.id,
        name: schoolClass.name,
        tutor: null,
      })),
    }));
  }
}
