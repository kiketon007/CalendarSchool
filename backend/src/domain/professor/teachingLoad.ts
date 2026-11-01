import type { UnavailableInterval } from './availability.js';

/** Máximo de horas lectivas de un profesor a la semana: 23 horas, en minutos (PRD §3.2). */
export const MAX_TEACHING_MINUTES = 1380;

/** Los días lectivos de la semana: de 1 (lunes) a 5 (viernes). */
const SCHOOL_DAYS = [1, 2, 3, 4, 5] as const;

/** Una sesión de un calendario, en minutos desde las 00:00. */
export interface TeachingSession {
  readonly startMinute: number;
  readonly endMinute: number;
}

/**
 * Un calendario con lo que necesita la carga: las sesiones de un día (sin los recreos, que no cuentan), iguales de
 * lunes a viernes.
 */
export interface TeachingCalendar {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly sessions: readonly TeachingSession[];
}

/**
 * Una asignación de un profesor: una asignatura en una clase de un curso. `sessionsPerWeek` son las de la asignatura
 * en el curso y `calendar` el del curso (`null`, sin calendario).
 */
export interface TeachingAssignment {
  readonly courseId: string;
  readonly courseName: string;
  readonly calendar: TeachingCalendar | null;
  readonly sessionsPerWeek: number;
}

/** Un calendario o un curso citado en un aviso. */
export interface TeachingRef {
  readonly id: string;
  readonly name: string;
}

export type TeachingLoadWarning =
  | { readonly code: 'EXCEEDS_MAX_HOURS' }
  | { readonly code: 'MAY_EXCEED_MAX_HOURS' }
  | {
      readonly code: 'AVAILABILITY_INSUFFICIENT';
      readonly calendar: TeachingRef;
      /** La carga del profesor en ese calendario. */
      readonly sessions: number;
      /** Las sesiones del calendario en las que puede dar clase. */
      readonly available: number;
    }
  | {
      readonly code: 'COURSE_WITHOUT_CALENDAR';
      readonly course: TeachingRef;
      readonly assignmentCount: number;
    }
  | { readonly code: 'SEVERAL_CALENDARS'; readonly calendarCount: number };

export type TeachingLoadStatus = 'NO_LOAD' | 'FITS' | 'MAY_EXCEED' | 'EXCEEDS';

export interface TeachingLoad {
  /** Todas sus sesiones a la semana, también las de cursos sin calendario. */
  readonly sessionsPerWeek: number;
  /** Minutos lectivos a la semana si se le colocan las sesiones más cortas en las que puede dar clase. */
  readonly minMinutes: number;
  /** Minutos lectivos a la semana si se le colocan las más largas; nunca menor que `minMinutes`. */
  readonly maxMinutes: number;
  readonly status: TeachingLoadStatus;
  readonly warnings: readonly TeachingLoadWarning[];
}

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

/** ¿Se solapan el tramo `[a, b)` y la sesión `[s, e)`? Si se tocan solo en un extremo, no. */
const overlaps = (interval: UnavailableInterval, session: TeachingSession): boolean =>
  interval.startMinute < session.endMinute && session.startMinute < interval.endMinute;

/**
 * El rango de minutos de `load` sesiones dentro de las `durations` (ordenadas de menor a mayor): el mínimo suma las
 * más cortas y el máximo, las más largas. Si la carga supera las sesiones, cada una que sobra suma la duración más
 * corta al mínimo y la más larga al máximo.
 */
function rangeOf(durations: readonly number[], load: number): { min: number; max: number } {
  const taken = Math.min(load, durations.length);
  let min = sum(durations.slice(0, taken));
  let max = sum(durations.slice(durations.length - taken));
  const extra = load - taken;
  const shortest = durations[0];
  const longest = durations.at(-1);
  if (extra > 0 && shortest !== undefined && longest !== undefined) {
    min += extra * shortest;
    max += extra * longest;
  }
  return { min, max };
}

interface CalendarLoad {
  readonly calendar: TeachingCalendar;
  load: number;
}

interface CourseWithoutCalendar {
  readonly course: TeachingRef;
  assignmentCount: number;
}

/**
 * La carga lectiva de un profesor (US-PROF-SUMMARY), medida en minutos y no en sesiones: los calendarios pueden tener
 * sesiones de distinta duración y la que le toque a cada sesión la decide el motor al generar los horarios, así que se
 * da un **rango**. Pura, sin dependencias y sin modificar los argumentos.
 *
 * Calendario a calendario, con `carga` la suma de las sesiones a la semana de sus asignaciones en cursos con ese
 * calendario y `libres` las sesiones de lunes a viernes que no se solapan con ningún tramo no disponible:
 * - con `carga <= libres`, el mínimo suma las `carga` duraciones libres más cortas y el máximo, las más largas;
 * - con `carga > libres` avisa (`AVAILABILITY_INSUFFICIENT`) y calcula el rango con todas las sesiones del calendario.
 *
 * El rango del profesor es la suma de los de cada calendario. Las asignaciones en cursos sin calendario no suman, pero
 * avisan y cuentan en `sessionsPerWeek`. El estado sale solo de las horas frente a `MAX_TEACHING_MINUTES`. Los
 * solapes entre calendarios distintos no se comprueban (lo hace el motor): solo se avisa.
 *
 * @param compareNames Orden de los nombres de calendarios y cursos en los avisos (la comparación del castellano de
 * la aplicación, que el dominio no puede importar).
 */
export function teachingLoadOf(
  assignments: readonly TeachingAssignment[],
  unavailable: readonly UnavailableInterval[],
  compareNames: (a: string, b: string) => number,
): TeachingLoad {
  const calendars = new Map<string, CalendarLoad>();
  const withoutCalendar = new Map<string, CourseWithoutCalendar>();
  let sessionsPerWeek = 0;

  for (const { courseId, courseName, calendar, sessionsPerWeek: sessions } of assignments) {
    sessionsPerWeek += sessions;
    if (calendar === null) {
      const known = withoutCalendar.get(courseId);
      if (known === undefined) {
        withoutCalendar.set(courseId, {
          course: { id: courseId, name: courseName },
          assignmentCount: 1,
        });
      } else {
        known.assignmentCount += 1;
      }
    } else {
      const known = calendars.get(calendar.id);
      if (known === undefined) {
        calendars.set(calendar.id, { calendar, load: sessions });
      } else {
        known.load += sessions;
      }
    }
  }

  let minMinutes = 0;
  let maxMinutes = 0;
  const insufficient: TeachingLoadWarning[] = [];

  const byCalendarName = [...calendars.values()].sort((a, b) =>
    compareNames(a.calendar.name, b.calendar.name),
  );
  for (const { calendar, load } of byCalendarName) {
    const week = SCHOOL_DAYS.flatMap((day) =>
      calendar.sessions.map((session) => ({ day, session })),
    );
    const free = week.filter(
      ({ day, session }) =>
        !unavailable.some((interval) => interval.dayOfWeek === day && overlaps(interval, session)),
    );
    const enough = load <= free.length;
    const durations = (enough ? free : week)
      .map(({ session }) => session.endMinute - session.startMinute)
      .sort((a, b) => a - b);
    const range = rangeOf(durations, load);
    minMinutes += range.min;
    maxMinutes += range.max;
    if (!enough) {
      insufficient.push({
        code: 'AVAILABILITY_INSUFFICIENT',
        calendar: { id: calendar.id, name: calendar.name },
        sessions: load,
        available: free.length,
      });
    }
  }

  const status: TeachingLoadStatus =
    assignments.length === 0
      ? 'NO_LOAD'
      : minMinutes > MAX_TEACHING_MINUTES
        ? 'EXCEEDS'
        : maxMinutes > MAX_TEACHING_MINUTES
          ? 'MAY_EXCEED'
          : 'FITS';

  const warnings: TeachingLoadWarning[] = [];
  if (status === 'EXCEEDS') {
    warnings.push({ code: 'EXCEEDS_MAX_HOURS' });
  } else if (status === 'MAY_EXCEED') {
    warnings.push({ code: 'MAY_EXCEED_MAX_HOURS' });
  }
  warnings.push(...insufficient);
  [...withoutCalendar.values()]
    .sort((a, b) => compareNames(a.course.name, b.course.name))
    .forEach(({ course, assignmentCount }) => {
      warnings.push({ code: 'COURSE_WITHOUT_CALENDAR', course, assignmentCount });
    });
  if (calendars.size >= 2) {
    warnings.push({ code: 'SEVERAL_CALENDARS', calendarCount: calendars.size });
  }

  return { sessionsPerWeek, minMinutes, maxMinutes, status, warnings };
}
