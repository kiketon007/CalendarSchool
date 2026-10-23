import type {
  NewStudent,
  Student,
  StudentChanges,
  StudentSummary,
  StudentUpdate,
} from './student.js';

/**
 * Puerto de los alumnos. Todo método recibe el colegio, que sale siempre de la identidad de la petición:
 * un curso, una clase o un alumno de otro colegio no existe para quien llama.
 */
export interface StudentRepository {
  /**
   * Crea el alumno en una única transacción y lo devuelve con su curso y su clase. Comprueba dentro de la
   * transacción, con la fila del curso bloqueada en modo compartido, que el curso es del colegio y que la
   * clase, si se indica, es de ese curso: un borrado o una edición simultáneos del curso esperan y no
   * pueden dejar al alumno con un curso o una clase inexistentes. Lanza `CourseNotFound` o `ClassNotFound`
   * (sin crear nada).
   */
  create(
    schoolId: string,
    student: NewStudent,
    courseId: string,
    classId: string | null,
  ): Promise<Student>;

  /**
   * Alumno del colegio con todos sus datos (los sensibles incluidos), o `null` si es de otro colegio o no
   * existe: no se distingue el caso.
   */
  findById(schoolId: string, studentId: string): Promise<Student | null>;

  /**
   * Guarda el estado final del alumno en una única transacción y devuelve cómo estaba y cómo quedó, o
   * `null` si el alumno es de otro colegio o no existe (no se cambia nada). Bloquea el curso elegido en
   * modo compartido y después al alumno (el mismo orden que el borrado del curso, para no formar un
   * ciclo) y comprueba que el curso es del colegio y que la clase, si se indica, es de ese curso. Lanza
   * `CourseNotFound` o `ClassNotFound` sin cambiar nada.
   */
  update(
    schoolId: string,
    studentId: string,
    changes: StudentChanges,
    courseId: string,
    classId: string | null,
  ): Promise<StudentUpdate | null>;

  /**
   * Borra de verdad al alumno del colegio en una única transacción y devuelve `true`, o `false` si el
   * alumno es de otro colegio, no existe o ya se borró (no se borra nada). Bloquea solo la fila del
   * alumno (no su curso): una edición o un segundo borrado simultáneos esperan y no la encuentran si el
   * borrado confirma primero, y no puede formar un ciclo con el borrado o la edición del curso. No lee
   * los datos sensibles del alumno ni toca su curso, su clase ni a otros alumnos.
   */
  delete(schoolId: string, studentId: string): Promise<boolean>;

  /** Alumnos del colegio sin datos sensibles, sin ordenar (el orden lo decide la aplicación). */
  listBySchool(schoolId: string): Promise<StudentSummary[]>;
}
