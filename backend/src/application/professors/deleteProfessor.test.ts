import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { DeletedProfessor } from '../../domain/professor/professor.js';
import { ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { DeleteProfessor } from './deleteProfessor.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1', professorId: 'p1' } as const;

const withClass: DeletedProfessor = {
  freedClass: { id: 'c1', name: 'A', courseName: '1º Primaria' },
};
const withoutClass: DeletedProfessor = { freedClass: null };

describe('DeleteProfessor', () => {
  let remove: Mock<ProfessorRepository['delete']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: DeleteProfessor;

  beforeEach(() => {
    remove = vi.fn<ProfessorRepository['delete']>().mockResolvedValue(withClass);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new DeleteProfessor({
      professorRepository: { delete: remove },
      logger: { info, warn },
    });
  });

  it('deletes the professor of the school of the identity and returns what was freed', async () => {
    await expect(useCase.execute(identity)).resolves.toEqual(withClass);

    expect(remove).toHaveBeenCalledExactlyOnceWith('school-1', 'p1');
  });

  it('returns no freed class for a professor who tutored none', async () => {
    remove.mockResolvedValue(withoutClass);

    await expect(useCase.execute(identity)).resolves.toEqual(withoutClass);
  });

  it('throws ProfessorNotFound, without logging anything, when the professor is not in the school', async () => {
    remove.mockResolvedValue(null);

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(ProfessorNotFound);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['with a freed class', withClass, true],
    ['without a freed class', withoutClass, false],
  ])(
    'logs PROFESSOR_DELETED %s, only with identifiers and no names',
    async (_name, deleted, freed) => {
      remove.mockResolvedValue(deleted);

      await useCase.execute(identity);

      expect(info).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'PROFESSOR_DELETED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          professor_id: 'p1',
          freed_class: freed,
        },
        expect.any(String),
      );
      expect(JSON.stringify(info.mock.calls)).not.toMatch(/1º Primaria/);
    },
  );

  it('lets a database failure through without logging a deletion', async () => {
    remove.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(DatabaseUnavailable);
    expect(info).not.toHaveBeenCalled();
  });
});
