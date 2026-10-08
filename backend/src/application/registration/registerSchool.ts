import type { Municipality } from '../../domain/municipality/municipality.js';
import type { MunicipalityRepository } from '../../domain/municipality/municipalityRepository.js';
import {
  EmailAlreadyRegistered,
  SchoolAlreadyRegistered,
} from '../../domain/registration/registrationErrors.js';
import type { RegistrationRepository } from '../../domain/registration/registrationRepository.js';
import { normalizeSchoolName } from '../../domain/school/normalizeSchoolName.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { ValidationError } from '../validationError.js';
import type { CaptchaVerifier } from './captchaVerifier.js';
import type { IdGenerator } from './idGenerator.js';
import { maskEmail } from './maskEmail.js';
import type { PasswordHasher } from './passwordHasher.js';
import { parseRegisterSchoolRequest } from './registerSchoolRequest.js';

/** Datos de la petición HTTP que se registran en los eventos. */
export interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

/** Resultado del alta: nunca incluye la contraseña ni su hash. */
export interface RegisterSchoolResult {
  user: { id: string; email: string; firstName: string; lastName: string };
  school: { id: string; name: string; municipality: Municipality };
}

export interface RegisterSchoolDependencies {
  registrationRepository: RegistrationRepository;
  municipalityRepository: MunicipalityRepository;
  passwordHasher: PasswordHasher;
  idGenerator: IdGenerator;
  captchaVerifier: CaptchaVerifier;
  logger: ApplicationLogger;
}

/**
 * Caso de uso: registra un colegio y su usuario administrador. Sigue el orden de procesamiento
 * de US01: captcha → validación del payload → email existente → colegio existente → alta.
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
      user: {
        id: userId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      },
      school: { id: schoolId, name: input.schoolName, municipality },
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
