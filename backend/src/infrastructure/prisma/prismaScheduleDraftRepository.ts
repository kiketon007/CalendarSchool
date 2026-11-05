import type {
  ScheduleDraftRepository,
  StoredDraftCourse,
  StoredDraftProfessor,
  StoredDraftSubject,
  StoredScheduleDraft,
} from '../../domain/schedule/scheduleDraft.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/**
 * Lee el horario borrador de un colegio para verlo (US-ALGO-VIEW), en PostgreSQL. Una sola llamada de Prisma, sin
 * bloqueos: el `DRAFT` del colegio con sus entradas y, de cada una, su asignatura, su profesor y su clase con el
 * curso y el calendario **actual** de este. Después lo **normaliza**: cada curso, clase, asignatura y profesor sale
 * una vez, y solo los que tienen alguna entrada.
 *
 * Las entradas conservan las horas guardadas al generar; el calendario es el de hoy y puede ser otro, o ninguno.
 */
export class PrismaScheduleDraftRepository implements ScheduleDraftRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findDraft(schoolId: string): Promise<StoredScheduleDraft | null> {
    const schedule = await translateDatabaseErrors(() =>
      this.prisma.schedule.findFirst({
        where: { schoolId, status: 'DRAFT' },
        select: {
          id: true,
          generatedAt: true,
          placedSessions: true,
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
      StoredDraftCourse & { classes: { id: string; name: string }[] }
    >();
    const subjects = new Map<string, StoredDraftSubject>();
    const professors = new Map<string, StoredDraftProfessor>();
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
      generatedAt: schedule.generatedAt,
      placedSessions: schedule.placedSessions,
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
