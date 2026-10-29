import type { Subject } from '../../domain/subject/subject.js';
import {
  SubjectAlreadyExists,
  SubjectCodeAlreadyExists,
  SubjectCoursesNotFound,
} from '../../domain/subject/subjectErrors.js';
import type {
  NewSubject,
  SubjectChanges,
  SubjectRepository,
} from '../../domain/subject/subjectRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';
import {
  SUBJECT_CODE_UNIQUE_INDEX,
  SUBJECT_NAME_UNIQUE_INDEX,
  violatedUniqueIndex,
} from './uniqueViolation.js';

/** Lo que muestra una asignatura: nunca los nombres normalizados, el colegio ni la fecha de actualización. */
const SUBJECT_FIELDS = {
  id: true,
  name: true,
  code: true,
  type: true,
  status: true,
  description: true,
  color: true,
  createdAt: true,
  courses: {
    select: { sessionsPerWeek: true, course: { select: { id: true, name: true } } },
  },
} as const;

interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
  type: Subject['type'];
  status: Subject['status'];
  description: string | null;
  color: Subject['color'];
  createdAt: Date;
  courses: { sessionsPerWeek: number; course: { id: string; name: string } }[];
}

/** Fila de una asignatura tal como la devuelve `SUBJECT_FIELDS`, lista para el dominio. */
function toSubject({ courses, ...subject }: SubjectRow): Subject {
  return {
    ...subject,
    courses: courses.map(({ sessionsPerWeek, course }) => ({
      id: course.id,
      name: course.name,
      sessionsPerWeek,
    })),
  };
}

/** Asignaturas y los cursos en los que se imparten, en PostgreSQL. */
export class PrismaSubjectRepository implements SubjectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(schoolId: string, subject: NewSubject): Promise<Subject> {
    try {
      return await translateDatabaseErrors(() =>
        this.prisma.$transaction(async (transaction): Promise<Subject> => {
          const courseIds = subject.courses.map(({ courseId }) => courseId);
          if (courseIds.length > 0) {
            // Los cursos se bloquean antes de escribir nada y **en orden de `id`**, el mismo orden que usan
            // los calendarios, así que no hay ciclos. `FOR SHARE` y no `FOR UPDATE`: el alta no modifica
            // los cursos, solo necesita que no desaparezcan mientras escribe (varias altas pueden convivir;
            // el borrado de un curso o la edición de un calendario esperan). Se filtra por colegio: un
            // curso ajeno no existe.
            const locked = await transaction.$queryRaw<{ id: string }[]>`
              SELECT id FROM courses
              WHERE id = ANY(${courseIds}::uuid[]) AND school_id = ${schoolId}::uuid
              ORDER BY id FOR SHARE`;
            const found = new Set(locked.map(({ id }) => id));
            const missing = courseIds.flatMap((id, position) => (found.has(id) ? [] : [position]));
            if (missing.length > 0) {
              throw new SubjectCoursesNotFound(missing);
            }
          }

          // La unicidad del nombre y del código la garantizan los índices, no una consulta previa, para que
          // dos altas simultáneas no creen dos asignaturas.
          await transaction.subject.create({
            data: {
              id: subject.id,
              schoolId,
              name: subject.name,
              normalizedName: subject.normalizedName,
              code: subject.code,
              normalizedCode: subject.normalizedCode,
              type: subject.type,
              status: subject.status,
              description: subject.description,
              color: subject.color,
              courses: {
                create: subject.courses.map(({ courseId, sessionsPerWeek }) => ({
                  courseId,
                  sessionsPerWeek,
                })),
              },
            },
          });

          const stored = await transaction.subject.findUniqueOrThrow({
            where: { id: subject.id },
            select: SUBJECT_FIELDS,
          });
          return toSubject(stored);
        }),
      );
    } catch (error) {
      const index = violatedUniqueIndex(error);
      if (index === SUBJECT_NAME_UNIQUE_INDEX) {
        throw new SubjectAlreadyExists();
      }
      if (index === SUBJECT_CODE_UNIQUE_INDEX) {
        throw new SubjectCodeAlreadyExists();
      }
      throw error;
    }
  }

  async listBySchool(schoolId: string): Promise<Subject[]> {
    const subjects = await translateDatabaseErrors(() =>
      this.prisma.subject.findMany({ where: { schoolId }, select: SUBJECT_FIELDS }),
    );
    return subjects.map(toSubject);
  }

  async findById(schoolId: string, id: string): Promise<Subject | null> {
    const subject = await translateDatabaseErrors(() =>
      this.prisma.subject.findFirst({ where: { id, schoolId }, select: SUBJECT_FIELDS }),
    );
    return subject === null ? null : toSubject(subject);
  }

  async delete(schoolId: string, subjectId: string): Promise<boolean> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<boolean> => {
        // El mismo bloqueo que la edición: un `PUT` o un segundo borrado de la misma asignatura esperan y, si
        // el borrado confirma primero, no encuentran la fila. Se filtra por colegio: una asignatura ajena no
        // existe. Solo se bloquea la asignatura, no sus cursos: el borrado no los toca, y el de un curso
        // toma el curso y borra las filas `(*, curso)`, mientras este borra las `(asignatura, *)`; solo
        // comparten la fila de la pareja y ninguno necesita la fila principal que retiene el otro, así que
        // la espera es en un solo sentido y no hay ciclo. `$queryRaw` porque hace falta saber si la fila existe.
        const locked = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM subjects WHERE id = ${subjectId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        if (locked.length === 0) {
          return false;
        }

        // Sus filas de `subject_courses` caen por el `ON DELETE CASCADE` de la base de datos, nunca a mano.
        await transaction.subject.delete({ where: { id: subjectId } });
        return true;
      }),
    );
  }

  async update(
    schoolId: string,
    id: string,
    changes: SubjectChanges,
  ): Promise<{ before: Subject; after: Subject } | null> {
    try {
      return await translateDatabaseErrors(() =>
        this.prisma.$transaction(
          async (transaction): Promise<{ before: Subject; after: Subject } | null> => {
            // 1. La asignatura, filtrada por colegio. Dos ediciones de la misma se serializan aquí: la segunda
            // lee lo que dejó la primera y lo reemplaza entero. Sin fila, nada más se toca (una asignatura que
            // no existe gana a un curso que no existe).
            const subjects = await transaction.$queryRaw<{ id: string }[]>`
              SELECT id FROM subjects
              WHERE id = ${id}::uuid AND school_id = ${schoolId}::uuid
              FOR UPDATE`;
            if (subjects.length === 0) {
              return null;
            }

            // 2. Los cursos pedidos y los que tiene hoy, `FOR SHARE` y en orden de `id` (el mismo orden que el
            // alta y los calendarios, así que no hay ciclos). Bloquear también los actuales evita que el
            // borrado de uno se cruce con el reemplazo de `subject_courses`. Se filtra por colegio: un curso
            // ajeno no existe.
            const requested = changes.courses.map(({ courseId }) => courseId);
            const locked = await transaction.$queryRaw<{ id: string }[]>`
              SELECT id FROM courses
              WHERE school_id = ${schoolId}::uuid
                AND (
                  id = ANY(${requested}::uuid[])
                  OR id IN (SELECT course_id FROM subject_courses WHERE subject_id = ${id}::uuid)
                )
              ORDER BY id FOR SHARE`;
            const found = new Set(locked.map(({ id: courseId }) => courseId));
            const missing = requested.flatMap((courseId, position) =>
              found.has(courseId) ? [] : [position],
            );
            if (missing.length > 0) {
              throw new SubjectCoursesNotFound(missing);
            }

            const before = toSubject(
              await transaction.subject.findUniqueOrThrow({
                where: { id },
                select: SUBJECT_FIELDS,
              }),
            );

            // 3. Los campos y los cursos, reemplazados: se borran antes de insertar los recibidos. La unicidad
            // del nombre y del código la garantizan los índices (la propia fila no choca consigo misma).
            await transaction.subject.update({
              where: { id },
              data: {
                name: changes.name,
                normalizedName: changes.normalizedName,
                code: changes.code,
                normalizedCode: changes.normalizedCode,
                type: changes.type,
                status: changes.status,
                description: changes.description,
                color: changes.color,
              },
            });
            await transaction.subjectCourse.deleteMany({ where: { subjectId: id } });
            await transaction.subjectCourse.createMany({
              data: changes.courses.map(({ courseId, sessionsPerWeek }) => ({
                subjectId: id,
                courseId,
                sessionsPerWeek,
              })),
            });

            const after = toSubject(
              await transaction.subject.findUniqueOrThrow({
                where: { id },
                select: SUBJECT_FIELDS,
              }),
            );
            return { before, after };
          },
        ),
      );
    } catch (error) {
      const index = violatedUniqueIndex(error);
      if (index === SUBJECT_NAME_UNIQUE_INDEX) {
        throw new SubjectAlreadyExists();
      }
      if (index === SUBJECT_CODE_UNIQUE_INDEX) {
        throw new SubjectCodeAlreadyExists();
      }
      throw error;
    }
  }
}
