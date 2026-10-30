import { describe, expect, it } from 'vitest';
import { parseUpdateCourseWorkloadRequest } from './updateCourseWorkloadRequest.js';

const SUBJECT_A = '0192f5a0-0000-7000-8000-0000000000e1';
const SUBJECT_B = '0192f5a0-0000-7000-8000-0000000000e2';

/** Un cambio válido: la fila entera, sin reglas salvo que se indiquen. */
function change(overrides: Record<string, unknown> = {}) {
  return {
    subjectId: SUBJECT_A,
    sessionsPerWeek: 2,
    maxPerDay: null,
    blockSize: null,
    ...overrides,
  };
}

describe('parseUpdateCourseWorkloadRequest', () => {
  it('reads the changes in the order they arrived, with null for a subject that stops being taught', () => {
    const changes = [
      change({ sessionsPerWeek: 4, maxPerDay: 2, blockSize: 2 }),
      change({ subjectId: SUBJECT_B, sessionsPerWeek: null }),
    ];

    expect(parseUpdateCourseWorkloadRequest({ changes })).toEqual({
      success: true,
      data: { changes },
    });
  });

  it('accepts the limits: 1 and 5 sessions and 200 changes', () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      change({
        subjectId: `0192f5a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
        sessionsPerWeek: 1 + (index % 5),
      }),
    );

    expect(parseUpdateCourseWorkloadRequest({ changes: many }).success).toBe(true);
  });

  it('lowercases the ids of the subjects', () => {
    expect(
      parseUpdateCourseWorkloadRequest({
        changes: [change({ subjectId: SUBJECT_A.toUpperCase() })],
      }),
    ).toEqual({ success: true, data: { changes: [change()] } });
  });

  it('ignores unknown properties, the school never comes from the body', () => {
    const result = parseUpdateCourseWorkloadRequest({
      schoolId: 'other',
      changes: [change({ extra: true })],
    });

    expect(result).toEqual({ success: true, data: { changes: [change()] } });
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
    const many = Array.from({ length: 201 }, (_, index) =>
      change({
        subjectId: `0192f5a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
        sessionsPerWeek: 1,
      }),
    );

    expect(parseUpdateCourseWorkloadRequest({ changes: many })).toEqual({
      success: false,
      details: [{ field: 'changes', code: 'INVALID_LENGTH' }],
    });
  });

  it.each([null, 'x', 7, [], true] as unknown[])(
    'rejects a change that is not an object (%s) with INVALID_FORMAT',
    (item) => {
      expect(parseUpdateCourseWorkloadRequest({ changes: [item] })).toEqual({
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
    expect(parseUpdateCourseWorkloadRequest({ changes: [change({ subjectId })] })).toEqual({
      success: false,
      details: [{ field: 'changes[0].subjectId', code }],
    });
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
    expect(parseUpdateCourseWorkloadRequest({ changes: [change({ sessionsPerWeek })] })).toEqual({
      success: false,
      details: [{ field: 'changes[0].sessionsPerWeek', code }],
    });
  });

  describe.each([
    ['maxPerDay', [2, 5], [0, 1, 6, -1]],
    ['blockSize', [2, 3], [0, 1, 4, -1]],
  ] as const)('the rule %s', (field, valid, outOfRange) => {
    it.each(valid)('accepts %i', (value) => {
      expect(parseUpdateCourseWorkloadRequest({ changes: [change({ [field]: value })] })).toEqual({
        success: true,
        data: { changes: [change({ [field]: value })] },
      });
    });

    it('accepts null, which removes the rule', () => {
      expect(
        parseUpdateCourseWorkloadRequest({ changes: [change({ [field]: null })] }).success,
      ).toBe(true);
    });

    it('asks for it when it is missing', () => {
      const rest: Record<string, unknown> = change();
      delete rest[field];

      expect(parseUpdateCourseWorkloadRequest({ changes: [rest] })).toEqual({
        success: false,
        details: [{ field: `changes[0].${field}`, code: 'REQUIRED' }],
      });
    });

    it.each(outOfRange)('rejects %i with OUT_OF_RANGE', (value) => {
      expect(parseUpdateCourseWorkloadRequest({ changes: [change({ [field]: value })] })).toEqual({
        success: false,
        details: [{ field: `changes[0].${field}`, code: 'OUT_OF_RANGE' }],
      });
    });

    it.each([2.5, '2', true, Number.NaN] as unknown[])(
      'rejects %s with INVALID_FORMAT',
      (value) => {
        expect(parseUpdateCourseWorkloadRequest({ changes: [change({ [field]: value })] })).toEqual(
          {
            success: false,
            details: [{ field: `changes[0].${field}`, code: 'INVALID_FORMAT' }],
          },
        );
      },
    );

    it('is NOT_ALLOWED with a value when the subject stops being taught', () => {
      expect(
        parseUpdateCourseWorkloadRequest({
          changes: [change({ sessionsPerWeek: null, [field]: 2 })],
        }),
      ).toEqual({
        success: false,
        details: [{ field: `changes[0].${field}`, code: 'NOT_ALLOWED' }],
      });
    });

    it('reports the range before NOT_ALLOWED when the subject stops being taught', () => {
      expect(
        parseUpdateCourseWorkloadRequest({
          changes: [change({ sessionsPerWeek: null, [field]: 9 })],
        }),
      ).toEqual({
        success: false,
        details: [{ field: `changes[0].${field}`, code: 'OUT_OF_RANGE' }],
      });
    });
  });

  it('accepts a subject that stops being taught with both rules at null', () => {
    expect(
      parseUpdateCourseWorkloadRequest({ changes: [change({ sessionsPerWeek: null })] }).success,
    ).toBe(true);
  });

  it('marks a repeated subject from its second appearance, without distinguishing the case', () => {
    expect(
      parseUpdateCourseWorkloadRequest({
        changes: [
          change(),
          change({ subjectId: SUBJECT_B, sessionsPerWeek: 3 }),
          change({ subjectId: SUBJECT_A.toUpperCase(), sessionsPerWeek: null }),
        ],
      }),
    ).toEqual({
      success: false,
      details: [{ field: 'changes[2].subjectId', code: 'DUPLICATE' }],
    });
  });

  it('reports every invalid field in order: subject, sessions, maximum and block of each change', () => {
    expect(
      parseUpdateCourseWorkloadRequest({
        changes: [
          { subjectId: 'x', sessionsPerWeek: 9, maxPerDay: 1, blockSize: 4 },
          change({ sessionsPerWeek: 3 }),
          { sessionsPerWeek: null, maxPerDay: 2, blockSize: 2 },
        ],
      }),
    ).toEqual({
      success: false,
      details: [
        { field: 'changes[0].subjectId', code: 'INVALID_FORMAT' },
        { field: 'changes[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
        { field: 'changes[0].maxPerDay', code: 'OUT_OF_RANGE' },
        { field: 'changes[0].blockSize', code: 'OUT_OF_RANGE' },
        { field: 'changes[2].subjectId', code: 'REQUIRED' },
        { field: 'changes[2].maxPerDay', code: 'NOT_ALLOWED' },
        { field: 'changes[2].blockSize', code: 'NOT_ALLOWED' },
      ],
    });
  });
});
