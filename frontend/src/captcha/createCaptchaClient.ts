import type { CaptchaClient } from './captchaClient';
import type { CaptchaConfig } from './captchaConfig';
import { createFakeCaptchaClient } from './fakeCaptchaClient';
import { createRecaptchaClient } from './recaptchaClient';

/** El cliente de reCAPTCHA con claves de sitio y el falso sin ellas. */
export function createCaptchaClient(config: CaptchaConfig): CaptchaClient {
  return config.mode === 'recaptcha'
    ? createRecaptchaClient({ siteKeyV3: config.siteKeyV3, siteKeyV2: config.siteKeyV2 })
    : createFakeCaptchaClient();
}
