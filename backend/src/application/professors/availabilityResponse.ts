import { formatClock } from '../../domain/calendar/clock.js';
import type { ProfessorAvailability } from '../../domain/professor/availability.js';

/** Un tramo no disponible tal como lo ve la API: las horas en «HH:MM». */
export interface UnavailableIntervalView {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/** La disponibilidad de un profesor tal como la devuelve la API (`ProfessorAvailability` del contrato). */
export interface ProfessorAvailabilityView {
  professorId: string;
  unavailable: UnavailableIntervalView[];
}

/** Pasa la disponibilidad del dominio (minutos) a la de la API (`HH:MM`), en el mismo orden. */
export function toAvailabilityView(availability: ProfessorAvailability): ProfessorAvailabilityView {
  return {
    professorId: availability.professorId,
    unavailable: availability.intervals.map(({ dayOfWeek, startMinute, endMinute }) => ({
      dayOfWeek,
      startTime: formatClock(startMinute),
      endTime: formatClock(endMinute),
    })),
  };
}
