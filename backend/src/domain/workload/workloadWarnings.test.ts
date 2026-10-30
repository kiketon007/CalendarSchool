import { describe, expect, it } from 'vitest';
import { workloadWarnings } from './workloadWarnings.js';

describe('workloadWarnings', () => {
  it('only warns that there is no calendar when the course has none, even with sessions assigned', () => {
    expect(workloadWarnings({ assignedSessions: 12, availableSessions: null })).toEqual([
      { code: 'COURSE_WITHOUT_CALENDAR' },
    ]);
  });

  it('warns that there is no calendar when nothing is assigned either', () => {
    expect(workloadWarnings({ assignedSessions: 0, availableSessions: null })).toEqual([
      { code: 'COURSE_WITHOUT_CALENDAR' },
    ]);
  });

  it('has no warnings when the load is exactly the available sessions', () => {
    expect(workloadWarnings({ assignedSessions: 30, availableSessions: 30 })).toEqual([]);
  });

  it('has no warnings when the load is below the available sessions', () => {
    expect(workloadWarnings({ assignedSessions: 8, availableSessions: 30 })).toEqual([]);
  });

  it('has no warnings when nothing is assigned to a course with a calendar', () => {
    expect(workloadWarnings({ assignedSessions: 0, availableSessions: 25 })).toEqual([]);
  });

  it('warns with both numbers when the load exceeds the available sessions by one', () => {
    expect(workloadWarnings({ assignedSessions: 31, availableSessions: 30 })).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 31, available: 30 },
    ]);
  });

  it('warns when the calendar is shorter than the load', () => {
    expect(workloadWarnings({ assignedSessions: 28, availableSessions: 25 })).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 28, available: 25 },
    ]);
  });
});
