import type { SubjectColor } from '../subject/subject.js';

/** Un periodo de la jornada de un calendario, en minutos desde las 00:00. */
export interface StoredDraftPeriod {
  readonly kind: 'SESSION' | 'BREAK';
  readonly startMinute: number;
  readonly endMinute: number;
}

/** Un curso del borrador con su calendario **actual** (que puede ser otro que al generar, o ninguno). */
export interface StoredDraftCourse {
  readonly id: string;
  readonly name: string;
  readonly calendar: {
    readonly id: string;
    readonly name: string;
    /** Los periodos de la jornada en su orden. */
    readonly periods: readonly StoredDraftPeriod[];
  } | null;
  /** Solo las clases del curso que tienen alguna entrada. */
  readonly classes: readonly { readonly id: string; readonly name: string }[];
}

export interface StoredDraftSubject {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly color: SubjectColor;
}

export interface StoredDraftProfessor {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
}

/** Una sesión del horario, con las horas guardadas al generar. */
export interface StoredDraftEntry {
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

/**
 * El horario borrador de un colegio tal como se lee para verlo (US-ALGO-VIEW): **normalizado**, con las entradas solo
 * con ids y cada curso, clase, asignatura y profesor una vez. Solo contiene lo que aparece en alguna entrada.
 */
export interface StoredScheduleDraft {
  readonly id: string;
  readonly generatedAt: Date;
  readonly placedSessions: number;
  readonly courses: readonly StoredDraftCourse[];
  readonly subjects: readonly StoredDraftSubject[];
  readonly professors: readonly StoredDraftProfessor[];
  readonly entries: readonly StoredDraftEntry[];
}

/** Puerto de lectura del horario borrador (US-ALGO-VIEW). */
export interface ScheduleDraftRepository {
  /**
   * El borrador (`DRAFT`) del colegio, que es como mucho uno, o `null` si no hay ninguno. Una sola lectura, sin
   * bloqueos. El orden de las listas no está garantizado: lo da el caso de uso.
   */
  findDraft(schoolId: string): Promise<StoredScheduleDraft | null>;
}
