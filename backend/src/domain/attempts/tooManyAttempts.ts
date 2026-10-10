/**
 * Se ha superado el número máximo de intentos de una operación para una clave (IP). Lleva los
 * segundos que faltan para poder reintentar, que la capa HTTP envía en `Retry-After`. El mensaje
 * nunca revela la clave ni cuántos intentos hay registrados.
 */
export class TooManyAttempts extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Se ha superado el número máximo de intentos');
    this.name = 'TooManyAttempts';
  }
}
