/** Códigos de error de la API (deben coincidir con `ErrorCode` de docs/api-spec.yml). */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'DATABASE_UNAVAILABLE';

/**
 * Error con código y estado HTTP que el manejador central traduce al formato de error común.
 * El mensaje va en castellano y está dirigido a desarrolladores: el frontend traduce por `code`.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
