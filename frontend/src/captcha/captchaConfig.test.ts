import { describe, expect, it } from 'vitest';
import { readCaptchaConfig } from './captchaConfig';

describe('readCaptchaConfig', () => {
  it('uses the fake client when there are no site keys', () => {
    expect(readCaptchaConfig({})).toEqual({ mode: 'fake' });
  });

  it('uses reCAPTCHA when both site keys are defined', () => {
    expect(
      readCaptchaConfig({
        VITE_RECAPTCHA_SITE_KEY_V3: 'clave-de-sitio-v3',
        VITE_RECAPTCHA_SITE_KEY_V2: 'clave-de-sitio-v2',
      }),
    ).toEqual({
      mode: 'recaptcha',
      siteKeyV3: 'clave-de-sitio-v3',
      siteKeyV2: 'clave-de-sitio-v2',
    });
  });

  it.each([
    [{ VITE_RECAPTCHA_SITE_KEY_V3: 'clave-de-sitio-v3' }, 'VITE_RECAPTCHA_SITE_KEY_V2'],
    [{ VITE_RECAPTCHA_SITE_KEY_V2: 'clave-de-sitio-v2' }, 'VITE_RECAPTCHA_SITE_KEY_V3'],
  ])('fails naming the missing site key when only one is defined', (env, missing) => {
    expect(() => readCaptchaConfig(env)).toThrow(missing);
  });

  it('treats empty values as not defined', () => {
    expect(
      readCaptchaConfig({ VITE_RECAPTCHA_SITE_KEY_V3: '', VITE_RECAPTCHA_SITE_KEY_V2: '' }),
    ).toEqual({ mode: 'fake' });
    expect(() =>
      readCaptchaConfig({ VITE_RECAPTCHA_SITE_KEY_V3: 'x', VITE_RECAPTCHA_SITE_KEY_V2: '' }),
    ).toThrow('VITE_RECAPTCHA_SITE_KEY_V2');
  });
});
