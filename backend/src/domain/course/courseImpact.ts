/**
 * Lo que se pierde (o se ha perdido) al borrar un curso: las clases que caen con él y los alumnos del
 * curso, con y sin clase, que no se borran y quedan sin curso ni clase (US14).
 */
export interface CourseImpact {
  readonly classCount: number;
  readonly studentCount: number;
}
