import { describe, expect, it } from 'vitest';
import { professorFieldCases } from '../../../test/support/professorFixtures.js';
import { parseUpdateProfessorRequest } from './updateProfessorRequest.js';

const CLASS_ID = '0192f5a0-0000-7000-8000-0000000000e1';

/** Cuerpo válido sobre el que cada test cambia solo lo que prueba. */
const BASE = { firstName: 'José María', lastName: 'García López' };

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 40);

describe('parseUpdateProfessorRequest', () => {
  describe.each(['firstName', 'lastName', 'position'] as const)('%s (shared table)', (field) => {
    const cases = professorFieldCases(field);

    it.each(cases.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseUpdateProfessorRequest({ ...BASE, [field]: value }).success).toBe(true);
      },
    );

    it.each(cases.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const result = parseUpdateProfessorRequest({ ...BASE, [field]: value });

        expect(result).toEqual({ success: false, details: [{ field, code }] });
      },
    );
  });

  it('cleans the names like the creation does', () => {
    const result = parseUpdateProfessorRequest({ firstName: '  José   María ', lastName: ' Gil ' });

    expect(result).toEqual({
      success: true,
      data: { firstName: 'José María', lastName: 'Gil', position: null, classId: undefined },
    });
  });

  it.each([
    ['absent', {}],
    ['null', { position: null }],
  ])('treats a %s position as no position', (_label, extra) => {
    const result = parseUpdateProfessorRequest({ ...BASE, ...extra });

    expect(result.success && result.data.position).toBeNull();
  });

  it('keeps a valid position', () => {
    const result = parseUpdateProfessorRequest({ ...BASE, position: 'DIRECTOR' });

    expect(result.success && result.data.position).toBe('DIRECTOR');
  });

  describe('classId', () => {
    it('absent means "do not touch the tutorship"', () => {
      const result = parseUpdateProfessorRequest(BASE);

      expect(result.success && result.data.classId).toBeUndefined();
    });

    it('null means "no class"', () => {
      const result = parseUpdateProfessorRequest({ ...BASE, classId: null });

      expect(result.success && result.data.classId).toBeNull();
    });

    it('a UUID is kept', () => {
      const result = parseUpdateProfessorRequest({ ...BASE, classId: CLASS_ID });

      expect(result.success && result.data.classId).toBe(CLASS_ID);
    });

    it.each(['abc', '', 5, {}, ['x']])('rejects %j as INVALID_FORMAT', (classId) => {
      const result = parseUpdateProfessorRequest({ ...BASE, classId });

      expect(result).toEqual({
        success: false,
        details: [{ field: 'classId', code: 'INVALID_FORMAT' }],
      });
    });
  });

  it('reports every invalid field in the order of the form', () => {
    const result = parseUpdateProfessorRequest({
      firstName: '',
      lastName: '',
      position: 'BOSS',
      classId: 'abc',
    });

    expect(result).toEqual({
      success: false,
      details: [
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'lastName', code: 'REQUIRED' },
        { field: 'position', code: 'INVALID_FORMAT' },
        { field: 'classId', code: 'INVALID_FORMAT' },
      ],
    });
  });

  it.each([null, undefined, 'text', 5, []])('rejects the body %j as missing both names', (body) => {
    expect(parseUpdateProfessorRequest(body)).toEqual({
      success: false,
      details: [
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'lastName', code: 'REQUIRED' },
      ],
    });
  });

  it('ignores unknown properties such as the school', () => {
    const result = parseUpdateProfessorRequest({ ...BASE, schoolId: 'x', subjectIds: [1] });

    expect(result.success).toBe(true);
    expect(result.success && Object.keys(result.data).sort()).toEqual([
      'classId',
      'firstName',
      'lastName',
      'position',
    ]);
  });
});
