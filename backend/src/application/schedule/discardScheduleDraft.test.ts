import { describe, expect, it, vi } from 'vitest';
import { ScheduleNotDraft, ScheduleNotFound } from '../../domain/schedule/scheduleErrors.js';
import type { DiscardOutcome } from '../../domain/schedule/scheduleRepository.js';
import { DiscardScheduleDraft } from './discardScheduleDraft.js';

const SCHOOL_ID = 'school-1';
const ACTOR_ID = 'user-1';

function build(outcome: DiscardOutcome) {
  const scheduleRepository = {
    discard: vi.fn((_schoolId: string, _id: string) => Promise.resolve(outcome)),
  };
  const logger = { info: vi.fn(), warn: vi.fn() };
  const useCase = new DiscardScheduleDraft({ scheduleRepository, logger });
  return { useCase, scheduleRepository, logger };
}

const input = { schoolId: SCHOOL_ID, actorId: ACTOR_ID, scheduleId: 'schedule-1' };

describe('DiscardScheduleDraft', () => {
  it('asks the repository to discard the draft of the school', async () => {
    const { useCase, scheduleRepository } = build({ kind: 'discarded' });

    await useCase.execute(input);

    expect(scheduleRepository.discard).toHaveBeenCalledExactlyOnceWith(SCHOOL_ID, 'schedule-1');
  });

  it('logs the discard with the ids and nothing else', async () => {
    const { useCase, logger } = build({ kind: 'discarded' });

    await expect(useCase.execute(input)).resolves.toBeUndefined();

    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SCHEDULE_DRAFT_DISCARDED',
        school_id: SCHOOL_ID,
        actor_id: ACTOR_ID,
        schedule_id: 'schedule-1',
      },
      expect.any(String),
    );
  });

  it('throws ScheduleNotFound and logs the rejection when it is not of the school', async () => {
    const { useCase, logger } = build({ kind: 'notFound' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ScheduleNotFound);

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'SCHEDULE_DISCARD_REJECTED',
        school_id: SCHOOL_ID,
        actor_id: ACTOR_ID,
        schedule_id: 'schedule-1',
        reason: 'NOT_FOUND',
      },
      expect.any(String),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('throws ScheduleNotDraft when it is an official one, which is never deleted', async () => {
    const { useCase, logger } = build({ kind: 'notDraft' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ScheduleNotDraft);

    expect(logger.warn.mock.calls[0]?.[0]).toMatchObject({
      event: 'SCHEDULE_DISCARD_REJECTED',
      reason: 'NOT_DRAFT',
    });
  });
});
