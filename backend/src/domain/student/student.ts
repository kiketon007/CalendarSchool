/** Un curso o una clase de un alumno, con su nombre. */
export interface StudentReference {
  /** UUIDv7. */
  readonly id: string;
  readonly name: string;
}

/**
 * Alumno de un colegio tal como lo muestra el listado: sin los datos sensibles (tipo de comida y
 * observaciones), que nunca salen de la ficha ni van a los logs.
 */
export interface StudentSummary {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  /** `null` si el curso del alumno se borró. */
  readonly course: StudentReference | null;
  /** `null` si el alumno no tiene clase, o se quitó su clase o se borró su curso. */
  readonly class: StudentReference | null;
  /** Si come en el comedor. */
  readonly cafeteria: boolean;
  /** Beca de comedor: `null` si no come en el comedor. */
  readonly scholarship: boolean | null;
}

/** Alumno con todos sus datos, incluidos los sensibles (solo la respuesta del alta los lleva). */
export interface Student extends StudentSummary {
  /** Tipo de comida (dato sensible), o `null`. */
  readonly foodType: string | null;
  /** Observaciones (dato sensible), o `null`. */
  readonly observations: string | null;
}

/** Alumno nuevo, con los textos ya limpios y su identificador. */
export interface NewStudent {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly cafeteria: boolean;
  /** `null` si no come en el comedor; con comedor, siempre un booleano. */
  readonly scholarship: boolean | null;
  /** `null` si no come en el comedor o no se indicó. */
  readonly foodType: string | null;
  readonly observations: string | null;
}

/** Estado final de un alumno al editarlo, con los textos ya limpios (el identificador no cambia). */
export type StudentChanges = Omit<NewStudent, 'id'>;

/** Resultado de editar un alumno: cómo estaba y cómo quedó, para saber qué campos cambiaron. */
export interface StudentUpdate {
  readonly before: Student;
  readonly after: Student;
}
