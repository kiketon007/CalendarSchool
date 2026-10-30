import type {
  CourseWorkloadChange,
  CourseWorkloadSnapshot,
} from '../../domain/workload/courseWorkload.js';
import type {
  ApplyWorkloadChangesResult,
  CourseWorkloadRepository,
} from '../../domain/workload/courseWorkloadRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Lo que hace falta para leer la carga: vale el cliente y el de una transacción. */
type Reader = Pick<PrismaClient, 'course' | 'subject'>;

/**
 * Lee el curso con su calendario (solo cuentan los periodos de tipo sesión, no los recreos) y todas las
 * asignaturas del colegio con las sesiones que llevan en él. Se filtra por colegio: un curso ajeno no existe.
 * No bloquea nada; `applyChanges` la llama dentro de su transacción para responder con lo que dejó escrito.
 */
async function readWorkload(
  client: Reader,
  schoolId: string,
  courseId: string,
): Promise<CourseWorkloadSnapshot | null> {
  const course = await client.course.findFirst({
    where: { id: courseId, schoolId },
    select: {
      id: true,
      name: true,
      calendar: {
        select: {
          id: true,
          name: true,
          _count: { select: { periods: { where: { kind: 'SESSION' } } } },
        },
      },
    },
  });
  if (course === null) {
    return null;
  }

  const subjects = await client.subject.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
      status: true,
      courses: { where: { courseId }, select: { sessionsPerWeek: true } },
    },
  });

  return {
    course: { id: course.id, name: course.name },
    calendar:
      course.calendar === null
        ? null
        : {
            id: course.calendar.id,
            name: course.calendar.name,
            sessionsPerDay: course.calendar._count.periods,
          },
    subjects: subjects.map(({ courses, ...subject }) => ({
      ...subject,
      sessionsPerWeek: courses[0]?.sessionsPerWeek ?? null,
    })),
  };
}

/** La carga horaria de un curso (`subject_courses` vista por curso), en PostgreSQL. */
export class PrismaCourseWorkloadRepository implements CourseWorkloadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByCourse(schoolId: string, courseId: string): Promise<CourseWorkloadSnapshot | null> {
    return translateDatabaseErrors(() => readWorkload(this.prisma, schoolId, courseId));
  }

  async applyChanges(
    schoolId: string,
    courseId: string,
    changes: readonly CourseWorkloadChange[],
  ): Promise<ApplyWorkloadChangesResult> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<ApplyWorkloadChangesResult> => {
        // 1. Las asignaturas pedidas, `FOR UPDATE` y en orden de `id`: es el mismo orden que la edición de una
        // asignatura (la asignatura primero y los cursos después), así que no hay ciclos con ella, con su
        // borrado ni con otro cambio de carga que comparta asignaturas. Se filtra por colegio: una ajena no
        // existe. Se bloquean aunque el curso falte, para no cambiar el orden según el resultado.
        const requested = changes.map(({ subjectId }) => subjectId);
        const lockedSubjects = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM subjects
          WHERE school_id = ${schoolId}::uuid AND id = ANY(${requested}::uuid[])
          ORDER BY id FOR UPDATE`;

        // 2. El curso, `FOR SHARE`: no se modifica, solo tiene que seguir ahí mientras se escribe. Esperan
        // su borrado y la edición de su calendario (`FOR UPDATE`); si el borrado confirma antes, no hay fila.
        // El calendario no se bloquea: se lee para el balance y, si cambia a la vez, la siguiente lectura
        // recalcula los avisos.
        const lockedCourse = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM courses
          WHERE id = ${courseId}::uuid AND school_id = ${schoolId}::uuid
          FOR SHARE`;
        if (lockedCourse.length === 0) {
          return { kind: 'courseNotFound' };
        }

        const found = new Set(lockedSubjects.map(({ id }) => id));
        const missing = requested.flatMap((subjectId, position) =>
          found.has(subjectId) ? [] : [position],
        );
        if (missing.length > 0) {
          return { kind: 'subjectsNotFound', positions: missing };
        }

        // 3. Solo las filas de esas asignaturas en este curso. Las demás no se tocan.
        const existing = new Map(
          (
            await transaction.subjectCourse.findMany({
              where: { courseId, subjectId: { in: requested } },
              select: { subjectId: true, sessionsPerWeek: true },
            })
          ).map(({ subjectId, sessionsPerWeek }) => [subjectId, sessionsPerWeek]),
        );
        const toRemove: string[] = [];
        const toUpdate: { subjectId: string; sessionsPerWeek: number }[] = [];
        const toAdd: { subjectId: string; courseId: string; sessionsPerWeek: number }[] = [];
        for (const { subjectId, sessionsPerWeek } of changes) {
          const current = existing.get(subjectId);
          if (sessionsPerWeek === null) {
            if (current !== undefined) {
              toRemove.push(subjectId);
            }
          } else if (current === undefined) {
            toAdd.push({ subjectId, courseId, sessionsPerWeek });
          } else if (current !== sessionsPerWeek) {
            toUpdate.push({ subjectId, sessionsPerWeek });
          }
        }

        // Primero se borra, después se actualiza y al final se inserta. Una actualización conserva
        // `created_at`; una fila que no cambia no se escribe.
        if (toRemove.length > 0) {
          await transaction.subjectCourse.deleteMany({
            where: { courseId, subjectId: { in: toRemove } },
          });
        }
        for (const { subjectId, sessionsPerWeek } of toUpdate) {
          await transaction.subjectCourse.update({
            where: { subjectId_courseId: { subjectId, courseId } },
            data: { sessionsPerWeek },
          });
        }
        if (toAdd.length > 0) {
          await transaction.subjectCourse.createMany({ data: toAdd });
        }

        const workload = await readWorkload(transaction, schoolId, courseId);
        if (workload === null) {
          // No puede pasar: el curso está bloqueado en esta transacción.
          return { kind: 'courseNotFound' };
        }
        return {
          kind: 'applied',
          added: toAdd.length,
          removed: toRemove.length,
          changed: toUpdate.length,
          workload,
        };
      }),
    );
  }
}
