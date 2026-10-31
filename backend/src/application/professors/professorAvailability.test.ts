import { describe, expect, it, vi } from 'vitest';
import type { ProfessorAvailability } from '../../domain/professor/availability.js';
import { ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorAvailabilityRepository } from '../../domain/professor/professorAvailabilityRepository.js';
import { ValidationError } from '../validationError.js';
import { GetProfessorAvailability } from './getProfessorAvailability.js';
import { UpdateProfessorAvailability } from './updateProfessorAvailability.js';

const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';

const stored: ProfessorAvailability = {
  professorId: PROFESSOR_ID,
  intervals: [
    { dayOfWeek: 1, startMinute: 540, endMinute: 630 },
    { dayOfWeek: 3, startMinute: 540, endMinute: 840 },
  ],
};

const response = {
  professorId: PROFESSOR_ID,
  unavailable: [
    { dayOfWeek: 1, startTime: '09:00', endTime: '10:30' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '14:00' },
  ],
};

describe('GetProfessorAvailability', () => {
  it('reads the availability of the professor of the school of the identity, with the hours as text', async () => {
    const find = vi.fn<ProfessorAvailabilityRepository['find']>().mockResolvedValue(stored);

    const result = await new GetProfessorAvailability({
      availabilityRepository: { find },
    }).execute({ schoolId: 'school-1', professorId: PROFESSOR_ID });

    expect(result).toEqual(response);
    expect(find).toHaveBeenCalledExactlyOnceWith('school-1', PROFESSOR_ID);
  });

  it('returns no intervals for a professor that is available always', async () => {
    const find = vi
      .fn<ProfessorAvailabilityRepository['find']>()
      .mockResolvedValue({ professorId: PROFESSOR_ID, intervals: [] });

    const result = await new GetProfessorAvailability({
      availabilityRepository: { find },
    }).execute({ schoolId: 'school-1', professorId: PROFESSOR_ID });

    expect(result.unavailable).toEqual([]);
  });

  it('throws ProfessorNotFound when the professor is not in the school', async () => {
    const find = vi.fn<ProfessorAvailabilityRepository['find']>().mockResolvedValue(null);

    await expect(
      new GetProfessorAvailability({ availabilityRepository: { find } }).execute({
        schoolId: 'school-1',
        professorId: PROFESSOR_ID,
      }),
    ).rejects.toBeInstanceOf(ProfessorNotFound);
  });
});

describe('UpdateProfessorAvailability', () => {
  const logger = () => ({ info: vi.fn(), warn: vi.fn() });
  const body = {
    unavailable: [
      { dayOfWeek: 3, startTime: '09:00', endTime: '14:00' },
      { dayOfWeek: 1, startTime: '09:45', endTime: '10:30' },
      { dayOfWeek: 1, startTime: '09:00', endTime: '09:45' },
    ],
  };

  function build(result: Awaited<ReturnType<ProfessorAvailabilityRepository['replace']>>) {
    const replace = vi.fn<ProfessorAvailabilityRepository['replace']>().mockResolvedValue(result);
    const log = logger();
    return {
      replace,
      log,
      useCase: new UpdateProfessorAvailability({
        availabilityRepository: { replace },
        logger: log,
      }),
    };
  }

  const input = { schoolId: 'school-1', actorId: 'user-1', professorId: PROFESSOR_ID, body };

  it('normalizes the intervals before writing and answers with what was stored', async () => {
    const { replace, useCase } = build({ kind: 'replaced', availability: stored });

    const result = await useCase.execute(input);

    expect(replace).toHaveBeenCalledExactlyOnceWith('school-1', PROFESSOR_ID, [
      { dayOfWeek: 1, startMinute: 540, endMinute: 630 },
      { dayOfWeek: 3, startMinute: 540, endMinute: 840 },
    ]);
    expect(result).toEqual(response);
  });

  it('logs PROFESSOR_AVAILABILITY_UPDATED with only identifiers and the count when it replaced', async () => {
    const { log, useCase } = build({ kind: 'replaced', availability: stored });

    await useCase.execute(input);

    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'PROFESSOR_AVAILABILITY_UPDATED',
        school_id: 'school-1',
        actor_id: 'user-1',
        professor_id: PROFESSOR_ID,
        interval_count: 2,
      },
      expect.any(String),
    );
    expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/\d\d:\d\d/);
  });

  it('logs nothing when the intervals were already stored', async () => {
    const { log, useCase } = build({ kind: 'unchanged', availability: stored });

    const result = await useCase.execute(input);

    expect(result).toEqual(response);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('throws ProfessorNotFound and logs the rejection when the professor is not in the school', async () => {
    const { log, useCase } = build({ kind: 'notFound' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ProfessorNotFound);

    expect(log.warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'PROFESSOR_AVAILABILITY_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'user-1',
        professor_id: PROFESSOR_ID,
        reason: 'not_found',
      },
      expect.any(String),
    );
  });

  it('throws ValidationError with the fields and does not touch the repository', async () => {
    const { replace, log, useCase } = build({ kind: 'replaced', availability: stored });

    const attempt = useCase.execute({
      ...input,
      body: { unavailable: [{ dayOfWeek: 7, startTime: '09:00', endTime: '10:00' }] },
    });

    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toMatchObject({
      details: [{ field: 'unavailable[0].dayOfWeek', code: 'OUT_OF_RANGE' }],
    });
    expect(replace).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });

  it('lets a failure of the repository reach the caller', async () => {
    const failure = new Error('database down');
    const replace = vi.fn<ProfessorAvailabilityRepository['replace']>().mockRejectedValue(failure);

    await expect(
      new UpdateProfessorAvailability({
        availabilityRepository: { replace },
        logger: logger(),
      }).execute(input),
    ).rejects.toBe(failure);
  });
});
