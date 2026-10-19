import { describe, expect, it } from 'vitest';
import { courseFieldCases } from '../../../test/support/courseFixtures.js';
import { parseCreateCourseRequest } from './createCourseRequest.js';

/** Cuerpo válido sobre el que cada test cambia solo lo que prueba. */
const BASE = { name: '1º Primaria', classes: [{ name: 'A' }] };

const names = courseFieldCases('courseName');
const classNames = courseFieldCases('className');
const lists = courseFieldCases('classes');

/** Una lista de la tabla compartida (de nombres) como las clases del cuerpo. */
function asClasses(list: unknown): unknown {
  return Array.isArray(list) ? list.map((name: unknown) => ({ name })) : list;
}

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 40);

describe('parseCreateCourseRequest', () => {
  describe('course name (shared table)', () => {
    it.each(names.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseCreateCourseRequest({ ...BASE, name: value }).success).toBe(true);
      },
    );

    it.each(names.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseCreateCourseRequest({ ...BASE, name: value });

        expect(result).toEqual({ success: false, details: [{ field: 'name', code }] });
      },
    );
  });

  describe('class name (shared table)', () => {
    it.each(classNames.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseCreateCourseRequest({ ...BASE, classes: [{ name: value }] }).success).toBe(
          true,
        );
      },
    );

    it.each(classNames.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseCreateCourseRequest({ ...BASE, classes: [{ name: value }] });

        expect(result).toEqual({
          success: false,
          details: [{ field: 'classes[0].name', code }],
        });
      },
    );

    it('points at the position of the invalid class', () => {
      const result = parseCreateCourseRequest({
        ...BASE,
        classes: [{ name: 'A' }, { name: 'B' }, { name: '<C>' }],
      });

      expect(result).toEqual({
        success: false,
        details: [{ field: 'classes[2].name', code: 'INVALID_CHARACTERS' }],
      });
    });

    it('treats a class that is not an object, or has no name, as a missing name', () => {
      const result = parseCreateCourseRequest({ ...BASE, classes: ['A', {}, null] });

      expect(result).toEqual({
        success: false,
        details: [
          { field: 'classes[0].name', code: 'REQUIRED' },
          { field: 'classes[1].name', code: 'REQUIRED' },
          { field: 'classes[2].name', code: 'REQUIRED' },
        ],
      });
    });
  });

  describe('list of classes (shared table)', () => {
    it.each(lists.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseCreateCourseRequest({ ...BASE, classes: asClasses(value) }).success).toBe(true);
      },
    );

    it.each(lists.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseCreateCourseRequest({ ...BASE, classes: asClasses(value) });

        expect(result).toEqual({ success: false, details: [{ field: 'classes', code }] });
      },
    );
  });

  describe('duplicate classes', () => {
    it('marks the second and later occurrences of a name, ignoring case and spaces', () => {
      const result = parseCreateCourseRequest({
        ...BASE,
        classes: [{ name: 'A' }, { name: ' a ' }, { name: 'B' }, { name: 'A' }],
      });

      expect(result).toEqual({
        success: false,
        details: [
          { field: 'classes[1].name', code: 'DUPLICATE' },
          { field: 'classes[3].name', code: 'DUPLICATE' },
        ],
      });
    });

    it('treats names that differ in an accent or an ordinal sign as different', () => {
      const result = parseCreateCourseRequest({
        ...BASE,
        classes: [{ name: '1º' }, { name: '1ª' }, { name: 'Ñ' }, { name: 'N' }],
      });

      expect(result.success).toBe(true);
    });

    it('reports an invalid name instead of a duplicate when the repeated names are invalid', () => {
      const result = parseCreateCourseRequest({ ...BASE, classes: [{ name: '' }, { name: '' }] });

      expect(result).toEqual({
        success: false,
        details: [
          { field: 'classes[0].name', code: 'REQUIRED' },
          { field: 'classes[1].name', code: 'REQUIRED' },
        ],
      });
    });
  });

  describe('result', () => {
    it('cleans the names: no extra spaces, case kept', () => {
      const result = parseCreateCourseRequest({
        name: '  1º   Primaria  ',
        classes: [{ name: ' A ' }, { name: 'Grupo   B' }],
      });

      expect(result).toEqual({
        success: true,
        data: { name: '1º Primaria', classes: [{ name: 'A' }, { name: 'Grupo B' }] },
      });
    });

    it('ignores unknown properties such as the school or a tutor', () => {
      const result = parseCreateCourseRequest({
        ...BASE,
        schoolId: '0192f5a0-0000-7000-8000-000000000009',
        tutorId: 'x',
        classes: [{ name: 'A', tutorId: 'y' }],
      });

      expect(result).toEqual({
        success: true,
        data: { name: '1º Primaria', classes: [{ name: 'A' }] },
      });
    });

    it('reports every invalid field at once', () => {
      const result = parseCreateCourseRequest({
        name: '',
        classes: [{ name: 'A' }, { name: 'B/' }],
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
        expect(parseCreateCourseRequest(body)).toEqual({
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
