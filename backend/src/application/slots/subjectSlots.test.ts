import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { SlotRuleType, SubjectSlotsSnapshot } from '../../domain/slots/subjectSlots.js';
import { CourseHasNoCalendar, SubjectCourseNotFound } from '../../domain/slots/slotsErrors.js';
import type { SubjectSlotsRepository } from '../../domain/slots/subjectSlotsRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { buildSubjectSlotRule } from './buildSubjectSlotRule.js';
import { GetSubjectSlots } from './getSubjectSlots.js';
import { UpdateSubjectSlots } from './updateSubjectSlots.js';

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
  forbiddenCells: [{ dayOfWeek: 1, sessionNumber: 1 }],
};

const TYPES: SlotRuleType[] = ['FORBIDDEN_SLOTS', 'PREFERRED_SLOTS'];

describe('buildSubjectSlotRule', () => {
  it('shapes the response of the contract, without the groups of sessions', () => {
    const rule = buildSubjectSlotRule(snapshot, 'FORBIDDEN_SLOTS');

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
    const rule = buildSubjectSlotRule(
      { ...snapshot, calendar: null, cells: [], forbiddenCells: [], outsideCount: 3 },
      'FORBIDDEN_SLOTS',
    );

    expect(rule.calendar).toBeNull();
    expect(rule.outsideCalendarCount).toBe(3);
    expect(rule.warnings).toEqual([{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 3 }]);
  });

  it('warns that the subject does not fit with the forbidden slots and the groups of the calendar', () => {
    const everyCell = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
      { dayOfWeek, sessionNumber: 1 },
      { dayOfWeek, sessionNumber: 2 },
    ]);
    const rule = buildSubjectSlotRule(
      {
        ...snapshot,
        subject: { ...snapshot.subject, sessionsPerWeek: 1 },
        cells: everyCell,
        forbiddenCells: everyCell,
      },
      'FORBIDDEN_SLOTS',
    );

    expect(rule.warnings).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
  });

  it('does not add forbiddenSlots to the forbidden slots', () => {
    expect(buildSubjectSlotRule(snapshot, 'FORBIDDEN_SLOTS')).not.toHaveProperty('forbiddenSlots');
  });

  describe('preferred slots', () => {
    const preferred: SubjectSlotsSnapshot = {
      ...snapshot,
      cells: [
        { dayOfWeek: 1, sessionNumber: 1 },
        { dayOfWeek: 2, sessionNumber: 1 },
      ],
      forbiddenCells: [
        { dayOfWeek: 1, sessionNumber: 1 },
        { dayOfWeek: 1, sessionNumber: 2 },
      ],
    };

    it('adds the forbidden cells of the pair, to paint them', () => {
      const rule = buildSubjectSlotRule(preferred, 'PREFERRED_SLOTS');

      expect(rule.slots).toEqual(preferred.cells);
      expect(rule.forbiddenSlots).toEqual(preferred.forbiddenCells);
    });

    it('warns of the preferred cells that are also forbidden, with how many', () => {
      const rule = buildSubjectSlotRule(preferred, 'PREFERRED_SLOTS');

      expect(rule.warnings).toEqual([{ code: 'PREFERRED_SLOTS_FORBIDDEN', count: 1 }]);
    });

    it('decides whether the subject fits with the forbidden cells, never with the preferred ones', () => {
      const everyDay = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
        { dayOfWeek, sessionNumber: 1 },
        { dayOfWeek, sessionNumber: 2 },
      ]);
      const allForbidden = buildSubjectSlotRule(
        {
          ...snapshot,
          subject: { ...snapshot.subject, sessionsPerWeek: 1 },
          cells: [],
          forbiddenCells: everyDay,
        },
        'PREFERRED_SLOTS',
      );
      const onlyPreferred = buildSubjectSlotRule(
        {
          ...snapshot,
          subject: { ...snapshot.subject, sessionsPerWeek: 1 },
          cells: everyDay,
          forbiddenCells: [],
        },
        'PREFERRED_SLOTS',
      );

      expect(allForbidden.warnings).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
      expect(onlyPreferred.warnings).toEqual([]);
    });

    it('puts the outside warning before the contradiction', () => {
      const rule = buildSubjectSlotRule({ ...preferred, outsideCount: 2 }, 'PREFERRED_SLOTS');

      expect(rule.warnings).toEqual([
        { code: 'SLOTS_OUTSIDE_CALENDAR', count: 2 },
        { code: 'PREFERRED_SLOTS_FORBIDDEN', count: 1 },
      ]);
    });
  });
});

describe.each(TYPES)('GetSubjectSlots (%s)', (type) => {
  it('asks for the school, course, subject and type of the request and builds the rule', async () => {
    const find = vi.fn<SubjectSlotsRepository['find']>().mockResolvedValue(snapshot);

    const rule = await new GetSubjectSlots({ subjectSlotsRepository: { find } }).execute({
      ...identity,
      type,
    });

    expect(find).toHaveBeenCalledExactlyOnceWith('school-1', 'course-1', 'subject-1', type);
    expect(rule).toEqual(buildSubjectSlotRule(snapshot, type));
  });

  it('throws SubjectCourseNotFound when there is no pair, and lets a database failure through', async () => {
    const find = vi.fn<SubjectSlotsRepository['find']>().mockResolvedValue(null);
    const useCase = new GetSubjectSlots({ subjectSlotsRepository: { find } });

    await expect(useCase.execute({ ...identity, type })).rejects.toBeInstanceOf(
      SubjectCourseNotFound,
    );

    find.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
    await expect(useCase.execute({ ...identity, type })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});

describe.each(TYPES)('UpdateSubjectSlots (%s)', (type) => {
  let replace: Mock<SubjectSlotsRepository['replace']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: UpdateSubjectSlots;

  const request = {
    ...identity,
    type,
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
    useCase = new UpdateSubjectSlots({
      subjectSlotsRepository: { replace },
      logger: { info, warn },
    });
  });

  it('saves the cells in the school, course and subject of the request and answers with the rule', async () => {
    const rule = await useCase.execute(request);

    expect(replace).toHaveBeenCalledExactlyOnceWith('school-1', 'course-1', 'subject-1', type, [
      { dayOfWeek: 2, sessionNumber: 1 },
      { dayOfWeek: 1, sessionNumber: 1 },
    ]);
    expect(rule).toEqual(buildSubjectSlotRule(snapshot, type));
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
        type,
        slot_count: 2,
      },
      expect.stringContaining(type === 'FORBIDDEN_SLOTS' ? 'prohibidas' : 'preferidas'),
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
        type,
        reason: 'not_found',
      },
      expect.any(String),
    );
  });

  it('throws CourseHasNoCalendar and logs the rejection when the course has no calendar', async () => {
    replace.mockResolvedValue({ kind: 'noCalendar' });

    await expect(useCase.execute(request)).rejects.toBeInstanceOf(CourseHasNoCalendar);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        event: 'SUBJECT_SLOTS_UPDATE_REJECTED',
        type,
        reason: 'no_calendar',
      }),
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
