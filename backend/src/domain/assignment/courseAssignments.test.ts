import { describe, expect, it } from 'vitest';
import { planAssignmentChanges, type AssignmentCell } from './courseAssignments.js';

const cell = (subjectId: string, classId: string, professorId: string): AssignmentCell => ({
  subjectId,
  classId,
  professorId,
});

describe('planAssignmentChanges', () => {
  it('creates everything when nothing was assigned', () => {
    const wanted = [cell('s1', 'a', 'p1'), cell('s1', 'b', 'p2')];

    expect(planAssignmentChanges([], wanted)).toEqual({
      toDelete: [],
      toChange: [],
      toCreate: wanted,
      added: 2,
      removed: 0,
      changed: 0,
    });
  });

  it('deletes everything when nothing is wanted', () => {
    const current = [cell('s1', 'a', 'p1'), cell('s2', 'a', 'p1')];

    expect(planAssignmentChanges(current, [])).toEqual({
      toDelete: current,
      toChange: [],
      toCreate: [],
      added: 0,
      removed: 2,
      changed: 0,
    });
  });

  it('changes the professor of a pair that stays', () => {
    const plan = planAssignmentChanges([cell('s1', 'a', 'p1')], [cell('s1', 'a', 'p2')]);

    expect(plan).toEqual({
      toDelete: [],
      toChange: [cell('s1', 'a', 'p2')],
      toCreate: [],
      added: 0,
      removed: 0,
      changed: 1,
    });
  });

  it('does nothing when the wanted state is the current one, in any order', () => {
    const current = [cell('s1', 'a', 'p1'), cell('s1', 'b', 'p2'), cell('s2', 'a', 'p1')];
    const wanted = [cell('s2', 'a', 'p1'), cell('s1', 'a', 'p1'), cell('s1', 'b', 'p2')];

    expect(planAssignmentChanges(current, wanted)).toEqual({
      toDelete: [],
      toChange: [],
      toCreate: [],
      added: 0,
      removed: 0,
      changed: 0,
    });
  });

  it('plans a mix of the three operations in one go', () => {
    const current = [cell('s1', 'a', 'p1'), cell('s1', 'b', 'p1'), cell('s2', 'a', 'p3')];
    const wanted = [cell('s1', 'a', 'p1'), cell('s1', 'b', 'p2'), cell('s3', 'a', 'p3')];

    expect(planAssignmentChanges(current, wanted)).toEqual({
      toDelete: [cell('s2', 'a', 'p3')],
      toChange: [cell('s1', 'b', 'p2')],
      toCreate: [cell('s3', 'a', 'p3')],
      added: 1,
      removed: 1,
      changed: 1,
    });
  });

  it('treats the same subject in two classes as two pairs, and the same class with two subjects too', () => {
    const plan = planAssignmentChanges(
      [cell('s1', 'a', 'p1')],
      [cell('s1', 'a', 'p1'), cell('s1', 'b', 'p1'), cell('s2', 'a', 'p1')],
    );

    expect(plan.toCreate).toEqual([cell('s1', 'b', 'p1'), cell('s2', 'a', 'p1')]);
    expect(plan.toChange).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it('does not modify its inputs', () => {
    const current = [cell('s1', 'a', 'p1')];
    const wanted = [cell('s1', 'a', 'p2'), cell('s2', 'a', 'p2')];
    const before = structuredClone({ current, wanted });

    planAssignmentChanges(current, wanted);

    expect({ current, wanted }).toEqual(before);
  });

  it('returns no operations for two empty states', () => {
    expect(planAssignmentChanges([], [])).toEqual({
      toDelete: [],
      toChange: [],
      toCreate: [],
      added: 0,
      removed: 0,
      changed: 0,
    });
  });
});
