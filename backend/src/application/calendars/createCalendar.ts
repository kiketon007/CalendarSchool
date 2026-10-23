import type { Calendar } from '../../domain/calendar/calendar.js';
import {
  CalendarAlreadyExists,
  CalendarCoursesNotFound,
} from '../../domain/calendar/calendarErrors.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import { normalizeName } from '../../domain/course/courseNames.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import { ValidationError } from '../validationError.js';
import { parseCreateCalendarRequest } from './createCalendarRequest.js';

export interface CreateCalendarDependencies {
  calendarRepository: Pick<CalendarRepository, 'create'>;
  idGenerator: IdGenerator;
  logger: ApplicationLogger;
}

export interface CreateCalendarInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que crea el calendario, de la identidad de la petición. */
  actorId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: crea un calendario base con sus periodos y los cursos que lo siguen en el colegio de la
 * identidad (US-BASE). Valida y limpia el cuerpo (`ValidationError` con un `{ field, code }` por campo
 * inválido), genera el identificador y delega en el repositorio, que lo guarda todo en una transacción:
 * lanza `CalendarAlreadyExists` si el nombre ya está en uso en el colegio y `CalendarCoursesNotFound` si
 * algún curso no es del colegio (que aquí pasa a `400` con `NOT_FOUND` en `courseIds[<i>]`). El colegio no se
 * lee nunca del cuerpo. Registra `CALENDAR_CREATED` o `CALENDAR_CREATION_REJECTED` solo con identificadores
 * y recuentos: los nombres no van al log.
 */
export class CreateCalendar {
  constructor(private readonly dependencies: CreateCalendarDependencies) {}

  async execute({ schoolId, actorId, body }: CreateCalendarInput): Promise<Calendar> {
    const { calendarRepository, idGenerator, logger } = this.dependencies;

    const parsed = parseCreateCalendarRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { name, periods, courseIds } = parsed.data;

    let calendar: Calendar;
    try {
      calendar = await calendarRepository.create(
        schoolId,
        { id: idGenerator.generate(), name, normalizedName: normalizeName(name), periods },
        courseIds,
      );
    } catch (error) {
      if (error instanceof CalendarAlreadyExists) {
        logger.warn(
          {
            event: 'CALENDAR_CREATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'duplicate',
          },
          'Calendario rechazado: el nombre ya existe en el colegio',
        );
      }
      if (error instanceof CalendarCoursesNotFound) {
        logger.warn(
          {
            event: 'CALENDAR_CREATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'course_not_found',
          },
          'Calendario rechazado: algún curso no existe en el colegio',
        );
        throw new ValidationError(
          error.positions.map((position) => ({
            field: `courseIds[${String(position)}]`,
            code: 'NOT_FOUND' as const,
          })),
        );
      }
      throw error;
    }

    const sessionCount = calendar.periods.filter(({ type }) => type === 'SESSION').length;
    logger.info(
      {
        event: 'CALENDAR_CREATED',
        school_id: schoolId,
        actor_id: actorId,
        calendar_id: calendar.id,
        session_count: sessionCount,
        break_count: calendar.periods.length - sessionCount,
        course_count: calendar.courses.length,
      },
      'Calendario creado',
    );
    return calendar;
  }
}
