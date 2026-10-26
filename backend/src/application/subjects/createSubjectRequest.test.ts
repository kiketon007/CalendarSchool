import { describe, expect, it } from 'vitest';
import { subjectFieldCases } from '../../../test/support/subjectFixtures.js';
import { parseCreateSubjectRequest } from './createSubjectRequest.js';

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE = { courseId: COURSE_ID, sessionsPerWeek: 3 };

/** Cuerpo válido sobre el que cada test cambia solo lo que prueba. */
const BASE = {
  name: 'Inglés',
  type: 'CORE',
  status: 'ACTIVE',
  color: 'blue',
  courses: [COURSE],
};

const names = subjectFieldCases('subjectName');
const codes = subjectFieldCases('code');
const descriptions = subjectFieldCases('description');
const types = subjectFieldCases('type');
const statuses = subjectFieldCases('status');
const colors = subjectFieldCases('color');
const sessions = subjectFieldCases('sessionsPerWeek');
const courseLists = subjectFieldCases('courses');

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 50);

/** Un texto opcional ausente, vacío o solo con espacios se guarda como `null`; si no, recortado. */
const expectedOptional = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

describe('parseCreateSubjectRequest', () => {
  describe.each([
    ['name', 'name', names],
    ['type', 'type', types],
    ['status', 'status', statuses],
    ['color', 'color', colors],
  ] as const)('%s (shared table)', (field, key, cases) => {
    it.each(cases.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseCreateSubjectRequest({ ...BASE, [key]: value }).success).toBe(true);
      },
    );

    it.each(cases.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        expect(parseCreateSubjectRequest({ ...BASE, [key]: value })).toEqual({
          success: false,
          details: [{ field, code }],
        });
      },
    );
  });

  it('cleans the name: composed accents, no outer spaces and single inner spaces', () => {
    const result = parseCreateSubjectRequest({ ...BASE, name: '  Ciencias   de la  Naturaleza ' });

    expect(result).toMatchObject({ success: true, data: { name: 'Ciencias de la Naturaleza' } });
  });

  describe.each([
    ['code', codes],
    ['description', descriptions],
  ] as const)('%s (shared table, optional)', (field, cases) => {
    it.each(cases.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s and keeps it clean, or null when empty',
      (_label, value) => {
        expect(parseCreateSubjectRequest({ ...BASE, [field]: value })).toMatchObject({
          success: true,
          data: { [field]: expectedOptional(value) },
        });
      },
    );

    it.each(cases.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        expect(parseCreateSubjectRequest({ ...BASE, [field]: value })).toEqual({
          success: false,
          details: [{ field, code }],
        });
      },
    );

    it('treats an explicit null as no value', () => {
      expect(parseCreateSubjectRequest({ ...BASE, [field]: null })).toMatchObject({
        success: true,
        data: { [field]: null },
      });
    });
  });

  describe('sessionsPerWeek of a course (shared table)', () => {
    const withSessions = (value: unknown) => ({
      ...BASE,
      courses: [{ courseId: COURSE_ID, sessionsPerWeek: value }],
    });

    it.each(sessions.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseCreateSubjectRequest(withSessions(value)).success).toBe(true);
      },
    );

    it.each(sessions.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        expect(parseCreateSubjectRequest(withSessions(value))).toEqual({
          success: false,
          details: [{ field: 'courses[0].sessionsPerWeek', code }],
        });
      },
    );
  });

  describe('courses (shared table)', () => {
    it.each(courseLists.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseCreateSubjectRequest({ ...BASE, courses: value }).success).toBe(true);
      },
    );

    it.each(courseLists.invalid.map(({ value, issues }) => [label(value), value, issues]))(
      'rejects the invalid example %s with exactly its issues',
      (_label, value, issues) => {
        expect(parseCreateSubjectRequest({ ...BASE, courses: value })).toEqual({
          success: false,
          details: issues,
        });
      },
    );

    it('rejects more than 100 courses with INVALID_LENGTH', () => {
      const courses = Array.from({ length: 101 }, (_value, index) => ({
        courseId: `0192f5a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
        sessionsPerWeek: 2,
      }));

      expect(parseCreateSubjectRequest({ ...BASE, courses })).toEqual({
        success: false,
        details: [{ field: 'courses', code: 'INVALID_LENGTH' }],
      });
    });

    it('accepts exactly 100 courses', () => {
      const courses = Array.from({ length: 100 }, (_value, index) => ({
        courseId: `0192f5a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
        sessionsPerWeek: 2,
      }));

      expect(parseCreateSubjectRequest({ ...BASE, courses }).success).toBe(true);
    });

    it('lower-cases the course ids and keeps the order and the sessions', () => {
      const result = parseCreateSubjectRequest({
        ...BASE,
        courses: [
          { courseId: '0192F5A0-0000-7000-8000-0000000000D2', sessionsPerWeek: 5 },
          { courseId: COURSE_ID, sessionsPerWeek: 1 },
        ],
      });

      expect(result).toMatchObject({
        success: true,
        data: {
          courses: [
            { courseId: '0192f5a0-0000-7000-8000-0000000000d2', sessionsPerWeek: 5 },
            { courseId: COURSE_ID, sessionsPerWeek: 1 },
          ],
        },
      });
    });
  });

  it('returns the whole subject with its optional fields empty when only the required ones come', () => {
    expect(parseCreateSubjectRequest(BASE)).toEqual({
      success: true,
      data: {
        name: 'Inglés',
        code: null,
        type: 'CORE',
        status: 'ACTIVE',
        description: null,
        color: 'blue',
        courses: [COURSE],
      },
    });
  });

  it('reports one error per invalid field, in the order of the body', () => {
    const result = parseCreateSubjectRequest({
      name: '',
      code: 'IN G',
      type: 'OTHER',
      status: 'ARCHIVED',
      description: 'a'.repeat(501),
      color: 'magenta',
      courses: [{ courseId: 'no-es-uuid', sessionsPerWeek: 9 }],
    });

    expect(result).toEqual({
      success: false,
      details: [
        { field: 'name', code: 'REQUIRED' },
        { field: 'code', code: 'INVALID_CHARACTERS' },
        { field: 'type', code: 'INVALID_FORMAT' },
        { field: 'status', code: 'INVALID_FORMAT' },
        { field: 'description', code: 'INVALID_LENGTH' },
        { field: 'color', code: 'INVALID_FORMAT' },
        { field: 'courses[0].courseId', code: 'INVALID_FORMAT' },
        { field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
      ],
    });
  });

  it.each([undefined, null, 'texto', 5, []])(
    'asks for every required field when the body is %j',
    (body) => {
      expect(parseCreateSubjectRequest(body)).toEqual({
        success: false,
        details: [
          { field: 'name', code: 'REQUIRED' },
          { field: 'type', code: 'REQUIRED' },
          { field: 'status', code: 'REQUIRED' },
          { field: 'color', code: 'REQUIRED' },
          { field: 'courses', code: 'REQUIRED' },
        ],
      });
    },
  );

  it('ignores unknown properties: the school, an id and the courses of the answer', () => {
    const result = parseCreateSubjectRequest({
      ...BASE,
      schoolId: 'otro',
      id: 'x',
      createdAt: '2020-01-01',
    });

    expect(result).toEqual({
      success: true,
      data: {
        name: 'Inglés',
        code: null,
        type: 'CORE',
        status: 'ACTIVE',
        description: null,
        color: 'blue',
        courses: [COURSE],
      },
    });
  });
});
