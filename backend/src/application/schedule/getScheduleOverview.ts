import type {
  ScheduleReadRepository,
  StoredScheduleOverview,
} from '../../domain/schedule/scheduleRead.js';

/**
 * Caso de uso: qué horarios tiene el colegio (US-ALGO-CONFIRM). Solo lee: el borrador y el oficial vigente del colegio
 * de la sesión, sin sus entradas, y cuántos oficiales se sustituyeron. Lo usan `/horarios` y el panel de generación.
 */
export class GetScheduleOverview {
  constructor(
    private readonly dependencies: {
      scheduleReadRepository: Pick<ScheduleReadRepository, 'overview'>;
    },
  ) {}

  execute({ schoolId }: { schoolId: string }): Promise<StoredScheduleOverview> {
    return this.dependencies.scheduleReadRepository.overview(schoolId);
  }
}
