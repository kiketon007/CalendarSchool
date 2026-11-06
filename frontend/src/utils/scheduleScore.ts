import type { components } from '../api/generated/schema';

export type ScheduleScore = components['schemas']['ScheduleScore'];

/** Los seis enteros de la puntuación de un horario (US-ALGO-RUN_b). Deben coincidir con `docs/api-spec.yml`. */
const SCORE_FIELDS = [
  'total',
  'preferredMisses',
  'preferredTotal',
  'professorGaps',
  'consecutiveDays',
  'initialTotal',
] as const satisfies readonly (keyof ScheduleScore)[];

/**
 * Si un valor de una respuesta es una `ScheduleScore`: los seis enteros no negativos y nada más. Es el mismo guardia
 * que el del backend (`isScheduleScore`): lo usan los servicios de la generación y de los horarios.
 */
export function isScheduleScore(value: unknown): value is ScheduleScore {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === SCORE_FIELDS.length &&
    SCORE_FIELDS.every((field) => {
      const number = record[field];
      return typeof number === 'number' && Number.isInteger(number) && number >= 0;
    })
  );
}
