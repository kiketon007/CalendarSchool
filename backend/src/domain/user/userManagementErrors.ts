/** El usuario no existe en el colegio: es de otro, no existe, está eliminado o su id no es un UUID (`404 NOT_FOUND`). */
export class UserNotFound extends Error {
  constructor() {
    super('El usuario no existe');
    this.name = 'UserNotFound';
  }
}

/** La operación dejaría el colegio sin ningún administrador activo (`409 LAST_ADMIN_REQUIRED`). */
export class LastAdminRequired extends Error {
  constructor() {
    super('El colegio debe tener al menos un administrador activo');
    this.name = 'LastAdminRequired';
  }
}

/** Un usuario intenta darse de baja a sí mismo, aunque haya otros administradores (`409 CANNOT_SUSPEND_SELF`). */
export class CannotSuspendSelf extends Error {
  constructor() {
    super('Un usuario no puede darse de baja a sí mismo');
    this.name = 'CannotSuspendSelf';
  }
}

/** La operación exige un usuario `ACTIVE` y está dado de baja (`409 USER_NOT_ACTIVE`). */
export class UserNotActive extends Error {
  constructor() {
    super('El usuario no está activo');
    this.name = 'UserNotActive';
  }
}
