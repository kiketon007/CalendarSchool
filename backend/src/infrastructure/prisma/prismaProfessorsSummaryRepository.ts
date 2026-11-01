import type {
  ProfessorsSummaryRepository,
  ProfessorsSummarySnapshot,
} from '../../domain/professor/professorsSummaryRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/**
 * El resumen de carga de los profesores del colegio (US-PROF-SUMMARY), en PostgreSQL. Solo lee, sin bloqueos, con
 * dos llamadas de Prisma en total y ninguna por profesor o por curso:
 * - los profesores con sus tramos no disponibles y lo que imparten (lo mismo que `Professor.subjects`);
 * - los cursos con su calendario (solo las sesiones, sin los recreos, que no cuentan), su número de clases y, por
 *   asignatura que se imparte, `_count` de sus asignaciones.
 *
 * Si las dos lecturas ven el colegio en momentos distintos, la foto puede tener un aviso desfasado hasta la siguiente
 * petición; no hay nada que escribir ni que corregir.
 */
export class PrismaProfessorsSummaryRepository implements ProfessorsSummaryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async read(schoolId: string): Promise<ProfessorsSummarySnapshot> {
    const [professors, courses] = await translateDatabaseErrors(() =>
      Promise.all([
        this.prisma.professor.findMany({
          where: { schoolId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            unavailabilities: { select: { dayOfWeek: true, startMinute: true, endMinute: true } },
            assignments: {
              select: {
                schoolClass: { select: { id: true, name: true } },
                subjectCourse: {
                  select: {
                    sessionsPerWeek: true,
                    subject: { select: { id: true, name: true } },
                    course: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.course.findMany({
          where: { schoolId },
          select: {
            id: true,
            name: true,
            _count: { select: { classes: true } },
            calendar: {
              select: {
                id: true,
                name: true,
                periods: {
                  where: { kind: 'SESSION' },
                  select: { startMinute: true, endMinute: true },
                  orderBy: { position: 'asc' },
                },
              },
            },
            subjects: { select: { subjectId: true, _count: { select: { assignments: true } } } },
          },
        }),
      ]),
    );

    return {
      professors: professors.map(({ id, firstName, lastName, unavailabilities, assignments }) => ({
        id,
        firstName,
        lastName,
        subjects: assignments.map(({ schoolClass, subjectCourse }) => ({
          subjectId: subjectCourse.subject.id,
          subjectName: subjectCourse.subject.name,
          courseId: subjectCourse.course.id,
          courseName: subjectCourse.course.name,
          classId: schoolClass.id,
          className: schoolClass.name,
          sessionsPerWeek: subjectCourse.sessionsPerWeek,
        })),
        unavailable: unavailabilities,
      })),
      courses: courses.map(({ id, name, _count, calendar, subjects }) => ({
        id,
        name,
        calendar:
          calendar === null
            ? null
            : { id: calendar.id, name: calendar.name, sessions: calendar.periods },
        classCount: _count.classes,
        subjects: subjects.map(({ subjectId, _count: counts }) => ({
          subjectId,
          assignmentCount: counts.assignments,
        })),
      })),
    };
  }
}
