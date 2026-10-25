import type { Calendar, CalendarPeriod } from '../../domain/calendar/calendar.js';
import {
  CalendarAlreadyExists,
  CalendarCoursesNotFound,
  CalendarNotFound,
} from '../../domain/calendar/calendarErrors.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import { normalizeName } from '../../domain/course/courseNames.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { byName } from '../courses/courseOrdering.js';
import { ValidationError } from '../validationError.js';
import { parseUpdateCalendarRequest } from './updateCalendarRequest.js';

export interface UpdateCalendarDependencies {
  calendarRepository: Pick<CalendarRepository, 'update'>;
  logger: ApplicationLogger;
}

export interface UpdateCalendarInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que edita, de la identidad de la petición. */
  actorId: string;
  calendarId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

type ChangedField = 'name' | 'periods' | 'courses';

function samePeriods(a: readonly CalendarPeriod[], b: readonly CalendarPeriod[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (period, index) =>
        period.type === b[index]?.type &&
        period.startTime === b[index].startTime &&
        period.endTime === b[index].endTime,
    )
  );
}

/** Qué campos cambiaron y cuántos cursos se añadieron y se quitaron (el orden de los cursos no cuenta). */
function diff(before: Calendar, after: Calendar) {
  const beforeIds = new Set(before.courses.map(({ id }) => id));
  const afterIds = new Set(after.courses.map(({ id }) => id));
  const coursesAdded = [...afterIds].filter((id) => !beforeIds.has(id)).length;
  const coursesRemoved = [...beforeIds].filter((id) => !afterIds.has(id)).length;

  const changedFields: ChangedField[] = [];
  if (before.name !== after.name) {
    changedFields.push('name');
  }
  if (!samePeriods(before.periods, after.periods)) {
    changedFields.push('periods');
  }
  if (coursesAdded > 0 || coursesRemoved > 0) {
    changedFields.push('courses');
  }
  return { changedFields, coursesAdded, coursesRemoved };
}

/**
 * Caso de uso: edita un calendario base del colegio guardando su estado final (US-BASE_b). Valida y limpia el
 * cuerpo con las mismas reglas que el alta (`ValidationError`, sin tocar el repositorio ni registrar nada) y
 * delega en el repositorio, que lo guarda todo en una transacción: lanza `CalendarAlreadyExists` si otro
 * calendario del colegio usa el nombre y `CalendarCoursesNotFound` si algún curso no es del colegio (que aquí
 * pasa a `400` con `NOT_FOUND` en `courseIds[<i>]`); si el calendario no es del colegio devuelve `null` y se
 * lanza `CalendarNotFound`. Gana el último guardado. Registra `CALENDAR_UPDATED` (también sin cambios, con
 * `changed_fields` vacío) o `CALENDAR_UPDATE_REJECTED` solo con identificadores y recuentos: los nombres no
 * van al log.
 */
export class UpdateCalendar {
  constructor(private readonly dependencies: UpdateCalendarDependencies) {}

  async execute({ schoolId, actorId, calendarId, body }: UpdateCalendarInput): Promise<Calendar> {
    const { calendarRepository, logger } = this.dependencies;

    const parsed = parseUpdateCalendarRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { name, periods, courseIds } = parsed.data;

    const rejected = (reason: 'not_found' | 'duplicate' | 'course_not_found', message: string) => {
      logger.warn(
        {
          event: 'CALENDAR_UPDATE_REJECTED',
          school_id: schoolId,
          actor_id: actorId,
          calendar_id: calendarId,
          reason,
        },
        message,
      );
    };

    let result;
    try {
      result = await calendarRepository.update(
        schoolId,
        calendarId,
        { name, normalizedName: normalizeName(name), periods },
        courseIds,
      );
    } catch (error) {
      if (error instanceof CalendarAlreadyExists) {
        rejected('duplicate', 'Edición rechazada: el nombre ya existe en el colegio');
      }
      if (error instanceof CalendarCoursesNotFound) {
        rejected('course_not_found', 'Edición rechazada: algún curso no existe en el colegio');
        throw new ValidationError(
          error.positions.map((position) => ({
            field: `courseIds[${String(position)}]`,
            code: 'NOT_FOUND' as const,
          })),
        );
      }
      throw error;
    }

    if (result === null) {
      rejected('not_found', 'Edición rechazada: el calendario no existe en el colegio');
      throw new CalendarNotFound();
    }

    const { before, after } = result;
    const sessionCount = after.periods.filter(({ type }) => type === 'SESSION').length;
    const { changedFields, coursesAdded, coursesRemoved } = diff(before, after);
    logger.info(
      {
        event: 'CALENDAR_UPDATED',
        school_id: schoolId,
        actor_id: actorId,
        calendar_id: after.id,
        changed_fields: changedFields,
        session_count: sessionCount,
        break_count: after.periods.length - sessionCount,
        courses_added: coursesAdded,
        courses_removed: coursesRemoved,
      },
      'Calendario editado',
    );
    return { ...after, courses: [...after.courses].sort(byName) };
  }
}
