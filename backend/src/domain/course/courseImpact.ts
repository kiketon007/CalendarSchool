/**
 * Lo que se pierde (o se ha perdido) al borrar un curso: las clases que caen con él y los alumnos que
 * tenían asignados, que quedan sin clase. `studentCount` es siempre `0` hasta que existan los alumnos
 * (US14).
 */
export interface CourseImpact {
  readonly classCount: number;
  readonly studentCount: number;
}
