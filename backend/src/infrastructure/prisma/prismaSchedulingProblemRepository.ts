import type { ProblemCell, SchedulingProblem } from '../../domain/schedule/schedulingProblem.js';
import type { SchedulingProblemRepository } from '../../domain/schedule/schedulingProblemRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/**
 * La foto del problema de un colegio (US-ALGO-CHECK), en PostgreSQL. Solo lee, sin bloqueos, con dos llamadas de Prisma
 * en total y ninguna por curso, asignatura o profesor:
 * - los cursos con su calendario (todos los periodos, en orden), sus clases y, por asignatura que se imparte, su
 *   estado, sus sesiones, todas sus reglas con sus celdas y quién la da en cada clase;
 * - los profesores con sus tramos no disponibles.
 *
 * Son datos en bruto, tal como están guardados: las celdas que ya no existen en el calendario se devuelven igual.
 */
export class PrismaSchedulingProblemRepository implements SchedulingProblemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async read(schoolId: string): Promise<SchedulingProblem> {
    const [courses, professors] = await translateDatabaseErrors(() =>
      Promise.all([
        this.prisma.course.findMany({
          where: { schoolId },
          select: {
            id: true,
            name: true,
            calendar: {
              select: {
                id: true,
                name: true,
                periods: {
                  select: { kind: true, startMinute: true, endMinute: true },
                  orderBy: { position: 'asc' },
                },
              },
            },
            classes: { select: { id: true, name: true } },
            subjects: {
              select: {
                sessionsPerWeek: true,
                subject: { select: { id: true, name: true, status: true } },
                constraints: {
                  select: {
                    type: true,
                    maxPerDay: true,
                    blockSize: true,
                    slots: { select: { dayOfWeek: true, sessionNumber: true } },
                  },
                },
                assignments: { select: { classId: true, professorId: true } },
              },
            },
          },
        }),
        this.prisma.professor.findMany({
          where: { schoolId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            unavailabilities: { select: { dayOfWeek: true, startMinute: true, endMinute: true } },
          },
        }),
      ]),
    );

    return {
      courses: courses.map(({ id, name, calendar, classes, subjects }) => ({
        id,
        name,
        calendar:
          calendar === null
            ? null
            : { id: calendar.id, name: calendar.name, periods: calendar.periods },
        classes,
        subjects: subjects.map(({ sessionsPerWeek, subject, constraints, assignments }) => {
          const cellsOf = (type: 'FORBIDDEN_SLOTS' | 'PREFERRED_SLOTS'): ProblemCell[] =>
            constraints.filter((rule) => rule.type === type).flatMap(({ slots }) => slots);
          return {
            subjectId: subject.id,
            subjectName: subject.name,
            status: subject.status,
            sessionsPerWeek,
            maxPerDay: constraints.find((rule) => rule.type === 'MAX_PER_DAY')?.maxPerDay ?? null,
            blockSize: constraints.find((rule) => rule.type === 'BLOCK')?.blockSize ?? null,
            forbiddenCells: cellsOf('FORBIDDEN_SLOTS'),
            preferredCells: cellsOf('PREFERRED_SLOTS'),
            teachers: assignments,
          };
        }),
      })),
      professors: professors.map(({ id, firstName, lastName, unavailabilities }) => ({
        id,
        firstName,
        lastName,
        unavailable: unavailabilities,
      })),
    };
  }
}
