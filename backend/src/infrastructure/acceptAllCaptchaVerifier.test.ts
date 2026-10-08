import { describe, expect, it } from 'vitest';
import type { CaptchaVerifier } from '../application/registration/captchaVerifier.js';
import { AcceptAllCaptchaVerifier } from './acceptAllCaptchaVerifier.js';

describe('AcceptAllCaptchaVerifier', () => {
  const verifier: CaptchaVerifier = new AcceptAllCaptchaVerifier();

  it.each([
    [{ version: 'v3', token: 'cualquier-token' }],
    [{ version: 'v2', token: '' }],
    ['texto'],
    [undefined],
  ])('accepts %j until US01_e verifies the captcha for real', async (captcha) => {
    await expect(verifier.verify(captcha)).resolves.toBeUndefined();
  });
});
