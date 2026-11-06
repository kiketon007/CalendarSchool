import { progressOf, type Generation } from '../../domain/schedule/generation.js';

/** Una generación tal como la ve la persona usuaria: sin el colegio, el autor ni la marca de cancelación. */
export type GenerationView = Omit<Generation, 'schoolId' | 'createdById' | 'cancelRequested'> & {
  /** `round(100 · placed / total)`, de 0 a 100. */
  readonly progress: number;
  /**
   * Se detuvo la mejora: la generación terminó con éxito (`COMPLETED`) habiendo pedido mejorar y con la cancelación
   * solicitada. No hay columna propia: la carrera de una cancelación que llega tras el último control de la mejora
   * solo cambia un texto del resumen.
   */
  readonly improvementCancelled: boolean;
};

export function toGenerationView({
  schoolId: _schoolId,
  createdById: _createdById,
  cancelRequested,
  ...generation
}: Generation): GenerationView {
  return {
    ...generation,
    progress: progressOf(generation.placed, generation.total),
    improvementCancelled:
      generation.status === 'COMPLETED' && generation.improve && cancelRequested,
  };
}
