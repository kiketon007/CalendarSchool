import { parseCaptchaInput } from '../application/registration/captchaInput.js';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
  CaptchaUnavailable,
  type CaptchaVerifier,
} from '../application/registration/captchaVerifier.js';

/** Tokens reservados con los que desarrollo, tests y E2E simulan cada caso del captcha real. */
export const FAKE_CAPTCHA_TOKENS = {
  /** Con `version` `v3`: score bajo, el cliente debe presentar el reto v2. */
  lowScore: 'fake-low-score',
  /** Verificación fallida. */
  fail: 'fake-fail',
  /** Google no disponible. */
  unavailable: 'fake-unavailable',
} as const;

/** Score que simula el verificador falso con `fake-low-score`: por debajo del umbral de 0,6. */
const FAKE_LOW_SCORE = 0.3;

/**
 * Verificador falso para desarrollo, tests y E2E, que no dependen de Google. Aplica la misma
 * comprobación de forma que el real y acepta cualquier token salvo los reservados. Solo se usa sin
 * secretos de reCAPTCHA: `loadConfig` los exige en producción, así que nunca puede llegar allí.
 */
export class FakeCaptchaVerifier implements CaptchaVerifier {
  verify(captcha: unknown): Promise<void> {
    try {
      const { version, token } = parseCaptchaInput(captcha);
      if (token === FAKE_CAPTCHA_TOKENS.unavailable) {
        throw new CaptchaUnavailable(new Error('Fallo simulado de reCAPTCHA'));
      }
      if (token === FAKE_CAPTCHA_TOKENS.fail) {
        throw new CaptchaFailed('INVALID');
      }
      if (token === FAKE_CAPTCHA_TOKENS.lowScore && version === 'v3') {
        throw new CaptchaChallengeRequired(FAKE_LOW_SCORE);
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
