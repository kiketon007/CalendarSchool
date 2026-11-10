/** Los motores de generación de horarios que un despliegue puede elegir (`SCHEDULE_ENGINE` del backend). */
export const SCHEDULE_ENGINES = ['BACKTRACKING', 'ORTOOLS'] as const;
export type ScheduleEngineName = (typeof SCHEDULE_ENGINES)[number];

/**
 * El motor del contexto de CDK `scheduleEngine`. Sin contexto, `BACKTRACKING`; un valor que no es uno de los dos hace
 * fallar la síntesis nombrando el contexto y los valores admitidos, antes de tocar nada en AWS.
 */
export function scheduleEngineOf(context: unknown): ScheduleEngineName {
  if (context === undefined || context === null) {
    return 'BACKTRACKING';
  }
  const found = SCHEDULE_ENGINES.find((engine) => engine === context);
  if (found === undefined) {
    throw new Error(
      `El contexto scheduleEngine debe ser ${SCHEDULE_ENGINES.join(' u ')} y es «${typeof context === 'string' ? context : JSON.stringify(context)}»`,
    );
  }
  return found;
}
