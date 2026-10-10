import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptchaUnavailableError } from './captchaClient';
import { createRecaptchaClient } from './recaptchaClient';

const SITE_KEY_V3 = 'clave-de-sitio-v3';
const SITE_KEY_V2 = 'clave-de-sitio-v2';

/** `grecaptcha` simulado: `ready` ejecuta el callback enseguida y `execute` da un token distinto cada vez. */
function fakeGrecaptcha() {
  let tokens = 0;
  return {
    ready: vi.fn((callback: () => void) => {
      callback();
    }),
    execute: vi.fn(() => Promise.resolve(`token-v3-${++tokens}`)),
    render: vi.fn(() => 7),
    reset: vi.fn(),
  };
}

const scripts = () => [...document.querySelectorAll<HTMLScriptElement>('script[src*="recaptcha"]')];

/** Simula que el navegador termina de cargar el script de Google, que deja `grecaptcha` en `window`. */
function finishLoadingScript(grecaptcha = fakeGrecaptcha()) {
  window.grecaptcha = grecaptcha;
  scripts().at(-1)?.dispatchEvent(new Event('load'));
  return grecaptcha;
}

describe('reCAPTCHA client', () => {
  beforeEach(() => {
    delete window.grecaptcha;
  });

  afterEach(() => {
    scripts().forEach((script) => {
      script.remove();
    });
    delete window.grecaptcha;
    vi.useRealTimers();
  });

  const create = (loadTimeoutMs?: number) =>
    createRecaptchaClient({
      siteKeyV3: SITE_KEY_V3,
      siteKeyV2: SITE_KEY_V2,
      ...(loadTimeoutMs === undefined ? {} : { loadTimeoutMs }),
    });

  describe('loading the script', () => {
    it('does not load anything until a token is needed', () => {
      create();

      expect(scripts()).toHaveLength(0);
    });

    it('loads the script of Google with the v3 site key the first time it is needed', async () => {
      const pending = create().executeV3('register');

      expect(scripts()).toHaveLength(1);
      expect(scripts()[0]?.src).toBe(
        `https://www.google.com/recaptcha/api.js?render=${SITE_KEY_V3}`,
      );
      finishLoadingScript();
      await pending;
    });

    it('loads the script only once, however many tokens and challenges are asked', async () => {
      const client = create();
      const first = client.executeV3('register');
      const second = client.executeV3('register');
      const challenge = client.renderV2(document.createElement('div'), vi.fn());

      finishLoadingScript();
      await Promise.all([first, second, challenge]);
      await client.executeV3('register');

      expect(scripts()).toHaveLength(1);
    });

    it('does not load the script again when grecaptcha is already available', async () => {
      window.grecaptcha = fakeGrecaptcha();

      await create().executeV3('register');

      expect(scripts()).toHaveLength(0);
    });
  });

  describe('v3 tokens', () => {
    it('executes with the v3 site key and the action', async () => {
      const client = create();
      const pending = client.executeV3('register');
      const grecaptcha = finishLoadingScript();
      await pending;

      expect(grecaptcha.execute).toHaveBeenCalledWith(SITE_KEY_V3, { action: 'register' });
    });

    it('asks Google for a new token on every call', async () => {
      const client = create();
      const first = client.executeV3('register');
      finishLoadingScript();

      const tokens = [
        await first,
        await client.executeV3('register'),
        await client.executeV3('register'),
      ];

      expect(new Set(tokens).size).toBe(3);
    });

    it('is unavailable, keeping the cause, when Google rejects the execution', async () => {
      const cause = new Error('Invalid site key');
      const grecaptcha = fakeGrecaptcha();
      grecaptcha.execute.mockRejectedValueOnce(cause);
      window.grecaptcha = grecaptcha;

      const error: unknown = await create()
        .executeV3('register')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CaptchaUnavailableError);
      expect((error as CaptchaUnavailableError).cause).toBe(cause);
    });
  });

  describe('the v2 challenge', () => {
    it('renders the challenge in the container with the v2 site key', async () => {
      const container = document.createElement('div');
      const pending = create().renderV2(container, vi.fn());

      const grecaptcha = finishLoadingScript();
      await pending;

      expect(grecaptcha.render).toHaveBeenCalledWith(
        container,
        expect.objectContaining({ sitekey: SITE_KEY_V2 }),
      );
    });

    it('hands over the token when the challenge is solved and undefined when it expires', async () => {
      const onToken = vi.fn();
      const pending = create().renderV2(document.createElement('div'), onToken);
      const grecaptcha = finishLoadingScript();
      await pending;
      const params = (
        grecaptcha.render.mock.calls[0] as unknown as [
          HTMLElement,
          { callback: (token: string) => void; 'expired-callback': () => void },
        ]
      )[1];

      params.callback('token-v2');
      params['expired-callback']();

      expect(onToken).toHaveBeenNthCalledWith(1, 'token-v2');
      expect(onToken).toHaveBeenNthCalledWith(2, undefined);
    });

    it('resets the widget it rendered and removes it from the container', async () => {
      const container = document.createElement('div');
      container.innerHTML = '<iframe></iframe>';
      const pending = create().renderV2(container, vi.fn());
      const grecaptcha = finishLoadingScript();
      const challenge = await pending;

      challenge.reset();
      challenge.remove();

      expect(grecaptcha.reset).toHaveBeenCalledWith(7);
      expect(container.childElementCount).toBe(0);
    });
  });

  describe('when the script cannot be loaded', () => {
    it('is unavailable when the script fails to load', async () => {
      const pending = create().executeV3('register');
      scripts()[0]?.dispatchEvent(new Event('error'));

      await expect(pending).rejects.toBeInstanceOf(CaptchaUnavailableError);
    });

    it('is unavailable when Google does not answer in time', async () => {
      vi.useFakeTimers();
      const pending = create(10_000).executeV3('register');
      const result = pending.catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(10_000);

      expect(await result).toBeInstanceOf(CaptchaUnavailableError);
    });

    it('is unavailable for the challenge too', async () => {
      const pending = create().renderV2(document.createElement('div'), vi.fn());
      scripts()[0]?.dispatchEvent(new Event('error'));

      await expect(pending).rejects.toBeInstanceOf(CaptchaUnavailableError);
    });

    it('tries again with a new script on the next call, after a failure', async () => {
      const client = create();
      const failed = client.executeV3('register');
      scripts()[0]?.dispatchEvent(new Event('error'));
      await failed.catch(() => undefined);
      expect(scripts()).toHaveLength(0);

      const retry = client.executeV3('register');
      expect(scripts()).toHaveLength(1);
      finishLoadingScript();

      await expect(retry).resolves.toMatch(/^token-v3-/);
    });
  });
});
