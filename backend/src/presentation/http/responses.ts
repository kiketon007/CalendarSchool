import type { Response } from 'express';
import type { ErrorCode } from './appError.js';

/** Respuesta correcta en el formato común: `{ success: true, data }`. */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

/** Respuesta de error en el formato común: `{ success: false, error: { code, message } }`. */
export function sendError(res: Response, status: number, code: ErrorCode, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}
