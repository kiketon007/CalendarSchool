/** Cómo se obtienen los tokens del captcha: con reCAPTCHA de Google o con el cliente falso. */
export type CaptchaConfig =
  { mode: 'fake' } | { mode: 'recaptcha'; siteKeyV3: string; siteKeyV2: string };

/**
 * Lee las claves de sitio de reCAPTCHA (públicas, a diferencia de los secretos del backend): las
 * dos o ninguna. Sin ellas se usa el cliente falso, pensado para desarrollo, tests y E2E; un
 * backend en producción lo rechazaría, porque exige los secretos de reCAPTCHA y verifica de verdad.
 *
 * @throws Error si solo hay una de las dos claves, nombrando la que falta
 */
export function readCaptchaConfig(env: Record<string, string | undefined>): CaptchaConfig {
  const siteKeyV3 = env.VITE_RECAPTCHA_SITE_KEY_V3 || undefined;
  const siteKeyV2 = env.VITE_RECAPTCHA_SITE_KEY_V2 || undefined;

  if (siteKeyV3 === undefined && siteKeyV2 === undefined) {
    return { mode: 'fake' };
  }
  if (siteKeyV3 === undefined) {
    throw new Error('Falta VITE_RECAPTCHA_SITE_KEY_V3: las claves de sitio van juntas');
  }
  if (siteKeyV2 === undefined) {
    throw new Error('Falta VITE_RECAPTCHA_SITE_KEY_V2: las claves de sitio van juntas');
  }
  return { mode: 'recaptcha', siteKeyV3, siteKeyV2 };
}

/**
 * Configuración del captcha de este build. Es el único sitio que lee `import.meta.env`: el resto
 * del frontend la recibe ya interpretada.
 */
export const captchaConfig: CaptchaConfig = readCaptchaConfig(import.meta.env);
