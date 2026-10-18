import type { Request } from 'express';
import type { RequestContext } from '../../application/requestContext.js';

/** Datos de la petición que los casos de uso registran en los eventos: la IP resuelta y el user agent. */
export function requestContext(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}
