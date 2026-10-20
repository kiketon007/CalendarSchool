import { describe, expect, it } from 'vitest';
import { courseFieldCases } from '../../../test/support/courseFixtures.js';
import { parseUpdateCourseRequest } from './updateCourseRequest.js';

const ID_A = '0192f5a0-0000-7000-8000-0000000000a1';
const ID_B = '0192f5a0-0000-7000-8000-0000000000b2';

/** Cuerpo válido sobre el que cada test cambia solo lo que prueba. */
const BASE = { name: '1º Primaria', classes: [{ id: ID_A, name: 'A' }] };

const names = courseFieldCases('courseName');
const classNames = courseFieldCases('className');
const lists = courseFieldCases('classes');

/** Una lista de la tabla compartida (de nombres) como las clases del cuerpo. */
function asClasses(list: unknown): unknown {
  return Array.isArray(list) ? list.map((name: unknown) => ({ name })) : list;
}

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 40);

describe('parseUpdateCourseRequest', () => {
  describe('course name (shared table)', () => {
    it.each(names.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseUpdateCourseRequest({ ...BASE, name: value }).success).toBe(true);
      },
    );

    it.each(names.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseUpdateCourseRequest({ ...BASE, name: value });

        expect(result).toEqual({ success: false, details: [{ field: 'name', code }] });
      },
    );
  });

  describe('class name (shared table)', () => {
    it.each(classNames.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(
          parseUpdateCourseRequest({ ...BASE, classes: [{ id: ID_A, name: value }] }).success,
        ).toBe(true);
      },
    );

    it.each(classNames.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseUpdateCourseRequest({
          ...BASE,
          classes: [{ id: ID_A, name: value }],
        });

        expect(result).toEqual({
          success: false,
          details: [{ field: 'classes[0].name', code }],
        });
      },
    );

    it('points at the position of the invalid class', () => {
      const result = parseUpdateCourseRequest({
        ...BASE,
        classes: [{ id: ID_A, name: 'A' }, { name: 'B' }, { name: '<C>' }],
      });

      expect(result).toEqual({
        success: false,
        details: [{ field: 'classes[2].name', code: 'INVALID_CHARACTERS' }],
      });
    });
  });

  describe('list of classes (shared table)', () => {
    it.each(lists.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseUpdateCourseRequest({ ...BASE, classes: asClasses(value) }).success).toBe(true);
      },
    );

    it.each(lists.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseUpdateCourseRequest({ ...BASE, classes: asClasses(value) });

        expect(result).toEqual({ success: false, details: [{ field: 'classes', code }] });
      },
    );
  });

  describe('duplicate class names', () => {
    it('marks the second and later occurrences of a name, ignoring case and spaces', () => {
      const result = parseUpdateCourseRequest({
        ...BASE,
        classes: [{ id: ID_A, name: 'A' }, { id: ID_B, name: ' a ' }, { name: 'B' }, { name: 'A' }],
      });

      expect(result).toEqual({
        success: false,
        details: [
          { field: 'classes[1].name', code: 'DUPLICATE' },
          { field: 'classes[3].name', code: 'DUPLICATE' },
        ],
      });
    });
  });

  describe('class ids', () => {
    it('accepts classes with and without an id, keeping the order', () => {
      const result = parseUpdateCourseRequest({
        ...BASE,
        classes: [{ id: ID_B, name: 'B' }, { name: 'C' }, { id: ID_A, name: 'A' }],
      });

      expect(result).toEqual({
        success: true,
        data: {
          name: '1º Primaria',
          classes: [{ id: ID_B, name: 'B' }, { name: 'C' }, { id: ID_A, name: 'A' }],
        },
      });
    });

    it.each([
      ['a word', 'abc'],
      ['an empty text', ''],
      ['a number', 5],
      ['null', null],
      ['an object', {}],
    ])('rejects an id that is %s with INVALID_FORMAT', (_label, id) => {
      const result = parseUpdateCourseRequest({
        ...BASE,
        classes: [
          { id: ID_A, name: 'A' },
          { id, name: 'B' },
        ],
      });

      expect(result).toEqual({
        success: false,
        details: [{ field: 'classes[1].id', code: 'INVALID_FORMAT' }],
      });
    });

    it('marks the second and later occurrences of an id as DUPLICATE, ignoring case', () => {
      const result = parseUpdateCourseRequest({
        ...BASE,
        classes: [
          { id: ID_A, name: 'A' },
          { id: ID_A.toUpperCase(), name: 'B' },
          { id: ID_A, name: 'C' },
        ],
      });

      expect(result).toEqual({
        success: false,
        details: [
          { field: 'classes[1].id', code: 'DUPLICATE' },
          { field: 'classes[2].id', code: 'DUPLICATE' },
        ],
      });
    });

    it('reports an invalid id and an invalid name of the same class', () => {
      const result = parseUpdateCourseRequest({
        ...BASE,
        classes: [{ id: 'abc', name: '' }],
      });

      expect(result).toEqual({
        success: false,
        details: [
          { field: 'classes[0].id', code: 'INVALID_FORMAT' },
          { field: 'classes[0].name', code: 'REQUIRED' },
        ],
      });
    });
  });

  describe('result', () => {
    it('cleans the names: no extra spaces, case kept', () => {
      const result = parseUpdateCourseRequest({
        name: '  1º   Primaria  ',
        classes: [{ id: ID_A, name: ' A ' }, { name: 'Grupo   B' }],
      });

      expect(result).toEqual({
        success: true,
        data: { name: '1º Primaria', classes: [{ id: ID_A, name: 'A' }, { name: 'Grupo B' }] },
      });
    });

    it('ignores unknown properties such as the school or a tutor', () => {
      const result = parseUpdateCourseRequest({
        ...BASE,
        schoolId: '0192f5a0-0000-7000-8000-000000000009',
        tutorId: 'x',
        classes: [{ id: ID_A, name: 'A', tutorId: 'y' }],
      });

      expect(result).toEqual({
        success: true,
        data: { name: '1º Primaria', classes: [{ id: ID_A, name: 'A' }] },
      });
    });

    it('reports every invalid field at once', () => {
      const result = parseUpdateCourseRequest({
        name: '',
        classes: [{ id: ID_A, name: 'A' }, { name: 'B/' }],
      });

      expect(result).toEqual({
        success: false,
        details: [
          { field: 'name', code: 'REQUIRED' },
          { field: 'classes[1].name', code: 'INVALID_CHARACTERS' },
        ],
      });
    });

    it('treats a body that is not an object as empty', () => {
      for (const body of [undefined, null, 'x', 5, []]) {
        expect(parseUpdateCourseRequest(body)).toEqual({
          success: false,
          details: [
            { field: 'name', code: 'REQUIRED' },
            { field: 'classes', code: 'REQUIRED' },
          ],
        });
      }
    });
  });
});
