import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from '../../infrastructure/logger.js';
import { AppError } from './appError.js';
import { sendError } from './responses.js';

/** Responde 404 NOT_FOUND en JSON a cualquier ruta de la API que no exista. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', 404, 'La ruta solicitada no existe'));
};

/** Error que lanza `express.json()` cuando el cuerpo no es JSON válido. */
function isJsonParseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    (error as SyntaxError & { type?: string }).type === 'entity.parse.failed'
  );
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

    if (error instanceof AppError) {
      sendError(res, error.httpStatus, error.code, error.message);
      return;
    }

    if (isJsonParseError(error)) {
      sendError(res, 400, 'INVALID_JSON', 'El cuerpo de la petición no es JSON válido');
      return;
    }

    logger.error({ err: error }, 'Error no controlado al procesar la petición');
    sendError(res, 500, 'INTERNAL_ERROR', 'Error interno del servidor');
  };
}
