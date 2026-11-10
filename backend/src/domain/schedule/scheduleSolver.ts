import type { UnavailableInterval } from '../professor/availability.js';
import type { ScheduleScore } from './scheduleScore.js';

/** Una sesión de la jornada de un curso: su número (desde 1), su hora en minutos y el tramo entre recreos. */
export interface GenerationCell {
  readonly sessionNumber: number;
  readonly startMinute: number;
  readonly endMinute: number;
  /** Posición del tramo de sesiones seguidas (sin recreo) al que pertenece, desde 0. */
  readonly group: number;
}

/** Un curso con calendario: las sesiones de su jornada, iguales de lunes a viernes. */
export interface GenerationCourse {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly cells: readonly GenerationCell[];
}

/** Un profesor que da alguna lección, con los tramos en los que no puede. */
export interface GenerationProfessor {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly unavailable: readonly UnavailableInterval[];
}

/** Una celda de un curso: día (1, lunes, a 5) y número de sesión. */
export interface GenerationSlot {
  readonly dayOfWeek: number;
  readonly sessionNumber: number;
}

/**
 * Una lección: una asignatura activa en una clase, con su profesor y su carga. Es lo que HC1 obliga a colocar
 * exactamente `sessions` veces.
 */
export interface GenerationLesson {
  /** Posición en `GenerationInput.lessons`. */
  readonly index: number;
  readonly courseId: string;
  readonly courseName: string;
  readonly classId: string;
  readonly className: string;
  readonly subjectId: string;
  readonly subjectName: string;
  readonly professorId: string;
  readonly professorName: string;
  readonly sessions: number;
  /** Máximo de sesiones sueltas al día (1 sin regla). */
  readonly maxPerDay: number;
  /** Tamaño del bloque (2 o 3), o `null` sin regla. */
  readonly blockSize: number | null;
  /** Celdas prohibidas de la asignatura en el curso que existen en el calendario (HC8). */
  readonly forbidden: readonly GenerationSlot[];
  /**
   * Celdas preferidas de la asignatura en el curso que existen en el calendario y no están prohibidas (SC4). Vacía
   * si no tiene: entonces la lección no cuenta para el criterio.
   */
  readonly preferred: readonly GenerationSlot[];
}

/** Dónde puede ir una unidad: el día y su primera sesión. */
export interface Placement {
  readonly dayOfWeek: number;
  readonly firstSession: number;
}

/** Un bloque de `size` sesiones seguidas o una sesión suelta (`size` 1) de una lección, con sus emplazamientos. */
export interface GenerationUnit {
  /** Posición en `GenerationInput.units`, en el orden estable de la entrada. */
  readonly index: number;
  readonly lessonIndex: number;
  readonly size: number;
  /** Ordenados por día y por sesión. */
  readonly placements: readonly Placement[];
}

/** Todo lo que necesita el motor: los cursos, los profesores, las lecciones y sus unidades. */
export interface GenerationInput {
  readonly courses: readonly GenerationCourse[];
  readonly professors: readonly GenerationProfessor[];
  readonly lessons: readonly GenerationLesson[];
  readonly units: readonly GenerationUnit[];
}

/** Una sesión colocada: lo que se guarda del horario. */
export interface ScheduleEntry {
  readonly courseId: string;
  readonly classId: string;
  readonly subjectId: string;
  readonly professorId: string;
  readonly dayOfWeek: number;
  readonly sessionNumber: number;
  readonly startMinute: number;
  readonly endMinute: number;
}

/** Por qué no hay horario: antes de buscar, ninguna celda; después, la restricción que más veces cerró el paso. */
export type InfeasibleReason =
  'NO_FREE_CELLS' | 'CLASS_BUSY' | 'PROFESSOR_BUSY' | 'DAILY_RULE' | 'MAX_HOURS';

/** La lección que explica un `infeasible`, con las referencias para enlazar a donde se corrige. */
export interface InfeasibleCause {
  readonly reason: InfeasibleReason;
  readonly course: { readonly id: string; readonly name: string };
  readonly schoolClass: { readonly id: string; readonly name: string };
  readonly subject: { readonly id: string; readonly name: string };
  readonly professor: { readonly id: string; readonly name: string };
}

/** La fase de una generación: busca un horario válido o lo mejora con las preferencias (US-ALGO-RUN_b). */
export type GenerationPhase = 'SEARCHING' | 'IMPROVING';

/** Por qué terminó la mejora: no quedan movimientos que mejoren, se acabó el tiempo, se canceló o no se hizo. */
export type ImprovementStop = 'CONVERGED' | 'TIME_LIMIT' | 'CANCELLED' | 'SKIPPED';

/** Cómo fue la mejora: por qué terminó, cuántos movimientos aceptó y cuánto duró. */
export interface ImprovementReport {
  readonly stoppedBy: ImprovementStop;
  readonly moves: number;
  readonly elapsedMs: number;
}

/** El motor que encontró el horario: la búsqueda con retroceso en TypeScript o CP-SAT de OR-Tools (US-ALGO-ORTOOLS). */
export type ScheduleEngine = 'BACKTRACKING' | 'ORTOOLS';

/** Tiempo máximo de la resolución por defecto: 120 s, el límite de la regla de diseño del backtracking. */
export const DEFAULT_LIMIT_MS = 120_000;

/** Tiempo máximo de la fase de mejora por defecto: 60 s (o lo que quede de `limitMs`). */
export const IMPROVE_LIMIT_MS = 60_000;

export type SolveOutcome =
  | {
      readonly status: 'solved';
      /** El motor que encontró el horario válido de partida (el que se mejoró). */
      readonly engine: ScheduleEngine;
      readonly entries: readonly ScheduleEntry[];
      /** La puntuación del horario entregado; `initialTotal` es la del horario válido de la fase 1. */
      readonly score: ScheduleScore;
      readonly improvement: ImprovementReport;
    }
  | { readonly status: 'infeasible'; readonly cause: InfeasibleCause }
  | { readonly status: 'timeout'; readonly placed: number; readonly total: number }
  | { readonly status: 'cancelled' };

/** Lo que se inyecta al motor: el tiempo, la cancelación y el progreso. Todo es opcional. */
export interface SolveOptions {
  /** Tiempo máximo de toda la resolución, en milisegundos (120 000 por defecto). */
  readonly limitMs?: number;
  /** Si, con un horario válido, se mejora con las preferencias (`true` por defecto). */
  readonly improve?: boolean;
  /** Tiempo máximo de la mejora, en milisegundos ({@link IMPROVE_LIMIT_MS} por defecto), sin pasar de lo que quede de `limitMs`. */
  readonly improveMs?: number;
  /** Reloj en milisegundos (`Date.now` por defecto). */
  readonly now?: () => number;
  /** Se consulta al menos cada 1024 nodos de la búsqueda. */
  readonly isCancelled?: () => boolean;
  /** Sesiones colocadas (el máximo alcanzado, nunca baja) y total. */
  readonly onProgress?: (placed: number, total: number) => void;
  /** Datos para el log de quien llama (el id de la generación): el motor los añade a sus avisos. */
  readonly logContext?: Readonly<Record<string, unknown>>;
  /** Se llama con `'IMPROVING'` al empezar la mejora, después del último `onProgress`. */
  readonly onPhase?: (phase: GenerationPhase) => void;
  /** La puntuación del horario de partida y cada vez que la mejora baja la penalización (`total` nunca sube). */
  readonly onScore?: (score: ScheduleScore) => void;
}

/**
 * El puerto del motor (US-ALGO-RUN): dado el problema, encuentra un horario que cumpla las restricciones duras o dice
 * por qué no. La búsqueda cede el control al bucle de eventos al consultar el tiempo y la cancelación, por eso es
 * asíncrona: así quien la lanza puede guardar el progreso y ver la marca de cancelación mientras tanto.
 */
export interface ScheduleSolver {
  solve(input: GenerationInput, options?: SolveOptions): Promise<SolveOutcome>;
}

/** Las cifras de HC7: 23 horas lectivas por profesor y semana. */
export { MAX_TEACHING_MINUTES } from '../professor/teachingLoad.js';
