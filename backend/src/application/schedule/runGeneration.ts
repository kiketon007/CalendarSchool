import {
  PROGRESS_INTERVAL_MS,
  type Generation,
  type GenerationErrorCode,
  type GenerationErrorDetails,
} from '../../domain/schedule/generation.js';
import { generationInputOf } from '../../domain/schedule/generationInput.js';
import type { GenerationRepository } from '../../domain/schedule/generationRepository.js';
import { readinessOf } from '../../domain/schedule/readiness.js';
import type { ScheduleRepository } from '../../domain/schedule/scheduleRepository.js';
import type { ScheduleSolver } from '../../domain/schedule/scheduleSolver.js';
import type { SchedulingProblemRepository } from '../../domain/schedule/schedulingProblemRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { compareText } from '../courses/courseOrdering.js';
import type { IdGenerator } from '../registration/idGenerator.js';

export interface RunGenerationDependencies {
  generationRepository: Pick<GenerationRepository, 'claim' | 'saveProgress' | 'finish'>;
  scheduleRepository: Pick<ScheduleRepository, 'replaceDraft'>;
  schedulingProblemRepository: Pick<SchedulingProblemRepository, 'read'>;
  solver: ScheduleSolver;
  idGenerator: IdGenerator;
  logger: ApplicationLogger;
  now: () => Date;
  /** Tiempo máximo de la búsqueda, en segundos (`SCHEDULE_MAX_SECONDS`). */
  maxSeconds: number;
}

const NOT_READY_MESSAGE = 'El colegio ya no está listo para generar los horarios';
const INTERNAL_MESSAGE = 'Error interno durante la generación';
const TIMEOUT_MESSAGE =
  'Se agotó el tiempo de búsqueda, pero puede existir un horario: relaja alguna restricción (bloques, franjas prohibidas o disponibilidad) o inténtalo de nuevo';
const NO_FREE_CELLS_MESSAGE = 'La carga de una asignatura no cabe en las celdas libres de su curso';
const INFEASIBLE_MESSAGE =
  'No existe un horario que cumpla todas las restricciones; la restricción señalada es orientativa';

/**
 * Caso de uso: ejecuta una generación de horarios en segundo plano (US-ALGO-RUN); lo invoca el worker (la Lambda en
 * AWS, el lanzador en memoria en local y en los tests) con el id de una generación `QUEUED`.
 *
 * 1. **Reclama** la fila (`QUEUED → RUNNING`, condicional): si no lo consigue (un reintento de la Lambda, o cancelada
 *    antes de empezar) termina sin hacer nada.
 * 2. Lee la foto del problema **del colegio de la fila** y repite la comprobación previa: con bloqueantes, `FAILED`
 *    con `NOT_READY`.
 * 3. Construye la entrada, guarda el total y llama al motor con el límite de tiempo, el reloj, la cancelación y el
 *    progreso. El progreso y el latido se escriben como mucho cada 2 segundos, **al consultar la cancelación** (el
 *    motor lo hace con frecuencia aunque no avance), y esa misma escritura lee la marca de cancelación.
 * 4. Según el resultado: `solved` guarda el borrador en una transacción que además marca `COMPLETED`; `infeasible`,
 *    `timeout` y `cancelled` terminan sin tocar el borrador anterior; una excepción termina `FAILED/INTERNAL`.
 *
 * La traza de un error interno solo va al log; el mensaje guardado es genérico. Los eventos llevan identificadores y
 * cifras, nunca nombres de profesores, cursos ni asignaturas.
 */
export class RunGeneration {
  constructor(private readonly dependencies: RunGenerationDependencies) {}

  async execute(generationId: string): Promise<void> {
    const { generationRepository, now } = this.dependencies;

    const generation = await generationRepository.claim(generationId, now());
    if (generation === null) {
      return;
    }
    await this.run(generation);
  }

  private async run(generation: Generation): Promise<void> {
    const {
      generationRepository,
      scheduleRepository,
      schedulingProblemRepository,
      solver,
      idGenerator,
      logger,
      now,
      maxSeconds,
    } = this.dependencies;

    // Lo último que se sabe del progreso: es lo que se guarda si la generación termina sin horario.
    let placed = 0;
    let total = 0;

    const eventContext = () => ({
      school_id: generation.schoolId,
      actor_id: generation.createdById,
      generation_id: generation.id,
      placed,
      total,
      duration_ms: now().getTime() - (generation.startedAt ?? generation.createdAt).getTime(),
    });
    const failed = async (
      errorCode: GenerationErrorCode,
      errorMessage: string,
      errorDetails: GenerationErrorDetails | null,
      error?: unknown,
    ) => {
      await generationRepository.finish(
        generation.id,
        { status: 'FAILED', placed, total, errorCode, errorMessage, errorDetails },
        now(),
      );
      logger.warn(
        {
          event: 'SCHEDULE_GENERATION_FAILED',
          ...eventContext(),
          error_code: errorCode,
          ...(errorDetails === null ? {} : { reason: errorDetails.reason }),
          ...(error === undefined ? {} : { err: error }),
        },
        'Generación de horarios fallida',
      );
    };
    const cancelled = async () => {
      await generationRepository.finish(
        generation.id,
        { status: 'CANCELLED', placed, total },
        now(),
      );
      logger.info(
        { event: 'SCHEDULE_GENERATION_CANCELLED', ...eventContext(), error_code: null },
        'Generación de horarios cancelada',
      );
    };

    try {
      const problem = await schedulingProblemRepository.read(generation.schoolId);
      if (readinessOf(problem, compareText).blocking.length > 0) {
        await failed('NOT_READY', NOT_READY_MESSAGE, null);
        return;
      }

      const input = generationInputOf(problem, compareText);
      total = input.lessons.reduce((sum, lesson) => sum + lesson.sessions, 0);

      // La primera escritura fija el total y ya lee si se canceló mientras esperaba.
      let cancelRequested = (
        await generationRepository.saveProgress(generation.id, { placed, total }, now())
      ).cancelRequested;
      if (cancelRequested) {
        await cancelled();
        return;
      }

      let lastSaveAt = now().getTime();
      let saving = false;
      const saveIfDue = () => {
        const current = now();
        if (saving || current.getTime() - lastSaveAt < PROGRESS_INTERVAL_MS) {
          return;
        }
        saving = true;
        lastSaveAt = current.getTime();
        // Un fallo al guardar el progreso no detiene la búsqueda: el guardado final informará si la base falla.
        void generationRepository
          .saveProgress(generation.id, { placed, total }, current)
          .then(
            (result) => {
              cancelRequested = cancelRequested || result.cancelRequested;
            },
            () => undefined,
          )
          .finally(() => {
            saving = false;
          });
      };

      const outcome = await solver.solve(input, {
        limitMs: maxSeconds * 1000,
        now: () => now().getTime(),
        isCancelled: () => {
          saveIfDue();
          return cancelRequested;
        },
        onProgress: (placedSessions) => {
          placed = Math.max(placed, placedSessions);
        },
      });

      switch (outcome.status) {
        case 'solved': {
          placed = outcome.entries.length;
          await scheduleRepository.replaceDraft(
            {
              id: idGenerator.generate(),
              schoolId: generation.schoolId,
              generationId: generation.id,
              createdById: generation.createdById,
              placedSessions: outcome.entries.length,
              total,
              entries: outcome.entries.map((entry) => ({ ...entry, id: idGenerator.generate() })),
            },
            now(),
          );
          logger.info(
            { event: 'SCHEDULE_GENERATION_COMPLETED', ...eventContext(), error_code: null },
            'Generación de horarios completada',
          );
          return;
        }
        case 'infeasible': {
          const { reason, course, schoolClass, subject, professor } = outcome.cause;
          await failed(
            'INFEASIBLE',
            reason === 'NO_FREE_CELLS' ? NO_FREE_CELLS_MESSAGE : INFEASIBLE_MESSAGE,
            { reason, lesson: { course, class: schoolClass, subject, professor } },
          );
          return;
        }
        case 'timeout': {
          placed = Math.max(placed, outcome.placed);
          total = outcome.total;
          await failed('TIMEOUT', TIMEOUT_MESSAGE, null);
          return;
        }
        case 'cancelled': {
          await cancelled();
          return;
        }
      }
    } catch (error) {
      await failed('INTERNAL', INTERNAL_MESSAGE, null, error);
    }
  }
}
