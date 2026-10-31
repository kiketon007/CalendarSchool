import { sessionGroupsOf } from '../../domain/calendar/sessionGroups.js';
import type { ConstraintListSnapshot } from '../../domain/constraints/constraintList.js';
import type { ConstraintListRepository } from '../../domain/constraints/constraintListRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/**
 * El listado de reglas de reparto del colegio (US20), en PostgreSQL. Lee las parejas asignatura-curso que
 * tienen alguna regla con todas sus reglas y celdas, y el calendario de su curso (solo los periodos de tipo
 * sesión o recreo, para resumir la jornada), en una única llamada de Prisma: no hace una lectura por curso.
 */
export class PrismaConstraintListRepository implements ConstraintListRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listBySchool(schoolId: string): Promise<ConstraintListSnapshot> {
    const pairs = await translateDatabaseErrors(() =>
      this.prisma.subjectCourse.findMany({
        where: { subject: { schoolId }, constraints: { some: {} } },
        select: {
          sessionsPerWeek: true,
          subject: {
            select: { id: true, name: true, code: true, color: true, status: true },
          },
          course: {
            select: {
              id: true,
              name: true,
              calendar: {
                select: { periods: { select: { kind: true }, orderBy: { position: 'asc' } } },
              },
            },
          },
          constraints: {
            select: {
              id: true,
              type: true,
              maxPerDay: true,
              blockSize: true,
              slots: { select: { dayOfWeek: true, sessionNumber: true } },
            },
          },
        },
      }),
    );
    return pairs.map(({ sessionsPerWeek, subject, course, constraints }) => ({
      course: { id: course.id, name: course.name },
      subject,
      sessionsPerWeek,
      calendar:
        course.calendar === null
          ? null
          : { sessionGroups: sessionGroupsOf(course.calendar.periods.map(({ kind }) => kind)) },
      rules: constraints,
    }));
  }
}
