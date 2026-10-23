import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { StudentNotFound } from '../../domain/student/studentErrors.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { DeleteStudent } from './deleteStudent.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1', studentId: 's1' } as const;

describe('DeleteStudent', () => {
  let remove: Mock<StudentRepository['delete']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: DeleteStudent;

  beforeEach(() => {
    remove = vi.fn<StudentRepository['delete']>().mockResolvedValue(true);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new DeleteStudent({
      studentRepository: { delete: remove },
      logger: { info, warn },
    });
  });

  it('deletes the student of the school of the identity and returns its id', async () => {
    await expect(useCase.execute(identity)).resolves.toEqual({ id: 's1' });

    expect(remove).toHaveBeenCalledExactlyOnceWith('school-1', 's1');
  });

  it('throws StudentNotFound, without logging anything, when the student is not in the school', async () => {
    remove.mockResolvedValue(false);

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(StudentNotFound);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs STUDENT_DELETED only with the identifiers', async () => {
    await useCase.execute(identity);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'STUDENT_DELETED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        student_id: 's1',
      },
      expect.any(String),
    );
  });

  it('lets a database failure through without logging a deletion', async () => {
    remove.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(DatabaseUnavailable);
    expect(info).not.toHaveBeenCalled();
  });
});
