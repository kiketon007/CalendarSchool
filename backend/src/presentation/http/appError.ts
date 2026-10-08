/**
 * Códigos de error de la API. Deben coincidir con `ErrorCode` de docs/api-spec.yml;
 * lo comprueba `appError.test.ts`.
 */
export const ERROR_CODES = [
  'NOT_FOUND',
  'INVALID_JSON',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL_ERROR',
  'REQUEST_TIMEOUT',
  'DATABASE_UNAVAILABLE',
  'VALIDATION_ERROR',
  'EMAIL_ALREADY_REGISTERED',
  'SCHOOL_ALREADY_REGISTERED',
  'CAPTCHA_CHALLENGE_REQUIRED',
  'CAPTCHA_FAILED',
  'TOO_MANY_REQUESTS',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

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
