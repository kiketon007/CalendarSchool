import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SubjectNotFound } from '../../domain/subject/subjectErrors.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { DeleteSubject } from './deleteSubject.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1', subjectId: 's1' } as const;

describe('DeleteSubject', () => {
  let remove: Mock<SubjectRepository['delete']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: DeleteSubject;

  beforeEach(() => {
    remove = vi.fn<SubjectRepository['delete']>().mockResolvedValue({ assignmentCount: 0 });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new DeleteSubject({
      subjectRepository: { delete: remove },
      logger: { info, warn },
    });
  });

  it('deletes the subject of the school of the identity and returns its id', async () => {
    await expect(useCase.execute(identity)).resolves.toEqual({ id: 's1' });

    expect(remove).toHaveBeenCalledExactlyOnceWith('school-1', 's1');
  });

  it('throws SubjectNotFound, without logging anything, when the subject is not in the school', async () => {
    remove.mockResolvedValue(null);

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(SubjectNotFound);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs SUBJECT_DELETED only with the identifiers and the assignments that fell with it', async () => {
    remove.mockResolvedValue({ assignmentCount: 3 });

    await useCase.execute(identity);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SUBJECT_DELETED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        subject_id: 's1',
        assignment_count: 3,
      },
      expect.any(String),
    );
  });

  it('lets a database failure through without logging a deletion', async () => {
    remove.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(DatabaseUnavailable);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
