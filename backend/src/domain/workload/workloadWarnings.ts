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
    };

/**
 * Avisos de la carga de un curso (US19). Sin calendario no hay con qué comparar, así que solo avisa de eso;
 * con calendario avisa si las sesiones asignadas superan las disponibles (`sesiones al día × 5`). Pura: US19_b
 * a US20 la ampliarán con los avisos por asignatura.
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
