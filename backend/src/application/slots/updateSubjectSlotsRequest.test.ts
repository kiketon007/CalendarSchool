import { describe, expect, it } from 'vitest';
import {
  MAX_FORBIDDEN_SLOTS,
  parseUpdateSubjectSlotsRequest,
} from './updateSubjectSlotsRequest.js';

const cell = (dayOfWeek: unknown, sessionNumber: unknown) => ({ dayOfWeek, sessionNumber });

describe('parseUpdateSubjectSlotsRequest', () => {
  it('reads the cells in the order they arrived', () => {
    expect(parseUpdateSubjectSlotsRequest({ slots: [cell(3, 2), cell(1, 5), cell(1, 1)] })).toEqual(
      {
        success: true,
        data: { slots: [cell(3, 2), cell(1, 5), cell(1, 1)] },
      },
    );
  });

  it('accepts an empty list, which removes the rule', () => {
    expect(parseUpdateSubjectSlotsRequest({ slots: [] })).toEqual({
      success: true,
      data: { slots: [] },
    });
  });

  it('accepts the limits: days 1 and 5, sessions 1 and 8 and 40 cells', () => {
    const many = Array.from({ length: MAX_FORBIDDEN_SLOTS }, (_, index) =>
      cell(1 + (index % 5), 1 + Math.floor(index / 5)),
    );

    expect(parseUpdateSubjectSlotsRequest({ slots: many }).success).toBe(true);
    expect(parseUpdateSubjectSlotsRequest({ slots: [cell(5, 8)] }).success).toBe(true);
  });

  it('ignores unknown properties, the school never comes from the body', () => {
    expect(
      parseUpdateSubjectSlotsRequest({ schoolId: 'x', slots: [{ ...cell(2, 2), extra: true }] }),
    ).toEqual({ success: true, data: { slots: [cell(2, 2)] } });
  });

  it.each([undefined, null, 'x', 7, []] as unknown[])(
    'asks for the slots when the body is %s',
    (body) => {
      expect(parseUpdateSubjectSlotsRequest(body)).toEqual({
        success: false,
        details: [{ field: 'slots', code: 'REQUIRED' }],
      });
    },
  );

  it.each([
    [{ slots: null }, 'REQUIRED'],
    [{ slots: 'x' }, 'INVALID_FORMAT'],
    [{ slots: {} }, 'INVALID_FORMAT'],
  ] as const)('rejects slots %s with %s', (body, code) => {
    expect(parseUpdateSubjectSlotsRequest(body)).toEqual({
      success: false,
      details: [{ field: 'slots', code }],
    });
  });

  it('rejects more than 40 cells with INVALID_LENGTH', () => {
    const many = Array.from({ length: MAX_FORBIDDEN_SLOTS + 1 }, () => cell(1, 1));

    expect(parseUpdateSubjectSlotsRequest({ slots: many })).toEqual({
      success: false,
      details: [{ field: 'slots', code: 'INVALID_LENGTH' }],
    });
  });

  it.each([null, 'x', 7, [], true] as unknown[])(
    'rejects a cell that is not an object (%s) with INVALID_FORMAT',
    (item) => {
      expect(parseUpdateSubjectSlotsRequest({ slots: [item] })).toEqual({
        success: false,
        details: [{ field: 'slots[0]', code: 'INVALID_FORMAT' }],
      });
    },
  );

  describe.each([
    ['dayOfWeek', (value: unknown) => cell(value, 1), [0, 6, -1]],
    ['sessionNumber', (value: unknown) => cell(1, value), [0, 9, -1]],
  ] as const)('the field %s', (field, build, outOfRange) => {
    it.each([undefined, null])('is REQUIRED when it is %s', (value) => {
      expect(parseUpdateSubjectSlotsRequest({ slots: [build(value)] })).toEqual({
        success: false,
        details: [{ field: `slots[0].${field}`, code: 'REQUIRED' }],
      });
    });

    it.each(outOfRange)('rejects %i with OUT_OF_RANGE', (value) => {
      expect(parseUpdateSubjectSlotsRequest({ slots: [build(value)] })).toEqual({
        success: false,
        details: [{ field: `slots[0].${field}`, code: 'OUT_OF_RANGE' }],
      });
    });

    it.each([2.5, '2', true, Number.NaN] as unknown[])(
      'rejects %s with INVALID_FORMAT',
      (value) => {
        expect(parseUpdateSubjectSlotsRequest({ slots: [build(value)] })).toEqual({
          success: false,
          details: [{ field: `slots[0].${field}`, code: 'INVALID_FORMAT' }],
        });
      },
    );
  });

  it('marks a repeated cell from its second appearance', () => {
    expect(
      parseUpdateSubjectSlotsRequest({ slots: [cell(2, 3), cell(1, 1), cell(2, 3), cell(2, 3)] }),
    ).toEqual({
      success: false,
      details: [
        { field: 'slots[2]', code: 'DUPLICATE' },
        { field: 'slots[3]', code: 'DUPLICATE' },
      ],
    });
  });

  it('does not mark as repeated a cell that is already invalid', () => {
    expect(parseUpdateSubjectSlotsRequest({ slots: [cell(6, 1), cell(6, 1)] })).toEqual({
      success: false,
      details: [
        { field: 'slots[0].dayOfWeek', code: 'OUT_OF_RANGE' },
        { field: 'slots[1].dayOfWeek', code: 'OUT_OF_RANGE' },
      ],
    });
  });

  it('reports every invalid field in order, the day before the session of each cell', () => {
    expect(
      parseUpdateSubjectSlotsRequest({
        slots: [cell(0, 9), cell(1, 1), 'x', cell(undefined, 2), cell(1, 1)],
      }),
    ).toEqual({
      success: false,
      details: [
        { field: 'slots[0].dayOfWeek', code: 'OUT_OF_RANGE' },
        { field: 'slots[0].sessionNumber', code: 'OUT_OF_RANGE' },
        { field: 'slots[2]', code: 'INVALID_FORMAT' },
        { field: 'slots[3].dayOfWeek', code: 'REQUIRED' },
        { field: 'slots[4]', code: 'DUPLICATE' },
      ],
    });
  });
});
