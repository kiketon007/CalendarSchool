import { describe, expect, it } from 'vitest';
import { professorFieldCases } from '../../../test/support/professorFixtures.js';
import { parseCreateProfessorRequest } from './createProfessorRequest.js';

const CLASS_ID = '0192f5a0-0000-7000-8000-0000000000e1';

/** Cuerpo válido sobre el que cada test cambia solo lo que prueba. */
const BASE = { firstName: 'José María', lastName: 'García López' };

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 40);

describe('parseCreateProfessorRequest', () => {
  describe.each(['firstName', 'lastName'] as const)('%s (shared table)', (field) => {
    const cases = professorFieldCases(field);

    it.each(cases.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseCreateProfessorRequest({ ...BASE, [field]: value }).success).toBe(true);
      },
    );

    it.each(cases.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseCreateProfessorRequest({ ...BASE, [field]: value });

        expect(result).toEqual({ success: false, details: [{ field, code }] });
      },
    );
  });

  describe.each(['position', 'classId'] as const)('%s (shared table)', (field) => {
    const cases = professorFieldCases(field);

    it.each(cases.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseCreateProfessorRequest({ ...BASE, [field]: value }).success).toBe(true);
      },
    );

    it.each(cases.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseCreateProfessorRequest({ ...BASE, [field]: value });

        expect(result).toEqual({ success: false, details: [{ field, code }] });
      },
    );
  });

  describe('result', () => {
    it('cleans the names: no extra spaces, case and accents kept', () => {
      const result = parseCreateProfessorRequest({
        firstName: '  José   María ',
        lastName: ' García   López ',
      });

      expect(result).toEqual({
        success: true,
        data: { firstName: 'José María', lastName: 'García López', position: null, classId: null },
      });
    });

    it('keeps the position and the class when they come', () => {
      const result = parseCreateProfessorRequest({
        ...BASE,
        position: 'JEFE_ESTUDIOS',
        classId: CLASS_ID,
      });

      expect(result).toEqual({
        success: true,
        data: {
          firstName: 'José María',
          lastName: 'García López',
          position: 'JEFE_ESTUDIOS',
          classId: CLASS_ID,
        },
      });
    });

    it('treats an explicit null position and class like a missing one', () => {
      const result = parseCreateProfessorRequest({ ...BASE, position: null, classId: null });

      expect(result).toMatchObject({ success: true, data: { position: null, classId: null } });
    });

    it('ignores unknown properties such as the school, the subjects or an email', () => {
      const result = parseCreateProfessorRequest({
        ...BASE,
        schoolId: '0192f5a0-0000-7000-8000-000000000009',
        subjectIds: ['x'],
        email: 'ana@example.com',
      });

      expect(result).toEqual({
        success: true,
        data: { firstName: 'José María', lastName: 'García López', position: null, classId: null },
      });
    });

    it('reports every invalid field at once, in the order of the form', () => {
      const result = parseCreateProfessorRequest({
        firstName: '',
        lastName: '<b>',
        position: 'PRESIDENTE',
        classId: 'abc',
      });

      expect(result).toEqual({
        success: false,
        details: [
          { field: 'firstName', code: 'REQUIRED' },
          { field: 'lastName', code: 'INVALID_CHARACTERS' },
          { field: 'position', code: 'INVALID_FORMAT' },
          { field: 'classId', code: 'INVALID_FORMAT' },
        ],
      });
    });

    it('treats a body that is not an object as empty', () => {
      for (const body of [undefined, null, 'x', 5, []]) {
        expect(parseCreateProfessorRequest(body)).toEqual({
          success: false,
          details: [
            { field: 'firstName', code: 'REQUIRED' },
            { field: 'lastName', code: 'REQUIRED' },
          ],
        });
      }
    });
  });
});
