import type { Subject } from '../../domain/subject/subject.js';
import {
  SubjectAlreadyExists,
  SubjectCodeAlreadyExists,
  SubjectCoursesNotFound,
} from '../../domain/subject/subjectErrors.js';
import type { NewSubject, SubjectRepository } from '../../domain/subject/subjectRepository.js';
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
}
