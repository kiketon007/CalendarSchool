import type {
  ConfirmOutcome,
  DiscardOutcome,
  ScheduleDraft,
  ScheduleRepository,
} from '../../domain/schedule/scheduleRepository.js';
import { isScheduleScore } from '../../domain/schedule/scheduleScore.js';
import type { Prisma } from './generated/client.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';
import { OFFICIAL_SCHEDULE_UNIQUE_INDEX, violatedUniqueIndex } from './uniqueViolation.js';

/** Para deshacer la transacción de confirmar cuando el horario no es un borrador del colegio. */
class NotAConfirmableDraft extends Error {}

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
              // El motor que de verdad encontró el horario: si OR-Tools falló, el que lo sustituyó.
              engine: draft.engine,
              placed: draft.placedSessions,
              total: draft.total,
              score: draft.score as unknown as Prisma.InputJsonValue,
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
              engine: draft.engine,
              placedSessions: draft.placedSessions,
              score: draft.score as unknown as Prisma.InputJsonValue,
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

  async confirm(schoolId: string, id: string, actorId: string, now: Date): Promise<ConfirmOutcome> {
    try {
      return await translateDatabaseErrors(() =>
        this.prisma.$transaction(
          async (transaction) => {
            // El oficial vigente deja de serlo y se conserva (0 o 1 fila).
            const replaced = await transaction.schedule.updateManyAndReturn({
              where: { schoolId, status: 'OFFICIAL', replacedAt: null },
              data: { replacedAt: now },
              select: { id: true },
            });
            // Solo si es del colegio y sigue siendo borrador: dos confirmaciones a la vez se serializan en esta fila.
            const promoted = await transaction.schedule.updateMany({
              where: { id, schoolId, status: 'DRAFT' },
              data: { status: 'OFFICIAL', confirmedAt: now, confirmedById: actorId },
            });
            if (promoted.count === 0) {
              // Se deshace también la sustitución del oficial anterior.
              throw new NotAConfirmableDraft();
            }
            const schedule = await transaction.schedule.findUniqueOrThrow({
              where: { id },
              select: {
                id: true,
                status: true,
                generatedAt: true,
                placedSessions: true,
                confirmedAt: true,
                replacedAt: true,
                score: true,
                confirmedBy: { select: { firstName: true, lastName: true } },
              },
            });
            return {
              kind: 'confirmed' as const,
              // Un JSON que no tenga la forma de la puntuación se lee como si no hubiera.
              schedule: {
                ...schedule,
                score: isScheduleScore(schedule.score) ? schedule.score : null,
              },
              replacedId: replaced[0]?.id ?? null,
            };
          },
          { timeout: 15_000, maxWait: 10_000 },
        ),
      );
    } catch (error) {
      if (
        error instanceof NotAConfirmableDraft ||
        violatedUniqueIndex(error) === OFFICIAL_SCHEDULE_UNIQUE_INDEX
      ) {
        return this.whyNotDraft(schoolId, id);
      }
      throw error;
    }
  }

  async discard(schoolId: string, id: string): Promise<DiscardOutcome> {
    const deleted = await translateDatabaseErrors(() =>
      this.prisma.schedule.deleteMany({ where: { id, schoolId, status: 'DRAFT' } }),
    );
    return deleted.count > 0 ? { kind: 'discarded' } : this.whyNotDraft(schoolId, id);
  }

  /** Distingue un horario que no existe en el colegio de uno que existe pero ya no es un borrador. */
  private async whyNotDraft(
    schoolId: string,
    id: string,
  ): Promise<{ kind: 'notFound' } | { kind: 'notDraft' }> {
    const found = await translateDatabaseErrors(() =>
      this.prisma.schedule.findFirst({ where: { id, schoolId }, select: { id: true } }),
    );
    return found === null ? { kind: 'notFound' } : { kind: 'notDraft' };
  }
}
