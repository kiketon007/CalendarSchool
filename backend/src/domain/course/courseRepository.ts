import type { Course } from './course.js';
import type { CourseImpact } from './courseImpact.js';
import type { CourseUpdatePlan, CurrentCourse, RequestedCourse } from './courseUpdate.js';

/** Clase nueva: el nombre limpio para mostrar y el normalizado para comparar. */
export interface NewClass {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
}

/** Curso nuevo con todas sus clases, en el orden en que se recibieron. */
export interface NewCourse {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly classes: readonly NewClass[];
}

/**
 * Puerto de los cursos. Todo método recibe el colegio, que sale siempre de la identidad de la petición:
 * un curso de otro colegio no existe para quien llama.
 */
export interface CourseRepository {
  /**
   * Crea el curso y todas sus clases en una única transacción: o se crea todo o no se crea nada.
   * Lanza `CourseAlreadyExists` si el colegio ya tiene un curso con el mismo nombre normalizado.
   */
  create(schoolId: string, course: NewCourse): Promise<Course>;

  /** Cursos del colegio con sus clases, sin ordenar (el orden lo decide la aplicación). */
  listBySchool(schoolId: string): Promise<Course[]>;

  /**
   * Un curso del colegio con sus clases, sin ordenar, o `null` si no existe en él (también si es de otro
   * colegio).
   */
  findById(schoolId: string, courseId: string): Promise<Course | null>;

  /**
   * Deja el curso en el estado `requested` en una única transacción, con la fila del curso bloqueada para
   * que las ediciones del mismo curso vayan de una en una. Lee el curso guardado, calcula con `plan` lo
   * que hay que escribir (que lanza `CourseChanged` si se pide una clase que el curso ya no tiene) y lo
   * escribe sin romper el índice único de las clases: primero borra, luego renombra en dos fases y por
   * último crea. Si el plan está vacío no escribe nada. Devuelve el curso resultante (sin ordenar) y el
   * plan aplicado. Lanza `CourseNotFound` si el curso no está en el colegio, `CourseChanged` desde `plan`
   * y `CourseAlreadyExists` si otro curso del colegio ya tiene el nombre normalizado; en cualquier fallo
   * no queda ningún cambio.
   */
  update(
    schoolId: string,
    courseId: string,
    requested: RequestedCourse,
    plan: (current: CurrentCourse) => CourseUpdatePlan,
  ): Promise<UpdatedCourse>;

  /**
   * Lo que se perdería al borrar el curso (sus clases y los alumnos asignados), o `null` si no existe en
   * el colegio (también si es de otro colegio). No cambia nada.
   */
  impactOf(schoolId: string, courseId: string): Promise<CourseImpact | null>;

  /**
   * Borra el curso y todas sus clases en una única transacción, con la fila del curso bloqueada para que
   * no se cruce con una edición o con otro borrado del mismo curso. Devuelve lo que se borró de verdad,
   * contado dentro de esa transacción, o `null` si el curso no existe en el colegio (también si ya lo
   * borró otra persona). Si falla cualquier escritura no se borra nada.
   */
  delete(schoolId: string, courseId: string): Promise<CourseImpact | null>;
}

/** Resultado de una edición: el curso final y lo que se escribió para llegar a él. */
export interface UpdatedCourse {
  readonly course: Course;
  readonly plan: CourseUpdatePlan;
}
