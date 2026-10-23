/** Un periodo es una sesión lectiva o un recreo (patio). */
export type CalendarPeriodType = 'SESSION' | 'BREAK';

/**
 * Un periodo de la jornada de un calendario, igual de lunes a viernes. Las horas son `HH:MM` de 24 horas;
 * en la base de datos se guardan como minutos desde las 00:00. El número de una sesión no se guarda: es su
 * orden entre las sesiones del calendario.
 */
export interface CalendarPeriod {
  readonly type: CalendarPeriodType;
  readonly startTime: string;
  readonly endTime: string;
}

/** Curso que sigue un calendario, con lo mínimo para mostrarlo. */
export interface CalendarCourse {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
}

/** Calendario base de un colegio (US-BASE): una estructura de jornada con sus periodos y los cursos que la siguen. */
export interface Calendar {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  /** Periodos en el orden del día. */
  readonly periods: readonly CalendarPeriod[];
  readonly courses: readonly CalendarCourse[];
  /** Instante de creación, el que guarda la base de datos. */
  readonly createdAt: Date;
}
