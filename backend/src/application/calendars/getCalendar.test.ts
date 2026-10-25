import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Calendar } from '../../domain/calendar/calendar.js';
import { CalendarNotFound } from '../../domain/calendar/calendarErrors.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { GetCalendar } from './getCalendar.js';

const calendar: Calendar = {
  id: 'cal-1',
  name: 'Primaria',
  createdAt: new Date('2026-10-23T09:30:00Z'),
  periods: [{ type: 'SESSION', startTime: '09:00', endTime: '09:45' }],
  courses: [
    { id: 'c10', name: '10º Primaria' },
    { id: 'c2', name: '2º Primaria' },
    { id: 'c1', name: '1º Primaria' },
  ],
};

describe('GetCalendar', () => {
  let findById: Mock<CalendarRepository['findById']>;
  let useCase: GetCalendar;

  beforeEach(() => {
    findById = vi.fn<CalendarRepository['findById']>().mockResolvedValue(calendar);
    useCase = new GetCalendar({ calendarRepository: { findById } });
  });

  it('looks the calendar up under the school of the identity and orders its courses naturally', async () => {
    const result = await useCase.execute({ schoolId: 'school-1', calendarId: 'cal-1' });

    expect(findById).toHaveBeenCalledExactlyOnceWith('school-1', 'cal-1');
    expect(result.courses.map(({ name }) => name)).toEqual([
      '1º Primaria',
      '2º Primaria',
      '10º Primaria',
    ]);
    expect(result.periods).toEqual(calendar.periods);
  });

  it('throws CalendarNotFound when it is not in the school, without telling why', async () => {
    findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ schoolId: 'school-1', calendarId: 'cal-1' }),
    ).rejects.toBeInstanceOf(CalendarNotFound);
  });

  it('lets a database failure through', async () => {
    findById.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(
      useCase.execute({ schoolId: 'school-1', calendarId: 'cal-1' }),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});
