import { CaptchaFailed } from './captchaVerifier.js';

/** Captcha tal como lo envía el cliente: la versión con la que se obtuvo y su token. */
export interface CaptchaInput {
  readonly version: 'v3' | 'v2';
  readonly token: string;
}

/**
 * Comprueba la forma del campo `captcha` (que llega sin validar) antes de verificarlo con Google, y
 * lo comparten el verificador real y el falso. Un `captcha` ausente o mal formado es un fallo de
 * verificación (`422 CAPTCHA_FAILED`), no un error de validación (`400`): el captcha va antes que
 * la validación del resto del payload.
 *
 * @throws CaptchaFailed con motivo `MISSING` si falta o no tiene la forma esperada
 */
export function parseCaptchaInput(captcha: unknown): CaptchaInput {
  if (typeof captcha !== 'object' || captcha === null || Array.isArray(captcha)) {
    throw new CaptchaFailed('MISSING');
  }
  const { version, token } = captcha as Record<string, unknown>;
  if ((version !== 'v3' && version !== 'v2') || typeof token !== 'string' || token === '') {
    throw new CaptchaFailed('MISSING');
  }
  return { version, token };
}
