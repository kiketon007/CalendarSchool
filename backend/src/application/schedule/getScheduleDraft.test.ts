import { describe, expect, it, vi } from 'vitest';
import type {
  ScheduleDraftRepository,
  StoredDraftEntry,
  StoredScheduleDraft,
} from '../../domain/schedule/scheduleDraft.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { GetScheduleDraft } from './getScheduleDraft.js';

const SCHOOL_ID = 'school-1';
const GENERATED_AT = new Date('2026-11-04T08:00:05.000Z');

const calendar = {
  id: 'calendar-1',
  name: 'Primaria',
  periods: [
    { kind: 'SESSION' as const, startMinute: 540, endMinute: 585 },
    { kind: 'BREAK' as const, startMinute: 585, endMinute: 615 },
    { kind: 'SESSION' as const, startMinute: 615, endMinute: 660 },
  ],
};

function entry(overrides: Partial<StoredDraftEntry> = {}): StoredDraftEntry {
  return {
    courseId: 'course-1',
    classId: 'class-1a',
    subjectId: 'subject-1',
    professorId: 'professor-1',
    dayOfWeek: 1,
    sessionNumber: 1,
    startMinute: 540,
    endMinute: 585,
    ...overrides,
  };
}

function draftOf(overrides: Partial<StoredScheduleDraft> = {}): StoredScheduleDraft {
  return {
    id: 'schedule-1',
    generatedAt: GENERATED_AT,
    placedSessions: 1,
    courses: [
      { id: 'course-1', name: '1º Primaria', calendar, classes: [{ id: 'class-1a', name: 'A' }] },
    ],
    subjects: [{ id: 'subject-1', name: 'Inglés', code: 'ING', color: 'blue' }],
    professors: [{ id: 'professor-1', firstName: 'Ana', lastName: 'García' }],
    entries: [entry()],
    ...overrides,
  };
}

function useCaseWith(draft: StoredScheduleDraft | null) {
  const findDraft = vi.fn<ScheduleDraftRepository['findDraft']>().mockResolvedValue(draft);
  return { useCase: new GetScheduleDraft({ scheduleDraftRepository: { findDraft } }), findDraft };
}

describe('GetScheduleDraft', () => {
  it('asks for the draft of the school of the session', async () => {
    const { useCase, findDraft } = useCaseWith(null);

    await useCase.execute({ schoolId: SCHOOL_ID });

    expect(findDraft).toHaveBeenCalledExactlyOnceWith(SCHOOL_ID);
  });

  it('returns null when the school has no draft', async () => {
    const { useCase } = useCaseWith(null);

    await expect(useCase.execute({ schoolId: SCHOOL_ID })).resolves.toBeNull();
  });

  it('returns the draft with the header and the hours as HH:MM', async () => {
    const { useCase } = useCaseWith(draftOf());

    const view = await useCase.execute({ schoolId: SCHOOL_ID });

    expect(view).toEqual({
      id: 'schedule-1',
      status: 'DRAFT',
      generatedAt: GENERATED_AT,
      placedSessions: 1,
      courses: [
        {
          id: 'course-1',
          name: '1º Primaria',
          calendar: {
            id: 'calendar-1',
            name: 'Primaria',
            periods: [
              { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
              { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
              { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
            ],
          },
          classes: [{ id: 'class-1a', name: 'A' }],
        },
      ],
      subjects: [{ id: 'subject-1', name: 'Inglés', code: 'ING', color: 'blue' }],
      professors: [{ id: 'professor-1', firstName: 'Ana', lastName: 'García' }],
      entries: [
        {
          courseId: 'course-1',
          classId: 'class-1a',
          subjectId: 'subject-1',
          professorId: 'professor-1',
          dayOfWeek: 1,
          sessionNumber: 1,
          startTime: '09:00',
          endTime: '09:45',
        },
      ],
    });
  });

  it('keeps a course without calendar and an entry without professor', async () => {
    const { useCase } = useCaseWith(
      draftOf({
        courses: [
          {
            id: 'course-1',
            name: '1º Primaria',
            calendar: null,
            classes: [{ id: 'class-1a', name: 'A' }],
          },
        ],
        entries: [entry({ professorId: null })],
        professors: [],
      }),
    );

    const view = await useCase.execute({ schoolId: SCHOOL_ID });

    expect(view?.courses[0]?.calendar).toBeNull();
    expect(view?.entries[0]?.professorId).toBeNull();
  });

  it('sorts courses and classes naturally, so 2º goes before 10º and A before B', async () => {
    const { useCase } = useCaseWith(
      draftOf({
        courses: [
          {
            id: 'course-10',
            name: '10º',
            calendar,
            classes: [
              { id: 'class-10b', name: 'B' },
              { id: 'class-10a', name: 'A' },
            ],
          },
          { id: 'course-2', name: '2º', calendar, classes: [{ id: 'class-2a', name: 'A' }] },
        ],
        entries: [],
      }),
    );

    const view = await useCase.execute({ schoolId: SCHOOL_ID });

    expect(view?.courses.map(({ name }) => name)).toEqual(['2º', '10º']);
    expect(view?.courses[1]?.classes.map(({ name }) => name)).toEqual(['A', 'B']);
  });

  it('sorts subjects by name and professors by last name and first name, ignoring accents', async () => {
    const { useCase } = useCaseWith(
      draftOf({
        subjects: [
          { id: 's-2', name: 'Matemáticas', code: null, color: 'red' },
          { id: 's-1', name: 'Inglés', code: 'ING', color: 'blue' },
          { id: 's-3', name: 'Álgebra', code: null, color: 'green' },
        ],
        professors: [
          { id: 'p-3', firstName: 'Luis', lastName: 'Pérez' },
          { id: 'p-2', firstName: 'Eva', lastName: 'García' },
          { id: 'p-1', firstName: 'Ana', lastName: 'García' },
        ],
        entries: [],
      }),
    );

    const view = await useCase.execute({ schoolId: SCHOOL_ID });

    expect(view?.subjects.map(({ name }) => name)).toEqual(['Álgebra', 'Inglés', 'Matemáticas']);
    expect(view?.professors.map(({ id }) => id)).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('sorts the entries by class, then day, then session', async () => {
    const { useCase } = useCaseWith(
      draftOf({
        courses: [
          {
            id: 'course-1',
            name: '1º',
            calendar,
            classes: [
              { id: 'class-1b', name: 'B' },
              { id: 'class-1a', name: 'A' },
            ],
          },
        ],
        entries: [
          entry({ classId: 'class-1b', dayOfWeek: 1, sessionNumber: 1 }),
          entry({ classId: 'class-1a', dayOfWeek: 2, sessionNumber: 1 }),
          entry({ classId: 'class-1a', dayOfWeek: 1, sessionNumber: 2 }),
          entry({ classId: 'class-1a', dayOfWeek: 1, sessionNumber: 1 }),
        ],
      }),
    );

    const view = await useCase.execute({ schoolId: SCHOOL_ID });

    expect(
      view?.entries.map(({ classId, dayOfWeek, sessionNumber }) => [
        classId,
        dayOfWeek,
        sessionNumber,
      ]),
    ).toEqual([
      ['class-1a', 1, 1],
      ['class-1a', 1, 2],
      ['class-1a', 2, 1],
      ['class-1b', 1, 1],
    ]);
  });

  it('does not modify the draft it read', async () => {
    const draft = draftOf({
      subjects: [
        { id: 's-2', name: 'Matemáticas', code: null, color: 'red' },
        { id: 's-1', name: 'Inglés', code: 'ING', color: 'blue' },
      ],
    });
    const { useCase } = useCaseWith(draft);

    await useCase.execute({ schoolId: SCHOOL_ID });

    expect(draft.subjects.map(({ id }) => id)).toEqual(['s-2', 's-1']);
  });

  it('lets the database unavailability through', async () => {
    const findDraft = vi
      .fn<ScheduleDraftRepository['findDraft']>()
      .mockRejectedValue(new DatabaseUnavailable(new Error('down')));
    const useCase = new GetScheduleDraft({ scheduleDraftRepository: { findDraft } });

    await expect(useCase.execute({ schoolId: SCHOOL_ID })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});
