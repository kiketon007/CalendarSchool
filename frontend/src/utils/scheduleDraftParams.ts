import type { ScheduleDetail } from '../services/scheduleDraftService';

/** Las tres vistas del borrador, tal como se escriben en `vista`. */
export const DRAFT_VIEWS = ['clase', 'profesor', 'colegio'] as const;
export type DraftViewName = (typeof DRAFT_VIEWS)[number];

/**
 * Lo elegido en la página del horario borrador (US-ALGO-VIEW): la vista, la clase, el profesor y el día. `classId` y
 * `professorId` son `null` solo si el borrador no tiene ninguno.
 */
export interface DraftSelection {
  view: DraftViewName;
  classId: string | null;
  professorId: string | null;
  day: number;
}

/** La primera clase del primer curso que tiene alguna (los cursos y las clases ya vienen ordenados). */
function firstClassId(draft: ScheduleDetail): string | null {
  for (const course of draft.courses) {
    const first = course.classes[0];
    if (first !== undefined) {
      return first.id;
    }
  }
  return null;
}

/** Los valores por defecto de un borrador. */
function defaultsOf(draft: ScheduleDetail): DraftSelection {
  return {
    view: 'clase',
    classId: firstClassId(draft),
    professorId: draft.professors[0]?.id ?? null,
    day: 1,
  };
}

function dayOf(value: string | null): number | null {
  return value !== null && /^[1-5]$/u.test(value) ? Number(value) : null;
}

/**
 * Lee la selección de la dirección y la valida contra el borrador cargado: una vista desconocida, una clase o un
 * profesor que no están, o un día que no es de 1 a 5 se ignoran, sin error, y se usa el valor por defecto.
 */
export function selectionFromParams(
  params: URLSearchParams,
  draft: ScheduleDetail,
): DraftSelection {
  const defaults = defaultsOf(draft);
  const view = params.get('vista');
  const classId = params.get('clase');
  const professorId = params.get('profesor');
  return {
    view: DRAFT_VIEWS.find((name) => name === view) ?? defaults.view,
    classId: draft.courses.some(({ classes }) => classes.some(({ id }) => id === classId))
      ? classId
      : defaults.classId,
    professorId: draft.professors.some(({ id }) => id === professorId)
      ? professorId
      : defaults.professorId,
    day: dayOf(params.get('dia')) ?? defaults.day,
  };
}

/**
 * Escribe la selección en la dirección: solo la vista y el dato de esa vista, y solo si no es el de por defecto.
 * Solo lleva ids y números, nunca nombres.
 */
export function paramsFromSelection(
  selection: DraftSelection,
  draft: ScheduleDetail,
): URLSearchParams {
  const defaults = defaultsOf(draft);
  const params = new URLSearchParams();
  if (selection.view !== defaults.view) {
    params.set('vista', selection.view);
  }
  if (
    selection.view === 'clase' &&
    selection.classId !== null &&
    selection.classId !== defaults.classId
  ) {
    params.set('clase', selection.classId);
  }
  if (
    selection.view === 'profesor' &&
    selection.professorId !== null &&
    selection.professorId !== defaults.professorId
  ) {
    params.set('profesor', selection.professorId);
  }
  if (selection.view === 'colegio' && selection.day !== defaults.day) {
    params.set('dia', String(selection.day));
  }
  return params;
}
