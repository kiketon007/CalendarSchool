import type { NewProfessor, Professor } from './professor.js';

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
}
