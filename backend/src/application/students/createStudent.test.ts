import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Student } from '../../domain/student/student.js';
import { ClassNotFound, CourseNotFound } from '../../domain/student/studentErrors.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { CreateStudent } from './createStudent.js';

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const CLASS_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const identity = { schoolId: 'school-1', actorId: 'actor-1' } as const;
const body = {
  firstName: '  Juan   Carlos ',
  lastName: 'García',
  courseId: COURSE_ID,
  cafeteria: false,
};

const created: Student = {
  id: 'id-1',
  firstName: 'Juan Carlos',
  lastName: 'García',
  course: { id: COURSE_ID, name: '1º Primaria' },
  class: null,
  cafeteria: false,
  scholarship: null,
  foodType: null,
  observations: null,
};

describe('CreateStudent', () => {
  let create: Mock<StudentRepository['create']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: CreateStudent;

  beforeEach(() => {
    create = vi.fn<StudentRepository['create']>().mockResolvedValue(created);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new CreateStudent({
      studentRepository: { create },
      idGenerator: { generate: () => 'id-1' },
      logger: { info, warn },
    });
  });

  it('stores the cleaned names under the school of the identity, with a generated id and no class', async () => {
    await useCase.execute({ ...identity, body });

    expect(create).toHaveBeenCalledExactlyOnceWith(
      'school-1',
      {
        id: 'id-1',
        firstName: 'Juan Carlos',
        lastName: 'García',
        cafeteria: false,
        scholarship: null,
        foodType: null,
        observations: null,
      },
      COURSE_ID,
      null,
    );
  });

  it('passes the class, the scholarship, the food type and the observations when they come', async () => {
    await useCase.execute({
      ...identity,
      body: {
        ...body,
        classId: CLASS_ID,
        cafeteria: true,
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Necesita apoyo',
      },
    });

    expect(create).toHaveBeenCalledExactlyOnceWith(
      'school-1',
      {
        id: 'id-1',
        firstName: 'Juan Carlos',
        lastName: 'García',
        cafeteria: true,
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Necesita apoyo',
      },
      COURSE_ID,
      CLASS_ID,
    );
  });

  it('returns the student that the repository created', async () => {
    await expect(useCase.execute({ ...identity, body })).resolves.toEqual(created);
  });

  it('ignores a school or a status that come in the body', async () => {
    await useCase.execute({ ...identity, body: { ...body, schoolId: 'school-2', status: 'X' } });

    expect(create.mock.calls[0]?.[0]).toBe('school-1');
    expect(JSON.stringify(create.mock.calls)).not.toContain('school-2');
  });

  it('logs STUDENT_CREATED with the identifiers and two booleans, never names, food type or observations', async () => {
    create.mockResolvedValue({
      ...created,
      class: { id: CLASS_ID, name: 'A' },
      cafeteria: true,
      scholarship: false,
      foodType: 'Alérgico a frutos secos',
      observations: 'Diabetes tipo 1',
    });

    await useCase.execute({
      ...identity,
      body: {
        ...body,
        classId: CLASS_ID,
        cafeteria: true,
        scholarship: false,
        foodType: 'Alérgico a frutos secos',
        observations: 'Diabetes tipo 1',
      },
    });

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'STUDENT_CREATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        student_id: 'id-1',
        has_class: true,
        cafeteria: true,
      },
      expect.any(String),
    );
    const logged = JSON.stringify([info.mock.calls, warn.mock.calls]);
    for (const text of ['Juan', 'García', 'Primaria', 'frutos', 'Diabetes']) {
      expect(logged).not.toContain(text);
    }
  });

  it('logs has_class false and cafeteria false for a student without class and without cafeteria', async () => {
    await useCase.execute({ ...identity, body });

    expect(info.mock.calls[0]?.[0]).toMatchObject({ has_class: false, cafeteria: false });
  });

  it('throws ValidationError with the invalid fields and stores nothing', async () => {
    const attempt = useCase.execute({
      ...identity,
      body: {
        firstName: '',
        lastName: 'García',
        courseId: COURSE_ID,
        cafeteria: false,
        foodType: 'x',
      },
    });

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      details: [
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'foodType', code: 'NOT_ALLOWED' },
      ],
    });
    expect(create).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('turns CourseNotFound into a courseId field error and logs STUDENT_CREATION_REJECTED', async () => {
    create.mockRejectedValue(new CourseNotFound());

    const attempt = useCase.execute({ ...identity, body });

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      details: [{ field: 'courseId', code: 'NOT_FOUND' }],
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'STUDENT_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'course_not_found',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('turns ClassNotFound into a classId field error and logs STUDENT_CREATION_REJECTED', async () => {
    create.mockRejectedValue(new ClassNotFound());

    const attempt = useCase.execute({ ...identity, body: { ...body, classId: CLASS_ID } });

    await expect(attempt).rejects.toMatchObject({
      details: [{ field: 'classId', code: 'NOT_FOUND' }],
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'STUDENT_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'class_not_found',
      },
      expect.any(String),
    );
  });

  it('lets a database failure through without logging', async () => {
    create.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
