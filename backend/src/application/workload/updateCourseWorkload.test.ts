import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseWorkloadSnapshot } from '../../domain/workload/courseWorkload.js';
import type { CourseWorkloadRepository } from '../../domain/workload/courseWorkloadRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { UpdateCourseWorkload } from './updateCourseWorkload.js';

const SUBJECT_A = '0192f5a0-0000-7000-8000-0000000000e1';
const SUBJECT_B = '0192f5a0-0000-7000-8000-0000000000e2';

const identity = { schoolId: 'school-1', actorId: 'actor-1', courseId: 'course-1' } as const;
const body = {
  changes: [
    { subjectId: SUBJECT_A, sessionsPerWeek: 4 },
    { subjectId: SUBJECT_B, sessionsPerWeek: null },
  ],
};

const snapshot: CourseWorkloadSnapshot = {
  course: { id: 'course-1', name: '1º Primaria' },
  calendar: { id: 'calendar-1', name: 'Jornada continua', sessionsPerDay: 6 },
  subjects: [
    {
      id: SUBJECT_B,
      name: 'Música',
      code: null,
      color: 'pink',
      status: 'ACTIVE',
      sessionsPerWeek: null,
    },
    {
      id: SUBJECT_A,
      name: 'Inglés',
      code: 'ING',
      color: 'blue',
      status: 'ACTIVE',
      sessionsPerWeek: 4,
    },
  ],
};

describe('UpdateCourseWorkload', () => {
  let applyChanges: Mock<CourseWorkloadRepository['applyChanges']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: UpdateCourseWorkload;

  beforeEach(() => {
    applyChanges = vi.fn<CourseWorkloadRepository['applyChanges']>().mockResolvedValue({
      kind: 'applied',
      added: 1,
      removed: 1,
      changed: 1,
      workload: snapshot,
    });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new UpdateCourseWorkload({
      courseWorkloadRepository: { applyChanges },
      logger: { info, warn },
    });
  });

  it('applies only the parsed changes in the school and course of the identity and returns the balance', async () => {
    const workload = await useCase.execute({ ...identity, body });

    expect(applyChanges).toHaveBeenCalledExactlyOnceWith('school-1', 'course-1', [
      { subjectId: SUBJECT_A, sessionsPerWeek: 4 },
      { subjectId: SUBJECT_B, sessionsPerWeek: null },
    ]);
    expect(workload.subjects.map((subject) => subject.name)).toEqual(['Inglés', 'Música']);
    expect(workload.assignedSessions).toBe(4);
    expect(workload.availableSessions).toBe(30);
  });

  it('throws ValidationError without touching the repository or logging when the body is invalid', async () => {
    await expect(
      useCase.execute({
        ...identity,
        body: { changes: [{ subjectId: SUBJECT_A, sessionsPerWeek: 9 }] },
      }),
    ).rejects.toMatchObject({
      details: [{ field: 'changes[0].sessionsPerWeek', code: 'OUT_OF_RANGE' }],
    });

    expect(applyChanges).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs COURSE_WORKLOAD_UPDATED with the counts and only identifiers', async () => {
    await useCase.execute({ ...identity, body });

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_WORKLOAD_UPDATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        course_id: 'course-1',
        subjects_added: 1,
        subjects_removed: 1,
        subjects_changed: 1,
      },
      expect.any(String),
    );
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain('Inglés');
    expect(logged).not.toContain('ING');
  });

  it('does not log an update when nothing changed, but still answers with the load', async () => {
    applyChanges.mockResolvedValue({
      kind: 'applied',
      added: 0,
      removed: 0,
      changed: 0,
      workload: snapshot,
    });

    const workload = await useCase.execute({ ...identity, body });

    expect(workload.course.id).toBe('course-1');
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('carries the warning of a load that does not fit, and still saves it', async () => {
    applyChanges.mockResolvedValue({
      kind: 'applied',
      added: 0,
      removed: 0,
      changed: 1,
      workload: {
        ...snapshot,
        calendar: { id: 'calendar-1', name: 'Corta', sessionsPerDay: 1 },
        subjects: [
          { ...snapshot.subjects[1]!, sessionsPerWeek: 5 },
          { ...snapshot.subjects[0]!, sessionsPerWeek: 2 },
        ],
      },
    });

    const workload = await useCase.execute({ ...identity, body });

    expect(workload.warnings).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 7, available: 5 },
    ]);
    expect(info).toHaveBeenCalledOnce();
  });

  it('throws CourseNotFound and logs the rejection when the course is not in the school', async () => {
    applyChanges.mockResolvedValue({ kind: 'courseNotFound' });

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(CourseNotFound);

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_WORKLOAD_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        course_id: 'course-1',
        reason: 'not_found',
      },
      expect.any(String),
    );
  });

  it('marks each missing subject as NOT_FOUND in its change and logs the rejection', async () => {
    applyChanges.mockResolvedValue({ kind: 'subjectsNotFound', positions: [1] });

    const error = await useCase.execute({ ...identity, body }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual([
      { field: 'changes[1].subjectId', code: 'NOT_FOUND' },
    ]);
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        event: 'COURSE_WORKLOAD_UPDATE_REJECTED',
        reason: 'subject_not_found',
      }),
      expect.any(String),
    );
  });

  it('lets a database failure through without logging an update', async () => {
    applyChanges.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
