/**
 * Resultado de intentar registrar un intento: aceptado (con el identificador de su fila, para poder
 * liberarlo), o rechazado con el instante de reintento.
 */
export type AttemptResult =
  { accepted: true; attemptId: string } | { accepted: false; retryAt: Date };

/** Puerto de persistencia de los intentos de operaciones limitadas (registro, login...). */
export interface AttemptRepository {
  /**
   * Registra un intento de la clave si en la ventana `[now - windowMs, now]` hay menos de
   * `maxAttempts` intentos aceptados, y lo rechaza en caso contrario. La comprobación y el registro
   * son atómicos por clave: peticiones simultáneas con la misma clave no superan el máximo. Un
   * intento rechazado no se guarda y no cuenta. Borra de la clave los intentos que ya salieron de la
   * ventana.
   *
   * @returns `accepted: true` con el identificador del intento, o `accepted: false` con el instante
   * en que el intento aceptado más antiguo sale de la ventana y se podrá reintentar
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  register(key: string, now: Date, windowMs: number, maxAttempts: number): Promise<AttemptResult>;

  /**
   * Libera un intento aceptado: borra solo esa fila, de modo que deja de contar. Es para las
   * operaciones que solo cuentan los fallidos (el login). Liberar un intento que ya no existe (se
   * purgó o se liberó antes) no es un error.
   *
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  release(attemptId: string): Promise<void>;
}
