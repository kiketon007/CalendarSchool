/**
 * Por qué falló la verificación. Solo se registra en el log: al cliente le llega siempre el mismo
 * mensaje, para no dar pistas a un atacante sobre qué comprobación no ha superado.
 */
export type CaptchaFailureReason =
  | 'MISSING'
  | 'INVALID'
  | 'EXPIRED_OR_DUPLICATE'
  | 'ACTION_MISMATCH'
  | 'HOSTNAME_MISMATCH'
  | 'CHALLENGE_FAILED';

/** El captcha falta, no es válido, ha caducado o no se ha superado el reto v2 (`422 CAPTCHA_FAILED`). */
export class CaptchaFailed extends Error {
  constructor(public readonly reason: CaptchaFailureReason) {
    super('La verificación de reCAPTCHA ha fallado');
    this.name = 'CaptchaFailed';
  }
}

/**
 * El score de reCAPTCHA v3 es bajo: el cliente debe presentar el reto v2
 * (`422 CAPTCHA_CHALLENGE_REQUIRED`). El score solo se registra en el log.
 */
export class CaptchaChallengeRequired extends Error {
  constructor(public readonly score: number) {
    super('Se requiere superar el reto de reCAPTCHA');
    this.name = 'CaptchaChallengeRequired';
  }
}

/**
 * No se ha podido verificar el captcha: Google no responde a tiempo, falla o las claves están
 * mal configuradas (`503 CAPTCHA_UNAVAILABLE`). Se falla cerrado. Conserva la causa para el log;
 * la respuesta nunca la expone.
 */
export class CaptchaUnavailable extends Error {
  constructor(cause: unknown) {
    super('La verificación de reCAPTCHA no está disponible', { cause });
    this.name = 'CaptchaUnavailable';
  }
}

/**
 * Puerto de verificación anti-bot. Recibe el campo `captcha` tal como llega en la petición
 * (sin validar) y lo verifica antes que el resto del payload.
 *
 * @throws CaptchaFailed si la verificación falla
 * @throws CaptchaChallengeRequired si el cliente debe presentar el reto v2
 * @throws CaptchaUnavailable si no se ha podido verificar (falla cerrado)
 */
export interface CaptchaVerifier {
  verify(captcha: unknown): Promise<void>;
}
