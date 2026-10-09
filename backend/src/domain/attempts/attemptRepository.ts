/** Resultado de intentar registrar un intento: aceptado, o rechazado con el instante de reintento. */
export type AttemptResult = { accepted: true } | { accepted: false; retryAt: Date };

/** Puerto de persistencia de los intentos de operaciones limitadas (registro, login...). */
export interface AttemptRepository {
  /**
   * Registra un intento de la clave si en la ventana `[now - windowMs, now]` hay menos de
   * `maxAttempts` intentos aceptados, y lo rechaza en caso contrario. La comprobación y el registro
   * son atómicos por clave: peticiones simultáneas con la misma clave no superan el máximo. Un
   * intento rechazado no se guarda y no cuenta. Borra de la clave los intentos que ya salieron de la
   * ventana.
   *
   * @returns `accepted: true`, o `accepted: false` con el instante en que el intento aceptado más
   * antiguo sale de la ventana y se podrá reintentar
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  register(key: string, now: Date, windowMs: number, maxAttempts: number): Promise<AttemptResult>;
}
