import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Subject } from '../../domain/subject/subject.js';
import {
  SubjectAlreadyExists,
  SubjectCodeAlreadyExists,
  SubjectCoursesNotFound,
} from '../../domain/subject/subjectErrors.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { CreateSubject } from './createSubject.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1' } as const;
const COURSE_A = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE_B = '0192f5a0-0000-7000-8000-0000000000d2';

const body = {
  name: '  Inglés  ',
  code: ' ING ',
  type: 'CORE',
  status: 'ACTIVE',
  description: '  Lengua extranjera ',
  color: 'blue',
  courses: [
    { courseId: COURSE_A, sessionsPerWeek: 3 },
    { courseId: COURSE_B, sessionsPerWeek: 2 },
  ],
};

const created: Subject = {
  id: 'id-1',
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
      sessionsPerWeek: 2,
      constraintCount: 0,
      assignmentCount: 0,
    },
  ],
};

describe('CreateSubject', () => {
  let create: Mock<SubjectRepository['create']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: CreateSubject;

  beforeEach(() => {
    create = vi.fn<SubjectRepository['create']>().mockResolvedValue(created);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new CreateSubject({
      subjectRepository: { create },
      idGenerator: { generate: () => 'id-1' },
      logger: { info, warn },
    });
  });

  it('stores the cleaned and normalized name and code under the school of the identity, with the courses', async () => {
    await expect(useCase.execute({ ...identity, body })).resolves.toEqual(created);

    expect(create).toHaveBeenCalledExactlyOnceWith('school-1', {
      id: 'id-1',
      name: 'Inglés',
      normalizedName: 'inglés',
      code: 'ING',
      normalizedCode: 'ing',
      type: 'CORE',
      status: 'ACTIVE',
      description: 'Lengua extranjera',
      color: 'blue',
      courses: [
        { courseId: COURSE_A, sessionsPerWeek: 3 },
        { courseId: COURSE_B, sessionsPerWeek: 2 },
      ],
    });
  });

  it('returns the courses in natural order, so 2º comes before 10º, whatever order the repository gives them', async () => {
    create.mockResolvedValue({
      ...created,
      courses: [
        {
          id: 'c10',
          name: '10º Primaria',
          sessionsPerWeek: 3,
          constraintCount: 0,
          assignmentCount: 0,
        },
        {
          id: 'c1',
          name: '1º Primaria',
          sessionsPerWeek: 3,
          constraintCount: 0,
          assignmentCount: 0,
        },
        {
          id: 'c2',
          name: '2º Primaria',
          sessionsPerWeek: 1,
          constraintCount: 0,
          assignmentCount: 0,
        },
      ],
    });

    const result = await useCase.execute({ ...identity, body });

    expect(result.courses.map(({ name }) => name)).toEqual([
      '1º Primaria',
      '2º Primaria',
      '10º Primaria',
    ]);
  });

  it('stores no code and no description as null, never as an empty text', async () => {
    await useCase.execute({
      ...identity,
      body: { ...body, code: '   ', description: undefined },
    });

    expect(create).toHaveBeenCalledWith(
      'school-1',
      expect.objectContaining({ code: null, normalizedCode: null, description: null }),
    );
  });

  it('ignores a school sent in the body', async () => {
    await useCase.execute({ ...identity, body: { ...body, schoolId: 'otro' } });

    expect(create).toHaveBeenCalledWith('school-1', expect.anything());
  });

  it('throws a ValidationError, without touching the repository or logging, for an invalid body', async () => {
    const error = await useCase
      .execute({ ...identity, body: { ...body, name: '', courses: [] } })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual([
      { field: 'name', code: 'REQUIRED' },
      { field: 'courses', code: 'REQUIRED' },
    ]);
    expect(create).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('turns the courses that are not in the school into NOT_FOUND errors at their positions, and logs the rejection', async () => {
    create.mockRejectedValue(new SubjectCoursesNotFound([1]));

    const error = await useCase.execute({ ...identity, body }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual([
      { field: 'courses[1].courseId', code: 'NOT_FOUND' },
    ]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SUBJECT_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'course_not_found',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('lets SubjectAlreadyExists through and logs the rejection as a duplicate name', async () => {
    create.mockRejectedValue(new SubjectAlreadyExists());

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      SubjectAlreadyExists,
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SUBJECT_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'duplicate_name',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('lets SubjectCodeAlreadyExists through and logs the rejection as a duplicate code', async () => {
    create.mockRejectedValue(new SubjectCodeAlreadyExists());

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      SubjectCodeAlreadyExists,
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SUBJECT_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'duplicate_code',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('logs SUBJECT_CREATED with the identifiers and the course count, never the name, the code or the description', async () => {
    await useCase.execute({ ...identity, body });

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SUBJECT_CREATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        subject_id: 'id-1',
        course_count: 2,
      },
      expect.any(String),
    );
    const logged = JSON.stringify([info.mock.calls, warn.mock.calls]);
    expect(logged).not.toMatch(/Inglés|ING|Lengua|Primaria/);
  });

  it('lets a database failure through without logging a creation', async () => {
    create.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
