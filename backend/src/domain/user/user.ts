export type UserRole = 'ADMIN' | 'MEMBER';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

/** Usuario con cuenta. Pertenece a un único colegio. */
export interface User {
  /** UUIDv7. */
  readonly id: string;
  readonly schoolId: string;
  /** Email normalizado: sin espacios al inicio ni al final y en minúsculas. */
  readonly email: string;
  /** Hash Bcrypt (cost 12); nunca la contraseña. */
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  /** Aceptación de la política de privacidad; `null` en las cuentas anteriores al consentimiento. */
  readonly privacyPolicyAcceptance: PrivacyPolicyAcceptance | null;
}

/** Cuándo se aceptó la política de privacidad y qué versión (`PRIVACY_POLICY_VERSION`). */
export interface PrivacyPolicyAcceptance {
  readonly acceptedAt: Date;
  readonly version: string;
}
