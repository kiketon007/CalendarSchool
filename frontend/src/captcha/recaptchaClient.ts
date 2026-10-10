import {
  CaptchaUnavailableError,
  type CaptchaChallenge,
  type CaptchaClient,
} from './captchaClient';

/** Parte de la API de `grecaptcha` que usa el formulario de registro. */
interface Grecaptcha {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
  render(
    container: HTMLElement,
    parameters: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
    },
  ): number;
  reset(widgetId: number): void;
}

declare global {
  interface Window {
    /** Lo define el script de Google al cargarse. */
    grecaptcha?: Grecaptcha;
  }
}

/** Tiempo máximo hasta que `grecaptcha` está listo; después se trata como indisponibilidad. */
const DEFAULT_LOAD_TIMEOUT_MS = 10_000;

export interface RecaptchaClientOptions {
  /** Clave de sitio de la clave v3 (por score). */
  siteKeyV3: string;
  /** Clave de sitio de la clave v2 (reto). */
  siteKeyV2: string;
  loadTimeoutMs?: number;
}

/**
 * Cliente de captcha con reCAPTCHA de Google. El script solo se carga la primera vez que se pide un
 * token o un reto (es decir, en la página de registro, no en toda la aplicación) y una sola vez.
 * Si no carga o no responde a tiempo, se descarta para poder reintentarlo en la siguiente llamada.
 */
export function createRecaptchaClient({
  siteKeyV3,
  siteKeyV2,
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
}: RecaptchaClientOptions): CaptchaClient {
  let loading: Promise<Grecaptcha> | undefined;

  /** `grecaptcha` listo para usar, cargando el script si hace falta. */
  function load(): Promise<Grecaptcha> {
    loading ??= new Promise<Grecaptcha>((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => {
        fail(new Error('reCAPTCHA no ha respondido a tiempo'));
      }, loadTimeoutMs);

      const fail = (cause: unknown) => {
        clearTimeout(timer);
        script.remove();
        loading = undefined;
        reject(new CaptchaUnavailableError(cause));
      };
      const succeed = () => {
        const { grecaptcha } = window;
        if (!grecaptcha) {
          fail(new Error('El script de reCAPTCHA no ha definido grecaptcha'));
          return;
        }
        grecaptcha.ready(() => {
          clearTimeout(timer);
          resolve(grecaptcha);
        });
      };

      if (window.grecaptcha) {
        succeed();
        return;
      }
      script.src = `https://www.google.com/recaptcha/api.js?render=${siteKeyV3}`;
      script.async = true;
      script.addEventListener('load', succeed);
      script.addEventListener('error', () => {
        fail(new Error('No se ha podido cargar el script de reCAPTCHA'));
      });
      document.head.append(script);
    });
    return loading;
  }

  return {
    async executeV3(action) {
      const grecaptcha = await load();
      try {
        return await grecaptcha.execute(siteKeyV3, { action });
      } catch (cause) {
        throw new CaptchaUnavailableError(cause);
      }
    },

    async renderV2(container, onToken): Promise<CaptchaChallenge> {
      const grecaptcha = await load();
      let widgetId: number;
      try {
        widgetId = grecaptcha.render(container, {
          sitekey: siteKeyV2,
          callback: (token) => {
            onToken(token);
          },
          'expired-callback': () => {
            onToken(undefined);
          },
        });
      } catch (cause) {
        throw new CaptchaUnavailableError(cause);
      }
      return {
        reset() {
          grecaptcha.reset(widgetId);
        },
        remove() {
          container.replaceChildren();
        },
      };
    },
  };
}
