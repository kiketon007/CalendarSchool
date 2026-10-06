import type { RequestHandler } from 'express';
import { sendError } from './responses.js';

/** Tiempo máximo de una petición antes de responder 503 REQUEST_TIMEOUT. */
export const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Responde 503 REQUEST_TIMEOUT si la petición no ha respondido en `timeoutMs`.
 * El handler original sigue ejecutándose: su respuesta tardía la descarta el manejador
 * de errores, que ignora los errores producidos con la respuesta ya enviada.
 */
export function requestTimeout(timeoutMs: number = REQUEST_TIMEOUT_MS): RequestHandler {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      // Si el handler ya empezó a responder (p. ej. en streaming), no se puede responder otra vez.
      if (!res.headersSent) {
        sendError(res, 503, 'REQUEST_TIMEOUT', 'La petición ha superado el tiempo máximo de respuesta');
      }
    }, timeoutMs);

    const clearTimer = () => clearTimeout(timer);
    res.on('finish', clearTimer);
    res.on('close', clearTimer);
    next();
  };
}
