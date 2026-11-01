import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Subject } from '../../domain/subject/subject.js';
import {
  SubjectAlreadyExists,
  SubjectCodeAlreadyExists,
  SubjectCoursesNotFound,
  SubjectNotFound,
} from '../../domain/subject/subjectErrors.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { UpdateSubject } from './updateSubject.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1', subjectId: 'subject-1' } as const;
const COURSE_A = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE_B = '0192f5a0-0000-7000-8000-0000000000d2';
const COURSE_C = '0192f5a0-0000-7000-8000-0000000000d3';

const before: Subject = {
  id: 'subject-1',
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  description: 'Lengua extranjera',
  color: 'blue',
  createdAt: new Date('2026-10-26T09:30:00Z'),
  courses: [
    {
      id: COURSE_A,
      name: '1º Primaria',
      sessionsPerWeek: 3,
      constraintCount: 0,
      assignmentCount: 0,
    },
    {
      id: COURSE_B,
      name: '2º Primaria',
      sessionsPerWeek: 3,
      constraintCount: 0,
      assignmentCount: 0,
    },
  ],
};

const body = {
  name: '  Inglés  avanzado ',
  code: ' ing2 ',
  type: 'CORE',
  status: 'INACTIVE',
  description: 'Lengua extranjera',
  color: 'blue',
  courses: [
    { courseId: COURSE_A, sessionsPerWeek: 2 },
    { courseId: COURSE_C, sessionsPerWeek: 2 },
  ],
};

const after: Subject = {
  ...before,
  name: 'Inglés avanzado',
  code: 'ing2',
  status: 'INACTIVE',
  // El repositorio no ordena: el caso de uso lo hace.
  courses: [
    {
      id: COURSE_C,
      name: '10º Primaria',
      sessionsPerWeek: 2,
      constraintCount: 0,
      assignmentCount: 0,
    },
    {
      id: COURSE_A,
      name: '1º Primaria',
      sessionsPerWeek: 2,
      constraintCount: 0,
      assignmentCount: 0,
    },
  ],
};

describe('UpdateSubject', () => {
  let update: Mock<SubjectRepository['update']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: UpdateSubject;

  beforeEach(() => {
    update = vi.fn<SubjectRepository['update']>().mockResolvedValue({ before, after });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new UpdateSubject({ subjectRepository: { update }, logger: { info, warn } });
  });

  it('stores the cleaned and normalized final state under the school of the identity', async () => {
    await useCase.execute({ ...identity, body });

    expect(update).toHaveBeenCalledExactlyOnceWith('school-1', 'subject-1', {
      name: 'Inglés avanzado',
      normalizedName: 'inglés avanzado',
      code: 'ing2',
      normalizedCode: 'ing2',
      type: 'CORE',
      status: 'INACTIVE',
      description: 'Lengua extranjera',
      color: 'blue',
      courses: [
        { courseId: COURSE_A, sessionsPerWeek: 2 },
        { courseId: COURSE_C, sessionsPerWeek: 2 },
      ],
    });
  });

  it('stores a null code and description when they come empty', async () => {
    await useCase.execute({ ...identity, body: { ...body, code: '  ', description: '' } });

    expect(update).toHaveBeenCalledWith(
      'school-1',
      'subject-1',
      expect.objectContaining({ code: null, normalizedCode: null, description: null }),
    );
  });

  it('returns the saved subject with the courses in natural order', async () => {
    const result = await useCase.execute({ ...identity, body });

    expect(result.courses.map(({ name }) => name)).toEqual(['1º Primaria', '10º Primaria']);
    expect(result).toMatchObject({ name: 'Inglés avanzado', status: 'INACTIVE' });
  });

  it('logs what changed, with counts and without names, codes or descriptions', async () => {
    await useCase.execute({ ...identity, body });

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SUBJECT_UPDATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        subject_id: 'subject-1',
        changed_fields: ['name', 'code', 'status', 'courses'],
        courses_added: 1,
        courses_removed: 1,
        courses_changed: 1,
      },
      expect.any(String),
    );
    const everything = JSON.stringify([info.mock.calls, warn.mock.calls]);
    for (const secret of ['Inglés', 'ing2', 'Lengua extranjera', '1º Primaria']) {
      expect(everything).not.toContain(secret);
    }
  });

  it('still logs SUBJECT_UPDATED, with no changed fields, when nothing changed', async () => {
    update.mockResolvedValue({ before, after: before });

    await useCase.execute({ ...identity, body });

    expect(info).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        event: 'SUBJECT_UPDATED',
        changed_fields: [],
        courses_added: 0,
        courses_removed: 0,
        courses_changed: 0,
      }),
      expect.any(String),
    );
  });

  it('rejects an invalid body without touching the repository or logging anything', async () => {
    await expect(
      useCase.execute({ ...identity, body: { ...body, name: '', courses: [] } }),
    ).rejects.toEqual(
      new ValidationError([
        { field: 'name', code: 'REQUIRED' },
        { field: 'courses', code: 'REQUIRED' },
      ]),
    );

    expect(update).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws SubjectNotFound and logs not_found when the subject is not in the school', async () => {
    update.mockResolvedValue(null);

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(SubjectNotFound);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SUBJECT_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        subject_id: 'subject-1',
        reason: 'not_found',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it.each([
    ['name', new SubjectAlreadyExists(), 'duplicate_name'],
    ['code', new SubjectCodeAlreadyExists(), 'duplicate_code'],
  ])('lets the %s conflict through and logs it as %s', async (_field, error, reason) => {
    update.mockRejectedValue(error);

    await expect(useCase.execute({ ...identity, body })).rejects.toBe(error);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        event: 'SUBJECT_UPDATE_REJECTED',
        subject_id: 'subject-1',
        reason,
      }),
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('turns a missing course into a 400 with NOT_FOUND on that course and logs course_not_found', async () => {
    update.mockRejectedValue(new SubjectCoursesNotFound([1]));

    await expect(useCase.execute({ ...identity, body })).rejects.toEqual(
      new ValidationError([{ field: 'courses[1].courseId', code: 'NOT_FOUND' }]),
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ event: 'SUBJECT_UPDATE_REJECTED', reason: 'course_not_found' }),
      expect.any(String),
    );
  });

  it('lets a database failure through without logging', async () => {
    update.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
