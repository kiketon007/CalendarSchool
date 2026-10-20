import type { NewProfessor, Professor } from '../../domain/professor/professor.js';
import { ClassAlreadyHasTutor, ClassNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Lo que muestra el profesor: la clase que tutoriza y su curso; nunca fechas ni nada más. */
const PROFESSOR_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  tutoredClass: { select: { id: true, name: true, course: { select: { id: true, name: true } } } },
} as const;

interface ProfessorRow {
  id: string;
  firstName: string;
  lastName: string;
  position: 'DIRECTOR' | 'JEFE_ESTUDIOS' | null;
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
}
