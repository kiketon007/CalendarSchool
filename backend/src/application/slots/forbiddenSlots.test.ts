import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { SubjectSlotsSnapshot } from '../../domain/slots/subjectSlots.js';
import { CourseHasNoCalendar, SubjectCourseNotFound } from '../../domain/slots/slotsErrors.js';
import type { SubjectSlotsRepository } from '../../domain/slots/subjectSlotsRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { buildSubjectSlotRule } from './buildSubjectSlotRule.js';
import { GetForbiddenSlots } from './getForbiddenSlots.js';
import { UpdateForbiddenSlots } from './updateForbiddenSlots.js';

const identity = {
  schoolId: 'school-1',
  courseId: 'course-1',
  subjectId: 'subject-1',
} as const;

const snapshot: SubjectSlotsSnapshot = {
  course: { id: 'course-1', name: '1º Primaria' },
  subject: {
    id: 'subject-1',
    name: 'Religión',
    code: 'REL',
    color: 'purple',
    sessionsPerWeek: 2,
    maxPerDay: null,
    blockSize: null,
  },
  calendar: {
    id: 'calendar-1',
    name: 'Jornada',
    periods: [
      { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
      { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
      { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
    ],
    sessionGroups: [1, 1],
  },
  cells: [{ dayOfWeek: 1, sessionNumber: 1 }],
  outsideCount: 0,
};

describe('buildSubjectSlotRule', () => {
  it('shapes the response of the contract, without the groups of sessions', () => {
    const rule = buildSubjectSlotRule(snapshot);

    expect(rule).toEqual({
      course: snapshot.course,
      subject: snapshot.subject,
      calendar: {
        id: 'calendar-1',
        name: 'Jornada',
        periods: snapshot.calendar!.periods,
      },
      slots: snapshot.cells,
      outsideCalendarCount: 0,
      warnings: [],
    });
  });

  it('has a null calendar when the course has none, and all its cells outside', () => {
    const rule = buildSubjectSlotRule({ ...snapshot, calendar: null, cells: [], outsideCount: 3 });

    expect(rule.calendar).toBeNull();
    expect(rule.outsideCalendarCount).toBe(3);
    expect(rule.warnings).toEqual([{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 3 }]);
  });

  it('warns that the subject does not fit with the forbidden slots and the groups of the calendar', () => {
    const everyCell = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
      { dayOfWeek, sessionNumber: 1 },
      { dayOfWeek, sessionNumber: 2 },
    ]);
    const rule = buildSubjectSlotRule({
      ...snapshot,
      subject: { ...snapshot.subject, sessionsPerWeek: 1 },
      cells: everyCell,
    });

    expect(rule.warnings).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
  });
});

describe('GetForbiddenSlots', () => {
  it('asks for the school, course and subject of the request and builds the rule', async () => {
    const find = vi.fn<SubjectSlotsRepository['find']>().mockResolvedValue(snapshot);

    const rule = await new GetForbiddenSlots({ subjectSlotsRepository: { find } }).execute(
      identity,
    );

    expect(find).toHaveBeenCalledExactlyOnceWith('school-1', 'course-1', 'subject-1');
    expect(rule).toEqual(buildSubjectSlotRule(snapshot));
  });

  it('throws SubjectCourseNotFound when there is no pair, and lets a database failure through', async () => {
    const find = vi.fn<SubjectSlotsRepository['find']>().mockResolvedValue(null);
    const useCase = new GetForbiddenSlots({ subjectSlotsRepository: { find } });

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(SubjectCourseNotFound);

    find.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});

describe('UpdateForbiddenSlots', () => {
  let replace: Mock<SubjectSlotsRepository['replace']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: UpdateForbiddenSlots;

  const request = {
    ...identity,
    actorId: 'actor-1',
    body: {
      slots: [
        { dayOfWeek: 2, sessionNumber: 1 },
        { dayOfWeek: 1, sessionNumber: 1 },
      ],
    },
  };

  beforeEach(() => {
    replace = vi.fn<SubjectSlotsRepository['replace']>().mockResolvedValue({
      kind: 'saved',
      changed: true,
      slotCount: 2,
      snapshot,
    });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new UpdateForbiddenSlots({
      subjectSlotsRepository: { replace },
      logger: { info, warn },
    });
  });

  it('saves the cells in the school, course and subject of the request and answers with the rule', async () => {
    const rule = await useCase.execute(request);

    expect(replace).toHaveBeenCalledExactlyOnceWith('school-1', 'course-1', 'subject-1', [
      { dayOfWeek: 2, sessionNumber: 1 },
      { dayOfWeek: 1, sessionNumber: 1 },
    ]);
    expect(rule).toEqual(buildSubjectSlotRule(snapshot));
  });

  it('throws ValidationError without touching the repository or logging when the body is invalid', async () => {
    await expect(
      useCase.execute({ ...request, body: { slots: [{ dayOfWeek: 6, sessionNumber: 1 }] } }),
    ).rejects.toMatchObject({
      details: [{ field: 'slots[0].dayOfWeek', code: 'OUT_OF_RANGE' }],
    });

    expect(replace).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs SUBJECT_SLOTS_UPDATED with the count and only identifiers', async () => {
    await useCase.execute(request);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SUBJECT_SLOTS_UPDATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        course_id: 'course-1',
        subject_id: 'subject-1',
        type: 'FORBIDDEN_SLOTS',
        slot_count: 2,
      },
      expect.any(String),
    );
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain('Religión');
    expect(logged).not.toContain('REL');
  });

  it('does not log an update when nothing changed, but still answers with the rule', async () => {
    replace.mockResolvedValue({ kind: 'saved', changed: false, slotCount: 2, snapshot });

    const rule = await useCase.execute(request);

    expect(rule.course.id).toBe('course-1');
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws SubjectCourseNotFound and logs the rejection when the pair does not exist', async () => {
    replace.mockResolvedValue({ kind: 'notFound' });

    await expect(useCase.execute(request)).rejects.toBeInstanceOf(SubjectCourseNotFound);

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SUBJECT_SLOTS_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        course_id: 'course-1',
        subject_id: 'subject-1',
        reason: 'not_found',
      },
      expect.any(String),
    );
  });

  it('throws CourseHasNoCalendar and logs the rejection when the course has no calendar', async () => {
    replace.mockResolvedValue({ kind: 'noCalendar' });

    await expect(useCase.execute(request)).rejects.toBeInstanceOf(CourseHasNoCalendar);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ event: 'SUBJECT_SLOTS_UPDATE_REJECTED', reason: 'no_calendar' }),
      expect.any(String),
    );
  });

  it('marks each cell whose session is not in the calendar as OUT_OF_RANGE, at its position', async () => {
    replace.mockResolvedValue({ kind: 'outOfCalendar', positions: [1] });

    const error = await useCase.execute(request).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual([
      { field: 'slots[1].sessionNumber', code: 'OUT_OF_RANGE' },
    ]);
    expect(info).not.toHaveBeenCalled();
  });

  it('lets a database failure through without logging an update', async () => {
    replace.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute(request)).rejects.toBeInstanceOf(DatabaseUnavailable);
    expect(info).not.toHaveBeenCalled();
  });
});
