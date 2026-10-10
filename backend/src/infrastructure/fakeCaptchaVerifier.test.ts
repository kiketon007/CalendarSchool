import { describe, expect, it } from 'vitest';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
  CaptchaUnavailable,
  type CaptchaVerifier,
} from '../application/registration/captchaVerifier.js';
import { FakeCaptchaVerifier } from './fakeCaptchaVerifier.js';

const verifier: CaptchaVerifier = new FakeCaptchaVerifier();

describe('FakeCaptchaVerifier', () => {
  it.each([
    ['any v3 token', { version: 'v3', token: 'e2e' }],
    ['any v2 token', { version: 'v2', token: 'e2e' }],
    ['the fixed token of the fake client', { version: 'v3', token: 'fake-v3-token' }],
  ])('accepts %s', async (_case, captcha) => {
    await expect(verifier.verify(captcha)).resolves.toBeUndefined();
  });

  it('asks for the v2 challenge with the reserved low score token of version v3', async () => {
    const error: unknown = await verifier
      .verify({ version: 'v3', token: 'fake-low-score' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CaptchaChallengeRequired);
    expect((error as CaptchaChallengeRequired).score).toBe(0.3);
  });

  it('does not ask for the challenge when the low score token comes from the v2 challenge', async () => {
    await expect(
      verifier.verify({ version: 'v2', token: 'fake-low-score' }),
    ).resolves.toBeUndefined();
  });

  it.each(['v3', 'v2'] as const)(
    'fails with the reserved fail token of version %s',
    async (version) => {
      await expect(verifier.verify({ version, token: 'fake-fail' })).rejects.toMatchObject({
        name: 'CaptchaFailed',
        reason: 'INVALID',
      });
    },
  );

  it.each(['v3', 'v2'] as const)(
    'is unavailable with the reserved token of version %s',
    async (version) => {
      await expect(verifier.verify({ version, token: 'fake-unavailable' })).rejects.toBeInstanceOf(
        CaptchaUnavailable,
      );
    },
  );

  it.each([
    ['no captcha', undefined],
    ['a malformed captcha', { version: 'v1', token: 'e2e' }],
    ['an empty token', { version: 'v3', token: '' }],
  ])('fails with MISSING for %s, like the real verifier', async (_case, captcha) => {
    const error: unknown = await verifier.verify(captcha).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CaptchaFailed);
    expect((error as CaptchaFailed).reason).toBe('MISSING');
  });
});
