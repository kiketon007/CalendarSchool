import type { SchoolUser } from '../../domain/user/schoolUser.js';
import type { SchoolUserRepository } from '../../domain/user/schoolUserRepository.js';

/**
 * Caso de uso: lista los usuarios de un colegio. El colegio lo toma el router de la identidad de la
 * petición y nunca de lo que envía el cliente.
 */
export class ListSchoolUsers {
  constructor(
    private readonly dependencies: {
      schoolUserRepository: Pick<SchoolUserRepository, 'listBySchool'>;
      /** Reloj inyectado: decide qué restablecimientos de contraseña siguen pendientes. */
      now: () => Date;
    },
  ) {}

  execute({ schoolId }: { schoolId: string }): Promise<SchoolUser[]> {
    const { schoolUserRepository, now } = this.dependencies;
    return schoolUserRepository.listBySchool(schoolId, now());
  }
}
