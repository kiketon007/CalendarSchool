import { describe, expect, it } from 'vitest';
import { subjectFieldCases } from '../../../test/support/subjectFixtures.js';
import { parseCreateSubjectRequest } from './createSubjectRequest.js';
import { parseUpdateSubjectRequest } from './updateSubjectRequest.js';

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE = { courseId: COURSE_ID, sessionsPerWeek: 3 };
const BASE = {
  name: 'Inglés',
  type: 'CORE',
  status: 'ACTIVE',
  color: 'blue',
  courses: [COURSE],
};

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 50);

describe('parseUpdateSubjectRequest', () => {
  it('reads the final state: the cleaned texts, the optional ones as null and the courses', () => {
    expect(
      parseUpdateSubjectRequest({
        name: '  Inglés  avanzado ',
        code: '   ',
        type: 'ELECTIVE',
        status: 'INACTIVE',
        description: '  ',
        color: 'green',
        courses: [COURSE],
      }),
    ).toEqual({
      success: true,
      data: {
        name: 'Inglés avanzado',
        code: null,
        type: 'ELECTIVE',
        status: 'INACTIVE',
        description: null,
        color: 'green',
        courses: [COURSE],
      },
    });
  });

  it('ignores unknown properties such as the school and the id', () => {
    const result = parseUpdateSubjectRequest({ ...BASE, schoolId: 'otro', id: 'x' });
    expect(result).toEqual(parseCreateSubjectRequest(BASE));
    expect(result.success).toBe(true);
  });

  it('does not accept a subject without courses: it has to keep at least one', () => {
    expect(parseUpdateSubjectRequest({ ...BASE, courses: [] })).toEqual({
      success: false,
      details: [{ field: 'courses', code: 'REQUIRED' }],
    });
  });

  describe.each([
    ['name', subjectFieldCases('subjectName')],
    ['code', subjectFieldCases('code')],
    ['description', subjectFieldCases('description')],
    ['type', subjectFieldCases('type')],
    ['status', subjectFieldCases('status')],
    ['color', subjectFieldCases('color')],
    ['courses', subjectFieldCases('courses')],
  ] as const)('%s (shared table)', (field, cases) => {
    it.each(cases.invalid.map(({ value }) => [label(value), value]))(
      'gives the same error as the creation for %s',
      (_label, value) => {
        const body = { ...BASE, [field]: value };
        expect(parseUpdateSubjectRequest(body)).toEqual(parseCreateSubjectRequest(body));
      },
    );
  });

  it.each([null, undefined, 'texto', 5, []])(
    'reports the required fields of a body that is %j like the creation',
    (body) => {
      const result = parseUpdateSubjectRequest(body);
      expect(result).toEqual(parseCreateSubjectRequest(body));
      expect(result.success).toBe(false);
    },
  );
});
