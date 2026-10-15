import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import { AccountSuspended, InvalidCredentials } from '../../domain/login/loginErrors.js';
import type { RefreshTokenRepository } from '../../domain/session/refreshTokenRepository.js';
import type { UserCredentialsRepository } from '../../domain/user/userCredentialsRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { AttemptLimiter } from '../attempts/attemptLimiter.js';
import type { PasswordHasher } from '../credentials/passwordHasher.js';
import { maskEmail } from '../registration/maskEmail.js';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
  type CaptchaVerifier,
} from '../registration/captchaVerifier.js';
import type { RequestContext } from '../requestContext.js';
import type { CreateSession } from '../session/createSession.js';
import { ValidationError } from '../validationError.js';
import { parseLoginRequest } from './loginRequest.js';

/** Ventana deslizante del límite de intentos fallidos de login: 15 minutos (US02). */
export const LOGIN_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;

/** Resultado del login: el refresh token en claro, solo para que la capa HTTP lo ponga en la cookie. */
export interface LogInResult {
  refreshToken: string;
}

export interface LogInDependencies {
  attemptLimiter: Pick<AttemptLimiter, 'consume' | 'release'>;
  captchaVerifier: CaptchaVerifier;
  userCredentialsRepository: UserCredentialsRepository;
  passwordHasher: Pick<PasswordHasher, 'verify'>;
  createSession: Pick<CreateSession, 'create'>;
  refreshTokenRepository: Pick<RefreshTokenRepository, 'save'>;
  logger: ApplicationLogger;
}

/**
 * Caso de uso: inicia la sesión de un usuario con su email y su contraseña. Sigue el orden de
 * procesamiento de US02: validación → límite de intentos fallidos por IP → captcha → credenciales →
 * estado de la cuenta → sesión. La comprobación del `Origin` (paso 1) es de la capa HTTP.
 */
export class LogIn {
  constructor(private readonly dependencies: LogInDependencies) {}

  async execute(body: unknown, context: RequestContext): Promise<LogInResult> {
    const raw = isRecord(body) ? body : {};

    const parsed = parseLoginRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { email, password } = parsed.data;

    const attemptId = await this.reserveAttempt(email, context);
    await this.verifyCaptcha(raw.captcha, email, context);
    const user = await this.checkCredentials(email, password, context);

    if (user.status === 'SUSPENDED') {
      // La contraseña es correcta: el intento no es un fallo, pero la cuenta no puede entrar.
      await this.releaseAttempt(attemptId, email, context);
      this.logFailed('SUSPENDED', email, context);
      throw new AccountSuspended();
    }

    // La contraseña es correcta y la cuenta está activa: el intento no cuenta y se abre una sesión nueva.
    await this.releaseAttempt(attemptId, email, context);
    // Una cookie `refresh_token` recibida con la petición ni se lee ni se revoca: la sesión es siempre nueva.
    const session = this.dependencies.createSession.create(user.id);
    await this.dependencies.refreshTokenRepository.save(session.refreshToken);

    this.dependencies.logger.info(
      { ...this.eventContext('USER_LOGIN_SUCCESS', email, context), user_id: user.id },
      'Sesión iniciada',
    );
    return { refreshToken: session.token };
  }

  /**
   * Busca al usuario y compara la contraseña (paso 5). Se compara siempre, también cuando el email
   * no existe o el usuario está eliminado (contra un hash ficticio), para que la respuesta cueste lo
   * mismo. Un fallo deja el intento contado.
   *
   * @throws InvalidCredentials si el email no existe, el usuario está eliminado o la contraseña no coincide
   */
  private async checkCredentials(
    email: string,
    password: string,
    context: RequestContext,
  ): Promise<{ id: string; status: 'ACTIVE' | 'SUSPENDED' }> {
    const { userCredentialsRepository, passwordHasher } = this.dependencies;

    const found = await userCredentialsRepository.findByEmail(email);
    // Para el cliente, un usuario eliminado no existe.
    const user = found !== null && found.status !== 'DELETED' ? found : null;

    const matches = await passwordHasher.verify(password, user?.passwordHash ?? null);
    if (user === null) {
      this.logFailed('NOT_FOUND', email, context);
      throw new InvalidCredentials('NOT_FOUND');
    }
    if (!matches) {
      this.logFailed('PASSWORD', email, context);
      throw new InvalidCredentials('PASSWORD');
    }
    return { id: user.id, status: user.status as 'ACTIVE' | 'SUSPENDED' };
  }

  /**
   * Libera el intento reservado (la contraseña era correcta). Si falla, el login no se interrumpe:
   * el usuario ya ha demostrado conocer la contraseña y lo único que ocurre es que el intento sigue
   * contando para el límite. Se registra para poder detectarlo.
   */
  private async releaseAttempt(
    attemptId: string,
    email: string,
    context: RequestContext,
  ): Promise<void> {
    try {
      await this.dependencies.attemptLimiter.release(attemptId);
    } catch (error) {
      this.dependencies.logger.warn(
        {
          ...this.eventContext('LOGIN_ATTEMPT_RELEASE_FAILED', email, context),
          error: error instanceof Error ? error.message : String(error),
        },
        'No se ha podido liberar el intento de login: seguirá contando para el límite',
      );
    }
  }

  private logFailed(
    reason: 'PASSWORD' | 'NOT_FOUND' | 'SUSPENDED',
    email: string,
    context: RequestContext,
  ): void {
    this.dependencies.logger.warn(
      { ...this.eventContext('USER_LOGIN_FAILED', email, context), reason },
      'Login rechazado',
    );
  }

  /**
   * Reserva el intento contra el límite de la IP (paso 3), antes del captcha y de cualquier consulta
   * de usuarios. Se libera solo si la contraseña resulta correcta; cualquier otro final lo deja contado.
   */
  private async reserveAttempt(email: string, context: RequestContext): Promise<string> {
    try {
      // Las peticiones sin IP identificable comparten un único contador, lo que falla del lado seguro.
      return await this.dependencies.attemptLimiter.consume(`login:${context.ip ?? 'unknown'}`);
    } catch (error) {
      if (error instanceof TooManyAttempts) {
        this.dependencies.logger.warn(
          {
            ...this.eventContext('USER_LOGIN_RATE_LIMITED', email, context),
            retry_after: error.retryAfterSeconds,
          },
          'Login rechazado: se ha superado el número máximo de intentos fallidos',
        );
      }
      throw error;
    }
  }

  /**
   * Verifica el captcha con la acción `login` (paso 4) y registra el resultado: el reto pedido
   * (`info`, con el score) y la verificación fallida (`warn`, con el motivo y la versión). Nunca
   * registra el token. La indisponibilidad de Google la registra el manejador central de errores.
   */
  private async verifyCaptcha(
    captcha: unknown,
    email: string,
    context: RequestContext,
  ): Promise<void> {
    try {
      await this.dependencies.captchaVerifier.verify(captcha, 'login');
    } catch (error) {
      if (error instanceof CaptchaChallengeRequired) {
        this.dependencies.logger.info(
          {
            ...this.eventContext('USER_LOGIN_CAPTCHA_CHALLENGE', email, context),
            score: error.score,
          },
          'Login: el score de reCAPTCHA es bajo, se pide el reto v2',
        );
      } else if (error instanceof CaptchaFailed) {
        this.dependencies.logger.warn(
          {
            ...this.eventContext('USER_LOGIN_CAPTCHA_FAILED', email, context),
            reason: error.reason,
            version: captchaVersion(captcha),
          },
          'Login rechazado: la verificación de reCAPTCHA ha fallado',
        );
      }
      throw error;
    }
  }

  /** Contexto común de los eventos: email enmascarado, IP y user agent; nunca la contraseña. */
  private eventContext(event: string, email: unknown, context: RequestContext) {
    return {
      event,
      email: maskEmail(email),
      ip: context.ip,
      user_agent: context.userAgent,
    };
  }
}

/** Versión del captcha (`v3` o `v2`) si el campo la trae, para el log; si no, `undefined`. */
function captchaVersion(captcha: unknown): string | undefined {
  return isRecord(captcha) && (captcha.version === 'v3' || captcha.version === 'v2')
    ? captcha.version
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
