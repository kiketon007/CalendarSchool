import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Student } from '../../domain/student/student.js';
import {
  ClassNotFound,
  CourseNotFound,
  StudentNotFound,
} from '../../domain/student/studentErrors.js';
import type { StudentRepository } from '../../domain/student/studentRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError, type FieldError } from '../validationError.js';
import { UpdateStudent } from './updateStudent.js';

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const OTHER_COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d2';
const CLASS_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const identity = {
  schoolId: 'school-1',
  actorId: 'actor-1',
  studentId: 'student-1',
} as const;

const before: Student = {
  id: 'student-1',
  firstName: 'Juan',
  lastName: 'García',
  course: { id: COURSE_ID, name: '1º Primaria' },
  class: { id: CLASS_ID, name: 'A' },
  cafeteria: true,
  scholarship: false,
  foodType: 'Vegetariana',
  observations: 'Diabetes tipo 1',
};

/** Cuerpo que deja al alumno exactamente como estaba. */
const unchangedBody = {
  firstName: 'Juan',
  lastName: 'García',
  courseId: COURSE_ID,
  classId: CLASS_ID,
  cafeteria: true,
  scholarship: false,
  foodType: 'Vegetariana',
  observations: 'Diabetes tipo 1',
};

/** La promesa se rechaza con un `ValidationError` con exactamente estos campos. */
async function expectValidationError(attempt: Promise<unknown>, details: FieldError[]) {
  await expect(attempt).rejects.toBeInstanceOf(ValidationError);
  await expect(attempt).rejects.toMatchObject({ details });
}

describe('UpdateStudent', () => {
  let update: Mock<StudentRepository['update']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: UpdateStudent;

  beforeEach(() => {
    update = vi.fn<StudentRepository['update']>().mockResolvedValue({ before, after: before });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new UpdateStudent({ studentRepository: { update }, logger: { info, warn } });
  });

  it('stores the cleaned final state under the school and the student of the identity', async () => {
    await useCase.execute({
      ...identity,
      body: { ...unchangedBody, firstName: '  Juan   Carlos ', classId: null, foodType: '  ' },
    });

    expect(update).toHaveBeenCalledExactlyOnceWith(
      'school-1',
      'student-1',
      {
        firstName: 'Juan Carlos',
        lastName: 'García',
        cafeteria: true,
        scholarship: false,
        foodType: null,
        observations: 'Diabetes tipo 1',
      },
      COURSE_ID,
      null,
    );
  });

  it('returns the student as it was stored', async () => {
    const after: Student = { ...before, firstName: 'Juanito' };
    update.mockResolvedValue({ before, after });

    await expect(
      useCase.execute({ ...identity, body: { ...unchangedBody, firstName: 'Juanito' } }),
    ).resolves.toEqual(after);
  });

  it('ignores a school, an id or a status that come in the body', async () => {
    await useCase.execute({
      ...identity,
      body: { ...unchangedBody, schoolId: 'school-2', id: 'other', status: 'X' },
    });

    expect(update.mock.calls[0]?.[0]).toBe('school-1');
    expect(update.mock.calls[0]?.[1]).toBe('student-1');
    expect(JSON.stringify(update.mock.calls)).not.toContain('school-2');
    expect(JSON.stringify(update.mock.calls)).not.toContain('other');
  });

  describe('invalid body', () => {
    it('throws ValidationError without calling the repository or logging anything', async () => {
      await expectValidationError(
        useCase.execute({
          ...identity,
          body: { ...unchangedBody, firstName: '', courseId: 'abc' },
        }),
        [
          { field: 'firstName', code: 'REQUIRED' },
          { field: 'courseId', code: 'INVALID_FORMAT' },
        ],
      );

      expect(update).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('student not found', () => {
    beforeEach(() => {
      update.mockResolvedValue(null);
    });

    it('throws StudentNotFound and logs STUDENT_UPDATE_REJECTED with reason not_found', async () => {
      await expect(useCase.execute({ ...identity, body: unchangedBody })).rejects.toBeInstanceOf(
        StudentNotFound,
      );

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'STUDENT_UPDATE_REJECTED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          reason: 'not_found',
        },
        expect.any(String),
      );
      expect(info).not.toHaveBeenCalled();
    });
  });

  describe('course or class that do not exist', () => {
    it('turns CourseNotFound into a 400 courseId NOT_FOUND and logs course_not_found', async () => {
      update.mockRejectedValue(new CourseNotFound());

      await expectValidationError(useCase.execute({ ...identity, body: unchangedBody }), [
        { field: 'courseId', code: 'NOT_FOUND' },
      ]);

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'STUDENT_UPDATE_REJECTED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          reason: 'course_not_found',
        },
        expect.any(String),
      );
      expect(info).not.toHaveBeenCalled();
    });

    it('turns ClassNotFound into a 400 classId NOT_FOUND and logs class_not_found', async () => {
      update.mockRejectedValue(new ClassNotFound());

      await expectValidationError(useCase.execute({ ...identity, body: unchangedBody }), [
        { field: 'classId', code: 'NOT_FOUND' },
      ]);

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'STUDENT_UPDATE_REJECTED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          reason: 'class_not_found',
        },
        expect.any(String),
      );
    });
  });

  it('lets an unexpected failure through without logging a rejection', async () => {
    update.mockRejectedValue(new DatabaseUnavailable(new Error('connection')));

    await expect(useCase.execute({ ...identity, body: unchangedBody })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  describe('STUDENT_UPDATED', () => {
    it('lists the names of the changed fields in the order of the creation, with has_class and cafeteria', async () => {
      const after: Student = {
        ...before,
        firstName: 'Juanito',
        observations: null,
        class: null,
      };
      update.mockResolvedValue({ before, after });

      await useCase.execute({
        ...identity,
        body: { ...unchangedBody, firstName: 'Juanito', classId: null, observations: null },
      });

      expect(info).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'STUDENT_UPDATED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          student_id: 'student-1',
          changed_fields: ['firstName', 'classId', 'observations'],
          has_class: false,
          cafeteria: true,
        },
        expect.any(String),
      );
    });

    it('compares the course and the class by id and counts the scholarship and the food type', async () => {
      const after: Student = {
        ...before,
        course: { id: OTHER_COURSE_ID, name: '2º Primaria' },
        class: null,
        cafeteria: false,
        scholarship: null,
        foodType: null,
      };
      update.mockResolvedValue({ before, after });

      await useCase.execute({ ...identity, body: { ...unchangedBody, courseId: OTHER_COURSE_ID } });

      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          changed_fields: ['courseId', 'classId', 'cafeteria', 'scholarship', 'foodType'],
          has_class: false,
          cafeteria: false,
        }),
        expect.any(String),
      );
    });

    it('still logs the event, with no changed fields, when nothing changed', async () => {
      await useCase.execute({ ...identity, body: unchangedBody });

      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'STUDENT_UPDATED', changed_fields: [] }),
        expect.any(String),
      );
    });

    it('never puts names, food type or observations in any event', async () => {
      const after: Student = {
        ...before,
        firstName: 'Nombre Secreto',
        lastName: 'Apellido Secreto',
        foodType: 'Alérgico a frutos secos',
        observations: 'Diabetes tipo 1',
      };
      update.mockResolvedValue({ before, after });

      await useCase.execute({
        ...identity,
        body: {
          ...unchangedBody,
          firstName: 'Nombre Secreto',
          lastName: 'Apellido Secreto',
          foodType: 'Alérgico a frutos secos',
        },
      });

      const logged = JSON.stringify([info.mock.calls, warn.mock.calls]);
      for (const secret of [
        'Nombre Secreto',
        'Apellido Secreto',
        'Alérgico a frutos secos',
        'Diabetes tipo 1',
        'Vegetariana',
        'García',
      ]) {
        expect(logged).not.toContain(secret);
      }
    });
  });
});
