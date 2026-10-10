import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
  CaptchaUnavailable,
  type CaptchaFailureReason,
} from '../application/registration/captchaVerifier.js';
import { RecaptchaCaptchaVerifier } from './recaptchaCaptchaVerifier.js';

const V3_SECRET = 'secreto-v3-que-nunca-sale';
const V2_SECRET = 'secreto-v2-que-nunca-sale';
const HOSTNAME = 'localhost';
const SITEVERIFY = 'https://www.google.com/recaptcha/api/siteverify';

type FetchMock = Mock<typeof fetch>;

/** Respuesta de `siteverify` con la forma documentada por Google. */
function google(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const v3Ok = (overrides: Record<string, unknown> = {}) =>
  google({
    success: true,
    score: 0.9,
    action: 'register',
    challenge_ts: '2026-10-10T09:00:00Z',
    hostname: HOSTNAME,
    ...overrides,
  });
const v2Ok = (overrides: Record<string, unknown> = {}) =>
  google({ success: true, challenge_ts: '2026-10-10T09:00:00Z', hostname: HOSTNAME, ...overrides });
const failure = (...codes: string[]) => google({ success: false, 'error-codes': codes });

describe('RecaptchaCaptchaVerifier', () => {
  let fetchMock: FetchMock;
  let verifier: RecaptchaCaptchaVerifier;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>().mockResolvedValue(v3Ok());
    verifier = new RecaptchaCaptchaVerifier({
      v3Secret: V3_SECRET,
      v2Secret: V2_SECRET,
      expectedHostname: HOSTNAME,
      fetch: fetchMock,
    });
  });

  const v3 = { version: 'v3', token: 'token-v3' };
  const v2 = { version: 'v2', token: 'token-v2' };

  async function rejection(captcha: unknown): Promise<unknown> {
    return verifier.verify(captcha).then(
      () => undefined,
      (error: unknown) => error,
    );
  }

  async function failedWith(captcha: unknown, reason: CaptchaFailureReason) {
    const error = await rejection(captcha);
    expect(error).toBeInstanceOf(CaptchaFailed);
    expect((error as CaptchaFailed).reason).toBe(reason);
  }

  describe('the request to Google', () => {
    it('posts the secret and the token as a form to siteverify', async () => {
      await verifier.verify(v3);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(SITEVERIFY);
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('Content-Type')).toBe(
        'application/x-www-form-urlencoded',
      );
      const form = new URLSearchParams(init.body as string);
      expect(Object.fromEntries(form)).toEqual({ secret: V3_SECRET, response: 'token-v3' });
    });

    it('uses the secret of the version of the token', async () => {
      fetchMock.mockResolvedValueOnce(v2Ok());

      await verifier.verify(v2);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
        secret: V2_SECRET,
        response: 'token-v2',
      });
    });

    it('limits the wait with an abort signal', async () => {
      await verifier.verify(v3);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('does not call Google when the captcha is missing or malformed', async () => {
      await failedWith(undefined, 'MISSING');
      await failedWith({ version: 'v3', token: '' }, 'MISSING');

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('a v3 token', () => {
    it.each([
      ['a high score', 0.9],
      ['a score exactly at the threshold', 0.6],
    ])('is accepted with %s', async (_case, score) => {
      fetchMock.mockResolvedValueOnce(v3Ok({ score }));

      await expect(verifier.verify(v3)).resolves.toBeUndefined();
    });

    it.each([0.3, 0.59, 0])('asks for the v2 challenge with a score of %s', async (score) => {
      fetchMock.mockResolvedValueOnce(v3Ok({ score }));

      const error = await rejection(v3);

      expect(error).toBeInstanceOf(CaptchaChallengeRequired);
      expect((error as CaptchaChallengeRequired).score).toBe(score);
    });

    it('fails when the action is not register', async () => {
      fetchMock.mockResolvedValueOnce(v3Ok({ action: 'login' }));

      await failedWith(v3, 'ACTION_MISMATCH');
    });

    it('fails when the hostname is not the one of the application', async () => {
      fetchMock.mockResolvedValueOnce(v3Ok({ hostname: 'otro-sitio.example' }));

      await failedWith(v3, 'HOSTNAME_MISMATCH');
    });

    it('checks the hostname and the action before the score', async () => {
      fetchMock.mockResolvedValueOnce(v3Ok({ score: 0.1, hostname: 'otro-sitio.example' }));

      await failedWith(v3, 'HOSTNAME_MISMATCH');
    });

    it('is unavailable, not failed, when Google answers a v3 success without a score', async () => {
      fetchMock.mockResolvedValueOnce(
        google({ success: true, action: 'register', hostname: HOSTNAME }),
      );

      expect(await rejection(v3)).toBeInstanceOf(CaptchaUnavailable);
    });
  });

  describe('a v2 token', () => {
    it('is accepted when Google confirms the challenge for the hostname', async () => {
      fetchMock.mockResolvedValueOnce(v2Ok());

      await expect(verifier.verify(v2)).resolves.toBeUndefined();
    });

    it('fails when the challenge is not passed', async () => {
      fetchMock.mockResolvedValueOnce(google({ success: false }));

      await failedWith(v2, 'CHALLENGE_FAILED');
    });

    it('fails when the hostname is not the one of the application', async () => {
      fetchMock.mockResolvedValueOnce(v2Ok({ hostname: 'otro-sitio.example' }));

      await failedWith(v2, 'HOSTNAME_MISMATCH');
    });

    it('does not ask for a score or an action', async () => {
      fetchMock.mockResolvedValueOnce(v2Ok({ action: undefined, score: undefined }));

      await expect(verifier.verify(v2)).resolves.toBeUndefined();
    });
  });

  describe('a token that Google rejects', () => {
    it.each([
      ['timeout-or-duplicate', 'EXPIRED_OR_DUPLICATE'],
      ['invalid-input-response', 'INVALID'],
      ['missing-input-response', 'INVALID'],
      ['bad-request', 'INVALID'],
    ] as const)('maps %s to the reason %s', async (code, reason) => {
      fetchMock.mockResolvedValueOnce(failure(code));

      await failedWith(v3, reason);
    });

    it('fails with INVALID when Google gives no reason for a v3 token', async () => {
      fetchMock.mockResolvedValueOnce(google({ success: false }));

      await failedWith(v3, 'INVALID');
    });
  });

  describe('when the verification cannot be completed it fails closed', () => {
    it.each([
      ['invalid-input-secret', failure('invalid-input-secret')],
      ['missing-input-secret', failure('missing-input-secret')],
      ['a 500 status', google({ success: false }, 500)],
      ['a 503 status', google({ error: 'overloaded' }, 503)],
      ['a body that is not JSON', new Response('<html>', { status: 200 })],
      ['a body that is not an object', google([] as unknown as Record<string, unknown>)],
      ['a body without success', google({ score: 0.9 })],
      ['a success that is not a boolean', google({ success: 'yes' })],
    ])('is unavailable on %s', async (_case, response) => {
      fetchMock.mockResolvedValueOnce(response);

      expect(await rejection(v3)).toBeInstanceOf(CaptchaUnavailable);
    });

    it('is unavailable, keeping the cause, when the network fails', async () => {
      const cause = new TypeError('fetch failed');
      fetchMock.mockRejectedValueOnce(cause);

      const error = await rejection(v3);

      expect(error).toBeInstanceOf(CaptchaUnavailable);
      expect((error as CaptchaUnavailable).cause).toBe(cause);
    });

    it('is unavailable when Google does not answer within the time limit', async () => {
      const slow = new RecaptchaCaptchaVerifier({
        v3Secret: V3_SECRET,
        v2Secret: V2_SECRET,
        expectedHostname: HOSTNAME,
        timeoutMs: 20,
        fetch: (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            (init?.signal as AbortSignal).addEventListener('abort', () => {
              reject((init?.signal as AbortSignal).reason);
            });
          }),
      });

      const started = Date.now();
      const error = await slow.verify(v3).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CaptchaUnavailable);
      expect(Date.now() - started).toBeLessThan(2000);
    });
  });

  describe('secrets and tokens', () => {
    it('never put the secrets or the token in the error messages or their causes', async () => {
      const responses = [
        failure('invalid-input-secret'),
        google({ success: false }, 500),
        failure('timeout-or-duplicate'),
        v3Ok({ score: 0.1 }),
        v3Ok({ action: 'login' }),
      ];
      const errors: unknown[] = [];
      for (const response of responses) {
        fetchMock.mockResolvedValueOnce(response);
        errors.push(await rejection(v3));
      }
      fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
      errors.push(await rejection(v3));

      const text = JSON.stringify(
        errors.map((error) => ({
          name: (error as Error).name,
          message: (error as Error).message,
          cause: String((error as Error).cause ?? ''),
        })),
      );
      expect(errors).toHaveLength(6);
      expect(text).not.toContain(V3_SECRET);
      expect(text).not.toContain(V2_SECRET);
      expect(text).not.toContain('token-v3');
    });
  });
});
