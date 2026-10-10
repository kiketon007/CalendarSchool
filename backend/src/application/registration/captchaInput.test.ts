import { describe, expect, it } from 'vitest';
import { CaptchaFailed } from './captchaVerifier.js';
import { parseCaptchaInput } from './captchaInput.js';

describe('parseCaptchaInput', () => {
  it.each(['v3', 'v2'] as const)('accepts a %s token', (version) => {
    expect(parseCaptchaInput({ version, token: 'un-token' })).toEqual({
      version,
      token: 'un-token',
    });
  });

  it('ignores properties that are not part of the captcha', () => {
    expect(parseCaptchaInput({ version: 'v3', token: 't', extra: 'x' })).toEqual({
      version: 'v3',
      token: 't',
    });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'un-token'],
    ['a number', 42],
    ['an array', ['v3', 'token']],
    ['an empty object', {}],
    ['an unknown version', { version: 'v1', token: 't' }],
    ['a missing version', { token: 't' }],
    ['a missing token', { version: 'v3' }],
    ['an empty token', { version: 'v3', token: '' }],
    ['a token that is not a string', { version: 'v3', token: 123 }],
  ])('fails with MISSING for %s', (_case, captcha) => {
    expect(() => parseCaptchaInput(captcha)).toThrow(CaptchaFailed);
    expect(() => parseCaptchaInput(captcha)).toThrow(
      expect.objectContaining({ reason: 'MISSING' }),
    );
  });
});
