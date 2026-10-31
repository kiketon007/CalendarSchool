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
  | { readonly code: 'SUBJECT_DOES_NOT_FIT' }
  | { readonly code: 'SLOTS_OUTSIDE_CALENDAR'; readonly count: number }
  | { readonly code: 'PREFERRED_SLOTS_FORBIDDEN'; readonly count: number };

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

/** Una celda de la cuadrícula de franjas: el día (1, lunes, a 5) y el número de la sesión en la jornada. */
export interface SlotCell {
  readonly dayOfWeek: number;
  readonly sessionNumber: number;
}

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
  /**
   * Los tamaños de los tramos de sesiones seguidas entre recreos, en orden (por ejemplo `[3, 3]` con el recreo
   * tras la 3ª sesión). Las sesiones se numeran seguidas a través de los tramos y la jornada es la misma de
   * lunes a viernes.
   */
  readonly sessionGroups: readonly number[];
}

/** Las franjas prohibidas de una asignatura que hacen falta para sus avisos. */
export interface SlotsSummary {
  /** Las celdas prohibidas que existen en el calendario actual. */
  readonly cells: readonly SlotCell[];
  /** Cuántas celdas guardadas ya no existen en el calendario (sin calendario, todas). */
  readonly outsideCount: number;
}

/** Una celda como texto, para comparar conjuntos de celdas. */
const cellKey = ({ dayOfWeek, sessionNumber }: SlotCell) =>
  `${String(dayOfWeek)}-${String(sessionNumber)}`;

const NO_SLOTS: SlotsSummary = { cells: [], outsideCount: 0 };

/** Las celdas prohibidas por día de la semana (1 a 5), como conjuntos de números de sesión. */
function forbiddenByDay(cells: readonly SlotCell[]): Set<number>[] {
  const days = Array.from({ length: SCHOOL_DAYS_PER_WEEK }, () => new Set<number>());
  for (const { dayOfWeek, sessionNumber } of cells) {
    days[dayOfWeek - 1]?.add(sessionNumber);
  }
  return days;
}

/** `true` si entre las sesiones libres hay `size` seguidas dentro de un mismo tramo (sin recreo entre ellas). */
function fitsBlock(
  groups: readonly number[],
  forbidden: ReadonlySet<number>,
  size: number,
): boolean {
  let first = 1;
  for (const length of groups) {
    let run = 0;
    for (let session = first; session < first + length; session += 1) {
      run = forbidden.has(session) ? 0 : run + 1;
      if (run >= size) {
        return true;
      }
    }
    first += length;
  }
  return false;
}

/**
 * Avisos de una asignatura en un curso (US19_b y US19_c), calculados en cada lectura. Cada asignatura se
 * comprueba por separado: no garantiza que el horario completo exista. Pura y sin dependencias; el frontend
 * repite esta misma regla para recalcular los avisos mientras se edita, y los dos tests recorren la misma tabla
 * (`test-fixtures/subject-warnings.json`).
 *
 * Con la carga `L`, el máximo `m` (1 sin regla), el bloque `k`, `b = ⌊L / k⌋` bloques y `r = L mod k` sesiones
 * sueltas (sin bloque, `b = 0` y `r = L`):
 * - `BLOCK_LARGER_THAN_LOAD`: hay bloque y `L < k`, con o sin calendario.
 * - `SUBJECT_DOES_NOT_FIT`: solo con calendario y sin el aviso anterior. Cada día lleva como mucho un bloque
 *   (`k` sesiones libres seguidas de un mismo tramo) y, si lo lleva, ninguna suelta; si no, hasta `min(m, libres)`
 *   sueltas. Salta si no hay `b` días que puedan llevar un bloque y dejen, entre los demás, sitio para `r`
 *   sueltas. Con cinco días se prueban los 32 repartos.
 * - `SLOTS_OUTSIDE_CALENDAR` (con el recuento): hay celdas guardadas que ya no existen en el calendario.
 *
 * Una asignatura que no se imparte no tiene avisos.
 */
export function subjectWarnings(
  rules: SubjectRules,
  day: DaySummary | null,
  slots: SlotsSummary = NO_SLOTS,
): WorkloadWarning[] {
  const { sessionsPerWeek: load, maxPerDay, blockSize } = rules;
  if (load === null) {
    return [];
  }
  const outside: WorkloadWarning[] =
    slots.outsideCount > 0 ? [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: slots.outsideCount }] : [];
  if (blockSize !== null && load < blockSize) {
    return [{ code: 'BLOCK_LARGER_THAN_LOAD' }, ...outside];
  }
  if (day === null) {
    return outside;
  }

  const blocks = blockSize === null ? 0 : Math.floor(load / blockSize);
  const loose = blockSize === null ? load : load % blockSize;
  const sessions = day.sessionGroups.reduce((total, size) => total + size, 0);
  const forbidden = forbiddenByDay(slots.cells);
  const looseOf = forbidden.map((cells) => {
    const free = Array.from({ length: sessions }, (_, index) => index + 1).filter(
      (session) => !cells.has(session),
    ).length;
    return Math.min(maxPerDay ?? 1, free);
  });
  const canBlock = forbidden.map(
    (cells) => blockSize !== null && fitsBlock(day.sessionGroups, cells, blockSize),
  );

  // Se prueba cada reparto de los bloques entre los días que pueden llevarlos.
  let fits = false;
  for (let mask = 0; mask < 1 << SCHOOL_DAYS_PER_WEEK && !fits; mask += 1) {
    const chosen = forbidden.map((_, index) => (mask & (1 << index)) !== 0);
    const count = chosen.filter(Boolean).length;
    if (count === blocks && chosen.every((isBlock, index) => !isBlock || canBlock[index])) {
      const room = looseOf.reduce(
        (total, loosePerDay, index) => total + (chosen[index] ? 0 : loosePerDay),
        0,
      );
      fits = room >= loose;
    }
  }
  return fits ? outside : [{ code: 'SUBJECT_DOES_NOT_FIT' }, ...outside];
}

/**
 * Aviso de contradicción entre las franjas preferidas y las prohibidas de una asignatura (US19_d): gana la
 * prohibida y la preferida se ignora, así que se avisa con el número de celdas preferidas que también están
 * prohibidas. Ambas listas son las celdas que existen en el calendario actual. Pura; el frontend repite esta
 * misma regla y los dos tests recorren `test-fixtures/preferred-slots-warnings.json`. Va después de los avisos
 * de `subjectWarnings`.
 */
export function preferredSlotsWarnings(
  preferred: readonly SlotCell[],
  forbidden: readonly SlotCell[],
): WorkloadWarning[] {
  const forbiddenKeys = new Set(forbidden.map(cellKey));
  const count = preferred.filter((cell) => forbiddenKeys.has(cellKey(cell))).length;
  return count > 0 ? [{ code: 'PREFERRED_SLOTS_FORBIDDEN', count }] : [];
}
