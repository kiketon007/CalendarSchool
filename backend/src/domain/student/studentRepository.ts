import type { NewStudent, Student, StudentSummary } from './student.js';

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

  /** Alumnos del colegio sin datos sensibles, sin ordenar (el orden lo decide la aplicación). */
  listBySchool(schoolId: string): Promise<StudentSummary[]>;
}
