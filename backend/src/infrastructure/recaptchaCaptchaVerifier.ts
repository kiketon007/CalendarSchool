import { z } from 'zod';
import { parseCaptchaInput } from '../application/registration/captchaInput.js';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
  CaptchaUnavailable,
  type CaptchaVerifier,
} from '../application/registration/captchaVerifier.js';

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/** Score mínimo de reCAPTCHA v3 para aceptar el registro (US01_e): por debajo se pide el reto v2. */
export const RECAPTCHA_V3_MIN_SCORE = 0.6;

/** Acción con la que el frontend obtiene los tokens v3 del registro. */
export const RECAPTCHA_REGISTER_ACTION = 'register';

/** Tiempo máximo de espera a Google: dentro de los 10 segundos del timeout de la petición. */
const DEFAULT_TIMEOUT_MS = 3000;

/** Respuesta de `siteverify`; solo se leen los campos que se usan. */
const siteverifyResponseSchema = z.object({
  success: z.boolean(),
  score: z.number().optional(),
  action: z.string().optional(),
  hostname: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
});
type SiteverifyResponse = z.infer<typeof siteverifyResponseSchema>;

/** Errores de `siteverify` que son un fallo de nuestra configuración, no del usuario. */
const SECRET_ERROR_CODES = new Set(['missing-input-secret', 'invalid-input-secret']);

export interface RecaptchaCaptchaVerifierOptions {
  /** Secreto de la clave v3 (por score). */
  v3Secret: string;
  /** Secreto de la clave v2 (reto). */
  v2Secret: string;
  /** Dominio de la aplicación (el de `APP_ORIGIN`): el token debe haberse resuelto en él. */
  expectedHostname: string;
  /** Tiempo máximo de espera a Google; por defecto, 3 segundos. */
  timeoutMs?: number;
  /** `fetch` inyectable para probar sin red. */
  fetch?: typeof fetch;
}

/**
 * Verificador de captcha con Google reCAPTCHA. Verifica el token con `siteverify` usando el secreto
 * de su versión y falla cerrado: si no puede completar la verificación, lanza `CaptchaUnavailable`
 * en lugar de dejar pasar el registro. Los secretos y los tokens nunca van en los errores.
 */
export class RecaptchaCaptchaVerifier implements CaptchaVerifier {
  private readonly secrets: Record<'v3' | 'v2', string>;
  private readonly expectedHostname: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(options: RecaptchaCaptchaVerifierOptions) {
    this.secrets = { v3: options.v3Secret, v2: options.v2Secret };
    this.expectedHostname = options.expectedHostname;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async verify(captcha: unknown): Promise<void> {
    const { version, token } = parseCaptchaInput(captcha);
    const result = await this.callGoogle(this.secrets[version], token);

    if (!result.success) {
      throw this.failureOf(result, version);
    }
    if (result.hostname !== this.expectedHostname) {
      throw new CaptchaFailed('HOSTNAME_MISMATCH');
    }
    if (version === 'v2') {
      return;
    }
    if (result.action !== RECAPTCHA_REGISTER_ACTION) {
      throw new CaptchaFailed('ACTION_MISMATCH');
    }
    if (result.score === undefined) {
      // Una clave v3 siempre devuelve el score: que falte indica una clave de otro tipo.
      throw new CaptchaUnavailable(new Error('La respuesta de reCAPTCHA v3 no incluye el score'));
    }
    if (result.score < RECAPTCHA_V3_MIN_SCORE) {
      throw new CaptchaChallengeRequired(result.score);
    }
  }

  /** Pregunta a Google y valida la forma de la respuesta; cualquier fallo es indisponibilidad. */
  private async callGoogle(secret: string, token: string): Promise<SiteverifyResponse> {
    let body: unknown;
    try {
      const response = await this.fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }).toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Google respondió con el estado ${response.status}`);
      }
      body = await response.json();
    } catch (error) {
      throw new CaptchaUnavailable(error);
    }

    const parsed = siteverifyResponseSchema.safeParse(body);
    if (!parsed.success) {
      throw new CaptchaUnavailable(new Error('Respuesta inesperada de reCAPTCHA'));
    }
    return parsed.data;
  }

  /** Traduce una respuesta `success: false` de Google al error que corresponde. */
  private failureOf(result: SiteverifyResponse, version: 'v3' | 'v2'): Error {
    const codes = result['error-codes'] ?? [];
    const secretError = codes.find((code) => SECRET_ERROR_CODES.has(code));
    if (secretError) {
      return new CaptchaUnavailable(
        new Error(`reCAPTCHA indica un secreto inválido: ${secretError}`),
      );
    }
    if (codes.includes('timeout-or-duplicate')) {
      return new CaptchaFailed('EXPIRED_OR_DUPLICATE');
    }
    // Un reto v2 sin motivo es un reto no superado; con un motivo del token, un token inválido.
    return new CaptchaFailed(
      version === 'v2' && codes.length === 0 ? 'CHALLENGE_FAILED' : 'INVALID',
    );
  }
}
