import type { SchoolUser } from './schoolUser.js';
import type { UserChange, UserChangeSnapshot } from './userManagement.js';

/** Resultado de aplicar una operación de gestión a un usuario del colegio. */
export interface AppliedUserChange {
  /** El usuario antes de la operación. */
  readonly previous: SchoolUser;
  /** El usuario después de la operación; igual a `previous` si no hubo cambio. */
  readonly user: SchoolUser;
  /** Lo que se escribió, o `null` si el usuario ya estaba como se pedía. */
  readonly change: UserChange | null;
  /** Sesiones que la operación revocó (solo la baja revoca). */
  readonly revokedSessions: number;
}

/**
 * Puerto de los usuarios de un colegio. El colegio es siempre un parámetro obligatorio, tomado de
 * la identidad de la petición: ningún método lee ni escribe datos de un colegio sin indicarlo.
 */
export interface SchoolUserRepository {
  /**
   * Usuarios `ACTIVE` y `SUSPENDED` del colegio (los `DELETED` no se devuelven), ordenados por
   * apellidos, nombre y email con la intercalación del castellano. `passwordResetPending` es cierto
   * si el usuario tiene un restablecimiento pendiente (no usado, no revocado y no caducado) en `now`.
   *
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  listBySchool(schoolId: string, now: Date): Promise<SchoolUser[]>;

  /**
   * Aplica una operación de gestión a un usuario con el colegio bloqueado hasta que termina: las
   * operaciones del mismo colegio se ejecutan de una en una, así que `plan` ve un recuento de
   * administradores que nadie más puede cambiar mientras tanto. Lee al usuario (solo `ACTIVE` o
   * `SUSPENDED` del colegio), llama a `plan` con él y con el número de `ADMIN` activos, y escribe lo
   * que `plan` devuelva; en la baja revoca en la misma transacción todas las sesiones del usuario
   * que sigan sin revocar. Si `plan` lanza, no se escribe nada y el error se propaga.
   *
   * @returns el resultado, o `null` si el usuario no es de este colegio, no existe o está `DELETED`
   * (en cuyo caso no se llama a `plan`)
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  applyChange(input: {
    schoolId: string;
    userId: string;
    /** Instante de la revocación de las sesiones y de la comprobación de los restablecimientos pendientes. */
    now: Date;
    /** Regla de negocio; recibe la instantánea sin el usuario que actúa, que conoce el caso de uso. */
    plan: (snapshot: Omit<UserChangeSnapshot, 'actorId'>) => UserChange | null;
  }): Promise<AppliedUserChange | null>;
}
