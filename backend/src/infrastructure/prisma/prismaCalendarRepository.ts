import type { Calendar, CalendarPeriod } from '../../domain/calendar/calendar.js';
import {
  CalendarAlreadyExists,
  CalendarCoursesNotFound,
} from '../../domain/calendar/calendarErrors.js';
import type { CalendarRepository, NewCalendar } from '../../domain/calendar/calendarRepository.js';
import { formatClock, parseClock } from '../../domain/calendar/clock.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';
import { CALENDAR_UNIQUE_INDEX, violatedUniqueIndex } from './uniqueViolation.js';

/** Lo que muestra un calendario: nunca el nombre normalizado ni las fechas de actualización. */
const CALENDAR_FIELDS = {
  id: true,
  name: true,
  createdAt: true,
  periods: {
    select: { kind: true, startMinute: true, endMinute: true },
    orderBy: { position: 'asc' },
  },
  courses: { select: { id: true, name: true } },
} as const;

interface CalendarRow {
  id: string;
  name: string;
  createdAt: Date;
  periods: { kind: 'SESSION' | 'BREAK'; startMinute: number; endMinute: number }[];
  courses: { id: string; name: string }[];
}

/** Fila de un calendario tal como la devuelve `CALENDAR_FIELDS`, con las horas como `HH:MM`, lista para el dominio. */
function toCalendar({ id, name, createdAt, periods, courses }: CalendarRow): Calendar {
  return {
    id,
    name,
    createdAt,
    periods: periods.map(({ kind, startMinute, endMinute }) => ({
      type: kind,
      startTime: formatClock(startMinute),
      endTime: formatClock(endMinute),
    })),
    courses: courses.map(({ id: courseId, name: courseName }) => ({
      id: courseId,
      name: courseName,
    })),
  };
}

/** Un periodo del dominio (horas `HH:MM`) como lo guarda la base de datos, con su posición desde 1. */
function toRow(id: () => string, period: CalendarPeriod, index: number) {
  return {
    id: id(),
    position: index + 1,
    kind: period.type,
    startMinute: parseClock(period.startTime) ?? 0,
    endMinute: parseClock(period.endTime) ?? 0,
  };
}

/** Calendarios base y sus periodos en PostgreSQL. */
export class PrismaCalendarRepository implements CalendarRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly generateId: () => string = () => crypto.randomUUID(),
  ) {}

  async create(
    schoolId: string,
    calendar: NewCalendar,
    courseIds: readonly string[],
  ): Promise<Calendar> {
    try {
      return await translateDatabaseErrors(() =>
        this.prisma.$transaction(async (transaction): Promise<Calendar> => {
          if (courseIds.length > 0) {
            // Los cursos se bloquean antes de escribir nada y **en orden de `id`**: dos altas con cursos en
            // común se ordenan solas sin interbloquearse, y el borrado o la edición de un curso esperan o
            // ya no lo encuentran. Se filtra por colegio: un curso ajeno no existe.
            const locked = await transaction.$queryRaw<{ id: string }[]>`
              SELECT id FROM courses
              WHERE id = ANY(${[...courseIds]}::uuid[]) AND school_id = ${schoolId}::uuid
              ORDER BY id FOR UPDATE`;
            const found = new Set(locked.map(({ id }) => id));
            const missing = courseIds.flatMap((id, position) => (found.has(id) ? [] : [position]));
            if (missing.length > 0) {
              throw new CalendarCoursesNotFound(missing);
            }
          }

          // La unicidad del nombre la garantiza el índice, no una consulta previa, para que dos altas
          // simultáneas no creen dos calendarios.
          await transaction.calendar.create({
            data: {
              id: calendar.id,
              schoolId,
              name: calendar.name,
              normalizedName: calendar.normalizedName,
              periods: {
                create: calendar.periods.map((period, index) =>
                  toRow(this.generateId, period, index),
                ),
              },
            },
          });

          if (courseIds.length > 0) {
            // Los que seguían otro calendario pasan a este.
            await transaction.course.updateMany({
              where: { id: { in: [...courseIds] }, schoolId },
              data: { calendarId: calendar.id },
            });
          }

          const stored = await transaction.calendar.findUniqueOrThrow({
            where: { id: calendar.id },
            select: CALENDAR_FIELDS,
          });
          return toCalendar(stored);
        }),
      );
    } catch (error) {
      if (violatedUniqueIndex(error) === CALENDAR_UNIQUE_INDEX) {
        throw new CalendarAlreadyExists();
      }
      throw error;
    }
  }

  async listBySchool(schoolId: string): Promise<Calendar[]> {
    const calendars = await translateDatabaseErrors(() =>
      this.prisma.calendar.findMany({ where: { schoolId }, select: CALENDAR_FIELDS }),
    );
    return calendars.map(toCalendar);
  }
}
