/**
 * Lo que se pierde (o se ha perdido) al borrar un curso: las clases que caen con él y los alumnos del
 * curso, con y sin clase, que no se borran y quedan sin curso ni clase (US14), y las reglas de reparto de sus
 * asignaturas, que caen por la cascada (US19_b).
 */
export interface CourseImpact {
  readonly classCount: number;
  readonly studentCount: number;
  /** Reglas de reparto de cualquier asignatura en el curso, de cualquier tipo. */
  readonly constraintCount: number;
}
