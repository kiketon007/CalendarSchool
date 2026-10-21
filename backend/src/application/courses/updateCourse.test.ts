import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Course } from '../../domain/course/course.js';
import {
  CourseAlreadyExists,
  CourseChanged,
  CourseNotFound,
  ProfessorAlreadyTutor,
  TutorNotFound,
} from '../../domain/course/courseErrors.js';
import type { CourseRepository, UpdatedCourse } from '../../domain/course/courseRepository.js';
import type {
  CourseUpdatePlan,
  CurrentCourse,
  RequestedTutor,
} from '../../domain/course/courseUpdate.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { UpdateCourse } from './updateCourse.js';

const ID_A = '0192f5a0-0000-7000-8000-0000000000a1';
const ID_B = '0192f5a0-0000-7000-8000-0000000000b2';
const ID_C = '0192f5a0-0000-7000-8000-0000000000c3';

const identity = { schoolId: 'school-1', actorId: 'actor-1', courseId: 'course-1' } as const;

/** Lo que el repositorio tiene guardado antes de editar. */
const saved: CurrentCourse = {
  name: '1º Primaria',
  normalizedName: '1º primaria',
  classes: [
    { id: ID_A, name: 'A', normalizedName: 'a', tutorId: null },
    { id: ID_B, name: 'B', normalizedName: 'b', tutorId: null },
    { id: ID_C, name: 'C', normalizedName: 'c', tutorId: null },
  ],
};

const body = {
  name: '  1º   Primaria Tarde ',
  classes: [{ id: ID_A, name: ' Grupo   A ' }, { id: ID_B, name: 'B' }, { name: 'D' }],
};

const result: Course = {
  id: 'course-1',
  name: '1º Primaria Tarde',
  createdAt: new Date('2026-10-19T09:30:00Z'),
  classes: [
    { id: 'k-d', name: 'D', tutor: null },
    { id: ID_A, name: 'Grupo A', tutor: null },
    { id: ID_B, name: 'B', tutor: null },
  ],
};

describe('UpdateCourse', () => {
  let update: Mock<CourseRepository['update']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: UpdateCourse;
  let nextId: number;
  /** Plan que calculó la función `plan` que recibió el repositorio, con el curso guardado. */
  let planned: CourseUpdatePlan | undefined;
  /** Profesores que el repositorio le da a la regla: los pedidos que existen en el colegio. */
  let tutors: Map<string, RequestedTutor>;

  beforeEach(() => {
    nextId = 0;
    planned = undefined;
    tutors = new Map();
    update = vi
      .fn<CourseRepository['update']>()
      .mockImplementation((_school, _course, _requested, plan): Promise<UpdatedCourse> => {
        planned = plan(saved, tutors);
        return Promise.resolve({ course: result, plan: planned });
      });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new UpdateCourse({
      courseRepository: { update },
      idGenerator: { generate: () => `id-${String(++nextId)}` },
      logger: { info, warn },
    });
  });

  it('asks the repository to leave the course of the school of the identity in the requested state', async () => {
    await useCase.execute({ ...identity, body });

    expect(update).toHaveBeenCalledExactlyOnceWith(
      'school-1',
      'course-1',
      {
        name: '1º Primaria Tarde',
        normalizedName: '1º primaria tarde',
        classes: [
          { id: ID_A, existing: true, name: 'Grupo A', normalizedName: 'grupo a' },
          { id: ID_B, existing: true, name: 'B', normalizedName: 'b' },
          { id: 'id-1', existing: false, name: 'D', normalizedName: 'd' },
        ],
      },
      expect.any(Function),
    );
  });

  it('gives the repository the rule that plans the update against the saved course', async () => {
    await useCase.execute({ ...identity, body });

    expect(planned).toEqual({
      courseRenamed: true,
      removed: [ID_C],
      renamed: [
        { id: ID_A, name: 'Grupo A', normalizedName: 'grupo a', normalizedNameChanged: true },
      ],
      created: [{ id: 'id-1', name: 'D', normalizedName: 'd' }],
      tutorsChanged: [],
    });
  });

  it('generates an id only for the classes that come without one', async () => {
    await useCase.execute({ ...identity, body });

    expect(nextId).toBe(1);
  });

  it('returns the course that the repository left, with its classes in order', async () => {
    const course = await useCase.execute({ ...identity, body });

    expect(course.classes.map(({ name }) => name)).toEqual(['B', 'D', 'Grupo A']);
    expect(course).toMatchObject({ id: 'course-1', name: '1º Primaria Tarde' });
  });

  it('ignores a school or a tutor that comes in the body', async () => {
    await useCase.execute({
      ...identity,
      body: { ...body, schoolId: 'school-2', tutorId: 'tutor-1' },
    });

    expect(update.mock.calls[0]?.[0]).toBe('school-1');
    expect(JSON.stringify(update.mock.calls)).not.toContain('tutor-1');
    expect(JSON.stringify(update.mock.calls)).not.toContain('school-2');
  });

  it('logs COURSE_UPDATED with the identifiers and the counts, never the names', async () => {
    await useCase.execute({ ...identity, body });

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_UPDATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        course_id: 'course-1',
        classes_added: 1,
        classes_removed: 1,
        classes_renamed: 1,
        tutors_changed: 0,
      },
      expect.any(String),
    );
    const logged = JSON.stringify([info.mock.calls, warn.mock.calls]);
    expect(logged).not.toContain('Primaria');
    expect(logged).not.toContain('Grupo');
  });

  it('logs nothing when the plan changes nothing', async () => {
    update.mockImplementation((_school, _course, _requested, plan) =>
      Promise.resolve({
        course: result,
        plan: plan(
          {
            name: '1º Primaria Tarde',
            normalizedName: '1º primaria tarde',
            classes: [{ id: ID_A, name: 'A', normalizedName: 'a', tutorId: null }],
          },
          tutors,
        ),
      }),
    );

    await useCase.execute({
      ...identity,
      body: { name: '1º Primaria Tarde', classes: [{ id: ID_A, name: 'A' }] },
    });

    expect(info).not.toHaveBeenCalled();
  });

  it('throws ValidationError with the invalid fields and calls nothing', async () => {
    const attempt = useCase.execute({
      ...identity,
      body: { name: '', classes: [{ id: 'abc', name: 'A' }, { name: 'a' }] },
    });

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      details: [
        { field: 'name', code: 'REQUIRED' },
        { field: 'classes[0].id', code: 'INVALID_FORMAT' },
        { field: 'classes[1].name', code: 'DUPLICATE' },
      ],
    });
    expect(update).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('logs COURSE_UPDATE_REJECTED and rethrows CourseAlreadyExists when the name is taken', async () => {
    update.mockRejectedValue(new CourseAlreadyExists());

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      CourseAlreadyExists,
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        course_id: 'course-1',
        reason: 'duplicate',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('logs COURSE_UPDATE_REJECTED and rethrows CourseChanged when a class is no longer there', async () => {
    update.mockRejectedValue(new CourseChanged());

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(CourseChanged);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        course_id: 'course-1',
        reason: 'changed',
      },
      expect.any(String),
    );
  });

  it('lets CourseNotFound through without logging', async () => {
    update.mockRejectedValue(new CourseNotFound());

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(CourseNotFound);

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('lets a database failure through without logging', async () => {
    update.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  describe('tutors', () => {
    const TUTOR_1 = '0192f5a0-0000-7000-8000-0000000000f1';
    const TUTOR_2 = '0192f5a0-0000-7000-8000-0000000000f2';
    const withTutors = (classes: unknown[]) => ({ name: '1º Primaria', classes });

    it('passes the tutor of each class to the repository, apart from the classes that do not carry one', async () => {
      tutors.set(TUTOR_1, { id: TUTOR_1, tutoredClassId: null });
      await useCase.execute({
        ...identity,
        body: withTutors([
          { id: ID_A, name: 'A', tutorId: TUTOR_1 },
          { id: ID_B, name: 'B', tutorId: null },
          { id: ID_C, name: 'C' },
        ]),
      });

      const requested = update.mock.calls[0]?.[2];
      expect(requested?.classes).toEqual([
        { id: ID_A, existing: true, name: 'A', normalizedName: 'a', tutorId: TUTOR_1 },
        { id: ID_B, existing: true, name: 'B', normalizedName: 'b', tutorId: null },
        { id: ID_C, existing: true, name: 'C', normalizedName: 'c' },
      ]);
      expect(requested?.classes[2] && 'tutorId' in requested.classes[2]).toBe(false);
    });

    it('plans the tutor changes with the professors that the repository gives to the rule', async () => {
      tutors.set(TUTOR_1, { id: TUTOR_1, tutoredClassId: null });
      tutors.set(TUTOR_2, { id: TUTOR_2, tutoredClassId: null });

      await useCase.execute({
        ...identity,
        body: withTutors([
          { id: ID_A, name: 'A', tutorId: TUTOR_1 },
          { id: ID_B, name: 'B', tutorId: TUTOR_2 },
          { id: ID_C, name: 'C' },
        ]),
      });

      expect(planned?.tutorsChanged).toEqual([
        { classId: ID_A, tutorId: TUTOR_1 },
        { classId: ID_B, tutorId: TUTOR_2 },
      ]);
    });

    it('logs COURSE_UPDATED with the number of tutors changed', async () => {
      tutors.set(TUTOR_1, { id: TUTOR_1, tutoredClassId: null });

      await useCase.execute({
        ...identity,
        body: withTutors([
          { id: ID_A, name: 'A', tutorId: TUTOR_1 },
          { id: ID_B, name: 'B' },
          { id: ID_C, name: 'C' },
        ]),
      });

      expect(info).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ event: 'COURSE_UPDATED', tutors_changed: 1 }),
        expect.any(String),
      );
    });

    it('turns TutorNotFound into a validation error on the tutorId of that class and logs the rejection', async () => {
      update.mockRejectedValue(new TutorNotFound(1));

      const attempt = useCase.execute({
        ...identity,
        body: withTutors([
          { id: ID_A, name: 'A' },
          { id: ID_B, name: 'B', tutorId: TUTOR_1 },
        ]),
      });

      await expect(attempt).rejects.toBeInstanceOf(ValidationError);
      await expect(attempt).rejects.toMatchObject({
        details: [{ field: 'classes[1].tutorId', code: 'NOT_FOUND' }],
      });
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'COURSE_UPDATE_REJECTED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          course_id: 'course-1',
          reason: 'professor_not_found',
        },
        expect.any(String),
      );
      expect(info).not.toHaveBeenCalled();
    });

    it('logs COURSE_UPDATE_REJECTED and rethrows ProfessorAlreadyTutor', async () => {
      update.mockRejectedValue(new ProfessorAlreadyTutor());

      await expect(
        useCase.execute({
          ...identity,
          body: withTutors([{ id: ID_A, name: 'A', tutorId: TUTOR_1 }]),
        }),
      ).rejects.toBeInstanceOf(ProfessorAlreadyTutor);

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'COURSE_UPDATE_REJECTED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          course_id: 'course-1',
          reason: 'professor_already_tutor',
        },
        expect.any(String),
      );
      expect(info).not.toHaveBeenCalled();
    });

    it('never logs the ids or the names of the professors', async () => {
      tutors.set(TUTOR_1, { id: TUTOR_1, tutoredClassId: null });
      await useCase.execute({
        ...identity,
        body: withTutors([{ id: ID_A, name: 'A', tutorId: TUTOR_1 }]),
      });
      update.mockRejectedValue(new ProfessorAlreadyTutor());
      await expect(
        useCase.execute({
          ...identity,
          body: withTutors([{ id: ID_A, name: 'A', tutorId: TUTOR_1 }]),
        }),
      ).rejects.toBeInstanceOf(ProfessorAlreadyTutor);

      expect(JSON.stringify([info.mock.calls, warn.mock.calls])).not.toContain(TUTOR_1);
    });

    it('answers with a validation error before the repository for an invalid tutorId', async () => {
      const attempt = useCase.execute({
        ...identity,
        body: withTutors([{ id: ID_A, name: 'A', tutorId: 'abc' }]),
      });

      await expect(attempt).rejects.toMatchObject({
        details: [{ field: 'classes[0].tutorId', code: 'INVALID_FORMAT' }],
      });
      expect(update).not.toHaveBeenCalled();
    });
  });
});
