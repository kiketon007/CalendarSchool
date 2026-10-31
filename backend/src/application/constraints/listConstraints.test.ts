import { describe, expect, it, vi } from 'vitest';
import type { ConstraintPair } from '../../domain/constraints/constraintList.js';
import { ListConstraints } from './listConstraints.js';

const pair: ConstraintPair = {
  course: { id: 'course-1', name: '1º Primaria' },
  subject: { id: 'subject-1', name: 'Inglés', code: null, color: 'blue', status: 'ACTIVE' },
  sessionsPerWeek: 3,
  calendar: { sessionGroups: [3, 3] },
  rules: [{ id: 'rule-1', type: 'MAX_PER_DAY', maxPerDay: 2, blockSize: null, slots: [] }],
};

describe('ListConstraints', () => {
  it('reads the constraints of the school of the identity and builds the list', async () => {
    const listBySchool = vi.fn().mockResolvedValue([pair]);

    const list = await new ListConstraints({ constraintListRepository: { listBySchool } }).execute({
      schoolId: 'school-1',
    });

    expect(listBySchool).toHaveBeenCalledExactlyOnceWith('school-1');
    expect(list).toEqual([
      {
        id: 'rule-1',
        type: 'MAX_PER_DAY',
        course: pair.course,
        subject: pair.subject,
        maxPerDay: 2,
        blockSize: null,
        slotCount: null,
        warnings: [],
      },
    ]);
  });

  it('returns an empty list when the school has no rules', async () => {
    const listBySchool = vi.fn().mockResolvedValue([]);

    const list = await new ListConstraints({ constraintListRepository: { listBySchool } }).execute({
      schoolId: 'school-1',
    });

    expect(list).toEqual([]);
  });

  it('lets a database failure reach the caller', async () => {
    const failure = new Error('database down');
    const listBySchool = vi.fn().mockRejectedValue(failure);

    await expect(
      new ListConstraints({ constraintListRepository: { listBySchool } }).execute({
        schoolId: 'school-1',
      }),
    ).rejects.toBe(failure);
  });
});
