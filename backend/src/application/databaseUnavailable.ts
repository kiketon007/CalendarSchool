/**
 * No se pudo conectar con la base de datos. Conserva la causa original para el log; la
 * respuesta HTTP (`503 DATABASE_UNAVAILABLE`) nunca la expone.
 */
export class DatabaseUnavailable extends Error {
  constructor(cause: unknown) {
    super('La base de datos no está disponible', { cause });
    this.name = 'DatabaseUnavailable';
  }
}
