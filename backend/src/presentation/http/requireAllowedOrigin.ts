import type { RequestHandler } from 'express';
import { AppError } from './appError.js';

/**
 * Protección CSRF de los endpoints que usan la cookie de sesión (design.md D6): exige que la
 * cabecera `Origin` coincida exactamente con el origen de la aplicación. Si falta o es otra,
 * responde `403 ORIGIN_NOT_ALLOWED` sin llegar al handler ni a la base de datos.
 *
 * @param appOrigin origen ya normalizado por `loadConfig` (`URL.origin`)
 */
export function requireAllowedOrigin(appOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (req.get('origin') !== appOrigin) {
      next(new AppError('ORIGIN_NOT_ALLOWED', 403, 'El origen de la petición no está permitido'));
      return;
    }
    next();
  };
}
