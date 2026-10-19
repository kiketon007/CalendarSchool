import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Course } from '../../domain/course/course.js';
import { CourseAlreadyExists } from '../../domain/course/courseErrors.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { CreateCourse } from './createCourse.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1' } as const;
const body = { name: '  1º   Primaria ', classes: [{ name: ' A ' }, { name: 'Grupo   B' }] };

const created: Course = {
  id: 'id-1',
  name: '1º Primaria',
  classes: [
    { id: 'id-2', name: 'A', tutor: null },
    { id: 'id-3', name: 'Grupo B', tutor: null },
  ],
};

describe('CreateCourse', () => {
  let create: Mock<CourseRepository['create']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: CreateCourse;
  let nextId: number;

  beforeEach(() => {
    nextId = 0;
    create = vi.fn<CourseRepository['create']>().mockResolvedValue(created);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new CreateCourse({
      courseRepository: { create },
      idGenerator: { generate: () => `id-${String(++nextId)}` },
      logger: { info, warn },
    });
  });

  it('stores the cleaned and normalized names under the school of the identity, one id per course and class', async () => {
    await useCase.execute({ ...identity, body });

    expect(create).toHaveBeenCalledExactlyOnceWith('school-1', {
      id: 'id-1',
      name: '1º Primaria',
      normalizedName: '1º primaria',
      classes: [
        { id: 'id-2', name: 'A', normalizedName: 'a' },
        { id: 'id-3', name: 'Grupo B', normalizedName: 'grupo b' },
      ],
    });
  });

  it('returns the course that the repository created', async () => {
    await expect(useCase.execute({ ...identity, body })).resolves.toEqual(created);
  });

  it('ignores a school or a tutor that comes in the body', async () => {
    await useCase.execute({
      ...identity,
      body: { ...body, schoolId: 'school-2', tutorId: 'tutor-1' },
    });

    expect(create.mock.calls[0]?.[0]).toBe('school-1');
    expect(JSON.stringify(create.mock.calls)).not.toContain('tutor-1');
    expect(JSON.stringify(create.mock.calls)).not.toContain('school-2');
  });

  it('logs COURSE_CREATED with the identifiers and the number of classes, never the names', async () => {
    await useCase.execute({ ...identity, body });

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_CREATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        course_id: 'id-1',
        class_count: 2,
      },
      expect.any(String),
    );
    expect(JSON.stringify([info.mock.calls, warn.mock.calls])).not.toContain('Primaria');
    expect(JSON.stringify([info.mock.calls, warn.mock.calls])).not.toContain('Grupo');
  });

  it('throws ValidationError with the invalid fields and stores nothing', async () => {
    const attempt = useCase.execute({
      ...identity,
      body: { name: '', classes: [{ name: 'A' }, { name: 'a' }] },
    });

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      details: [
        { field: 'name', code: 'REQUIRED' },
        { field: 'classes[1].name', code: 'DUPLICATE' },
      ],
    });
    expect(create).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('logs COURSE_CREATION_REJECTED and rethrows CourseAlreadyExists when the name is taken', async () => {
    create.mockRejectedValue(new CourseAlreadyExists());

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      CourseAlreadyExists,
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'duplicate',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('propagates DatabaseUnavailable without logging a creation', async () => {
    create.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
