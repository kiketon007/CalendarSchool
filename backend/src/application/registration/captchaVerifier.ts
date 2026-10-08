/** El captcha falta, no es válido, ha caducado o no se ha superado el reto v2 (`422 CAPTCHA_FAILED`). */
export class CaptchaFailed extends Error {
  constructor() {
    super('La verificación de reCAPTCHA ha fallado');
    this.name = 'CaptchaFailed';
  }
}

/** El score de reCAPTCHA v3 es bajo: el cliente debe presentar el reto v2 (`422 CAPTCHA_CHALLENGE_REQUIRED`). */
export class CaptchaChallengeRequired extends Error {
  constructor() {
    super('Se requiere superar el reto de reCAPTCHA');
    this.name = 'CaptchaChallengeRequired';
  }
}

/**
 * Puerto de verificación anti-bot. Recibe el campo `captcha` tal como llega en la petición
 * (sin validar) y lo verifica antes que el resto del payload.
 *
 * @throws CaptchaFailed si la verificación falla
 * @throws CaptchaChallengeRequired si el cliente debe presentar el reto v2
 */
export interface CaptchaVerifier {
  verify(captcha: unknown): Promise<void>;
}
