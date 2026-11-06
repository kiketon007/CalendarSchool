import {
  INTERRUPTED_MESSAGE,
  type Generation,
  type GenerationErrorDetails,
} from '../../domain/schedule/generation.js';
import { GenerationInProgress } from '../../domain/schedule/generationErrors.js';
import type {
  CancelOutcome,
  FinishedGeneration,
  GenerationRepository,
} from '../../domain/schedule/generationRepository.js';
import { isScheduleScore } from '../../domain/schedule/scheduleScore.js';
import type { Prisma } from './generated/client.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';
import { GENERATION_IN_PROGRESS_UNIQUE_INDEX, violatedUniqueIndex } from './uniqueViolation.js';

type SavedProgress = Parameters<GenerationRepository['saveProgress']>[1];

type GenerationRow = Prisma.ScheduleGenerationGetPayload<object>;

function toGeneration(row: GenerationRow): Generation {
  return {
    id: row.id,
    schoolId: row.schoolId,
    createdById: row.createdById,
    status: row.status,
    placed: row.placed,
    total: row.total,
    improve: row.improve,
    phase: row.phase,
    // Un JSON que no tenga la forma de la puntuación se lee como si no hubiera: nunca rompe la lectura.
    score: isScheduleScore(row.score) ? row.score : null,
    cancelRequested: row.cancelRequested,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    // Solo lo escribe esta clase, con la forma de `GenerationErrorDetails`.
    errorDetails: row.errorDetails as GenerationErrorDetails | null,
    scheduleId: row.scheduleId,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

/** Las generaciones de horarios (`schedule_generations`) en PostgreSQL. */
export class PrismaGenerationRepository implements GenerationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(generation: {
    id: string;
    schoolId: string;
    createdById: string;
    improve: boolean;
    now: Date;
  }): Promise<Generation> {
    return translateDatabaseErrors(async () => {
      try {
        const row = await this.prisma.scheduleGeneration.create({
          data: {
            id: generation.id,
            schoolId: generation.schoolId,
            createdById: generation.createdById,
            improve: generation.improve,
            createdAt: generation.now,
          },
        });
        return toGeneration(row);
      } catch (error) {
        // El índice único parcial de la base es la exclusión mutua: no hay lectura previa que proteja.
        if (violatedUniqueIndex(error) === GENERATION_IN_PROGRESS_UNIQUE_INDEX) {
          throw new GenerationInProgress();
        }
        throw error;
      }
    });
  }

  async claim(id: string, now: Date): Promise<Generation | null> {
    return translateDatabaseErrors(async () => {
      // `UPDATE … WHERE status = 'QUEUED'`: de dos reclamaciones simultáneas gana solo una.
      const { count } = await this.prisma.scheduleGeneration.updateMany({
        where: { id, status: 'QUEUED' },
        data: { status: 'RUNNING', startedAt: now, heartbeatAt: now },
      });
      if (count === 0) {
        return null;
      }
      return toGeneration(
        await this.prisma.scheduleGeneration.findUniqueOrThrow({ where: { id } }),
      );
    });
  }

  async saveProgress(
    id: string,
    progress: SavedProgress,
    now: Date,
  ): Promise<{ cancelRequested: boolean }> {
    return translateDatabaseErrors(async () => {
      // Solo el worker escribe `placed`, así que leer el máximo y escribirlo no tiene carrera; la cancelación solo
      // toca `cancel_requested` y el estado, y se lee después de escribir.
      const current = await this.prisma.scheduleGeneration.findUnique({
        where: { id },
        select: { status: true, placed: true },
      });
      if (current?.status !== 'RUNNING') {
        // Ya no está `RUNNING` (la marcaron interrumpida o la cancelaron): el worker debe parar.
        return { cancelRequested: true };
      }
      await this.prisma.scheduleGeneration.updateMany({
        where: { id, status: 'RUNNING' },
        data: {
          placed: Math.max(current.placed, progress.placed),
          total: progress.total,
          phase: progress.phase,
          // Sin puntuación todavía no se toca la columna (nunca se borra una ya guardada).
          ...(progress.score === null
            ? {}
            : { score: progress.score as unknown as Prisma.InputJsonValue }),
          heartbeatAt: now,
        },
      });
      const after = await this.prisma.scheduleGeneration.findUnique({
        where: { id },
        select: { status: true, cancelRequested: true },
      });
      return { cancelRequested: after?.status !== 'RUNNING' || after.cancelRequested };
    });
  }

  async finish(id: string, result: FinishedGeneration, now: Date): Promise<void> {
    await translateDatabaseErrors(async () => {
      const common = {
        status: result.status,
        placed: result.placed,
        total: result.total,
        finishedAt: now,
      } as const;
      const data =
        result.status === 'FAILED'
          ? {
              ...common,
              errorCode: result.errorCode,
              errorMessage: result.errorMessage,
              ...(result.errorDetails === null
                ? {}
                : { errorDetails: result.errorDetails as unknown as Prisma.InputJsonValue }),
            }
          : common;
      // Solo desde `QUEUED` (el lanzamiento falló) o `RUNNING`: una generación ya terminada, interrumpida o cancelada
      // no se pisa.
      await this.prisma.scheduleGeneration.updateMany({
        where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
        data,
      });
    });
  }

  async failStuck(schoolId: string, olderThan: Date, now: Date): Promise<number> {
    return translateDatabaseErrors(async () => {
      const { count } = await this.prisma.scheduleGeneration.updateMany({
        where: {
          schoolId,
          OR: [
            { status: 'RUNNING', heartbeatAt: { lt: olderThan } },
            { status: 'QUEUED', createdAt: { lt: olderThan } },
          ],
        },
        data: {
          status: 'FAILED',
          errorCode: 'INTERNAL',
          errorMessage: INTERRUPTED_MESSAGE,
          finishedAt: now,
        },
      });
      return count;
    });
  }

  async findCurrent(schoolId: string): Promise<Generation | null> {
    return translateDatabaseErrors(async () => {
      const inProgress = await this.prisma.scheduleGeneration.findFirst({
        where: { schoolId, status: { in: ['QUEUED', 'RUNNING'] } },
      });
      const row =
        inProgress ??
        (await this.prisma.scheduleGeneration.findFirst({
          where: { schoolId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }));
      return row === null ? null : toGeneration(row);
    });
  }

  async findById(schoolId: string, id: string): Promise<Generation | null> {
    return translateDatabaseErrors(async () => {
      const row = await this.prisma.scheduleGeneration.findFirst({ where: { id, schoolId } });
      return row === null ? null : toGeneration(row);
    });
  }

  async requestCancel(schoolId: string, id: string, now: Date): Promise<CancelOutcome> {
    return translateDatabaseErrors(async () => {
      // Todavía en cola: el worker no la reclamará, así que pasa directamente a `CANCELLED`.
      const queued = await this.prisma.scheduleGeneration.updateMany({
        where: { id, schoolId, status: 'QUEUED' },
        data: { cancelRequested: true, status: 'CANCELLED', finishedAt: now },
      });
      // En marcha: el worker verá la marca en su próxima escritura de progreso.
      const requested =
        queued.count > 0
          ? queued
          : await this.prisma.scheduleGeneration.updateMany({
              where: { id, schoolId, status: 'RUNNING' },
              data: { cancelRequested: true },
            });
      const row = await this.prisma.scheduleGeneration.findFirst({ where: { id, schoolId } });
      if (row === null) {
        return { kind: 'notFound' };
      }
      return requested.count > 0
        ? { kind: 'requested', generation: toGeneration(row) }
        : { kind: 'notCancellable' };
    });
  }
}
