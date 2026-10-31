import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Professor, ProfessorUpdate, TutoredClass } from '../../domain/professor/professor.js';
import { ProfessorAlreadyTutor } from '../../domain/course/courseErrors.js';
import { ClassNotFound } from '../../domain/professor/professorErrors.js';
import { ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { ValidationError } from '../validationError.js';
import { UpdateProfessor } from './updateProfessor.js';

const CLASS_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const identity = { schoolId: 'school-1', actorId: 'actor-1', professorId: 'p1' } as const;
const body = { firstName: 'Ana', lastName: 'García' };

const tutorOf = (name: string): TutoredClass => ({
  id: CLASS_ID,
  name,
  courseId: 'k1',
  courseName: '1º Primaria',
});

const before: Professor = {
  id: 'p1',
  firstName: 'Ana',
  lastName: 'García',
  position: null,
  subjects: [],
  unavailableCount: 0,
  tutoredClass: tutorOf('A'),
};

const unchanged: ProfessorUpdate = { before, after: before, replacedTutor: null };

describe('UpdateProfessor', () => {
  let update: Mock<ProfessorRepository['update']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: UpdateProfessor;

  beforeEach(() => {
    update = vi.fn<ProfessorRepository['update']>().mockResolvedValue(unchanged);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new UpdateProfessor({ professorRepository: { update }, logger: { info, warn } });
  });

  it('passes the cleaned final state under the school of the identity, leaving the class alone when absent', async () => {
    await useCase.execute({ ...identity, body: { firstName: ' Ana  ', lastName: 'García' } });

    expect(update).toHaveBeenCalledExactlyOnceWith('school-1', 'p1', {
      firstName: 'Ana',
      lastName: 'García',
      position: null,
      classId: undefined,
    });
  });

  it('passes the position and a class, or null for no class', async () => {
    await useCase.execute({
      ...identity,
      body: { ...body, position: 'DIRECTOR', classId: CLASS_ID },
    });
    await useCase.execute({ ...identity, body: { ...body, classId: null } });

    expect(update.mock.calls.map((call) => call[2])).toEqual([
      { firstName: 'Ana', lastName: 'García', position: 'DIRECTOR', classId: CLASS_ID },
      { firstName: 'Ana', lastName: 'García', position: null, classId: null },
    ]);
  });

  it('returns the professor and the replaced tutor', async () => {
    const after: Professor = { ...before, tutoredClass: tutorOf('B') };
    const replacedTutor = { id: 'p2', firstName: 'Luis', lastName: 'Pérez' };
    update.mockResolvedValue({ before, after, replacedTutor });

    await expect(useCase.execute({ ...identity, body })).resolves.toEqual({
      professor: after,
      replacedTutor,
    });
  });

  it('throws ValidationError with a detail per invalid field and does not touch the repository', async () => {
    await expect(
      useCase.execute({ ...identity, body: { firstName: '', lastName: 'x', classId: 'abc' } }),
    ).rejects.toEqual(
      new ValidationError([
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'classId', code: 'INVALID_FORMAT' },
      ]),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('throws ProfessorNotFound when the repository does not find the professor, and logs the rejection', async () => {
    update.mockResolvedValue(null);

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(ProfessorNotFound);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'PROFESSOR_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'not_found',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('turns ClassNotFound into an error of the classId field and logs the rejection', async () => {
    update.mockRejectedValue(new ClassNotFound());

    await expect(
      useCase.execute({ ...identity, body: { ...body, classId: CLASS_ID } }),
    ).rejects.toEqual(new ValidationError([{ field: 'classId', code: 'NOT_FOUND' }]));
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ event: 'PROFESSOR_UPDATE_REJECTED', reason: 'class_not_found' }),
      expect.any(String),
    );
  });

  it('lets other errors through, such as a race on the tutorship, without logging an update', async () => {
    update.mockRejectedValue(new ProfessorAlreadyTutor());

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      ProfessorAlreadyTutor,
    );
    expect(info).not.toHaveBeenCalled();
  });

  describe('PROFESSOR_UPDATED', () => {
    it('does not log when nothing changed', async () => {
      await useCase.execute({ ...identity, body });

      expect(info).not.toHaveBeenCalled();
    });

    it.each([
      ['firstName', { firstName: 'Anabel' }, ['firstName']],
      ['lastName', { lastName: 'Gil' }, ['lastName']],
      ['position', { position: 'DIRECTOR' as const }, ['position']],
    ])('logs the changed %s and no tutor change', async (_name, change, expected) => {
      update.mockResolvedValue({
        before,
        after: { ...before, ...change },
        replacedTutor: null,
      });

      await useCase.execute({ ...identity, body });

      expect(info).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'PROFESSOR_UPDATED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          professor_id: 'p1',
          changed_fields: expected,
          tutor_changed: false,
          replaced_tutor: false,
        },
        expect.any(String),
      );
    });

    it('logs the class as changed, a tutor change and the replaced tutor, without any name', async () => {
      update.mockResolvedValue({
        before,
        after: { ...before, tutoredClass: { ...tutorOf('B'), id: 'c2' } },
        replacedTutor: { id: 'p2', firstName: 'Luis', lastName: 'Pérez' },
      });

      await useCase.execute({ ...identity, body });

      expect(info).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'PROFESSOR_UPDATED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          professor_id: 'p1',
          changed_fields: ['class'],
          tutor_changed: true,
          replaced_tutor: true,
        },
        expect.any(String),
      );
      expect(JSON.stringify(info.mock.calls)).not.toMatch(/Luis|Pérez|Ana|García/);
    });

    it('logs the class as changed when the professor is left with no class', async () => {
      update.mockResolvedValue({
        before,
        after: { ...before, tutoredClass: null },
        replacedTutor: null,
      });

      await useCase.execute({ ...identity, body: { ...body, classId: null } });

      expect(info).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ changed_fields: ['class'], tutor_changed: true }),
        expect.any(String),
      );
    });
  });
});
