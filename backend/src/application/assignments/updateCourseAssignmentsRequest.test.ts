import { describe, expect, it } from 'vitest';
import {
  MAX_ASSIGNMENTS,
  parseUpdateCourseAssignmentsRequest,
} from './updateCourseAssignmentsRequest.js';

const S1 = '0192f5a0-0000-7000-8000-0000000000e1';
const S2 = '0192f5a0-0000-7000-8000-0000000000e2';
const C1 = '0192f5a0-0000-7000-8000-0000000000c1';
const C2 = '0192f5a0-0000-7000-8000-0000000000c2';
const P1 = '0192f5a0-0000-7000-8000-0000000000f1';
const P2 = '0192f5a0-0000-7000-8000-0000000000f2';

const entry = (subjectId: unknown, classId: unknown, professorId: unknown) => ({
  subjectId,
  classId,
  professorId,
});

const failures = (body: unknown) => {
  const result = parseUpdateCourseAssignmentsRequest(body);
  return result.success ? undefined : result.details;
};

describe('parseUpdateCourseAssignmentsRequest', () => {
  describe('a valid body', () => {
    it('keeps the entries in the order of the body', () => {
      const result = parseUpdateCourseAssignmentsRequest({
        assignments: [entry(S2, C2, P2), entry(S1, C1, P1)],
      });

      expect(result).toEqual({
        success: true,
        data: {
          assignments: [
            { subjectId: S2, classId: C2, professorId: P2 },
            { subjectId: S1, classId: C1, professorId: P1 },
          ],
        },
      });
    });

    it('accepts an empty list: nothing is assigned', () => {
      expect(parseUpdateCourseAssignmentsRequest({ assignments: [] })).toEqual({
        success: true,
        data: { assignments: [] },
      });
    });

    it('accepts the same professor in several classes and subjects', () => {
      expect(
        parseUpdateCourseAssignmentsRequest({
          assignments: [entry(S1, C1, P1), entry(S1, C2, P1), entry(S2, C1, P1)],
        }).success,
      ).toBe(true);
    });

    it('ignores a school sent in the body and any other extra property', () => {
      const result = parseUpdateCourseAssignmentsRequest({
        assignments: [{ ...entry(S1, C1, P1), sessionsPerWeek: 9 }],
        schoolId: 'other-school',
      });

      expect(result).toEqual({
        success: true,
        data: { assignments: [{ subjectId: S1, classId: C1, professorId: P1 }] },
      });
    });

    it(`accepts ${String(MAX_ASSIGNMENTS)} entries`, () => {
      const assignments = Array.from({ length: MAX_ASSIGNMENTS }, (_, index) =>
        entry(`0192f5a0-0000-7000-8000-${String(index).padStart(12, '0')}`, C1, P1),
      );

      expect(parseUpdateCourseAssignmentsRequest({ assignments }).success).toBe(true);
    });
  });

  describe('the list', () => {
    it.each([
      ['a missing list', {}],
      ['a null list', { assignments: null }],
      ['a text', { assignments: 'x' }],
      ['an object', { assignments: {} }],
      ['a body that is not an object', 'x'],
      ['a null body', null],
    ])('rejects %s as REQUIRED', (_name, body) => {
      expect(failures(body)).toEqual([{ field: 'assignments', code: 'REQUIRED' }]);
    });

    it('rejects more entries than the maximum with INVALID_LENGTH and reads none', () => {
      const assignments = Array.from({ length: MAX_ASSIGNMENTS + 1 }, () => entry(1, 2, 3));

      expect(failures({ assignments })).toEqual([{ field: 'assignments', code: 'INVALID_LENGTH' }]);
    });
  });

  describe('the fields of each entry', () => {
    it.each(['subjectId', 'classId', 'professorId'] as const)(
      'rejects a missing or null %s as REQUIRED',
      (field) => {
        const base = { subjectId: S1, classId: C1, professorId: P1 };

        expect(failures({ assignments: [{ ...base, [field]: undefined }] })).toEqual([
          { field: `assignments[0].${field}`, code: 'REQUIRED' },
        ]);
        expect(failures({ assignments: [{ ...base, [field]: null }] })).toEqual([
          { field: `assignments[0].${field}`, code: 'REQUIRED' },
        ]);
      },
    );

    it.each(['x', '123', '', 5, true, {}])('rejects %j as INVALID_FORMAT in every id', (value) => {
      expect(failures({ assignments: [entry(value, value, value)] })).toEqual([
        { field: 'assignments[0].subjectId', code: 'INVALID_FORMAT' },
        { field: 'assignments[0].classId', code: 'INVALID_FORMAT' },
        { field: 'assignments[0].professorId', code: 'INVALID_FORMAT' },
      ]);
    });

    it.each([null, 'x', 5, undefined])(
      'rejects an entry that is %j with its three fields as REQUIRED',
      (item) => {
        expect(failures({ assignments: [item] })).toEqual([
          { field: 'assignments[0].subjectId', code: 'REQUIRED' },
          { field: 'assignments[0].classId', code: 'REQUIRED' },
          { field: 'assignments[0].professorId', code: 'REQUIRED' },
        ]);
      },
    );

    it('reports every entry with its position, in the order of the body', () => {
      expect(
        failures({
          assignments: [
            entry('x', C1, P1),
            entry(S1, C1, P1),
            entry(S2, undefined, P2),
            entry(S2, C2, 'y'),
          ],
        }),
      ).toEqual([
        { field: 'assignments[0].subjectId', code: 'INVALID_FORMAT' },
        { field: 'assignments[2].classId', code: 'REQUIRED' },
        { field: 'assignments[3].professorId', code: 'INVALID_FORMAT' },
      ]);
    });
  });

  describe('duplicates', () => {
    it('marks DUPLICATE from the second entry with the same subject and class, even with another professor', () => {
      expect(
        failures({
          assignments: [entry(S1, C1, P1), entry(S1, C2, P1), entry(S1, C1, P2), entry(S1, C1, P1)],
        }),
      ).toEqual([
        { field: 'assignments[2]', code: 'DUPLICATE' },
        { field: 'assignments[3]', code: 'DUPLICATE' },
      ]);
    });

    it('does not mark an entry that already has wrong fields as DUPLICATE', () => {
      expect(failures({ assignments: [entry(S1, C1, P1), entry(S1, C1, 'x')] })).toEqual([
        { field: 'assignments[1].professorId', code: 'INVALID_FORMAT' },
      ]);
    });

    it('puts a DUPLICATE in the position of its entry, among the field errors', () => {
      expect(
        failures({
          assignments: [entry(S1, C1, P1), entry(S1, C1, P2), entry('x', C1, P1)],
        }),
      ).toEqual([
        { field: 'assignments[1]', code: 'DUPLICATE' },
        { field: 'assignments[2].subjectId', code: 'INVALID_FORMAT' },
      ]);
    });
  });
});
