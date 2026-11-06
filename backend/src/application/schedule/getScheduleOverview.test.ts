import { describe, expect, it, vi } from 'vitest';
import type {
  ScheduleReadRepository,
  StoredScheduleOverview,
  StoredScheduleSummary,
} from '../../domain/schedule/scheduleRead.js';
import type { ScheduleScore } from '../../domain/schedule/scheduleScore.js';
import { GetScheduleOverview } from './getScheduleOverview.js';

const SCHOOL_ID = 'school-1';

const scoreOf = (total: number): ScheduleScore => ({
  total,
  preferredMisses: 8,
  preferredTotal: 50,
  professorGaps: 18,
  consecutiveDays: 6,
  initialTotal: 220,
});

const draft: StoredScheduleSummary = {
  id: 'draft-1',
  status: 'DRAFT',
  generatedAt: new Date('2026-11-05T09:00:00.000Z'),
  placedSessions: 300,
  confirmedAt: null,
  confirmedBy: null,
  replacedAt: null,
  score: scoreOf(134),
};
const official: StoredScheduleSummary = {
  id: 'official-1',
  status: 'OFFICIAL',
  generatedAt: new Date('2026-11-04T08:00:05.000Z'),
  placedSessions: 290,
  confirmedAt: new Date('2026-11-04T10:30:00.000Z'),
  confirmedBy: { firstName: 'Ana', lastName: 'García' },
  replacedAt: null,
  score: null,
};

function useCaseWith(overview: StoredScheduleOverview) {
  const readOverview = vi.fn<ScheduleReadRepository['overview']>().mockResolvedValue(overview);
  return {
    useCase: new GetScheduleOverview({ scheduleReadRepository: { overview: readOverview } }),
    readOverview,
  };
}

describe('GetScheduleOverview', () => {
  it('asks the repository for the school of the session, once', async () => {
    const { useCase, readOverview } = useCaseWith({
      draft: null,
      official: null,
      previousCount: 0,
    });

    await useCase.execute({ schoolId: SCHOOL_ID });

    expect(readOverview).toHaveBeenCalledExactlyOnceWith(SCHOOL_ID);
  });

  it('returns nothing when the school has no schedule', async () => {
    const { useCase } = useCaseWith({ draft: null, official: null, previousCount: 0 });

    await expect(useCase.execute({ schoolId: SCHOOL_ID })).resolves.toEqual({
      draft: null,
      official: null,
      previousCount: 0,
    });
  });

  it('returns the draft, the current official and how many were replaced', async () => {
    const { useCase } = useCaseWith({ draft, official, previousCount: 2 });

    await expect(useCase.execute({ schoolId: SCHOOL_ID })).resolves.toEqual({
      draft,
      official,
      previousCount: 2,
    });
  });

  it('does not modify what the repository returns', async () => {
    const overview = { draft, official, previousCount: 1 };
    const { useCase } = useCaseWith(overview);

    await useCase.execute({ schoolId: SCHOOL_ID });

    expect(overview).toEqual({ draft, official, previousCount: 1 });
  });
});
