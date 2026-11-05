import type { SubjectColor } from '../subject/subject.js';

/** Un periodo de la jornada de un calendario, en minutos desde las 00:00. */
export interface StoredSchedulePeriod {
  readonly kind: 'SESSION' | 'BREAK';
  readonly startMinute: number;
  readonly endMinute: number;
}

/** Un curso del borrador con su calendario **actual** (que puede ser otro que al generar, o ninguno). */
export interface StoredScheduleCourse {
  readonly id: string;
  readonly name: string;
  readonly calendar: {
    readonly id: string;
    readonly name: string;
    /** Los periodos de la jornada en su orden. */
    readonly periods: readonly StoredSchedulePeriod[];
  } | null;
  /** Solo las clases del curso que tienen alguna entrada. */
  readonly classes: readonly { readonly id: string; readonly name: string }[];
}

export interface StoredScheduleSubject {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly color: SubjectColor;
}

export interface StoredScheduleProfessor {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
}

/** Una sesión del horario, con las horas guardadas al generar. */
export interface StoredScheduleEntry {
  readonly courseId: string;
  readonly classId: string;
  readonly subjectId: string;
  /** `null` si se borró al profesor después de generar. */
  readonly professorId: string | null;
  readonly dayOfWeek: number;
  readonly sessionNumber: number;
  readonly startMinute: number;
  readonly endMinute: number;
}

/** Qué horario del colegio se lee: el borrador o el oficial vigente. */
export type ScheduleSelector = 'draft' | 'official';

/**
 * Un horario de un colegio tal como se lee para verlo (US-ALGO-VIEW y US-ALGO-CONFIRM): **normalizado**, con las
 * entradas solo con ids y cada curso, clase, asignatura y profesor una vez. Solo contiene lo que aparece en alguna
 * entrada. Un borrador no lleva confirmación; un oficial sí.
 */
export interface StoredSchedule {
  readonly id: string;
  readonly status: 'DRAFT' | 'OFFICIAL';
  readonly generatedAt: Date;
  readonly placedSessions: number;
  /** Cuándo se confirmó como oficial; `null` en un borrador. */
  readonly confirmedAt: Date | null;
  /** Quién lo confirmó; `null` en un borrador. */
  readonly confirmedBy: { readonly firstName: string; readonly lastName: string } | null;
  /** Cuándo dejó de ser el oficial vigente; `null` en un borrador y en el vigente. */
  readonly replacedAt: Date | null;
  readonly courses: readonly StoredScheduleCourse[];
  readonly subjects: readonly StoredScheduleSubject[];
  readonly professors: readonly StoredScheduleProfessor[];
  readonly entries: readonly StoredScheduleEntry[];
}

/** La cabecera de un horario, sin sus entradas (US-ALGO-CONFIRM). */
export interface StoredScheduleSummary {
  readonly id: string;
  readonly status: 'DRAFT' | 'OFFICIAL';
  readonly generatedAt: Date;
  readonly placedSessions: number;
  readonly confirmedAt: Date | null;
  readonly confirmedBy: { readonly firstName: string; readonly lastName: string } | null;
  readonly replacedAt: Date | null;
}

/** Qué horarios tiene un colegio: el borrador, el oficial vigente y cuántos oficiales se sustituyeron. */
export interface StoredScheduleOverview {
  readonly draft: StoredScheduleSummary | null;
  readonly official: StoredScheduleSummary | null;
  readonly previousCount: number;
}

/** Puerto de lectura de los horarios de un colegio (US-ALGO-VIEW y US-ALGO-CONFIRM). */
export interface ScheduleReadRepository {
  /**
   * El borrador (`DRAFT`) del colegio o su oficial vigente (`OFFICIAL` sin sustituir), que son como mucho uno cada
   * uno, o `null` si no hay. Una sola lectura, sin bloqueos. El orden de las listas no está garantizado: lo da el
   * caso de uso.
   */
  find(schoolId: string, which: ScheduleSelector): Promise<StoredSchedule | null>;

  /** Las cabeceras del borrador y del oficial vigente del colegio, y cuántos oficiales se sustituyeron. */
  overview(schoolId: string): Promise<StoredScheduleOverview>;
}
