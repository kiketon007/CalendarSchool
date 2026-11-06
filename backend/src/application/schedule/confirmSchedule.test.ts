import { describe, expect, it, vi } from 'vitest';
import { ScheduleNotDraft, ScheduleNotFound } from '../../domain/schedule/scheduleErrors.js';
import type { ConfirmOutcome } from '../../domain/schedule/scheduleRepository.js';
import { ConfirmSchedule } from './confirmSchedule.js';

const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'user-1';
const NOW = new Date('2026-11-05T09:10:00.000Z');

const confirmed: ConfirmOutcome = {
  kind: 'confirmed',
  schedule: {
    id: 'schedule-2',
    status: 'OFFICIAL',
    generatedAt: new Date('2026-11-05T09:00:00.000Z'),
    placedSessions: 300,
    confirmedAt: NOW,
    confirmedBy: { firstName: 'Ana', lastName: 'García' },
    replacedAt: null,
    score: null,
  },
  replacedId: 'schedule-1',
};

function build(outcome: ConfirmOutcome) {
  const scheduleRepository = {
    confirm: vi.fn((_schoolId: string, _id: string, _actorId: string, _now: Date) =>
      Promise.resolve(outcome),
    ),
  };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const useCase = new ConfirmSchedule({ scheduleRepository, logger, now: () => NOW });
  return { useCase, scheduleRepository, logger };
}

const input = { schoolId: SCHOOL_ID, actorId: ACTOR_ID, scheduleId: 'schedule-2' };

describe('ConfirmSchedule', () => {
  it('asks the repository to confirm the draft of the school with the actor and the time', async () => {
    const { useCase, scheduleRepository } = build(confirmed);

    await useCase.execute(input);

    expect(scheduleRepository.confirm).toHaveBeenCalledExactlyOnceWith(
      SCHOOL_ID,
      'schedule-2',
      ACTOR_ID,
      NOW,
    );
  });

  it('returns the header of the confirmed schedule, with who confirmed it', async () => {
    const { useCase } = build(confirmed);

    await expect(useCase.execute(input)).resolves.toEqual(confirmed.schedule);
  });

  it('logs the confirmation with the ids, the replaced schedule and no names', async () => {
    const { useCase, logger } = build(confirmed);

    await useCase.execute(input);

    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SCHEDULE_CONFIRMED',
        school_id: SCHOOL_ID,
        actor_id: ACTOR_ID,
        schedule_id: 'schedule-2',
        replaced_schedule_id: 'schedule-1',
      },
      expect.any(String),
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(/Ana|García/u);
  });

  it('logs a null replaced schedule when there was no official before', async () => {
    const { useCase, logger } = build({ ...confirmed, replacedId: null });

    await useCase.execute(input);

    expect(logger.info.mock.calls[0]?.[0]).toMatchObject({ replaced_schedule_id: null });
  });

  it('throws ScheduleNotFound and logs the rejection when the schedule is not of the school', async () => {
    const { useCase, logger } = build({ kind: 'notFound' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ScheduleNotFound);

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SCHEDULE_CONFIRM_REJECTED',
        school_id: SCHOOL_ID,
        actor_id: ACTOR_ID,
        schedule_id: 'schedule-2',
        reason: 'NOT_FOUND',
      },
      expect.any(String),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('throws ScheduleNotDraft and logs the rejection when it is no longer a draft', async () => {
    const { useCase, logger } = build({ kind: 'notDraft' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ScheduleNotDraft);

    expect(logger.warn.mock.calls[0]?.[0]).toMatchObject({
      event: 'SCHEDULE_CONFIRM_REJECTED',
      reason: 'NOT_DRAFT',
    });
  });
});
