import { accessLinkExpiresAt } from '../../domain/accessLink/accessLink.js';
import { PasswordResetAlreadyPending } from '../../domain/accessLink/accessLinkErrors.js';
import type {
  AccessLinkRepository,
  CreatePasswordResetResult,
  NewPasswordReset,
} from '../../domain/accessLink/accessLinkRepository.js';
import { UserNotActive, UserNotFound } from '../../domain/user/userManagementErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import type { SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';

export interface CreatePasswordResetDependencies {
  accessLinkRepository: Pick<AccessLinkRepository, 'createPasswordReset'>;
  secretTokenGenerator: Pick<SecretTokenGenerator, 'generate'>;
  idGenerator: IdGenerator;
  /** Origen de la aplicación (`APP_ORIGIN`, sin barra final): el enlace apunta a su página de restablecimiento. */
  appOrigin: string;
  now: () => Date;
  logger: ApplicationLogger;
}

export interface CreatePasswordResetInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Administrador que genera el enlace, de la identidad de la petición. */
  actorId: string;
  /** Usuario cuya contraseña se restablecerá. */
  userId: string;
}

export interface CreatedPasswordReset {
  readonly passwordReset: {
    readonly userId: string;
    readonly createdAt: Date;
    readonly expiresAt: Date;
  };
  /** Enlace completo con el token en el fragmento. Solo existe en esta respuesta: no se guarda ni se registra. */
  readonly url: string;
}

/**
 * Caso de uso: genera el enlace de restablecimiento de contraseña de un usuario activo del colegio.
 * El token es aleatorio y solo se guarda su hash; el enlace (`<origen>/restablecer#<token>`) se
 * construye aquí y se devuelve una única vez. Generar otro revoca el anterior del usuario (lo hace el
 * repositorio en la misma transacción). Si dos administradores generan a la vez y el índice único
 * parcial rechaza al segundo, se reintenta una vez con el mismo token; un segundo choque se propaga.
 * Registra `PASSWORD_RESET_LINK_CREATED` sin el token, su hash ni el enlace.
 *
 * @throws UserNotFound si el usuario no es de este colegio, no existe o está eliminado
 * @throws UserNotActive si el usuario está dado de baja
 */
export class CreatePasswordReset {
  constructor(private readonly dependencies: CreatePasswordResetDependencies) {}

  async execute({
    schoolId,
    actorId,
    userId,
  }: CreatePasswordResetInput): Promise<CreatedPasswordReset> {
    const { secretTokenGenerator, idGenerator, appOrigin, now, logger } = this.dependencies;

    const { token, hash } = secretTokenGenerator.generate();
    const instant = now();
    const expiresAt = accessLinkExpiresAt(instant);
    const reset: NewPasswordReset = {
      id: idGenerator.generate(),
      schoolId,
      userId,
      createdById: actorId,
      tokenHash: hash,
      expiresAt,
      now: instant,
    };

    const result = await this.createWithOneRetry(reset);
    if (result.outcome === 'notFound') {
      throw new UserNotFound();
    }
    if (result.outcome === 'notActive') {
      throw new UserNotActive();
    }

    logger.info(
      {
        event: 'PASSWORD_RESET_LINK_CREATED',
        school_id: schoolId,
        actor_id: actorId,
        user_id: userId,
        replaced: result.replaced > 0,
      },
      'Enlace de restablecimiento de contraseña generado',
    );
    return {
      passwordReset: { userId, createdAt: result.createdAt, expiresAt },
      url: `${appOrigin}/restablecer#${token}`,
    };
  }

  private async createWithOneRetry(reset: NewPasswordReset): Promise<CreatePasswordResetResult> {
    const { accessLinkRepository } = this.dependencies;
    try {
      return await accessLinkRepository.createPasswordReset(reset);
    } catch (error) {
      if (!(error instanceof PasswordResetAlreadyPending)) {
        throw error;
      }
      // Otra generación se coló entre la revocación y la inserción: esta vez revoca la suya.
      return accessLinkRepository.createPasswordReset(reset);
    }
  }
}
