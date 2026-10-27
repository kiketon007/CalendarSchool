import { describe, expect, it } from 'vitest';
import type { Subject } from './subject.js';
import { subjectChanges } from './subjectChanges.js';

const COURSE_1 = { id: 'course-1', name: '1º Primaria', sessionsPerWeek: 3 };
const COURSE_2 = { id: 'course-2', name: '2º Primaria', sessionsPerWeek: 3 };
const COURSE_3 = { id: 'course-3', name: '3º Primaria', sessionsPerWeek: 2 };

const base: Subject = {
  id: 'subject-1',
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  description: 'Lengua extranjera',
  color: 'blue',
  createdAt: new Date('2026-10-26T09:30:00Z'),
  courses: [COURSE_1, COURSE_2],
};

const nothing = { changedFields: [], coursesAdded: 0, coursesRemoved: 0, coursesChanged: 0 };

describe('subjectChanges', () => {
  it('reports nothing when the subject is the same', () => {
    expect(subjectChanges(base, { ...base })).toEqual(nothing);
  });

  it.each([
    ['name', { name: 'Inglés avanzado' }],
    ['code', { code: 'ING2' }],
    ['code', { code: null }],
    ['type', { type: 'ELECTIVE' }],
    ['status', { status: 'INACTIVE' }],
    ['description', { description: null }],
    ['color', { color: 'green' }],
  ] as const)('reports %s when only it changes', (field, change) => {
    expect(subjectChanges(base, { ...base, ...change })).toEqual({
      ...nothing,
      changedFields: [field],
    });
  });

  it('counts a change of capitalization in the name or the code as a change', () => {
    expect(subjectChanges(base, { ...base, name: 'INGLÉS', code: 'ing' }).changedFields).toEqual([
      'name',
      'code',
    ]);
  });

  it('lists the changed fields in the order of the form', () => {
    const after: Subject = {
      ...base,
      color: 'green',
      status: 'INACTIVE',
      name: 'Otra',
      courses: [COURSE_1],
    };
    expect(subjectChanges(base, after).changedFields).toEqual([
      'name',
      'status',
      'color',
      'courses',
    ]);
  });

  it('counts the courses that are added, removed and kept with other sessions', () => {
    const after: Subject = {
      ...base,
      courses: [{ ...COURSE_1, sessionsPerWeek: 2 }, COURSE_3],
    };
    expect(subjectChanges(base, after)).toEqual({
      changedFields: ['courses'],
      coursesAdded: 1,
      coursesRemoved: 1,
      coursesChanged: 1,
    });
  });

  it('reports only courses when just the sessions of one course change', () => {
    const after: Subject = { ...base, courses: [COURSE_1, { ...COURSE_2, sessionsPerWeek: 5 }] };
    expect(subjectChanges(base, after)).toEqual({
      changedFields: ['courses'],
      coursesAdded: 0,
      coursesRemoved: 0,
      coursesChanged: 1,
    });
  });

  it('does not count the order of the courses', () => {
    expect(subjectChanges(base, { ...base, courses: [COURSE_2, COURSE_1] })).toEqual(nothing);
  });

  it('counts a subject that had no courses and gets one', () => {
    expect(subjectChanges({ ...base, courses: [] }, { ...base, courses: [COURSE_3] })).toEqual({
      changedFields: ['courses'],
      coursesAdded: 1,
      coursesRemoved: 0,
      coursesChanged: 0,
    });
  });
});
