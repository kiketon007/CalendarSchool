import type { UserRole, UserStatus } from './user.js';

/** Estados con los que un usuario aparece en la lista del colegio: los eliminados no se muestran. */
export type SchoolUserStatus = Exclude<UserStatus, 'DELETED'>;

/** Vista de un usuario para la lista de su colegio: nunca incluye el hash de la contraseña ni el consentimiento. */
export interface SchoolUser {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly role: UserRole;
  readonly status: SchoolUserStatus;
  /** Tiene un enlace de restablecimiento de contraseña pendiente (no usado, no revocado y no caducado). */
  readonly passwordResetPending: boolean;
  /** Fecha de alta. */
  readonly createdAt: Date;
}
