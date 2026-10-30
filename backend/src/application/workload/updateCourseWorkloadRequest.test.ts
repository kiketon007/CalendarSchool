import { describe, expect, it } from 'vitest';
import { parseUpdateCourseWorkloadRequest } from './updateCourseWorkloadRequest.js';

const SUBJECT_A = '0192f5a0-0000-7000-8000-0000000000e1';
const SUBJECT_B = '0192f5a0-0000-7000-8000-0000000000e2';

describe('parseUpdateCourseWorkloadRequest', () => {
  it('reads the changes in the order they arrived, with null for a subject that stops being taught', () => {
    expect(
      parseUpdateCourseWorkloadRequest({
        changes: [
          { subjectId: SUBJECT_A, sessionsPerWeek: 4 },
          { subjectId: SUBJECT_B, sessionsPerWeek: null },
        ],
      }),
    ).toEqual({
      success: true,
      data: {
        changes: [
          { subjectId: SUBJECT_A, sessionsPerWeek: 4 },
          { subjectId: SUBJECT_B, sessionsPerWeek: null },
        ],
      },
    });
  });

  it('accepts the limits: 1 and 5 sessions and 200 changes', () => {
    const many = Array.from({ length: 200 }, (_, index) => ({
      subjectId: `0192f5a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
      sessionsPerWeek: 1 + (index % 5),
    }));

    expect(parseUpdateCourseWorkloadRequest({ changes: many }).success).toBe(true);
  });

  it('lowercases the ids of the subjects', () => {
    expect(
      parseUpdateCourseWorkloadRequest({
        changes: [{ subjectId: SUBJECT_A.toUpperCase(), sessionsPerWeek: 2 }],
      }),
    ).toEqual({
      success: true,
      data: { changes: [{ subjectId: SUBJECT_A, sessionsPerWeek: 2 }] },
    });
  });

  it('ignores unknown properties, the school never comes from the body', () => {
    const result = parseUpdateCourseWorkloadRequest({
      schoolId: 'other',
      changes: [{ subjectId: SUBJECT_A, sessionsPerWeek: 2, extra: true }],
    });

    expect(result).toEqual({
      success: true,
      data: { changes: [{ subjectId: SUBJECT_A, sessionsPerWeek: 2 }] },
    });
  });

  it.each([undefined, null, 'x', 7, []] as unknown[])(
    'asks for the changes when the body is %s',
    (body) => {
      expect(parseUpdateCourseWorkloadRequest(body)).toEqual({
        success: false,
        details: [{ field: 'changes', code: 'REQUIRED' }],
      });
    },
  );

  it.each([
    [{ changes: null }, 'REQUIRED'],
    [{ changes: 'x' }, 'INVALID_FORMAT'],
    [{ changes: {} }, 'INVALID_FORMAT'],
    [{ changes: [] }, 'INVALID_LENGTH'],
  ] as const)('rejects changes %s with %s', (body, code) => {
    expect(parseUpdateCourseWorkloadRequest(body)).toEqual({
      success: false,
      details: [{ field: 'changes', code }],
    });
  });

  it('rejects more than 200 changes with INVALID_LENGTH', () => {
    const many = Array.from({ length: 201 }, (_, index) => ({
      subjectId: `0192f5a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
      sessionsPerWeek: 1,
    }));

    expect(parseUpdateCourseWorkloadRequest({ changes: many })).toEqual({
      success: false,
      details: [{ field: 'changes', code: 'INVALID_LENGTH' }],
    });
  });

  it.each([null, 'x', 7, [], true] as unknown[])(
    'rejects a change that is not an object (%s) with INVALID_FORMAT',
    (change) => {
      expect(parseUpdateCourseWorkloadRequest({ changes: [change] })).toEqual({
        success: false,
        details: [{ field: 'changes[0]', code: 'INVALID_FORMAT' }],
      });
    },
  );

  it.each([
    [undefined, 'REQUIRED'],
    [null, 'REQUIRED'],
    ['not-a-uuid', 'INVALID_FORMAT'],
    ['', 'INVALID_FORMAT'],
    [7, 'INVALID_FORMAT'],
  ] as const)('rejects the subjectId %s with %s', (subjectId, code) => {
    expect(
      parseUpdateCourseWorkloadRequest({ changes: [{ subjectId, sessionsPerWeek: 2 }] }),
    ).toEqual({ success: false, details: [{ field: 'changes[0].subjectId', code }] });
  });

  it.each([
    [undefined, 'REQUIRED'],
    [0, 'OUT_OF_RANGE'],
    [6, 'OUT_OF_RANGE'],
    [-1, 'OUT_OF_RANGE'],
    [2.5, 'INVALID_FORMAT'],
    ['3', 'INVALID_FORMAT'],
    [true, 'INVALID_FORMAT'],
    [Number.NaN, 'INVALID_FORMAT'],
  ] as const)('rejects the sessions %s with %s', (sessionsPerWeek, code) => {
    expect(
      parseUpdateCourseWorkloadRequest({ changes: [{ subjectId: SUBJECT_A, sessionsPerWeek }] }),
    ).toEqual({ success: false, details: [{ field: 'changes[0].sessionsPerWeek', code }] });
  });

  it('marks a repeated subject from its second appearance, without distinguishing the case', () => {
    expect(
      parseUpdateCourseWorkloadRequest({
        changes: [
          { subjectId: SUBJECT_A, sessionsPerWeek: 2 },
          { subjectId: SUBJECT_B, sessionsPerWeek: 3 },
          { subjectId: SUBJECT_A.toUpperCase(), sessionsPerWeek: null },
        ],
      }),
    ).toEqual({
      success: false,
      details: [{ field: 'changes[2].subjectId', code: 'DUPLICATE' }],
    });
  });

  it('reports every invalid field in order, the subject before the sessions of each change', () => {
    expect(
      parseUpdateCourseWorkloadRequest({
        changes: [
          { subjectId: 'x', sessionsPerWeek: 9 },
          { subjectId: SUBJECT_A, sessionsPerWeek: 3 },
          { sessionsPerWeek: 0 },
        ],
      }),
    ).toEqual({
      success: false,
      details: [
        { field: 'changes[0].subjectId', code: 'INVALID_FORMAT' },
        { field: 'changes[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
        { field: 'changes[2].subjectId', code: 'REQUIRED' },
        { field: 'changes[2].sessionsPerWeek', code: 'OUT_OF_RANGE' },
      ],
    });
  });
});
