import type { SchoolUser } from '../../domain/user/schoolUser.js';
import type { SchoolUserRepository } from '../../domain/user/schoolUserRepository.js';

/**
 * Caso de uso: lista los usuarios de un colegio. El colegio lo toma el router de la identidad de la
 * petición y nunca de lo que envía el cliente.
 */
export class ListSchoolUsers {
  constructor(private readonly schoolUserRepository: Pick<SchoolUserRepository, 'listBySchool'>) {}

  execute({ schoolId }: { schoolId: string }): Promise<SchoolUser[]> {
    return this.schoolUserRepository.listBySchool(schoolId);
  }
}
