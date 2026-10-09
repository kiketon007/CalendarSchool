import type { Municipality } from '../../domain/municipality/municipality.js';
import type { MunicipalityRepository } from '../../domain/municipality/municipalityRepository.js';
import {
  EmailAlreadyRegistered,
  SchoolAlreadyRegistered,
} from '../../domain/registration/registrationErrors.js';
import type { RegistrationRepository } from '../../domain/registration/registrationRepository.js';
import { normalizeSchoolName } from '../../domain/school/normalizeSchoolName.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { RequestContext } from '../requestContext.js';
import type { CreateSession } from '../session/createSession.js';
import { ValidationError } from '../validationError.js';
import type { CaptchaVerifier } from './captchaVerifier.js';
import type { IdGenerator } from './idGenerator.js';
import { maskEmail } from './maskEmail.js';
import type { PasswordHasher } from './passwordHasher.js';
import { parseRegisterSchoolRequest } from './registerSchoolRequest.js';

/** Datos del alta que se devuelven al cliente: nunca incluyen la contraseña, su hash ni tokens. */
export interface Registration {
  user: { id: string; email: string; firstName: string; lastName: string };
  school: { id: string; name: string; municipality: Municipality };
}

/**
 * Resultado del alta. El refresh token en claro va aparte de `registration` para que la capa
 * HTTP lo ponga en la cookie y nunca acabe en el cuerpo de la respuesta.
 */
export interface RegisterSchoolResult {
  registration: Registration;
  refreshToken: string;
}

export interface RegisterSchoolDependencies {
  registrationRepository: RegistrationRepository;
  municipalityRepository: MunicipalityRepository;
  passwordHasher: PasswordHasher;
  idGenerator: IdGenerator;
  captchaVerifier: CaptchaVerifier;
  createSession: Pick<CreateSession, 'create'>;
  logger: ApplicationLogger;
}

/**
 * Caso de uso: registra un colegio y su usuario administrador e inicia su sesión. Sigue el orden
 * de procesamiento de US01: captcha → validación del payload → email existente → colegio
 * existente → alta, que guarda el refresh token de la sesión en la misma transacción (US01_c).
 * El límite de intentos (paso 1) es un middleware previo que añade US01_d.
 */
export class RegisterSchool {
  constructor(private readonly dependencies: RegisterSchoolDependencies) {}

  async execute(body: unknown, context: RequestContext): Promise<RegisterSchoolResult> {
    const { captchaVerifier, municipalityRepository, registrationRepository } = this.dependencies;
    const raw = isRecord(body) ? body : {};

    await captchaVerifier.verify(raw.captcha);

    const parsed = parseRegisterSchoolRequest(body);
    if (!parsed.success) {
      this.logFailed(raw.email, context);
      throw new ValidationError(parsed.details);
    }
    const input = parsed.data;

    const municipality = await municipalityRepository.findByCode(input.municipalityCode);
    if (!municipality) {
      this.logFailed(input.email, context);
      throw new ValidationError([{ field: 'municipalityCode', code: 'INVALID_FORMAT' }]);
    }

    const normalizedName = normalizeSchoolName(input.schoolName);
    if (await registrationRepository.existsUserByEmail(input.email)) {
      this.logDuplicate('EMAIL', input.email, context);
      throw new EmailAlreadyRegistered();
    }
    if (await registrationRepository.existsSchool(normalizedName, municipality.code)) {
      this.logDuplicate('SCHOOL', input.email, context);
      throw new SchoolAlreadyRegistered();
    }

    const schoolId = this.dependencies.idGenerator.generate();
    const userId = this.dependencies.idGenerator.generate();
    const passwordHash = await this.dependencies.passwordHasher.hash(input.password);
    const session = this.dependencies.createSession.create(userId, context);

    try {
      await registrationRepository.createSchoolWithAdmin(
        {
          id: schoolId,
          name: input.schoolName,
          normalizedName,
          municipalityCode: municipality.code,
        },
        {
          id: userId,
          schoolId,
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        session.refreshToken,
      );
    } catch (error) {
      // Altas simultáneas: la base de datos detecta el duplicado que la comprobación previa no vio.
      if (error instanceof EmailAlreadyRegistered) {
        this.logDuplicate('EMAIL', input.email, context);
      } else if (error instanceof SchoolAlreadyRegistered) {
        this.logDuplicate('SCHOOL', input.email, context);
      }
      throw error;
    }

    this.dependencies.logger.info(
      this.eventContext('USER_REGISTER_SUCCESS', input.email, context),
      'Colegio y usuario administrador registrados',
    );
    return {
      registration: {
        user: {
          id: userId,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
        },
        school: { id: schoolId, name: input.schoolName, municipality },
      },
      refreshToken: session.token,
    };
  }

  private logFailed(email: unknown, context: RequestContext): void {
    this.dependencies.logger.warn(
      this.eventContext('USER_REGISTER_FAILED', email, context),
      'Registro rechazado: la petición contiene campos no válidos',
    );
  }

  private logDuplicate(reason: 'EMAIL' | 'SCHOOL', email: string, context: RequestContext): void {
    this.dependencies.logger.warn(
      { ...this.eventContext('USER_REGISTER_DUPLICATE', email, context), reason },
      reason === 'EMAIL'
        ? 'Registro rechazado: el email ya está registrado'
        : 'Registro rechazado: el colegio ya está registrado en ese municipio',
    );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
