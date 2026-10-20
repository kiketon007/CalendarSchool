import { CourseChanged } from './courseErrors.js';
import type { NewClass } from './courseRepository.js';

/** Clase guardada del curso, tal como está en la base de datos. */
export interface CurrentClass {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
}

/** Estado guardado del curso que se edita. */
export interface CurrentCourse {
  readonly name: string;
  readonly normalizedName: string;
  readonly classes: readonly CurrentClass[];
}

/**
 * Clase del estado final pedido, con los nombres ya limpios. `existing` indica si el cliente la envió con
 * `id` (una clase que ya tiene el curso) o sin él (nueva, con un `id` que generó la aplicación).
 */
export interface RequestedClass {
  readonly id: string;
  readonly existing: boolean;
  readonly name: string;
  readonly normalizedName: string;
}

/** Estado final pedido del curso, ya validado, con las clases en el orden recibido. */
export interface RequestedCourse {
  readonly name: string;
  readonly normalizedName: string;
  readonly classes: readonly RequestedClass[];
}

/** Clase que conserva su `id` y cambia de nombre. */
export interface RenamedClass {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  /**
   * Si cambia el nombre normalizado. Solo entonces puede chocar con el índice único durante la edición;
   * un cambio de mayúsculas o de espacios deja el nombre normalizado igual.
   */
  readonly normalizedNameChanged: boolean;
}

/** Lo que hay que escribir para llevar el curso guardado al estado pedido. */
export interface CourseUpdatePlan {
  /** Cambia el nombre del curso (también si solo cambian las mayúsculas). */
  readonly courseRenamed: boolean;
  /** Identificadores de las clases guardadas que ya no se piden. */
  readonly removed: readonly string[];
  readonly renamed: readonly RenamedClass[];
  readonly created: readonly NewClass[];
}

/**
 * Calcula la diferencia entre el curso guardado y el estado final pedido. Una clase con `id` conserva su
 * identidad y, si cambia de nombre, se renombra; una clase sin `id` se crea; una clase guardada que no se
 * pide se borra. Lanza `CourseChanged` si se pide una clase con `id` que el curso no tiene (la borró otra
 * persona o es de otro curso). Es una función pura: la ejecuta el repositorio con el curso bloqueado, para
 * que `current` sea el estado real al escribir.
 */
export function planCourseUpdate(
  current: CurrentCourse,
  requested: RequestedCourse,
): CourseUpdatePlan {
  const saved = new Map(current.classes.map((schoolClass) => [schoolClass.id, schoolClass]));
  const kept = new Set<string>();
  const renamed: RenamedClass[] = [];
  const created: NewClass[] = [];

  for (const schoolClass of requested.classes) {
    if (!schoolClass.existing) {
      created.push({
        id: schoolClass.id,
        name: schoolClass.name,
        normalizedName: schoolClass.normalizedName,
      });
      continue;
    }
    const before = saved.get(schoolClass.id);
    if (before === undefined) {
      throw new CourseChanged();
    }
    kept.add(before.id);
    if (before.name !== schoolClass.name) {
      renamed.push({
        id: schoolClass.id,
        name: schoolClass.name,
        normalizedName: schoolClass.normalizedName,
        normalizedNameChanged: before.normalizedName !== schoolClass.normalizedName,
      });
    }
  }

  return {
    courseRenamed: current.name !== requested.name,
    removed: current.classes.filter(({ id }) => !kept.has(id)).map(({ id }) => id),
    renamed,
    created,
  };
}

/** Indica si el plan no cambia nada: entonces no se escribe ni se registra ningún evento. */
export function isEmptyPlan(plan: CourseUpdatePlan): boolean {
  return (
    !plan.courseRenamed &&
    plan.removed.length === 0 &&
    plan.renamed.length === 0 &&
    plan.created.length === 0
  );
}
