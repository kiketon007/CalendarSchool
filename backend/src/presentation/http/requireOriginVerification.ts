import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from '../../infrastructure/logger.js';
import { AppError } from './appError.js';

/** Cabecera que CloudFront añade a las peticiones hacia el origen de la API. */
export const ORIGIN_VERIFY_HEADER = 'x-origin-verify';

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Solo deja pasar las peticiones que llegan por CloudFront (design.md D6): exige la cabecera
 * `X-Origin-Verify` con el secreto compartido. Sin ella, quien conozca la URL de API Gateway podría
 * saltarse CloudFront y elegir la IP que ve el límite de intentos.
 *
 * Compara los SHA-256 de ambos valores con `timingSafeEqual`: así el tiempo no depende de en qué
 * posición difieren ni de la longitud del valor recibido. El valor recibido nunca se registra.
 *
 * El `debug` guarda la IP y `X-Forwarded-For` tal como los ve Express: con ellos se mide
 * `TRUST_PROXY_HOPS` una vez desplegado (design.md D7).
 */
export function requireOriginVerification(secret: string, logger: Logger): RequestHandler {
  const expected = sha256(secret);

  return (req, _res, next) => {
    logger.debug({ ip: req.ip, forwardedFor: req.headers['x-forwarded-for'] }, 'Petición recibida');

    const received = req.get(ORIGIN_VERIFY_HEADER);
    if (received === undefined || !timingSafeEqual(sha256(received), expected)) {
      logger.warn(
        { ip: req.ip, path: req.path },
        'Petición sin la cabecera de verificación del origen',
      );
      next(new AppError('ORIGIN_NOT_ALLOWED', 403, 'La petición no procede de CloudFront'));
      return;
    }
    next();
  };
}
