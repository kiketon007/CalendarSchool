/**
 * Puerto para comprobar si la base de datos responde.
 *
 * Vive en la capa de aplicación y no en el dominio porque es una abstracción técnica,
 * no un concepto de negocio (design.md D1). Lo implementa un adaptador de infraestructura.
 */
export interface DatabasePing {
  /** Devuelve `true` si la base de datos responde y `false` en caso contrario. */
  ping(): Promise<boolean>;
}
