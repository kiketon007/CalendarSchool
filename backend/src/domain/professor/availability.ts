/**
 * Un tramo en el que un profesor no está disponible (US-PROF-AVAIL): el día (1, lunes, a 5) y las horas en
 * minutos desde las 00:00. Es semiabierto, `[startMinute, endMinute)`: una sesión de 09:00 a 09:45 y otra de
 * 09:45 a 10:30 se tocan pero no se solapan. No depende de ningún calendario.
 */
export interface UnavailableInterval {
  readonly dayOfWeek: number;
  readonly startMinute: number;
  readonly endMinute: number;
}

/** La disponibilidad de un profesor: sus tramos no disponibles, normalizados. Sin tramos está disponible siempre. */
export interface ProfessorAvailability {
  /** UUIDv7 del profesor. */
  readonly professorId: string;
  readonly intervals: readonly UnavailableInterval[];
}

/**
 * Normaliza los tramos no disponibles: los ordena por día y por inicio y une los de un mismo día que se solapan o
 * se tocan (el inicio de uno es menor o igual que el fin del anterior). Nunca une días distintos. Así lo mismo se
 * guarda siempre igual y un guardado repetido no cambia nada. Pura, sin dependencias y sin modificar la entrada; el
 * frontend repite esta misma regla y los dos tests recorren `test-fixtures/professor-unavailability-normalization.json`.
 */
export function normalizeUnavailability(
  intervals: readonly UnavailableInterval[],
): UnavailableInterval[] {
  const sorted = [...intervals].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute || a.endMinute - b.endMinute,
  );
  const joined: UnavailableInterval[] = [];
  for (const interval of sorted) {
    const last = joined.at(-1);
    if (
      last !== undefined &&
      last.dayOfWeek === interval.dayOfWeek &&
      interval.startMinute <= last.endMinute
    ) {
      joined[joined.length - 1] = {
        dayOfWeek: last.dayOfWeek,
        startMinute: last.startMinute,
        endMinute: Math.max(last.endMinute, interval.endMinute),
      };
    } else {
      joined.push({ ...interval });
    }
  }
  return joined;
}
