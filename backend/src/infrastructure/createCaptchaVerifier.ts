import type { ApplicationLogger } from '../application/applicationLogger.js';
import type { CaptchaVerifier } from '../application/registration/captchaVerifier.js';
import type { AppConfig } from './config.js';
import { FakeCaptchaVerifier } from './fakeCaptchaVerifier.js';
import { RecaptchaCaptchaVerifier } from './recaptchaCaptchaVerifier.js';

export interface CreateCaptchaVerifierOptions {
  recaptcha: AppConfig['recaptcha'];
  appOrigin: string;
  logger: ApplicationLogger;
  /** `fetch` inyectable para probar el verificador real sin red. */
  fetch?: typeof fetch;
}

/**
 * Elige el verificador de captcha según la configuración: el real con los secretos de reCAPTCHA y
 * el falso sin ellos. `loadConfig` exige los secretos en producción, así que el falso (que acepta
 * casi cualquier token) solo puede usarse en desarrollo, tests y E2E; al usarlo se avisa en el log.
 * El dominio esperado de los tokens es el de `APP_ORIGIN`.
 */
export function createCaptchaVerifier({
  recaptcha,
  appOrigin,
  logger,
  fetch,
}: CreateCaptchaVerifierOptions): CaptchaVerifier {
  if (!recaptcha) {
    logger.warn(
      { event: 'CAPTCHA_FAKE_VERIFIER' },
      'Sin secretos de reCAPTCHA: se usa el verificador falso, que acepta casi cualquier token. Solo para desarrollo, tests y E2E',
    );
    return new FakeCaptchaVerifier();
  }
  return new RecaptchaCaptchaVerifier({
    v3Secret: recaptcha.v3Secret,
    v2Secret: recaptcha.v2Secret,
    expectedHostname: new URL(appOrigin).hostname,
    ...(fetch ? { fetch } : {}),
  });
}
