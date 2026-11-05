import type {
  ScheduleReadRepository,
  ScheduleSelector,
  StoredScheduleOverview,
  StoredScheduleCourse,
  StoredScheduleProfessor,
  StoredScheduleSubject,
  StoredSchedule,
} from '../../domain/schedule/scheduleRead.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/**
 * Lee el borrador o el oficial vigente de un colegio para verlo (US-ALGO-VIEW y US-ALGO-CONFIRM), en PostgreSQL. Una
 * sola llamada de Prisma, sin bloqueos: el horario del colegio con sus entradas y, de cada una, su asignatura, su profesor y su clase con el
 * curso y el calendario **actual** de este. Después lo **normaliza**: cada curso, clase, asignatura y profesor sale
 * una vez, y solo los que tienen alguna entrada.
 *
 * Las entradas conservan las horas guardadas al generar; el calendario es el de hoy y puede ser otro, o ninguno.
 */
export class PrismaScheduleReadRepository implements ScheduleReadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async overview(schoolId: string): Promise<StoredScheduleOverview> {
    const header = {
      id: true,
      status: true,
      generatedAt: true,
      placedSessions: true,
      confirmedAt: true,
      replacedAt: true,
      confirmedBy: { select: { firstName: true, lastName: true } },
    } as const;
    const [draft, official, previousCount] = await translateDatabaseErrors(() =>
      Promise.all([
        this.prisma.schedule.findFirst({
          where: { schoolId, status: 'DRAFT' },
          select: header,
        }),
        this.prisma.schedule.findFirst({
          where: { schoolId, status: 'OFFICIAL', replacedAt: null },
          select: header,
        }),
        this.prisma.schedule.count({
          where: { schoolId, status: 'OFFICIAL', replacedAt: { not: null } },
        }),
      ]),
    );
    return { draft, official, previousCount };
  }

  async find(schoolId: string, which: ScheduleSelector): Promise<StoredSchedule | null> {
    const schedule = await translateDatabaseErrors(() =>
      this.prisma.schedule.findFirst({
        where:
          which === 'draft'
            ? { schoolId, status: 'DRAFT' }
            : { schoolId, status: 'OFFICIAL', replacedAt: null },
        select: {
          id: true,
          status: true,
          generatedAt: true,
          placedSessions: true,
          confirmedAt: true,
          replacedAt: true,
          confirmedBy: { select: { firstName: true, lastName: true } },
          entries: {
            select: {
              courseId: true,
              classId: true,
              subjectId: true,
              professorId: true,
              dayOfWeek: true,
              sessionNumber: true,
              startMinute: true,
              endMinute: true,
              subject: { select: { id: true, name: true, code: true, color: true } },
              professor: { select: { id: true, firstName: true, lastName: true } },
              schoolClass: {
                select: {
                  id: true,
                  name: true,
                  course: {
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
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );
    if (schedule === null) {
      return null;
    }

    const courses = new Map<
      string,
      StoredScheduleCourse & { classes: { id: string; name: string }[] }
    >();
    const subjects = new Map<string, StoredScheduleSubject>();
    const professors = new Map<string, StoredScheduleProfessor>();
    for (const { subject, professor, schoolClass } of schedule.entries) {
      subjects.set(subject.id, subject);
      if (professor !== null) {
        professors.set(professor.id, professor);
      }
      const { course } = schoolClass;
      const known = courses.get(course.id) ?? {
        id: course.id,
        name: course.name,
        calendar: course.calendar,
        classes: [],
      };
      if (!known.classes.some(({ id }) => id === schoolClass.id)) {
        known.classes.push({ id: schoolClass.id, name: schoolClass.name });
      }
      courses.set(course.id, known);
    }

    return {
      id: schedule.id,
      status: schedule.status,
      generatedAt: schedule.generatedAt,
      placedSessions: schedule.placedSessions,
      confirmedAt: schedule.confirmedAt,
      confirmedBy: schedule.confirmedBy,
      replacedAt: schedule.replacedAt,
      courses: [...courses.values()],
      subjects: [...subjects.values()],
      professors: [...professors.values()],
      entries: schedule.entries.map(
        ({
          courseId,
          classId,
          subjectId,
          professorId,
          dayOfWeek,
          sessionNumber,
          startMinute,
          endMinute,
        }) => ({
          courseId,
          classId,
          subjectId,
          professorId,
          dayOfWeek,
          sessionNumber,
          startMinute,
          endMinute,
        }),
      ),
    };
  }
}
