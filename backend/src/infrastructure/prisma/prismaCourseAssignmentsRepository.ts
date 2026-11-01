import {
  planAssignmentChanges,
  type AssignmentCell,
  type CourseAssignmentsSnapshot,
} from '../../domain/assignment/courseAssignments.js';
import type {
  CourseAssignmentsRepository,
  InvalidReference,
  ReplaceAssignmentsResult,
} from '../../domain/assignment/courseAssignmentsRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Lo que hace falta para leer la matriz: vale el cliente y el de una transacción. */
type Reader = Pick<PrismaClient, 'course' | 'subjectCourse' | 'professorAssignment'>;

/**
 * Lee la matriz de profesores de un curso del colegio: el curso con sus clases y tutores, las asignaturas que se
 * imparten en él con sus sesiones y las asignaciones. Se filtra por colegio: un curso ajeno no existe. No ordena
 * ni bloquea nada; `replace` la llama dentro de su transacción para responder con lo que dejó escrito.
 */
async function readAssignments(
  client: Reader,
  schoolId: string,
  courseId: string,
): Promise<CourseAssignmentsSnapshot | null> {
  const course = await client.course.findFirst({
    where: { id: courseId, schoolId },
    select: {
      id: true,
      name: true,
      classes: {
        select: {
          id: true,
          name: true,
          tutor: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (course === null) {
    return null;
  }
  const taught = await client.subjectCourse.findMany({
    where: { courseId },
    select: {
      sessionsPerWeek: true,
      subject: { select: { id: true, name: true, code: true, color: true, status: true } },
    },
  });
  const assignments = await client.professorAssignment.findMany({
    where: { courseId },
    select: { subjectId: true, classId: true, professorId: true },
  });
  return {
    course: { id: course.id, name: course.name },
    subjects: taught.map(({ sessionsPerWeek, subject }) => ({ ...subject, sessionsPerWeek })),
    classes: course.classes,
    assignments,
  };
}

/** Las asignaciones de los profesores por clase (`professor_assignments`) en PostgreSQL. */
export class PrismaCourseAssignmentsRepository implements CourseAssignmentsRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly generateId: () => string = () => crypto.randomUUID(),
  ) {}

  async find(schoolId: string, courseId: string): Promise<CourseAssignmentsSnapshot | null> {
    return translateDatabaseErrors(() => readAssignments(this.prisma, schoolId, courseId));
  }

  async replace(
    schoolId: string,
    courseId: string,
    wanted: readonly AssignmentCell[],
  ): Promise<ReplaceAssignmentsResult> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<ReplaceAssignmentsResult> => {
        // Mismo bloqueo que la edición y el borrado del curso: dos guardados se serializan aquí, y quitar una
        // clase o borrar el curso espera.
        const lockedCourse = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM courses
          WHERE id = ${courseId}::uuid AND school_id = ${schoolId}::uuid
          FOR UPDATE`;
        if (lockedCourse.length === 0) {
          return { kind: 'notFound' };
        }

        const current = await transaction.professorAssignment.findMany({
          where: { courseId },
          select: { subjectId: true, classId: true, professorId: true },
        });

        // Los profesores que intervienen (los pedidos y los que ya tenían asignaciones en el curso), en orden de
        // `id`: un borrado simultáneo de uno de ellos espera, o hace esperar a este guardado antes de que toque
        // sus filas, y así no se cruzan sobre las asignaciones.
        const involved = [
          ...new Set([...wanted, ...current].map(({ professorId }) => professorId)),
        ];
        const professors = new Set(
          (
            await transaction.$queryRaw<{ id: string }[]>`
              SELECT id FROM professors
              WHERE school_id = ${schoolId}::uuid AND id = ANY(${involved}::uuid[])
              ORDER BY id
              FOR SHARE`
          ).map(({ id }) => id),
        );

        // Las asignaturas que se imparten, bloqueadas `FOR SHARE` en orden de `subject_id`: quitar una del curso
        // (editar la asignatura, ajustar la carga o borrarla) no toma el bloqueo del curso, y sin esto el borrado
        // podía confirmar entre esta comprobación y el `INSERT` y la clave ajena hacía fallar el guardado.
        const taught = new Set(
          (
            await transaction.$queryRaw<{ subject_id: string }[]>`
              SELECT subject_id FROM subject_courses
              WHERE course_id = ${courseId}::uuid
              ORDER BY subject_id
              FOR SHARE`
          ).map(({ subject_id }) => subject_id),
        );
        // Las clases del curso, también bloqueadas `FOR SHARE` en orden de `id`: dentro de la aplicación solo se
        // borran al editar o borrar el curso, que toman su bloqueo, pero si se borraran por otro camino entre esta
        // comprobación y el `INSERT`, la clave ajena fallaría en lugar de contestar que la clase ya no existe.
        const classes = new Set(
          (
            await transaction.$queryRaw<{ id: string }[]>`
              SELECT id FROM classes
              WHERE course_id = ${courseId}::uuid
              ORDER BY id
              FOR SHARE`
          ).map(({ id }) => id),
        );

        const references: InvalidReference[] = [];
        wanted.forEach(({ subjectId, classId, professorId }, position) => {
          if (!taught.has(subjectId)) {
            references.push({ position, field: 'subjectId' });
          }
          if (!classes.has(classId)) {
            references.push({ position, field: 'classId' });
          }
          if (!professors.has(professorId)) {
            references.push({ position, field: 'professorId' });
          }
        });
        if (references.length > 0) {
          return { kind: 'invalidReferences', references };
        }

        const plan = planAssignmentChanges(current, wanted);
        if (plan.added + plan.removed + plan.changed === 0) {
          const snapshot = await readAssignments(transaction, schoolId, courseId);
          return { kind: 'unchanged', assignments: snapshot as CourseAssignmentsSnapshot };
        }

        // Primero lo que sobra, después lo que cambia (una fila por cambio: conserva `created_at`) y al final lo
        // nuevo. La unicidad es de la pareja (asignatura, clase), así que el orden no puede chocar.
        if (plan.toDelete.length > 0) {
          await transaction.professorAssignment.deleteMany({
            where: {
              courseId,
              OR: plan.toDelete.map(({ subjectId, classId }) => ({ subjectId, classId })),
            },
          });
        }
        for (const { subjectId, classId, professorId } of plan.toChange) {
          await transaction.professorAssignment.updateMany({
            where: { courseId, subjectId, classId },
            data: { professorId },
          });
        }
        if (plan.toCreate.length > 0) {
          await transaction.professorAssignment.createMany({
            data: plan.toCreate.map(({ subjectId, classId, professorId }) => ({
              id: this.generateId(),
              schoolId,
              professorId,
              subjectId,
              courseId,
              classId,
            })),
          });
        }

        const snapshot = await readAssignments(transaction, schoolId, courseId);
        return {
          kind: 'replaced',
          added: plan.added,
          removed: plan.removed,
          changed: plan.changed,
          assignments: snapshot as CourseAssignmentsSnapshot,
        };
      }),
    );
  }
}
