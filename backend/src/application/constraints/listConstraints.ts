import type { ListedConstraint } from '../../domain/constraints/constraintList.js';
import type { ConstraintListRepository } from '../../domain/constraints/constraintListRepository.js';
import { buildConstraintList } from './buildConstraintList.js';

/**
 * Caso de uso: lista las reglas de reparto de todo el colegio con sus avisos (US20). Es una lectura: no
 * registra eventos y no cambia nada. El colegio lo toma el router de la identidad de la petición y nunca de lo
 * que envía el cliente; un fallo de la base de datos llega tal cual al manejador de errores.
 */
export class ListConstraints {
  constructor(
    private readonly dependencies: {
      constraintListRepository: Pick<ConstraintListRepository, 'listBySchool'>;
    },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<ListedConstraint[]> {
    const snapshot = await this.dependencies.constraintListRepository.listBySchool(schoolId);
    return buildConstraintList(snapshot);
  }
}
