import type {
  DeletedProfessor,
  NewProfessor,
  Professor,
  ProfessorChanges,
  ProfessorUpdate,
} from './professor.js';

/**
 * Puerto de los profesores. Todo método recibe el colegio, que sale siempre de la identidad de la
 * petición: un profesor o una clase de otro colegio no existe para quien llama.
 */
export interface ProfessorRepository {
  /**
   * Crea el profesor y, si se indica `classId`, le asigna esa clase como tutoría, en una única
   * transacción: o se crea todo o no se crea nada. Lanza `ClassNotFound` si la clase no existe en el
   * colegio (también si es de otro) y `ClassAlreadyHasTutor` si ya tiene tutor; en los dos casos no
   * queda el profesor. Dos altas simultáneas con la misma clase no pueden ganar las dos.
   */
  create(schoolId: string, professor: NewProfessor, classId: string | null): Promise<Professor>;

  /** Profesores del colegio con su clase y su curso, sin ordenar (el orden lo decide la aplicación). */
  listBySchool(schoolId: string): Promise<Professor[]>;

  /** El profesor con su clase y su curso, o `null` si no está en el colegio (o no existe). */
  findById(schoolId: string, professorId: string): Promise<Professor | null>;

  /**
   * Guarda el estado final del profesor (US12) en una única transacción y devuelve cómo estaba, cómo
   * queda y el profesor que perdió la tutoría, si lo hubo. Devuelve `null` si el profesor no está en el
   * colegio. Si `classId` cambia, el profesor deja la clase que tutorizaba y toma la nueva; si esta tenía
   * otro tutor, lo pierde. Lanza `ClassNotFound` si la clase no existe en el colegio (no cambia nada) y
   * `ProfessorAlreadyTutor` si otra escritura simultánea le asignó una clase al profesor.
   */
  update(
    schoolId: string,
    professorId: string,
    changes: ProfessorChanges,
  ): Promise<ProfessorUpdate | null>;

  /**
   * Borra de verdad al profesor (US13) en una única transacción, con su fila bloqueada, y devuelve la
   * clase que tutorizaba, que queda sin tutor por la clave ajena (`ON DELETE SET NULL`); `null` si el
   * profesor no está en el colegio. Una edición simultánea espera el bloqueo y, si el borrado confirma
   * primero, no encuentra al profesor; de dos borrados simultáneos, solo uno borra.
   */
  delete(schoolId: string, professorId: string): Promise<DeletedProfessor | null>;
}
