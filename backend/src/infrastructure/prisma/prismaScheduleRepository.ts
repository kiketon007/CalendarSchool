import type {
  ScheduleDraft,
  ScheduleRepository,
} from '../../domain/schedule/scheduleRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Entradas por `createMany`: acota el tamaño de cada consulta (un colegio grande tiene unos miles de sesiones). */
const ENTRIES_PER_BATCH = 1000;

/** Los horarios generados (`schedules` y `schedule_entries`) en PostgreSQL. */
export class PrismaScheduleRepository implements ScheduleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async replaceDraft(draft: ScheduleDraft, now: Date): Promise<void> {
    await translateDatabaseErrors(() =>
      this.prisma.$transaction(
        async (transaction) => {
          // Primero la generación: si ya no está en curso (la marcaron interrumpida o la cancelaron) no se guarda nada.
          const completed = await transaction.scheduleGeneration.updateMany({
            where: { id: draft.generationId, status: 'RUNNING' },
            data: {
              status: 'COMPLETED',
              placed: draft.placedSessions,
              total: draft.total,
              finishedAt: now,
            },
          });
          if (completed.count === 0) {
            throw new Error('La generación ya no está en curso: no se guarda el horario');
          }

          // Solo el borrador del colegio: los oficiales no se tocan y las entradas caen por la cascada.
          await transaction.schedule.deleteMany({
            where: { schoolId: draft.schoolId, status: 'DRAFT' },
          });
          await transaction.schedule.create({
            data: {
              id: draft.id,
              schoolId: draft.schoolId,
              status: 'DRAFT',
              engine: 'BACKTRACKING',
              placedSessions: draft.placedSessions,
              generatedAt: now,
              createdById: draft.createdById,
            },
          });
          for (let from = 0; from < draft.entries.length; from += ENTRIES_PER_BATCH) {
            await transaction.scheduleEntry.createMany({
              data: draft.entries.slice(from, from + ENTRIES_PER_BATCH).map((entry) => ({
                ...entry,
                scheduleId: draft.id,
              })),
            });
          }
          await transaction.scheduleGeneration.update({
            where: { id: draft.generationId },
            data: { scheduleId: draft.id },
          });
        },
        // Insertar miles de filas supera el tiempo por defecto de una transacción interactiva (5 s).
        { timeout: 60_000, maxWait: 10_000 },
      ),
    );
  }
}
