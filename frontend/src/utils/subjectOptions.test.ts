import { describe, expect, expectTypeOf, it } from 'vitest';
import type { components } from '../api/generated/schema';
import { SUBJECT_COLORS, SUBJECT_STATUSES, SUBJECT_TYPES } from './subjectOptions';

type Schemas = components['schemas'];

describe('the options of a subject', () => {
  it('are exactly the enums of the contract, so the form can offer all of them and nothing else', () => {
    expectTypeOf<(typeof SUBJECT_TYPES)[number]>().toEqualTypeOf<Schemas['SubjectType']>();
    expectTypeOf<(typeof SUBJECT_STATUSES)[number]>().toEqualTypeOf<Schemas['SubjectStatus']>();
    expectTypeOf<(typeof SUBJECT_COLORS)[number]>().toEqualTypeOf<Schemas['SubjectColor']>();
  });

  it('keep the order in which they are offered', () => {
    expect([...SUBJECT_TYPES]).toEqual(['CORE', 'ELECTIVE', 'CUSTOM']);
    expect([...SUBJECT_STATUSES]).toEqual(['ACTIVE', 'INACTIVE']);
    expect([...SUBJECT_COLORS]).toEqual([
      'blue',
      'indigo',
      'purple',
      'pink',
      'red',
      'orange',
      'yellow',
      'green',
      'teal',
      'cyan',
      'brown',
      'gray',
    ]);
  });

  it('have no repeated value', () => {
    expect(new Set(SUBJECT_COLORS).size).toBe(SUBJECT_COLORS.length);
  });
});
