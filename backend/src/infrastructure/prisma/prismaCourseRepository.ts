import { CourseAlreadyExists, CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseImpact } from '../../domain/course/courseImpact.js';
import type { Course } from '../../domain/course/course.js';
import type {
  CourseRepository,
  NewCourse,
  UpdatedCourse,
} from '../../domain/course/courseRepository.js';
import {
  isEmptyPlan,
  type CourseUpdatePlan,
  type CurrentCourse,
  type RequestedCourse,
} from '../../domain/course/courseUpdate.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';
import { COURSE_UNIQUE_INDEX, violatedUniqueIndex } from './uniqueViolation.js';

/** Del profesor que tutoriza una clase solo hace falta lo mínimo para mostrarlo. */
const TUTOR_FIELDS = { select: { id: true, firstName: true, lastName: true } } as const;

/**
 * Solo lo que muestra el listado: nunca los nombres normalizados ni la fecha de actualización. De cada
 * clase, su tutor (US09).
 */
const LIST_FIELDS = {
  id: true,
  name: true,
  createdAt: true,
  classes: { select: { id: true, name: true, tutor: TUTOR_FIELDS } },
} as const;

/** Lo que necesita la edición para comparar: además, los nombres normalizados. */
const EDIT_FIELDS = {
  ...LIST_FIELDS,
  normalizedName: true,
  classes: { select: { id: true, name: true, normalizedName: true, tutor: TUTOR_FIELDS } },
} as const;

/** Fila de un curso con sus clases tal como la devuelve `LIST_FIELDS`, lista para el dominio. */
function toCourse({
  id,
  name,
  createdAt,
  classes,
}: {
  id: string;
  name: string;
  createdAt: Date;
  classes: {
    id: string;
    name: string;
    tutor: { id: string; firstName: string; lastName: string } | null;
  }[];
}): Course {
  return {
    id,
    name,
    createdAt,
    classes: classes.map((schoolClass) => ({
      id: schoolClass.id,
      name: schoolClass.name,
      tutor: schoolClass.tutor && {
        id: schoolClass.tutor.id,
        firstName: schoolClass.tutor.firstName,
        lastName: schoolClass.tutor.lastName,
      },
    })),
  };
}

/**
 * Alumnos asignados a las clases de un curso. Es siempre `0` hasta que existan los alumnos (US14), que
 * sustituirá este valor por un recuento real; ningún otro código sabe que es constante.
 */
const STUDENT_COUNT_UNTIL_US14 = 0;

/** Nombre provisional de una clase mientras se renombra en dos fases: `#` no es un carácter válido. */
const temporaryName = (position: number) => `#${String(position)}`;

/** Cursos y clases en PostgreSQL. */
export class PrismaCourseRepository implements CourseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(schoolId: string, course: NewCourse): Promise<Course> {
    let createdAt: Date;
    try {
      // Un único `create` anidado: Prisma lo ejecuta en una transacción, así que si falla cualquier
      // clase no queda ni el curso. La unicidad del nombre la garantiza el índice, no una consulta
      // previa, para que dos envíos simultáneos no creen dos cursos.
      ({ createdAt } = await translateDatabaseErrors(() =>
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
          select: { createdAt: true },
        }),
      ));
    } catch (error) {
      if (violatedUniqueIndex(error) === COURSE_UNIQUE_INDEX) {
        throw new CourseAlreadyExists();
      }
      throw error;
    }
    return {
      id: course.id,
      name: course.name,
      createdAt,
      classes: course.classes.map(({ id, name }) => ({ id, name, tutor: null })),
    };
  }

  async listBySchool(schoolId: string): Promise<Course[]> {
    const courses = await translateDatabaseErrors(() =>
      this.prisma.course.findMany({ where: { schoolId }, select: LIST_FIELDS }),
    );
    return courses.map(toCourse);
  }

  async findById(schoolId: string, courseId: string): Promise<Course | null> {
    const course = await translateDatabaseErrors(() =>
      this.prisma.course.findFirst({ where: { id: courseId, schoolId }, select: LIST_FIELDS }),
    );
    return course === null ? null : toCourse(course);
  }

  async update(
    schoolId: string,
    courseId: string,
    requested: RequestedCourse,
    plan: (current: CurrentCourse) => CourseUpdatePlan,
  ): Promise<UpdatedCourse> {
    try {
      return await translateDatabaseErrors(() =>
        this.prisma.$transaction(async (transaction): Promise<UpdatedCourse> => {
          // El bloqueo de la fila del curso (compatible con el pooler en modo transacción) hace que las
          // ediciones del mismo curso vayan de una en una, así que las clases que se leen a continuación
          // son las reales al escribir; las de otros cursos no esperan. Se filtra por colegio: un curso
          // ajeno no existe. `$queryRaw` porque hace falta saber si la fila existe.
          const locked = await transaction.$queryRaw<{ id: string }[]>`
            SELECT id FROM courses WHERE id = ${courseId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
          if (locked.length === 0) {
            throw new CourseNotFound();
          }

          const current = await transaction.course.findUniqueOrThrow({
            where: { id: courseId },
            select: EDIT_FIELDS,
          });
          const changes = plan(current);
          if (isEmptyPlan(changes)) {
            return { course: toCourse(current), plan: changes };
          }

          // El curso va primero: si el nombre ya lo tiene otro curso, falla sin haber tocado las clases
          // (y `updated_at` se renueva también cuando solo cambian las clases).
          await transaction.course.update({
            where: { id: courseId },
            data: { name: requested.name, normalizedName: requested.normalizedName },
          });

          // El índice único de las clases no es diferible, así que el orden importa: borrar libera los
          // nombres de las clases quitadas; las que cambian de nombre pasan por uno provisional para
          // que un intercambio (A↔B) no choque a mitad de camino; las nuevas van al final.
          if (changes.removed.length > 0) {
            await transaction.schoolClass.deleteMany({
              where: { courseId, id: { in: [...changes.removed] } },
            });
          }
          const moving = changes.renamed.filter(
            ({ normalizedNameChanged }) => normalizedNameChanged,
          );
          for (const [position, { id }] of moving.entries()) {
            await transaction.schoolClass.updateMany({
              where: { id, courseId },
              data: { name: temporaryName(position), normalizedName: temporaryName(position) },
            });
          }
          for (const { id, name, normalizedName } of changes.renamed) {
            await transaction.schoolClass.updateMany({
              where: { id, courseId },
              data: { name, normalizedName },
            });
          }
          if (changes.created.length > 0) {
            await transaction.schoolClass.createMany({
              data: changes.created.map(({ id, name, normalizedName }) => ({
                id,
                courseId,
                name,
                normalizedName,
              })),
            });
          }

          const updated = await transaction.course.findUniqueOrThrow({
            where: { id: courseId },
            select: LIST_FIELDS,
          });
          return { course: toCourse(updated), plan: changes };
        }),
      );
    } catch (error) {
      if (violatedUniqueIndex(error) === COURSE_UNIQUE_INDEX) {
        throw new CourseAlreadyExists();
      }
      throw error;
    }
  }

  async impactOf(schoolId: string, courseId: string): Promise<CourseImpact | null> {
    const course = await translateDatabaseErrors(() =>
      this.prisma.course.findFirst({
        where: { id: courseId, schoolId },
        select: { _count: { select: { classes: true } } },
      }),
    );
    return course === null
      ? null
      : { classCount: course._count.classes, studentCount: STUDENT_COUNT_UNTIL_US14 };
  }

  async delete(schoolId: string, courseId: string): Promise<CourseImpact | null> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<CourseImpact | null> => {
        // Mismo bloqueo que la edición: un `PUT` o un segundo borrado del mismo curso esperan y, si el
        // borrado confirma primero, no encuentran la fila. Se filtra por colegio: un curso ajeno no existe.
        const locked = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM courses WHERE id = ${courseId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        if (locked.length === 0) {
          return null;
        }
        // Se cuenta dentro de la transacción, con el curso bloqueado: es lo que se borra de verdad. Las
        // clases caen por la cascada de la base de datos (`ON DELETE CASCADE`), en la misma sentencia.
        const classCount = await transaction.schoolClass.count({ where: { courseId } });
        await transaction.course.delete({ where: { id: courseId } });
        return { classCount, studentCount: STUDENT_COUNT_UNTIL_US14 };
      }),
    );
  }
}
