import { CourseChanged, ProfessorAlreadyTutor, TutorNotFound } from './courseErrors.js';
import type { NewClass } from './courseRepository.js';

/** Clase guardada del curso, tal como está en la base de datos. */
export interface CurrentClass {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  /** Profesor que la tutoriza, o `null` si no tiene. */
  readonly tutorId: string | null;
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
  /**
   * Tutor pedido: omitido (`undefined`), el tutor de la clase no cambia; `null`, se quita; un UUID, ese
   * profesor pasa a ser su tutor.
   */
  readonly tutorId?: string | null;
}

/**
 * Un profesor del colegio al que se pide como tutor y la clase que tutoriza ahora (`null` si ninguna). Lo
 * lee el repositorio dentro de la transacción; si la clase no es de este curso, la tutoría es de otro curso.
 */
export interface RequestedTutor {
  readonly id: string;
  readonly tutoredClassId: string | null;
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
  /** Clases cuyo tutor cambia: `tutorId` es el nuevo, o `null` para dejarlas sin tutor. */
  readonly tutorsChanged: readonly { readonly classId: string; readonly tutorId: string | null }[];
}

const NO_TUTORS: ReadonlyMap<string, RequestedTutor> = new Map();

/**
 * Calcula la diferencia entre el curso guardado y el estado final pedido. Una clase con `id` conserva su
 * identidad y, si cambia de nombre, se renombra; una clase sin `id` se crea; una clase guardada que no se
 * pide se borra. Lanza `CourseChanged` si se pide una clase con `id` que el curso no tiene (la borró otra
 * persona o es de otro curso).
 *
 * Los tutores (US09_b): una clase con `tutorId` distinto del guardado es un cambio de tutor (`null` lo
 * quita). `tutors` son los profesores pedidos que existen en el colegio: lanza `TutorNotFound` (con la
 * posición de la clase) si uno no está, y `ProfessorAlreadyTutor` si el profesor tutoriza una clase de otro
 * curso, o una de este que esta misma petición no libera (la quita, o le pide otro tutor o `null`). Así
 * mover un profesor entre clases del curso o intercambiar dos tutores es válido en una sola petición.
 *
 * Es una función pura: la ejecuta el repositorio con el curso bloqueado, para que `current` sea el estado
 * real al escribir.
 */
export function planCourseUpdate(
  current: CurrentCourse,
  requested: RequestedCourse,
  tutors: ReadonlyMap<string, RequestedTutor> = NO_TUTORS,
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
    tutorsChanged: planTutors(saved, kept, requested, tutors),
  };
}

/** Los cambios de tutor del estado pedido, comprobando que cada profesor asignado se puede asignar. */
function planTutors(
  saved: ReadonlyMap<string, CurrentClass>,
  kept: ReadonlySet<string>,
  requested: RequestedCourse,
  tutors: ReadonlyMap<string, RequestedTutor>,
): CourseUpdatePlan['tutorsChanged'] {
  const requestedById = new Map(
    requested.classes.map((schoolClass) => [schoolClass.id, schoolClass]),
  );
  const changed: { classId: string; tutorId: string | null }[] = [];

  for (const [index, schoolClass] of requested.classes.entries()) {
    const wanted = schoolClass.tutorId;
    if (wanted === undefined) {
      continue;
    }
    const savedTutor = saved.get(schoolClass.id)?.tutorId ?? null;
    if (wanted === savedTutor) {
      continue;
    }
    changed.push({ classId: schoolClass.id, tutorId: wanted });
    if (wanted === null) {
      continue;
    }

    const professor = tutors.get(wanted);
    if (professor === undefined) {
      throw new TutorNotFound(index);
    }
    if (professor.tutoredClassId === null) {
      continue;
    }
    // Ya tutoriza una clase: solo vale si es de este curso y esta petición la libera.
    const owned = saved.get(professor.tutoredClassId);
    const stillWanted = requestedById.get(professor.tutoredClassId)?.tutorId;
    const released =
      owned !== undefined &&
      (!kept.has(owned.id) || (stillWanted !== undefined && stillWanted !== professor.id));
    if (!released) {
      throw new ProfessorAlreadyTutor();
    }
  }
  return changed;
}

/** Indica si el plan no cambia nada: entonces no se escribe ni se registra ningún evento. */
export function isEmptyPlan(plan: CourseUpdatePlan): boolean {
  return (
    !plan.courseRenamed &&
    plan.removed.length === 0 &&
    plan.renamed.length === 0 &&
    plan.created.length === 0 &&
    plan.tutorsChanged.length === 0
  );
}
