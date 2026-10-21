import { describe, expect, it } from 'vitest';
import { comedorCases, studentFieldCases } from '../../../test/support/studentFixtures.js';
import { parseCreateStudentRequest } from './createStudentRequest.js';

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const CLASS_ID = '0192f5a0-0000-7000-8000-0000000000e1';

/** Cuerpo válido sobre el que cada test cambia solo lo que prueba. */
const BASE = {
  firstName: 'José María',
  lastName: 'García López',
  courseId: COURSE_ID,
  cafeteria: false,
};

/** Con comedor, para los campos que solo existen con él. */
const WITH_CAFETERIA = { ...BASE, cafeteria: true, scholarship: false };

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 40);

describe('parseCreateStudentRequest', () => {
  describe.each([
    ['firstName', BASE],
    ['lastName', BASE],
    ['courseId', BASE],
    ['classId', BASE],
    ['cafeteria', BASE],
    ['scholarship', WITH_CAFETERIA],
    ['foodType', WITH_CAFETERIA],
    ['observations', WITH_CAFETERIA],
  ] as const)('%s (shared table)', (field, base) => {
    const cases = studentFieldCases(field);

    it.each(cases.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        // Con comedor, la beca es obligatoria: el ejemplo `true` del comedor la trae.
        const extra = field === 'cafeteria' && value === true ? { scholarship: false } : {};

        expect(parseCreateStudentRequest({ ...base, [field]: value, ...extra }).success).toBe(true);
      },
    );

    it.each(cases.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseCreateStudentRequest({ ...base, [field]: value });

        expect(result).toEqual({ success: false, details: [{ field, code }] });
      },
    );
  });

  describe('cafeteria, scholarship and food type (shared table)', () => {
    const cases = comedorCases();

    it.each(cases.valid.map((body) => [label(body), body]))(
      'accepts the valid combination %s',
      (_label, body) => {
        expect(parseCreateStudentRequest({ ...BASE, ...body }).success).toBe(true);
      },
    );

    it.each(cases.invalid.map(({ body, errors }) => [label(body), body, errors]))(
      'rejects the invalid combination %s',
      (_label, body, errors) => {
        const result = parseCreateStudentRequest({ ...BASE, ...body });

        expect(result).toEqual({ success: false, details: errors });
      },
    );
  });

  describe('result', () => {
    it('cleans the names and keeps the optional fields empty', () => {
      const result = parseCreateStudentRequest({
        firstName: '  José   María ',
        lastName: ' García   López ',
        courseId: COURSE_ID,
        cafeteria: false,
      });

      expect(result).toEqual({
        success: true,
        data: {
          firstName: 'José María',
          lastName: 'García López',
          courseId: COURSE_ID,
          classId: null,
          cafeteria: false,
          scholarship: null,
          foodType: null,
          observations: null,
        },
      });
    });

    it('keeps the class, the scholarship, the food type and the observations when they come', () => {
      const result = parseCreateStudentRequest({
        ...BASE,
        classId: CLASS_ID,
        cafeteria: true,
        scholarship: true,
        foodType: '  Sin   gluten ',
        observations: '  Primera línea\nSegunda   línea  ',
      });

      expect(result).toEqual({
        success: true,
        data: {
          firstName: 'José María',
          lastName: 'García López',
          courseId: COURSE_ID,
          classId: CLASS_ID,
          cafeteria: true,
          scholarship: true,
          // Los espacios repetidos se colapsan en el tipo de comida; las observaciones solo se recortan.
          foodType: 'Sin gluten',
          observations: 'Primera línea\nSegunda   línea',
        },
      });
    });

    it('turns an empty or blank food type and observations into null', () => {
      const result = parseCreateStudentRequest({
        ...WITH_CAFETERIA,
        foodType: '   ',
        observations: '\n  ',
      });

      expect(result).toMatchObject({ success: true, data: { foodType: null, observations: null } });
    });

    it('treats an explicit null class like a missing one', () => {
      const result = parseCreateStudentRequest({ ...BASE, classId: null });

      expect(result).toMatchObject({ success: true, data: { classId: null } });
    });

    it('measures the limits in characters, not in UTF-16 code units', () => {
      // 255 y 5000 puntos de código fuera del plano básico: 510 y 10000 unidades UTF-16.
      const result = parseCreateStudentRequest({
        ...WITH_CAFETERIA,
        foodType: '😀'.repeat(255),
        observations: '😀'.repeat(5000),
      });

      expect(result.success).toBe(true);
      expect(
        parseCreateStudentRequest({ ...WITH_CAFETERIA, observations: '😀'.repeat(5001) }),
      ).toEqual({ success: false, details: [{ field: 'observations', code: 'INVALID_LENGTH' }] });
    });

    it('ignores unknown properties such as the school, the status or an email', () => {
      const result = parseCreateStudentRequest({
        ...BASE,
        schoolId: '0192f5a0-0000-7000-8000-000000000009',
        status: 'GRADUATED',
        email: 'juan@example.com',
      });

      expect(result).toMatchObject({ success: true });
      expect(Object.keys((result as { data: object }).data).sort()).toEqual(
        [
          'cafeteria',
          'classId',
          'courseId',
          'firstName',
          'foodType',
          'lastName',
          'observations',
          'scholarship',
        ].sort(),
      );
    });

    it('reports every invalid field at once, in the order of the form', () => {
      const result = parseCreateStudentRequest({
        firstName: '',
        lastName: '<b>',
        courseId: 'abc',
        classId: 'abc',
        cafeteria: 'sí',
        scholarship: 'x',
        foodType: { raw: 5 },
        observations: 7,
      });

      expect(result).toEqual({
        success: false,
        details: [
          { field: 'firstName', code: 'REQUIRED' },
          { field: 'lastName', code: 'INVALID_CHARACTERS' },
          { field: 'courseId', code: 'INVALID_FORMAT' },
          { field: 'classId', code: 'INVALID_FORMAT' },
          { field: 'cafeteria', code: 'INVALID_FORMAT' },
          { field: 'observations', code: 'INVALID_FORMAT' },
        ],
      });
    });

    it('does not judge the scholarship or the food type while the cafeteria is invalid', () => {
      const result = parseCreateStudentRequest({
        ...BASE,
        cafeteria: undefined,
        scholarship: true,
        foodType: 'x',
      });

      expect(result).toEqual({
        success: false,
        details: [{ field: 'cafeteria', code: 'REQUIRED' }],
      });
    });

    it('treats a body that is not an object as empty', () => {
      for (const body of [undefined, null, 'x', 5, []]) {
        expect(parseCreateStudentRequest(body)).toEqual({
          success: false,
          details: [
            { field: 'firstName', code: 'REQUIRED' },
            { field: 'lastName', code: 'REQUIRED' },
            { field: 'courseId', code: 'REQUIRED' },
            { field: 'cafeteria', code: 'REQUIRED' },
          ],
        });
      }
    });
  });
});
