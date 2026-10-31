import {
  CONSTRAINT_TYPES,
  type ConstraintListSnapshot,
  type ConstraintPair,
  type ConstraintType,
  type ListedConstraint,
  type StoredConstraint,
} from '../../domain/constraints/constraintList.js';
import {
  preferredSlotsWarnings,
  subjectWarnings,
  type SlotCell,
  type WorkloadWarning,
} from '../../domain/workload/workloadWarnings.js';
import { byName } from '../courses/courseOrdering.js';

/** Las celdas de una regla de franjas divididas entre las que existen en el calendario y las que ya no. */
function splitCells(rule: StoredConstraint | undefined, sessionsPerDay: number) {
  const stored = rule?.slots ?? [];
  const inside: SlotCell[] = stored.filter(({ sessionNumber }) => sessionNumber <= sessionsPerDay);
  return { inside, outsideCount: stored.length - inside.length };
}

/** Los avisos de cada regla de una pareja, por tipo. */
function warningsOfPair(pair: ConstraintPair): Map<ConstraintType, WorkloadWarning[]> {
  const ruleOf = (type: ConstraintType) => pair.rules.find((rule) => rule.type === type);
  const rules = {
    sessionsPerWeek: pair.sessionsPerWeek,
    maxPerDay: ruleOf('MAX_PER_DAY')?.maxPerDay ?? null,
    blockSize: ruleOf('BLOCK')?.blockSize ?? null,
  };
  const byType = new Map<ConstraintType, WorkloadWarning[]>();

  if (pair.calendar === null) {
    // Sin calendario no hay con qué comparar: solo se puede decir que el bloque es mayor que la carga.
    const [blockLarger] = subjectWarnings(rules, null);
    const unchecked: WorkloadWarning = { code: 'COURSE_WITHOUT_CALENDAR' };
    for (const type of CONSTRAINT_TYPES) {
      byType.set(
        type,
        type === 'BLOCK' && blockLarger !== undefined ? [blockLarger, unchecked] : [unchecked],
      );
    }
    return byType;
  }

  const sessionsPerDay = pair.calendar.sessionGroups.reduce((total, size) => total + size, 0);
  const forbidden = splitCells(ruleOf('FORBIDDEN_SLOTS'), sessionsPerDay);
  const preferred = splitCells(ruleOf('PREFERRED_SLOTS'), sessionsPerDay);
  // `outsideCount: 0`: el recuento de celdas fuera es de cada cuadrícula, no de la asignatura.
  const ofPair = subjectWarnings(rules, pair.calendar, {
    cells: forbidden.inside,
    outsideCount: 0,
  });
  const doesNotFit = ofPair.filter(({ code }) => code === 'SUBJECT_DOES_NOT_FIT');
  const outside = (count: number): WorkloadWarning[] =>
    count > 0 ? [{ code: 'SLOTS_OUTSIDE_CALENDAR', count }] : [];

  byType.set('MAX_PER_DAY', doesNotFit);
  byType.set('BLOCK', ofPair);
  byType.set('FORBIDDEN_SLOTS', [...doesNotFit, ...outside(forbidden.outsideCount)]);
  byType.set('PREFERRED_SLOTS', [
    ...outside(preferred.outsideCount),
    ...preferredSlotsWarnings(preferred.inside, forbidden.inside),
  ]);
  return byType;
}

/**
 * Completa lo que leyó el repositorio con lo que muestra el listado de reglas (US20): una entrada por regla,
 * con su valor (el de su tipo y `null` en los otros dos), el número de celdas que existen en el calendario
 * actual y **sus** avisos, y ordenadas por curso, asignatura (`compareText`) y tipo.
 *
 * Los avisos salen de las mismas funciones puras que la carga del curso (`subjectWarnings` y
 * `preferredSlotsWarnings`), repartidos por la regla a la que afectan, para que el listado y la carga no se
 * contradigan: «no cabe» en las reglas obligatorias, «bloque mayor que la carga» en los bloques, las celdas
 * fuera del calendario en cada cuadrícula con su recuento, la contradicción en las preferidas y, sin
 * calendario, «no se puede comprobar» en todas. No modifica el original.
 */
export function buildConstraintList(snapshot: ConstraintListSnapshot): ListedConstraint[] {
  const typeOrder = (type: ConstraintType) => CONSTRAINT_TYPES.indexOf(type);
  return [...snapshot]
    .sort((a, b) => byName(a.course, b.course) || byName(a.subject, b.subject))
    .flatMap((pair) => {
      const warnings = warningsOfPair(pair);
      const sessionsPerDay =
        pair.calendar?.sessionGroups.reduce((total, size) => total + size, 0) ?? 0;
      return [...pair.rules]
        .sort((a, b) => typeOrder(a.type) - typeOrder(b.type))
        .map((rule): ListedConstraint => {
          const isSlots = rule.type === 'FORBIDDEN_SLOTS' || rule.type === 'PREFERRED_SLOTS';
          return {
            id: rule.id,
            type: rule.type,
            course: pair.course,
            subject: pair.subject,
            maxPerDay: rule.maxPerDay,
            blockSize: rule.blockSize,
            slotCount: isSlots ? splitCells(rule, sessionsPerDay).inside.length : null,
            warnings: warnings.get(rule.type) ?? [],
          };
        });
    });
}
