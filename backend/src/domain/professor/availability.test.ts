import { describe, expect, it } from 'vitest';
import fixtures from '../../../../test-fixtures/professor-unavailability-normalization.json' with { type: 'json' };
import { normalizeUnavailability, type UnavailableInterval } from './availability.js';

/** Un caso de `test-fixtures/professor-unavailability-normalization.json`, la tabla que comparten el backend y el frontend. */
interface Case {
  name: string;
  input: [number, number, number][];
  expected: [number, number, number][];
}

const toIntervals = (rows: [number, number, number][]): UnavailableInterval[] =>
  rows.map(([dayOfWeek, startMinute, endMinute]) => ({ dayOfWeek, startMinute, endMinute }));

describe('normalizeUnavailability', () => {
  it.each((fixtures as unknown as { cases: Case[] }).cases.map((c) => [c.name, c] as const))(
    'shared table: %s',
    (_name, { input, expected }) => {
      expect(normalizeUnavailability(toIntervals(input))).toEqual(toIntervals(expected));
    },
  );

  it('does not modify its input', () => {
    const input = toIntervals([
      [2, 600, 660],
      [1, 540, 600],
      [1, 600, 660],
    ]);
    const before = structuredClone(input);

    normalizeUnavailability(input);

    expect(input).toEqual(before);
  });

  it('is idempotent', () => {
    const once = normalizeUnavailability(
      toIntervals([
        [1, 540, 600],
        [1, 590, 650],
        [3, 100, 200],
      ]),
    );

    expect(normalizeUnavailability(once)).toEqual(once);
  });
});
