import type { RequestHandler } from 'express';

/**
 * Prohíbe cachear las respuestas de la API por defecto (`Cache-Control: no-store`), para que el
 * navegador no guarde datos de la sesión que se puedan ver tras cerrarla. Se monta antes que el
 * resto, de modo que también cubre los errores del parser y del manejador de errores. Una ruta con
 * datos públicos puede sustituirlo con su propia política (`GET /api/municipalities`).
 */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
