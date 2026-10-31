import { describe, expect, it, vi } from 'vitest';
import type { CourseAssignmentsSnapshot } from '../../domain/assignment/courseAssignments.js';
import type { CourseAssignmentsRepository } from '../../domain/assignment/courseAssignmentsRepository.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import { ValidationError } from '../validationError.js';
import { GetCourseAssignments } from './getCourseAssignments.js';
import { UpdateCourseAssignments } from './updateCourseAssignments.js';

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const S_ENGLISH = '0192f5a0-0000-7000-8000-0000000000e1';
const S_LANGUAGE = '0192f5a0-0000-7000-8000-0000000000e2';
const C_A = '0192f5a0-0000-7000-8000-0000000000c1';
const C_B = '0192f5a0-0000-7000-8000-0000000000c2';
const P_ANA = '0192f5a0-0000-7000-8000-0000000000f1';
const P_LUIS = '0192f5a0-0000-7000-8000-0000000000f2';

const subject = (id: string, name: string, sessionsPerWeek: number) => ({
  id,
  name,
  code: null,
  color: 'blue' as const,
  status: 'ACTIVE' as const,
  sessionsPerWeek,
});

/** Desordenada a propósito: el caso de uso la ordena. */
const snapshot: CourseAssignmentsSnapshot = {
  course: { id: COURSE_ID, name: '1º Primaria' },
  subjects: [subject(S_LANGUAGE, 'Lengua', 5), subject(S_ENGLISH, 'Inglés', 3)],
  classes: [
    { id: C_B, name: 'B', tutor: null },
    { id: C_A, name: 'A', tutor: { id: P_ANA, firstName: 'Ana', lastName: 'García' } },
  ],
  assignments: [
    { subjectId: S_LANGUAGE, classId: C_B, professorId: P_LUIS },
    { subjectId: S_ENGLISH, classId: C_A, professorId: P_ANA },
    { subjectId: S_LANGUAGE, classId: C_A, professorId: P_ANA },
  ],
};

describe('GetCourseAssignments', () => {
  it('reads the matrix of the course of the school of the identity', async () => {
    const find = vi.fn<CourseAssignmentsRepository['find']>().mockResolvedValue(snapshot);

    await new GetCourseAssignments({ assignmentsRepository: { find } }).execute({
      schoolId: 'school-1',
      courseId: COURSE_ID,
    });

    expect(find).toHaveBeenCalledExactlyOnceWith('school-1', COURSE_ID);
  });

  it('sorts the subjects and the classes by name and the assignments by subject and class', async () => {
    const find = vi.fn<CourseAssignmentsRepository['find']>().mockResolvedValue(snapshot);

    const result = await new GetCourseAssignments({ assignmentsRepository: { find } }).execute({
      schoolId: 'school-1',
      courseId: COURSE_ID,
    });

    expect(result.subjects.map(({ name }) => name)).toEqual(['Inglés', 'Lengua']);
    expect(result.classes.map(({ name }) => name)).toEqual(['A', 'B']);
    expect(result.assignments).toEqual([
      { subjectId: S_ENGLISH, classId: C_A, professorId: P_ANA },
      { subjectId: S_LANGUAGE, classId: C_A, professorId: P_ANA },
      { subjectId: S_LANGUAGE, classId: C_B, professorId: P_LUIS },
    ]);
  });

  it('sorts the classes in natural order', async () => {
    const find = vi.fn<CourseAssignmentsRepository['find']>().mockResolvedValue({
      ...snapshot,
      classes: ['10', '2', '1'].map((name, index) => ({
        id: `c${String(index)}`,
        name,
        tutor: null,
      })),
      assignments: [],
    });

    const result = await new GetCourseAssignments({ assignmentsRepository: { find } }).execute({
      schoolId: 'school-1',
      courseId: COURSE_ID,
    });

    expect(result.classes.map(({ name }) => name)).toEqual(['1', '2', '10']);
  });

  it('does not modify what the repository returned', async () => {
    const before = structuredClone(snapshot);
    const find = vi.fn<CourseAssignmentsRepository['find']>().mockResolvedValue(snapshot);

    await new GetCourseAssignments({ assignmentsRepository: { find } }).execute({
      schoolId: 'school-1',
      courseId: COURSE_ID,
    });

    expect(snapshot).toEqual(before);
  });

  it('throws CourseNotFound when the course is not in the school', async () => {
    const find = vi.fn<CourseAssignmentsRepository['find']>().mockResolvedValue(null);

    await expect(
      new GetCourseAssignments({ assignmentsRepository: { find } }).execute({
        schoolId: 'school-1',
        courseId: COURSE_ID,
      }),
    ).rejects.toBeInstanceOf(CourseNotFound);
  });
});

describe('UpdateCourseAssignments', () => {
  const logger = () => ({ info: vi.fn(), warn: vi.fn() });
  const body = {
    assignments: [
      { subjectId: S_ENGLISH, classId: C_A, professorId: P_ANA },
      { subjectId: S_LANGUAGE, classId: C_A, professorId: P_ANA },
    ],
  };
  const input = { schoolId: 'school-1', actorId: 'user-1', courseId: COURSE_ID, body };

  function build(result: Awaited<ReturnType<CourseAssignmentsRepository['replace']>>) {
    const replace = vi.fn<CourseAssignmentsRepository['replace']>().mockResolvedValue(result);
    const log = logger();
    return {
      replace,
      log,
      useCase: new UpdateCourseAssignments({ assignmentsRepository: { replace }, logger: log }),
    };
  }

  it('passes the entries of the body to the repository and answers with the sorted matrix', async () => {
    const { replace, useCase } = build({
      kind: 'replaced',
      added: 2,
      removed: 0,
      changed: 0,
      assignments: snapshot,
    });

    const result = await useCase.execute(input);

    expect(replace).toHaveBeenCalledExactlyOnceWith('school-1', COURSE_ID, body.assignments);
    expect(result.subjects.map(({ name }) => name)).toEqual(['Inglés', 'Lengua']);
    expect(result.classes.map(({ name }) => name)).toEqual(['A', 'B']);
  });

  it('logs COURSE_ASSIGNMENTS_UPDATED with only identifiers and counts when it replaced', async () => {
    const { log, useCase } = build({
      kind: 'replaced',
      added: 2,
      removed: 1,
      changed: 3,
      assignments: snapshot,
    });

    await useCase.execute(input);

    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_ASSIGNMENTS_UPDATED',
        school_id: 'school-1',
        actor_id: 'user-1',
        course_id: COURSE_ID,
        added: 2,
        removed: 1,
        changed: 3,
      },
      expect.any(String),
    );
  });

  it('logs nothing when the matrix was already stored', async () => {
    const { log, useCase } = build({ kind: 'unchanged', assignments: snapshot });

    await useCase.execute(input);

    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('throws CourseNotFound and logs the rejection when the course is not in the school', async () => {
    const { log, useCase } = build({ kind: 'notFound' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(CourseNotFound);

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_ASSIGNMENTS_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'user-1',
        course_id: COURSE_ID,
        reason: 'not_found',
      },
      expect.any(String),
    );
  });

  it('turns the invalid references into NOT_FOUND errors by position and logs the rejection', async () => {
    const { log, useCase } = build({
      kind: 'invalidReferences',
      references: [
        { position: 0, field: 'subjectId' },
        { position: 1, field: 'professorId' },
      ],
    });

    const attempt = useCase.execute(input);

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      details: [
        { field: 'assignments[0].subjectId', code: 'NOT_FOUND' },
        { field: 'assignments[1].professorId', code: 'NOT_FOUND' },
      ],
    });
    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_ASSIGNMENTS_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'user-1',
        course_id: COURSE_ID,
        reason: 'invalid_reference',
      },
      expect.any(String),
    );
  });

  it('throws ValidationError with the fields and does not touch the repository', async () => {
    const { replace, log, useCase } = build({ kind: 'unchanged', assignments: snapshot });

    const attempt = useCase.execute({ ...input, body: { assignments: [{ subjectId: 'x' }] } });

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      details: [
        { field: 'assignments[0].subjectId', code: 'INVALID_FORMAT' },
        { field: 'assignments[0].classId', code: 'REQUIRED' },
        { field: 'assignments[0].professorId', code: 'REQUIRED' },
      ],
    });
    expect(replace).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });

  it('never writes a name into the log', async () => {
    const { log, useCase } = build({
      kind: 'replaced',
      added: 1,
      removed: 0,
      changed: 0,
      assignments: snapshot,
    });

    await useCase.execute(input);

    expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/Ana|García|Inglés|Primaria/);
  });

  it('lets a failure of the repository reach the caller', async () => {
    const failure = new Error('database down');
    const replace = vi.fn<CourseAssignmentsRepository['replace']>().mockRejectedValue(failure);

    await expect(
      new UpdateCourseAssignments({
        assignmentsRepository: { replace },
        logger: logger(),
      }).execute(input),
    ).rejects.toBe(failure);
  });
});
