import type { CaptchaVerifier } from '../application/registration/captchaVerifier.js';

/**
 * Verificador provisional: acepta cualquier token. Mantiene el puerto en su sitio hasta que
 * US01_e lo sustituya por la verificación real de reCAPTCHA en `server.ts`, sin tocar el
 * caso de uso. No debe llegar a producción (el registro no se publica hasta US01_d y US01_e).
 */
export class AcceptAllCaptchaVerifier implements CaptchaVerifier {
  verify(): Promise<void> {
    return Promise.resolve();
  }
}
