import { describe, expect, it } from 'vitest';
import type { CourseAssignments } from '../services/courseAssignmentsService';
import {
  assignTutor,
  cellKey,
  draftFrom,
  hasChanges,
  sessionsByProfessor,
  toBody,
  unassignedCount,
} from './courseAssignmentsDraft';

const subject = (id: string, sessionsPerWeek: number) => ({
  id,
  name: id,
  code: null,
  color: 'blue' as const,
  status: 'ACTIVE' as const,
  sessionsPerWeek,
});

const matrix: CourseAssignments = {
  course: { id: 'course', name: '1º Primaria' },
  subjects: [subject('english', 3), subject('language', 5), subject('music', 1)],
  classes: [
    { id: 'a', name: 'A', tutor: { id: 'ana', firstName: 'Ana', lastName: 'García' } },
    { id: 'b', name: 'B', tutor: null },
  ],
  assignments: [
    { subjectId: 'english', classId: 'a', professorId: 'ana' },
    { subjectId: 'language', classId: 'b', professorId: 'luis' },
  ],
};

describe('cellKey', () => {
  it('joins the subject and the class', () => {
    expect(cellKey('english', 'a')).toBe('english:a');
  });
});

describe('draftFrom', () => {
  it('has one cell per subject and class, assigned or null', () => {
    expect(draftFrom(matrix)).toEqual({
      'english:a': 'ana',
      'english:b': null,
      'language:a': null,
      'language:b': 'luis',
      'music:a': null,
      'music:b': null,
    });
  });

  it('is empty for a course without subjects or without classes', () => {
    expect(draftFrom({ ...matrix, subjects: [], assignments: [] })).toEqual({});
    expect(draftFrom({ ...matrix, classes: [], assignments: [] })).toEqual({});
  });

  it('ignores an assignment whose cell is not in the matrix', () => {
    const stray = {
      ...matrix,
      assignments: [{ subjectId: 'gone', classId: 'a', professorId: 'x' }],
    };

    expect(Object.values(draftFrom(stray)).every((value) => value === null)).toBe(true);
  });
});

describe('unassignedCount', () => {
  it('counts the cells without professor', () => {
    expect(unassignedCount(draftFrom(matrix))).toBe(4);
  });

  it('is 0 when everything is assigned and the total when nothing is', () => {
    expect(unassignedCount({ 'x:a': 'ana', 'y:a': 'luis' })).toBe(0);
    expect(unassignedCount({ 'x:a': null, 'y:a': null })).toBe(2);
  });
});

describe('assignTutor', () => {
  it('fills only the empty cells of the class with the tutor', () => {
    const draft = { ...draftFrom(matrix), 'language:a': 'luis' };

    const result = assignTutor(draft, 'a', 'ana', matrix.subjects);

    expect(result['english:a']).toBe('ana');
    expect(result['language:a']).toBe('luis');
    expect(result['music:a']).toBe('ana');
  });

  it('does not touch the cells of the other classes', () => {
    const result = assignTutor(draftFrom(matrix), 'a', 'ana', matrix.subjects);

    expect(result['english:b']).toBeNull();
    expect(result['language:b']).toBe('luis');
    expect(result['music:b']).toBeNull();
  });

  it('does not modify the draft it receives', () => {
    const draft = draftFrom(matrix);
    const before = structuredClone(draft);

    assignTutor(draft, 'a', 'ana', matrix.subjects);

    expect(draft).toEqual(before);
  });
});

describe('sessionsByProfessor', () => {
  it('adds the sessions of the subject of each cell of the professor', () => {
    const draft = {
      ...draftFrom(matrix),
      'english:b': 'ana',
      'language:a': 'ana',
    };

    expect(sessionsByProfessor(draft, matrix.subjects)).toEqual(
      new Map([
        ['ana', 3 + 3 + 5],
        ['luis', 5],
      ]),
    );
  });

  it('is empty when nothing is assigned', () => {
    expect(sessionsByProfessor({ 'english:a': null }, matrix.subjects).size).toBe(0);
  });
});

describe('hasChanges', () => {
  it('is false for the draft made from the same matrix', () => {
    expect(hasChanges(draftFrom(matrix), matrix)).toBe(false);
  });

  it('is true when a cell is assigned, changed or emptied', () => {
    const base = draftFrom(matrix);

    expect(hasChanges({ ...base, 'music:a': 'ana' }, matrix)).toBe(true);
    expect(hasChanges({ ...base, 'english:a': 'luis' }, matrix)).toBe(true);
    expect(hasChanges({ ...base, 'english:a': null }, matrix)).toBe(true);
  });

  it('is false again when a change is undone', () => {
    const changed = { ...draftFrom(matrix), 'english:a': 'luis' };
    const undone = { ...changed, 'english:a': 'ana' };

    expect(hasChanges(changed, matrix)).toBe(true);
    expect(hasChanges(undone, matrix)).toBe(false);
  });
});

describe('toBody', () => {
  it('lists the assigned cells in the order of the matrix, leaving out the empty ones', () => {
    const draft = { ...draftFrom(matrix), 'music:b': 'luis' };

    expect(toBody(draft, matrix)).toEqual([
      { subjectId: 'english', classId: 'a', professorId: 'ana' },
      { subjectId: 'language', classId: 'b', professorId: 'luis' },
      { subjectId: 'music', classId: 'b', professorId: 'luis' },
    ]);
  });

  it('is empty when nothing is assigned', () => {
    expect(toBody({ 'english:a': null }, matrix)).toEqual([]);
  });
});
