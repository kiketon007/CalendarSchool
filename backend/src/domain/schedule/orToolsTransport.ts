import type { GenerationInput, Placement } from './scheduleSolver.js';

/** La versión del contrato JSON con el motor de Python (`solver-ortools/README.md`). */
export const ORTOOLS_PROTOCOL_VERSION = 1;

/** La petición al motor de OR-Tools. Solo lleva ids y números: ni nombres ni franjas preferidas. */
export interface OrToolsRequest {
  readonly version: typeof ORTOOLS_PROTOCOL_VERSION;
  readonly limitSeconds: number;
  readonly courses: readonly {
    readonly id: string;
    readonly cells: readonly {
      readonly sessionNumber: number;
      readonly startMinute: number;
      readonly endMinute: number;
    }[];
  }[];
  readonly lessons: readonly {
    readonly index: number;
    readonly courseId: string;
    readonly classId: string;
    readonly professorId: string;
    readonly maxPerDay: number;
    readonly blockSize: number | null;
  }[];
  readonly units: readonly {
    readonly index: number;
    readonly lessonIndex: number;
    readonly size: number;
    readonly placements: readonly Placement[];
  }[];
}

/** Un emplazamiento elegido para una unidad. */
export interface OrToolsPlacement extends Placement {
  readonly unitIndex: number;
}

/** La respuesta del motor de OR-Tools. */
export type OrToolsResponse =
  | {
      readonly version: typeof ORTOOLS_PROTOCOL_VERSION;
      readonly status: 'solved';
      readonly placements: readonly OrToolsPlacement[];
    }
  | {
      readonly version: typeof ORTOOLS_PROTOCOL_VERSION;
      readonly status: 'infeasible' | 'timeout' | 'cancelled';
    };

/**
 * Cómo llega la petición al motor de Python: un proceso hijo en local y en CI, y una Lambda en AWS. Devuelve la
 * respuesta tal como llegó (JSON ya leído, sin fiarse de ella: `isOrToolsResponse` la comprueba) y se rechaza si el
 * motor falla. Con la señal abortada MUST dejar de esperar y rechazar.
 */
export interface OrToolsTransport {
  solve(request: OrToolsRequest, signal: AbortSignal): Promise<unknown>;
}

/** La entrada del motor de restricciones convertida en la petición: sin nombres y sin preferencias. */
export function toOrToolsRequest(input: GenerationInput, limitSeconds: number): OrToolsRequest {
  return {
    version: ORTOOLS_PROTOCOL_VERSION,
    limitSeconds,
    courses: input.courses.map(({ id, cells }) => ({
      id,
      cells: cells.map(({ sessionNumber, startMinute, endMinute }) => ({
        sessionNumber,
        startMinute,
        endMinute,
      })),
    })),
    lessons: input.lessons.map(
      ({ index, courseId, classId, professorId, maxPerDay, blockSize }) => ({
        index,
        courseId,
        classId,
        professorId,
        maxPerDay,
        blockSize,
      }),
    ),
    units: input.units.map(({ index, lessonIndex, size, placements }) => ({
      index,
      lessonIndex,
      size,
      placements: placements.map(({ dayOfWeek, firstSession }) => ({ dayOfWeek, firstSession })),
    })),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * La guarda de tipo de la respuesta: la versión, uno de los cuatro estados y, en `solved`, un emplazamiento por
 * unidad —ni más, ni repetido, ni de una unidad que no existe— que además sea uno de los de su dominio, porque
 * HC4 y HC8 dependen de él. Lo que no cumpla se trata como una respuesta con otra forma.
 */
export function isOrToolsResponse(
  value: unknown,
  input: GenerationInput,
): value is OrToolsResponse {
  if (!isRecord(value) || value['version'] !== ORTOOLS_PROTOCOL_VERSION) {
    return false;
  }
  const status = value['status'];
  if (status === 'infeasible' || status === 'timeout' || status === 'cancelled') {
    return true;
  }
  const placements = value['placements'];
  if (
    status !== 'solved' ||
    !Array.isArray(placements) ||
    placements.length !== input.units.length
  ) {
    return false;
  }
  const seen = new Set<number>();
  for (const placement of placements as unknown[]) {
    if (!isRecord(placement)) {
      return false;
    }
    const { unitIndex, dayOfWeek, firstSession } = placement;
    if (
      !Number.isInteger(unitIndex) ||
      !Number.isInteger(dayOfWeek) ||
      !Number.isInteger(firstSession)
    ) {
      return false;
    }
    const unit = input.units[unitIndex as number];
    if (unit === undefined || seen.has(unitIndex as number)) {
      return false;
    }
    seen.add(unitIndex as number);
    if (
      !unit.placements.some(
        (allowed) => allowed.dayOfWeek === dayOfWeek && allowed.firstSession === firstSession,
      )
    ) {
      return false;
    }
  }
  return true;
}
