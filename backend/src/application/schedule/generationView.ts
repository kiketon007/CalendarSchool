import { progressOf, type Generation } from '../../domain/schedule/generation.js';

/** Una generación tal como la ve la persona usuaria: sin el colegio ni el autor, y con el porcentaje calculado. */
export type GenerationView = Omit<Generation, 'schoolId' | 'createdById'> & {
  /** `round(100 · placed / total)`, de 0 a 100. */
  readonly progress: number;
};

export function toGenerationView({
  schoolId: _schoolId,
  createdById: _createdById,
  ...generation
}: Generation): GenerationView {
  return { ...generation, progress: progressOf(generation.placed, generation.total) };
}
