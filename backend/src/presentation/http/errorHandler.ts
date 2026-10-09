import type { ErrorRequestHandler, RequestHandler } from 'express';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
} from '../../application/registration/captchaVerifier.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import {
  EmailAlreadyRegistered,
  SchoolAlreadyRegistered,
} from '../../domain/registration/registrationErrors.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { Logger } from '../../infrastructure/logger.js';
import { AppError } from './appError.js';
import { sendError, sendValidationError } from './responses.js';

/** Responde 404 NOT_FOUND en JSON a cualquier ruta de la API que no exista. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', 404, 'La ruta solicitada no existe'));
};

/**
 * Errores de cliente de `express.json()`, identificados por su campo `type`. Sin esta
 * traducción caerían en 500 INTERNAL_ERROR y se registrarían como fallos del servidor.
 */
const BODY_PARSER_ERRORS: Record<string, AppError> = {
  'entity.parse.failed': new AppError(
    'INVALID_JSON',
    400,
    'El cuerpo de la petición no es JSON válido',
  ),
  'entity.too.large': new AppError(
    'PAYLOAD_TOO_LARGE',
    413,
    'El cuerpo de la petición supera el tamaño máximo permitido',
  ),
  'charset.unsupported': new AppError(
    'UNSUPPORTED_MEDIA_TYPE',
    415,
    'La codificación del cuerpo de la petición no está soportada',
  ),
  'encoding.unsupported': new AppError(
    'UNSUPPORTED_MEDIA_TYPE',
    415,
    'La codificación del cuerpo de la petición no está soportada',
  ),
};

/** Devuelve el error de aplicación equivalente a un error de `express.json()`, si lo es. */
function bodyParserError(error: unknown): AppError | undefined {
  if (typeof error !== 'object' || error === null || !('type' in error)) {
    return undefined;
  }
  const { type } = error;
  return typeof type === 'string' && Object.hasOwn(BODY_PARSER_ERRORS, type)
    ? BODY_PARSER_ERRORS[type]
    : undefined;
}

/** Errores de dominio y de aplicación con su equivalente HTTP; el mensaje es el del propio error. */
function domainError(error: unknown): AppError | undefined {
  if (error instanceof EmailAlreadyRegistered) {
    return new AppError('EMAIL_ALREADY_REGISTERED', 409, error.message);
  }
  if (error instanceof SchoolAlreadyRegistered) {
    return new AppError('SCHOOL_ALREADY_REGISTERED', 409, error.message);
  }
  if (error instanceof CaptchaChallengeRequired) {
    return new AppError('CAPTCHA_CHALLENGE_REQUIRED', 422, error.message);
  }
  if (error instanceof CaptchaFailed) {
    return new AppError('CAPTCHA_FAILED', 422, error.message);
  }
  if (error instanceof InvalidSession) {
    // La causa (`reason`) solo va al log del caso de uso: el mensaje es el mismo para todas.
    return new AppError('INVALID_SESSION', 401, error.message);
  }
  return undefined;
}

/** Manejador central de errores: traduce cualquier error al formato de error común. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    // La respuesta ya se envió (p. ej. el 503 del timeout): el error lo produce un handler
    // que intenta responder tarde y se descarta, porque no se puede enviar otra respuesta.
    if (res.headersSent) {
      logger.debug('Se descarta un error producido después de enviar la respuesta');
      return;
    }

    if (error instanceof DatabaseUnavailable) {
      // La causa solo va al log: la respuesta nunca expone detalles de la base de datos.
      logger.error({ err: error }, 'La base de datos no está disponible');
      sendError(res, 503, 'DATABASE_UNAVAILABLE', error.message);
      return;
    }

    if (error instanceof ValidationError) {
      sendValidationError(res, error.message, error.details);
      return;
    }

    if (error instanceof TooManyAttempts) {
      // El mensaje no revela la clave ni cuántos intentos hay; el tiempo de espera va en la cabecera.
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
      sendError(res, 429, 'TOO_MANY_REQUESTS', error.message);
      return;
    }

    const appError =
      error instanceof AppError ? error : (domainError(error) ?? bodyParserError(error));
    if (appError) {
      sendError(res, appError.httpStatus, appError.code, appError.message);
      return;
    }

    logger.error({ err: error }, 'Error no controlado al procesar la petición');
    sendError(res, 500, 'INTERNAL_ERROR', 'Error interno del servidor');
  };
}
