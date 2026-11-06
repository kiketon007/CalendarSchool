import type {
  ScheduleReadRepository,
  StoredScheduleSummary,
} from '../../domain/schedule/scheduleRead.js';

/**
 * Caso de uso: los horarios oficiales anteriores del colegio (US-ALGO-CONFIRM_b). Solo lee: las cabeceras, sin
 * entradas, de los oficiales sustituidos del colegio de la sesión, el sustituido más recientemente primero y como
 * mucho 100. El orden lo da la consulta (es por fecha, no por texto), así que no se reordena.
 */
export class ListPreviousSchedules {
  constructor(
    private readonly dependencies: {
      scheduleReadRepository: Pick<ScheduleReadRepository, 'listPrevious'>;
    },
  ) {}

  execute({ schoolId }: { schoolId: string }): Promise<StoredScheduleSummary[]> {
    return this.dependencies.scheduleReadRepository.listPrevious(schoolId);
  }
}
