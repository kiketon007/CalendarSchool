import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { SUBJECT_COLORS, SUBJECT_STATUSES } from '../utils/subjectOptions';
import { isWorkloadWarning } from './courseWorkloadService';
import { isRecord, readJson } from './httpResponse';

export type SchedulingConstraint = components['schemas']['SchedulingConstraint'];
export type ConstraintType = components['schemas']['ConstraintType'];

/** Los tipos de regla en el orden del listado. Deben coincidir con `ConstraintType` del contrato. */
export const CONSTRAINT_TYPES = [
  'MAX_PER_DAY',
  'BLOCK',
  'FORBIDDEN_SLOTS',
  'PREFERRED_SLOTS',
] as const satisfies readonly ConstraintType[];

/** Resultado de pedir el listado de reglas, ya interpretado: la interfaz decide según el estado. */
export type ConstraintsOutcome =
  | { status: 'loaded'; constraints: SchedulingConstraint[] }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isTextOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** `true` si `value` es un entero de `[min, max]`. */
function isIntegerIn(value: unknown, min: number, max: number): boolean {
  return isCount(value) && value >= min && value <= max;
}

function isSubject(value: unknown): value is SchedulingConstraint['subject'] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isTextOrNull(value.code) &&
    typeof value.color === 'string' &&
    (SUBJECT_COLORS as readonly string[]).includes(value.color) &&
    typeof value.status === 'string' &&
    (SUBJECT_STATUSES as readonly string[]).includes(value.status)
  );
}

/** Cada regla lleva solo el valor de su tipo y `null` en los otros dos. */
function hasOnlyItsOwnValue(rule: Record<string, unknown>): boolean {
  const { type, maxPerDay, blockSize, slotCount } = rule;
  switch (type) {
    case 'MAX_PER_DAY':
      return isIntegerIn(maxPerDay, 2, 5) && blockSize === null && slotCount === null;
    case 'BLOCK':
      return maxPerDay === null && isIntegerIn(blockSize, 2, 3) && slotCount === null;
    case 'FORBIDDEN_SLOTS':
    case 'PREFERRED_SLOTS':
      return maxPerDay === null && blockSize === null && isCount(slotCount);
    default:
      return false;
  }
}

function isConstraint(value: unknown): value is SchedulingConstraint {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isRecord(value.course) &&
    typeof value.course.id === 'string' &&
    typeof value.course.name === 'string' &&
    isSubject(value.subject) &&
    hasOnlyItsOwnValue(value) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isWorkloadWarning)
  );
}

async function interpretList(response: Response): Promise<ConstraintsOutcome> {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status !== 200) {
    return { status: 'unavailable' };
  }
  const body = await readJson(response);
  const constraints = isRecord(body) && isRecord(body.data) ? body.data.constraints : undefined;
  return Array.isArray(constraints) && constraints.every(isConstraint)
    ? { status: 'loaded', constraints }
    : { status: 'unavailable' };
}

export const constraintsService = {
  /** Lista las reglas de reparto del colegio con `GET /api/constraints`. Nunca rechaza. */
  async list(authorizedFetch: AuthorizedFetch): Promise<ConstraintsOutcome> {
    try {
      return await interpretList(await authorizedFetch('/api/constraints'));
    } catch {
      return { status: 'unavailable' };
    }
  },
};
