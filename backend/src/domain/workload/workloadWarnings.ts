/** Días lectivos de la semana: la jornada de un calendario es la misma de lunes a viernes. */
export const SCHOOL_DAYS_PER_WEEK = 5;

/**
 * Aviso sobre la carga de un curso. Se calcula en cada lectura y nunca se guarda ni impide guardar: la carga
 * y el calendario se cambian en pantallas distintas, así que rechazar en una no evitaría el problema creado
 * en la otra. Debe coincidir con `WorkloadWarning` de `docs/api-spec.yml`.
 */
export type WorkloadWarning =
  | { readonly code: 'COURSE_WITHOUT_CALENDAR' }
  | {
      readonly code: 'WORKLOAD_EXCEEDS_SLOTS';
      readonly assigned: number;
      readonly available: number;
    }
  | { readonly code: 'BLOCK_LARGER_THAN_LOAD' }
  | { readonly code: 'SUBJECT_DOES_NOT_FIT' };

/**
 * Avisos de la carga de un curso (US19). Sin calendario no hay con qué comparar, así que solo avisa de eso;
 * con calendario avisa si las sesiones asignadas superan las disponibles (`sesiones al día × 5`). Pura. Los
 * avisos de cada asignatura los calcula `subjectWarnings`.
 */
export function workloadWarnings(load: {
  assignedSessions: number;
  availableSessions: number | null;
}): WorkloadWarning[] {
  const { assignedSessions, availableSessions } = load;
  if (availableSessions === null) {
    return [{ code: 'COURSE_WITHOUT_CALENDAR' }];
  }
  if (assignedSessions > availableSessions) {
    return [
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: assignedSessions, available: availableSessions },
    ];
  }
  return [];
}

/** Tope de bloques y sesiones sueltas por semana: una asignatura no puede ocupar más de un día cada vez. */
const MAX_DAYS = SCHOOL_DAYS_PER_WEEK;

/** Las reglas de una asignatura en un curso, tal como las lee el repositorio. */
export interface SubjectRules {
  /** Sesiones semanales en el curso, o `null` si no se imparte en él. */
  readonly sessionsPerWeek: number | null;
  /** Máximo de sesiones sueltas al día (2 a 5), o `null` sin regla (como mucho una al día). */
  readonly maxPerDay: number | null;
  /** Tamaño del bloque de sesiones seguidas (2 o 3), o `null` sin regla. */
  readonly blockSize: number | null;
}

/** La jornada del calendario del curso, resumida en lo que necesitan los avisos. */
export interface DaySummary {
  /** Sesiones de cada día (la jornada es la misma de lunes a viernes). */
  readonly sessionsPerDay: number;
  /** El tramo más largo de sesiones seguidas, sin un recreo entre ellas. */
  readonly maxConsecutiveSessions: number;
}

/**
 * Avisos de una asignatura en un curso (US19_b), calculados en cada lectura. Cada asignatura se comprueba por
 * separado: no garantiza que el horario completo exista. Pura y sin dependencias; el frontend repite esta misma
 * regla para recalcular los avisos mientras se edita la matriz.
 *
 * Con la carga `L`, el máximo `m` (1 sin regla) y el bloque `k`:
 * - `BLOCK_LARGER_THAN_LOAD`: hay bloque y `L < k`, con o sin calendario.
 * - `SUBJECT_DOES_NOT_FIT`: solo con calendario y sin el aviso anterior. Con `b = ⌊L / k⌋` bloques y
 *   `r = L mod k` sesiones sueltas (sin bloque, `b = 0` y `r = L`), salta si hay bloques y ningún tramo sin
 *   recreo llega a `k`, o si hacen falta más de cinco días: cada día lleva como mucho un bloque o, si no,
 *   hasta `min(m, S)` sueltas, y los cinco días tienen la misma jornada.
 */
export function subjectWarnings(rules: SubjectRules, day: DaySummary | null): WorkloadWarning[] {
  const { sessionsPerWeek: load, maxPerDay, blockSize } = rules;
  if (load === null) {
    return [];
  }
  if (blockSize !== null && load < blockSize) {
    return [{ code: 'BLOCK_LARGER_THAN_LOAD' }];
  }
  if (day === null) {
    return [];
  }
  const blocks = blockSize === null ? 0 : Math.floor(load / blockSize);
  const loose = blockSize === null ? load : load % blockSize;
  const perDay = Math.min(maxPerDay ?? 1, day.sessionsPerDay);
  const stretchTooShort =
    blockSize !== null && blocks > 0 && day.maxConsecutiveSessions < blockSize;
  const daysNeeded = blocks + Math.ceil(loose / perDay);
  if (stretchTooShort || daysNeeded > MAX_DAYS) {
    return [{ code: 'SUBJECT_DOES_NOT_FIT' }];
  }
  return [];
}
