import { describe, expect, it } from 'vitest';
import type {
  ConstraintPair,
  ConstraintType,
  StoredConstraint,
} from '../../domain/constraints/constraintList.js';
import type { SlotCell } from '../../domain/workload/workloadWarnings.js';
import { buildConstraintList } from './buildConstraintList.js';

const rule = (type: ConstraintType, rest: Partial<StoredConstraint> = {}): StoredConstraint => ({
  id: `rule-${type}`,
  type,
  maxPerDay: null,
  blockSize: null,
  slots: [],
  ...rest,
});

const pair = (overrides: Partial<ConstraintPair> = {}): ConstraintPair => ({
  course: { id: 'course-1', name: '1º Primaria' },
  subject: {
    id: 'subject-1',
    name: 'Inglés',
    code: 'ING',
    color: 'blue',
    status: 'ACTIVE',
  },
  sessionsPerWeek: 3,
  calendar: { sessionGroups: [3, 3] },
  rules: [rule('MAX_PER_DAY', { maxPerDay: 2 })],
  ...overrides,
});

/** Todas las celdas de un día de la jornada de 6 sesiones. */
const wholeDay = (dayOfWeek: number): SlotCell[] =>
  [1, 2, 3, 4, 5, 6].map((sessionNumber) => ({ dayOfWeek, sessionNumber }));

const codesOf = (type: ConstraintType, list: ReturnType<typeof buildConstraintList>) =>
  list.find((entry) => entry.type === type)?.warnings.map(({ code }) => code);

describe('buildConstraintList', () => {
  it('gives each rule the value of its type and null in the others', () => {
    const list = buildConstraintList([
      pair({
        rules: [
          rule('MAX_PER_DAY', { maxPerDay: 2 }),
          rule('BLOCK', { blockSize: 2 }),
          rule('FORBIDDEN_SLOTS', { slots: wholeDay(1) }),
          rule('PREFERRED_SLOTS', { slots: [{ dayOfWeek: 2, sessionNumber: 1 }] }),
        ],
      }),
    ]);

    expect(
      list.map(({ type, maxPerDay, blockSize, slotCount }) => ({
        type,
        maxPerDay,
        blockSize,
        slotCount,
      })),
    ).toEqual([
      { type: 'MAX_PER_DAY', maxPerDay: 2, blockSize: null, slotCount: null },
      { type: 'BLOCK', maxPerDay: null, blockSize: 2, slotCount: null },
      { type: 'FORBIDDEN_SLOTS', maxPerDay: null, blockSize: null, slotCount: 6 },
      { type: 'PREFERRED_SLOTS', maxPerDay: null, blockSize: null, slotCount: 1 },
    ]);
  });

  it('carries the course, the subject and the id of each rule', () => {
    const [entry] = buildConstraintList([pair()]);

    expect(entry).toMatchObject({
      id: 'rule-MAX_PER_DAY',
      course: { id: 'course-1', name: '1º Primaria' },
      subject: { id: 'subject-1', name: 'Inglés', code: 'ING', color: 'blue', status: 'ACTIVE' },
    });
  });

  it('has no warnings when the subject fits', () => {
    const [entry] = buildConstraintList([pair()]);

    expect(entry?.warnings).toEqual([]);
  });

  it('warns that the subject does not fit in the mandatory rules and not in the preferred one', () => {
    const preferred: SlotCell[] = [1, 2, 3].map((sessionNumber) => ({
      dayOfWeek: 5,
      sessionNumber,
    }));
    const list = buildConstraintList([
      pair({
        sessionsPerWeek: 5,
        rules: [
          rule('MAX_PER_DAY', { maxPerDay: 2 }),
          rule('FORBIDDEN_SLOTS', {
            slots: [...wholeDay(1), ...wholeDay(2), ...wholeDay(3), ...wholeDay(4)],
          }),
          rule('PREFERRED_SLOTS', { slots: preferred }),
        ],
      }),
    ]);

    expect(codesOf('MAX_PER_DAY', list)).toEqual(['SUBJECT_DOES_NOT_FIT']);
    expect(codesOf('FORBIDDEN_SLOTS', list)).toEqual(['SUBJECT_DOES_NOT_FIT']);
    expect(codesOf('PREFERRED_SLOTS', list)).toEqual([]);
  });

  it('warns that the block does not fit in the block rule and in the others of the subject', () => {
    const list = buildConstraintList([
      pair({
        sessionsPerWeek: 5,
        rules: [
          rule('BLOCK', { blockSize: 3 }),
          rule('FORBIDDEN_SLOTS', {
            slots: [1, 2, 3, 4, 5].flatMap((day) =>
              [2, 5].map((sessionNumber) => ({ dayOfWeek: day, sessionNumber })),
            ),
          }),
        ],
      }),
    ]);

    expect(codesOf('BLOCK', list)).toEqual(['SUBJECT_DOES_NOT_FIT']);
    expect(codesOf('FORBIDDEN_SLOTS', list)).toEqual(['SUBJECT_DOES_NOT_FIT']);
  });

  it('puts the block larger than the load only in the block rule', () => {
    const list = buildConstraintList([
      pair({
        sessionsPerWeek: 1,
        rules: [rule('MAX_PER_DAY', { maxPerDay: 2 }), rule('BLOCK', { blockSize: 2 })],
      }),
    ]);

    expect(codesOf('BLOCK', list)).toEqual(['BLOCK_LARGER_THAN_LOAD']);
    expect(codesOf('MAX_PER_DAY', list)).toEqual([]);
  });

  it('puts the preferred slots that are forbidden only in the preferred rule, with their count', () => {
    const list = buildConstraintList([
      pair({
        rules: [
          rule('MAX_PER_DAY', { maxPerDay: 2 }),
          rule('FORBIDDEN_SLOTS', { slots: wholeDay(1) }),
          rule('PREFERRED_SLOTS', {
            slots: [
              { dayOfWeek: 1, sessionNumber: 1 },
              { dayOfWeek: 1, sessionNumber: 2 },
              { dayOfWeek: 2, sessionNumber: 1 },
            ],
          }),
        ],
      }),
    ]);

    expect(list.find(({ type }) => type === 'PREFERRED_SLOTS')?.warnings).toEqual([
      { code: 'PREFERRED_SLOTS_FORBIDDEN', count: 2 },
    ]);
    expect(codesOf('MAX_PER_DAY', list)).toEqual([]);
    expect(codesOf('FORBIDDEN_SLOTS', list)).toEqual([]);
  });

  it('counts the cells outside the calendar in each grid on its own', () => {
    const list = buildConstraintList([
      pair({
        rules: [
          rule('MAX_PER_DAY', { maxPerDay: 2 }),
          rule('FORBIDDEN_SLOTS', {
            slots: [
              { dayOfWeek: 1, sessionNumber: 1 },
              { dayOfWeek: 1, sessionNumber: 7 },
              { dayOfWeek: 2, sessionNumber: 8 },
            ],
          }),
          rule('PREFERRED_SLOTS', {
            slots: [
              { dayOfWeek: 3, sessionNumber: 2 },
              { dayOfWeek: 3, sessionNumber: 7 },
            ],
          }),
        ],
      }),
    ]);

    expect(list.find(({ type }) => type === 'FORBIDDEN_SLOTS')?.warnings).toEqual([
      { code: 'SLOTS_OUTSIDE_CALENDAR', count: 2 },
    ]);
    expect(list.find(({ type }) => type === 'PREFERRED_SLOTS')?.warnings).toEqual([
      { code: 'SLOTS_OUTSIDE_CALENDAR', count: 1 },
    ]);
    expect(codesOf('MAX_PER_DAY', list)).toEqual([]);
    expect(list.map(({ slotCount }) => slotCount)).toEqual([null, 1, 1]);
  });

  it('does not count a cell outside the calendar as forbidden when it checks the preferred ones', () => {
    const list = buildConstraintList([
      pair({
        rules: [
          rule('FORBIDDEN_SLOTS', { slots: [{ dayOfWeek: 1, sessionNumber: 7 }] }),
          rule('PREFERRED_SLOTS', { slots: [{ dayOfWeek: 1, sessionNumber: 7 }] }),
        ],
      }),
    ]);

    expect(codesOf('PREFERRED_SLOTS', list)).toEqual(['SLOTS_OUTSIDE_CALENDAR']);
  });

  describe('a course without a calendar', () => {
    const withoutCalendar = (overrides: Partial<ConstraintPair> = {}) =>
      buildConstraintList([
        pair({
          calendar: null,
          sessionsPerWeek: 1,
          rules: [
            rule('MAX_PER_DAY', { maxPerDay: 2 }),
            rule('BLOCK', { blockSize: 2 }),
            rule('FORBIDDEN_SLOTS', { slots: wholeDay(1) }),
            rule('PREFERRED_SLOTS', { slots: wholeDay(2) }),
          ],
          ...overrides,
        }),
      ]);

    it('warns in every rule that it cannot be checked', () => {
      const list = withoutCalendar({ sessionsPerWeek: 3 });

      expect(list.map(({ warnings }) => warnings.map(({ code }) => code))).toEqual([
        ['COURSE_WITHOUT_CALENDAR'],
        ['COURSE_WITHOUT_CALENDAR'],
        ['COURSE_WITHOUT_CALENDAR'],
        ['COURSE_WITHOUT_CALENDAR'],
      ]);
    });

    it('puts the block larger than the load before it in the block rule', () => {
      const list = withoutCalendar();

      expect(codesOf('BLOCK', list)).toEqual(['BLOCK_LARGER_THAN_LOAD', 'COURSE_WITHOUT_CALENDAR']);
      expect(codesOf('MAX_PER_DAY', list)).toEqual(['COURSE_WITHOUT_CALENDAR']);
    });

    it('has no slots inside the calendar, so their count is 0 and they are not reported as outside', () => {
      const list = withoutCalendar();

      expect(list.map(({ slotCount }) => slotCount)).toEqual([null, null, 0, 0]);
      expect(codesOf('FORBIDDEN_SLOTS', list)).toEqual(['COURSE_WITHOUT_CALENDAR']);
    });
  });

  describe('order', () => {
    it('sorts by course, by subject and by type, with the Spanish comparison', () => {
      const entry = (course: string, subject: string, type: ConstraintType) =>
        pair({
          course: { id: `c-${course}`, name: course },
          subject: {
            id: `s-${subject}`,
            name: subject,
            code: null,
            color: 'red',
            status: 'ACTIVE',
          },
          rules: [rule(type, type === 'MAX_PER_DAY' ? { maxPerDay: 2 } : { blockSize: 2 })],
        });
      const list = buildConstraintList([
        entry('10º Primaria', 'Inglés', 'MAX_PER_DAY'),
        entry('2º Primaria', 'Música', 'BLOCK'),
        entry('2º Primaria', 'Ángel', 'BLOCK'),
        entry('2º Primaria', 'Inglés', 'MAX_PER_DAY'),
      ]);

      expect(list.map(({ course, subject }) => `${course.name}/${subject.name}`)).toEqual([
        '2º Primaria/Ángel',
        '2º Primaria/Inglés',
        '2º Primaria/Música',
        '10º Primaria/Inglés',
      ]);
    });

    it('sorts the rules of a pair as maximum, blocks, forbidden and preferred', () => {
      const list = buildConstraintList([
        pair({
          rules: [
            rule('PREFERRED_SLOTS', { slots: [{ dayOfWeek: 1, sessionNumber: 1 }] }),
            rule('FORBIDDEN_SLOTS', { slots: [{ dayOfWeek: 2, sessionNumber: 1 }] }),
            rule('BLOCK', { blockSize: 2 }),
            rule('MAX_PER_DAY', { maxPerDay: 2 }),
          ],
        }),
      ]);

      expect(list.map(({ type }) => type)).toEqual([
        'MAX_PER_DAY',
        'BLOCK',
        'FORBIDDEN_SLOTS',
        'PREFERRED_SLOTS',
      ]);
    });
  });

  it('returns an empty list for no pairs', () => {
    expect(buildConstraintList([])).toEqual([]);
  });

  it('does not modify its input', () => {
    const input = [
      pair({ rules: [rule('BLOCK', { blockSize: 2 }), rule('MAX_PER_DAY', { maxPerDay: 2 })] }),
    ];
    const before = structuredClone(input);

    buildConstraintList(input);

    expect(input).toEqual(before);
  });
});
