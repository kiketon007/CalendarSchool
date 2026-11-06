import { STUCK_AFTER_MS } from '../../domain/schedule/generation.js';
import { GenerationInProgress, ScheduleNotReady } from '../../domain/schedule/generationErrors.js';
import type { GenerationLauncher } from '../../domain/schedule/generationLauncher.js';
import type { GenerationRepository } from '../../domain/schedule/generationRepository.js';
import { readinessOf } from '../../domain/schedule/readiness.js';
import type { SchedulingProblemRepository } from '../../domain/schedule/schedulingProblemRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { compareText } from '../courses/courseOrdering.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import { toGenerationView, type GenerationView } from './generationView.js';

export interface StartGenerationDependencies {
  schedulingProblemRepository: Pick<SchedulingProblemRepository, 'read'>;
  generationRepository: Pick<GenerationRepository, 'failStuck' | 'insert' | 'finish'>;
  launcher: GenerationLauncher;
  idGenerator: IdGenerator;
  logger: ApplicationLogger;
  now: () => Date;
}

export interface StartGenerationInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Administrador que inicia la generación, de la identidad de la petición. */
  actorId: string;
  /** Si, tras encontrar un horario válido, se mejora con las preferencias (`true` por defecto). */
  improve?: boolean;
}

/**
 * Caso de uso: inicia en segundo plano la generación de los horarios del colegio (US-ALGO-RUN). Comprueba que no hay
 * bloqueantes (`ScheduleNotReady`, sin crear nada), marca como interrumpidas las generaciones atascadas del colegio
 * para que una interrumpida no lo bloquee para siempre, inserta la generación `QUEUED` (la base rechaza una segunda
 * en curso con `GenerationInProgress`) y la lanza sin esperarla. Si el lanzamiento falla, la deja `FAILED` con
 * `INTERNAL` para que no quede ninguna en cola y relanza el error. Registra `SCHEDULE_GENERATION_STARTED`, o
 * `SCHEDULE_GENERATION_REJECTED` o `SCHEDULE_GENERATION_FAILED`, solo con identificadores: ningún nombre va al log.
 */
export class StartGeneration {
  constructor(private readonly dependencies: StartGenerationDependencies) {}

  async execute({
    schoolId,
    actorId,
    improve = true,
  }: StartGenerationInput): Promise<GenerationView> {
    const {
      schedulingProblemRepository,
      generationRepository,
      launcher,
      idGenerator,
      logger,
      now,
    } = this.dependencies;

    const problem = await schedulingProblemRepository.read(schoolId);
    if (readinessOf(problem, compareText).blocking.length > 0) {
      logger.warn(
        {
          event: 'SCHEDULE_GENERATION_REJECTED',
          school_id: schoolId,
          actor_id: actorId,
          reason: 'not_ready',
        },
        'Generación rechazada: el colegio tiene problemas que impiden generar',
      );
      throw new ScheduleNotReady();
    }

    const startedAt = now();
    await generationRepository.failStuck(
      schoolId,
      new Date(startedAt.getTime() - STUCK_AFTER_MS),
      startedAt,
    );

    let generation;
    try {
      generation = await generationRepository.insert({
        id: idGenerator.generate(),
        schoolId,
        createdById: actorId,
        improve,
        now: startedAt,
      });
    } catch (error) {
      if (error instanceof GenerationInProgress) {
        logger.warn(
          {
            event: 'SCHEDULE_GENERATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'in_progress',
          },
          'Generación rechazada: el colegio ya tiene una en curso',
        );
      }
      throw error;
    }

    try {
      await launcher.launch(generation.id);
    } catch (error) {
      await generationRepository.finish(
        generation.id,
        {
          status: 'FAILED',
          placed: 0,
          total: 0,
          errorCode: 'INTERNAL',
          errorMessage: 'No se pudo lanzar la generación',
          errorDetails: null,
        },
        now(),
      );
      logger.warn(
        {
          event: 'SCHEDULE_GENERATION_FAILED',
          school_id: schoolId,
          actor_id: actorId,
          generation_id: generation.id,
          error_code: 'INTERNAL',
          err: error,
        },
        'No se pudo lanzar la generación de horarios',
      );
      throw error;
    }

    logger.info(
      {
        event: 'SCHEDULE_GENERATION_STARTED',
        school_id: schoolId,
        actor_id: actorId,
        generation_id: generation.id,
        improve,
      },
      'Generación de horarios iniciada',
    );
    return toGenerationView(generation);
  }
}
