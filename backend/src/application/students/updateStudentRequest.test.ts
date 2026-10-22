import { describe, expect, it } from 'vitest';
import { comedorCases, studentFieldCases } from '../../../test/support/studentFixtures.js';
import { parseCreateStudentRequest } from './createStudentRequest.js';
import { parseUpdateStudentRequest } from './updateStudentRequest.js';

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

describe('parseUpdateStudentRequest', () => {
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
        const extra = field === 'cafeteria' && value === true ? { scholarship: false } : {};

        expect(parseUpdateStudentRequest({ ...base, [field]: value, ...extra }).success).toBe(true);
      },
    );

    it.each(cases.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseUpdateStudentRequest({ ...base, [field]: value });

        expect(result).toEqual({ success: false, details: [{ field, code }] });
      },
    );
  });

  describe('cafeteria, scholarship and food type (shared table)', () => {
    const cases = comedorCases();

    it.each(cases.valid.map((body) => [label(body), body]))(
      'accepts the valid combination %s',
      (_label, body) => {
        expect(parseUpdateStudentRequest({ ...BASE, ...body }).success).toBe(true);
      },
    );

    it.each(cases.invalid.map(({ body, errors }) => [label(body), body, errors]))(
      'rejects the invalid combination %s',
      (_label, body, errors) => {
        const result = parseUpdateStudentRequest({ ...BASE, ...body });

        expect(result).toEqual({ success: false, details: errors });
      },
    );
  });

  describe('final state', () => {
    it('leaves the class, the food type and the observations empty when they are missing', () => {
      const result = parseUpdateStudentRequest(WITH_CAFETERIA);

      expect(result).toEqual({
        success: true,
        data: {
          firstName: 'José María',
          lastName: 'García López',
          courseId: COURSE_ID,
          classId: null,
          cafeteria: true,
          scholarship: false,
          foodType: null,
          observations: null,
        },
      });
    });

    it('treats null and blank texts as empty', () => {
      const result = parseUpdateStudentRequest({
        ...WITH_CAFETERIA,
        classId: null,
        foodType: '   ',
        observations: null,
      });

      expect(result).toMatchObject({
        success: true,
        data: { classId: null, foodType: null, observations: null },
      });
    });

    it('gives exactly the same result and the same errors as the creation body', () => {
      const bodies = [
        { ...WITH_CAFETERIA, classId: CLASS_ID, foodType: ' Sin  gluten ', observations: ' Nota ' },
        { ...BASE, scholarship: true },
        { firstName: '', lastName: '<b>', courseId: 'abc', cafeteria: 'sí' },
        {},
        null,
      ];

      for (const body of bodies) {
        expect(parseUpdateStudentRequest(body)).toEqual(parseCreateStudentRequest(body));
      }
    });

    it('ignores the unknown properties, also the id and the school', () => {
      const result = parseUpdateStudentRequest({
        ...BASE,
        id: '0192f5a0-0000-7000-8000-0000000000a1',
        schoolId: '0192f5a0-0000-7000-8000-0000000000b1',
        status: 'DELETED',
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
  });
});
