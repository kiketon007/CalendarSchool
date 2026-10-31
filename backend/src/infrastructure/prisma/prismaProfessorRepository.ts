import type {
  DeletedProfessor,
  NewProfessor,
  Professor,
  ProfessorChanges,
  ProfessorUpdate,
} from '../../domain/professor/professor.js';
import { ProfessorAlreadyTutor } from '../../domain/course/courseErrors.js';
import { ClassAlreadyHasTutor, ClassNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';
import { CLASS_TUTOR_UNIQUE_INDEX, violatedUniqueIndex } from './uniqueViolation.js';

/** Lo que muestra el profesor: la clase que tutoriza y su curso; nunca fechas ni nada más. */
const PROFESSOR_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  _count: { select: { unavailabilities: true } },
  tutoredClass: { select: { id: true, name: true, course: { select: { id: true, name: true } } } },
} as const;

interface ProfessorRow {
  id: string;
  firstName: string;
  lastName: string;
  position: 'DIRECTOR' | 'JEFE_ESTUDIOS' | null;
  _count: { unavailabilities: number };
  tutoredClass: { id: string; name: string; course: { id: string; name: string } } | null;
}

function toProfessor(row: ProfessorRow): Professor {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    position: row.position,
    // Las asignaturas llegan con `US-PROF-ASSIGN`: hasta entonces no hay nada que leer.
    subjects: [],
    unavailableCount: row._count.unavailabilities,
    tutoredClass: row.tutoredClass && {
      id: row.tutoredClass.id,
      name: row.tutoredClass.name,
      courseId: row.tutoredClass.course.id,
      courseName: row.tutoredClass.course.name,
    },
  };
}

/** Profesores en PostgreSQL. */
export class PrismaProfessorRepository implements ProfessorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    schoolId: string,
    professor: NewProfessor,
    classId: string | null,
  ): Promise<Professor> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<Professor> => {
        await transaction.professor.create({
          data: {
            id: professor.id,
            schoolId,
            firstName: professor.firstName,
            lastName: professor.lastName,
            position: professor.position,
          },
        });

        if (classId !== null) {
          // Un `UPDATE` condicionado a que la clase siga sin tutor y sea de un curso del colegio: es
          // atómico por sí mismo, así que dos altas simultáneas con la misma clase no pueden ganar las
          // dos (la segunda espera la fila, la reevalúa y no la encuentra libre). No hace falta
          // bloquear nada. El índice único de `classes.tutor_id` es la red de seguridad.
          const assigned = await transaction.schoolClass.updateMany({
            where: { id: classId, tutorId: null, course: { schoolId } },
            data: { tutorId: professor.id },
          });
          if (assigned.count === 0) {
            // Se distingue por qué no se asignó; el error deshace también el alta del profesor.
            const existing = await transaction.schoolClass.findFirst({
              where: { id: classId, course: { schoolId } },
              select: { id: true },
            });
            throw existing ? new ClassAlreadyHasTutor() : new ClassNotFound();
          }
        }

        const created = await transaction.professor.findUniqueOrThrow({
          where: { id: professor.id },
          select: PROFESSOR_FIELDS,
        });
        return toProfessor(created);
      }),
    );
  }

  async listBySchool(schoolId: string): Promise<Professor[]> {
    const rows = await translateDatabaseErrors(() =>
      this.prisma.professor.findMany({ where: { schoolId }, select: PROFESSOR_FIELDS }),
    );
    return rows.map(toProfessor);
  }

  async findById(schoolId: string, professorId: string): Promise<Professor | null> {
    const row = await translateDatabaseErrors(() =>
      this.prisma.professor.findFirst({
        where: { id: professorId, schoolId },
        select: PROFESSOR_FIELDS,
      }),
    );
    return row && toProfessor(row);
  }

  async update(
    schoolId: string,
    professorId: string,
    changes: ProfessorChanges,
  ): Promise<ProfessorUpdate | null> {
    try {
      return await translateDatabaseErrors(() =>
        this.prisma.$transaction(async (transaction): Promise<ProfessorUpdate | null> => {
          // El profesor se bloquea primero: dos ediciones del mismo profesor van de una en una y, si el
          // colegio no es el suyo, no existe. `$queryRaw` porque hace falta saber si la fila existe.
          const locked = await transaction.$queryRaw<{ id: string }[]>`
            SELECT id FROM professors WHERE id = ${professorId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
          if (locked.length === 0) {
            return null;
          }

          const beforeRow = await transaction.professor.findUniqueOrThrow({
            where: { id: professorId },
            select: PROFESSOR_FIELDS,
          });
          const before = toProfessor(beforeRow);

          const currentClassId = before.tutoredClass?.id ?? null;
          const newClassId = changes.classId === undefined ? currentClassId : changes.classId;
          const tutorshipChanges = newClassId !== currentClassId;

          let replacedTutorId: string | null = null;
          if (tutorshipChanges) {
            // Se bloquean a la vez la clase que deja y la que toma, en el orden de su id: dos ediciones
            // que se cruzan (cada una quiere la clase de la otra) las piden en el mismo orden y no se
            // interbloquean. La clase nueva debe ser de un curso del colegio.
            const ids = [currentClassId, newClassId].filter((id): id is string => id !== null);
            const classes = await transaction.$queryRaw<{ id: string; tutor_id: string | null }[]>`
              SELECT c.id, c.tutor_id FROM classes c JOIN courses co ON co.id = c.course_id
              WHERE co.school_id = ${schoolId}::uuid AND c.id = ANY(${ids}::uuid[])
              ORDER BY c.id FOR UPDATE OF c`;
            if (newClassId !== null) {
              const target = classes.find(({ id }) => id === newClassId);
              if (target === undefined) {
                throw new ClassNotFound();
              }
              replacedTutorId = target.tutor_id;
            }
          }

          await transaction.professor.update({
            where: { id: professorId },
            data: {
              firstName: changes.firstName,
              lastName: changes.lastName,
              position: changes.position,
            },
          });

          let replacedTutor: ProfessorUpdate['replacedTutor'] = null;
          if (tutorshipChanges) {
            if (replacedTutorId !== null) {
              replacedTutor = await transaction.professor.findUniqueOrThrow({
                where: { id: replacedTutorId },
                select: { id: true, firstName: true, lastName: true },
              });
            }
            // En este orden, porque `classes.tutor_id` es único y no diferible: primero se libera la
            // clase del profesor y después se asigna la nueva (quien la tenía la pierde con ese mismo
            // `UPDATE`, que sustituye el valor de su fila).
            await transaction.schoolClass.updateMany({
              where: { tutorId: professorId },
              data: { tutorId: null },
            });
            if (newClassId !== null) {
              await transaction.schoolClass.update({
                where: { id: newClassId },
                data: { tutorId: professorId },
              });
            }
          }

          const afterRow = await transaction.professor.findUniqueOrThrow({
            where: { id: professorId },
            select: PROFESSOR_FIELDS,
          });
          return { before, after: toProfessor(afterRow), replacedTutor };
        }),
      );
    } catch (error) {
      // Otra escritura que no comparte estos bloqueos (la edición de un curso) le dio al profesor otra
      // clase entre la lectura y la escritura: el índice único lo detiene y no se guarda nada.
      if (violatedUniqueIndex(error) === CLASS_TUTOR_UNIQUE_INDEX) {
        throw new ProfessorAlreadyTutor();
      }
      throw error;
    }
  }

  async delete(schoolId: string, professorId: string): Promise<DeletedProfessor | null> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<DeletedProfessor | null> => {
        // Mismo bloqueo que la edición: un `PUT` o un segundo borrado del mismo profesor esperan y, si el
        // borrado confirma primero, no encuentran la fila. Se filtra por colegio: un profesor ajeno no
        // existe. `$queryRaw` porque hace falta saber si la fila existe.
        const locked = await transaction.$queryRaw<{ id: string }[]>`
          SELECT id FROM professors WHERE id = ${professorId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
        if (locked.length === 0) {
          return null;
        }

        // Se lee dentro de la transacción, con el profesor bloqueado: es la clase que se libera de verdad.
        const tutored = await transaction.schoolClass.findFirst({
          where: { tutorId: professorId },
          select: { id: true, name: true, course: { select: { name: true } } },
        });

        // La clase queda sin tutor por la clave ajena (`ON DELETE SET NULL`), en la misma sentencia: no se
        // escribe a mano, así ningún otro camino de borrado puede olvidarlo.
        await transaction.professor.delete({ where: { id: professorId } });

        return {
          freedClass: tutored && {
            id: tutored.id,
            name: tutored.name,
            courseName: tutored.course.name,
          },
        };
      }),
    );
  }
}
