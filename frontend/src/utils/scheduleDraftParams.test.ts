import { describe, expect, it } from 'vitest';
import type { ScheduleDraft } from '../services/scheduleDraftService';
import { paramsFromSelection, selectionFromParams } from './scheduleDraftParams';

const calendar = {
  id: 'calendar-1',
  name: 'Primaria',
  periods: [{ type: 'SESSION' as const, startTime: '09:00', endTime: '09:45' }],
};

const draft: ScheduleDraft = {
  id: 'schedule-1',
  status: 'DRAFT',
  generatedAt: '2026-11-04T08:00:05.000Z',
  placedSessions: 0,
  courses: [
    { id: 'course-empty', name: '0º', calendar, classes: [] },
    {
      id: 'course-1',
      name: '1º',
      calendar,
      classes: [
        { id: 'class-1a', name: 'A' },
        { id: 'class-1b', name: 'B' },
      ],
    },
  ],
  subjects: [],
  professors: [
    { id: 'ana', firstName: 'Ana', lastName: 'García' },
    { id: 'luis', firstName: 'Luis', lastName: 'Pérez' },
  ],
  entries: [],
};

const parse = (query: string, source: ScheduleDraft = draft) =>
  selectionFromParams(new URLSearchParams(query), source);

describe('selectionFromParams', () => {
  it('uses the class view of the first class of the first course with classes by default', () => {
    expect(parse('')).toEqual({
      view: 'clase',
      classId: 'class-1a',
      professorId: 'ana',
      day: 1,
    });
  });

  it.each([
    ['vista=clase', 'clase'],
    ['vista=profesor', 'profesor'],
    ['vista=colegio', 'colegio'],
  ])('reads the view from %s', (query, view) => {
    expect(parse(query).view).toBe(view);
  });

  it('ignores a view that does not exist', () => {
    expect(parse('vista=semana').view).toBe('clase');
  });

  it('reads a class, a professor and a day that exist in the draft', () => {
    expect(parse('vista=clase&clase=class-1b').classId).toBe('class-1b');
    expect(parse('vista=profesor&profesor=luis').professorId).toBe('luis');
    expect(parse('vista=colegio&dia=3').day).toBe(3);
  });

  it('ignores a class or a professor that is not in the draft, with no error', () => {
    expect(parse('clase=class-9').classId).toBe('class-1a');
    expect(parse('profesor=nobody').professorId).toBe('ana');
  });

  it.each(['0', '6', 'lunes', '2.5', '', '-1', '3abc'])('ignores the day %j', (day) => {
    expect(parse(`dia=${day}`).day).toBe(1);
  });

  it('has no class or professor when the draft has none', () => {
    const empty: ScheduleDraft = { ...draft, courses: [], professors: [] };

    expect(parse('', empty)).toEqual({ view: 'clase', classId: null, professorId: null, day: 1 });
  });
});

describe('paramsFromSelection', () => {
  const base = { view: 'clase', classId: 'class-1a', professorId: 'ana', day: 1 } as const;

  it('writes nothing for the default selection', () => {
    expect(paramsFromSelection(base, draft).toString()).toBe('');
  });

  it('writes the view and only the id of that view', () => {
    expect(
      paramsFromSelection({ ...base, view: 'clase', classId: 'class-1b' }, draft).toString(),
    ).toBe('clase=class-1b');
    expect(
      paramsFromSelection({ ...base, view: 'profesor', professorId: 'luis' }, draft).toString(),
    ).toBe('vista=profesor&profesor=luis');
    expect(paramsFromSelection({ ...base, view: 'colegio', day: 4 }, draft).toString()).toBe(
      'vista=colegio&dia=4',
    );
  });

  it('omits the id and the day when they are the default ones', () => {
    expect(
      paramsFromSelection({ ...base, view: 'profesor', professorId: 'ana' }, draft).toString(),
    ).toBe('vista=profesor');
    expect(paramsFromSelection({ ...base, view: 'colegio', day: 1 }, draft).toString()).toBe(
      'vista=colegio',
    );
  });

  it('only writes ids and numbers, never names', () => {
    const written = paramsFromSelection(
      { view: 'profesor', classId: 'class-1b', professorId: 'luis', day: 3 },
      draft,
    ).toString();

    expect(written).not.toMatch(/García|Pérez|Primaria/u);
  });

  it('round-trips with selectionFromParams', () => {
    for (const selection of [
      { view: 'clase', classId: 'class-1b', professorId: 'ana', day: 1 },
      { view: 'profesor', classId: 'class-1a', professorId: 'luis', day: 1 },
      { view: 'colegio', classId: 'class-1a', professorId: 'ana', day: 5 },
    ] as const) {
      expect(selectionFromParams(paramsFromSelection(selection, draft), draft)).toEqual(selection);
    }
  });
});
