import { describe, expect, it, vi } from 'vitest';
import type { ApplicationLogger } from '../application/applicationLogger.js';
import { createCaptchaVerifier } from './createCaptchaVerifier.js';
import { FakeCaptchaVerifier } from './fakeCaptchaVerifier.js';
import { RecaptchaCaptchaVerifier } from './recaptchaCaptchaVerifier.js';

function logger() {
  return { info: vi.fn(), warn: vi.fn() } satisfies ApplicationLogger;
}

const recaptcha = { v3Secret: 'secreto-v3', v2Secret: 'secreto-v2' };

/** `fetch` de Google que responde un token v2 resuelto en el dominio indicado. */
function googleAnswering(hostname: string) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify({ success: true, hostname }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('createCaptchaVerifier', () => {
  it('uses the real verifier when there are reCAPTCHA secrets', () => {
    const verifier = createCaptchaVerifier({
      recaptcha,
      appOrigin: 'https://app.example.com',
      logger: logger(),
    });

    expect(verifier).toBeInstanceOf(RecaptchaCaptchaVerifier);
  });

  it('uses the fake verifier without secrets and warns that it accepts almost any token', () => {
    const log = logger();

    const verifier = createCaptchaVerifier({
      recaptcha: undefined,
      appOrigin: 'http://localhost:5173',
      logger: log,
    });

    expect(verifier).toBeInstanceOf(FakeCaptchaVerifier);
    expect(log.warn).toHaveBeenCalledWith(
      { event: 'CAPTCHA_FAKE_VERIFIER' },
      expect.stringContaining('verificador falso'),
    );
  });

  it('does not warn when it uses the real verifier', () => {
    const log = logger();

    createCaptchaVerifier({ recaptcha, appOrigin: 'https://app.example.com', logger: log });

    expect(log.warn).not.toHaveBeenCalled();
  });

  it('expects the hostname of APP_ORIGIN, without the scheme or the port', async () => {
    const accepted = createCaptchaVerifier({
      recaptcha,
      appOrigin: 'https://app.example.com:8443',
      logger: logger(),
      fetch: googleAnswering('app.example.com'),
    });
    const rejected = createCaptchaVerifier({
      recaptcha,
      appOrigin: 'https://app.example.com:8443',
      logger: logger(),
      fetch: googleAnswering('otro-sitio.example'),
    });
    const captcha = { version: 'v2', token: 'token-v2' };

    await expect(accepted.verify(captcha)).resolves.toBeUndefined();
    await expect(rejected.verify(captcha)).rejects.toMatchObject({ reason: 'HOSTNAME_MISMATCH' });
  });
});
