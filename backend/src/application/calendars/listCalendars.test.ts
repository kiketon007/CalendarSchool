import { describe, expect, it, vi } from 'vitest';
import type { Calendar } from '../../domain/calendar/calendar.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ListCalendars } from './listCalendars.js';

function calendar(id: string, name: string, courseNames: string[] = []): Calendar {
  return {
    id,
    name,
    createdAt: new Date('2026-10-23T09:30:00Z'),
    periods: [{ type: 'SESSION', startTime: '09:00', endTime: '09:45' }],
    courses: courseNames.map((courseName, index) => ({
      id: `${id}-c${String(index)}`,
      name: courseName,
    })),
  };
}

function listCalendarsWith(calendars: Calendar[]) {
  const listBySchool = vi.fn<CalendarRepository['listBySchool']>().mockResolvedValue(calendars);
  return { listBySchool, useCase: new ListCalendars({ calendarRepository: { listBySchool } }) };
}

describe('ListCalendars', () => {
  it('asks for the calendars of the school of the identity', async () => {
    const { listBySchool, useCase } = listCalendarsWith([]);

    await useCase.execute({ schoolId: 'school-1' });

    expect(listBySchool).toHaveBeenCalledExactlyOnceWith('school-1');
  });

  it('returns an empty list when the school has no calendars', async () => {
    const { useCase } = listCalendarsWith([]);

    await expect(useCase.execute({ schoolId: 'school-1' })).resolves.toEqual([]);
  });

  it('orders the calendars by name, in Spanish, without caring about capitals or accents', async () => {
    const { useCase } = listCalendarsWith([
      calendar('3', 'primaria'),
      calendar('1', 'Álvaro'),
      calendar('2', 'Infantil'),
    ]);

    const names = (await useCase.execute({ schoolId: 'school-1' })).map(({ name }) => name);

    expect(names).toEqual(['Álvaro', 'Infantil', 'primaria']);
  });

  it('orders the courses of each calendar in natural order: 2º before 10º', async () => {
    const { useCase } = listCalendarsWith([
      calendar('1', 'Primaria', ['10º Primaria', '2º Primaria', '1º Primaria']),
    ]);

    const [first] = await useCase.execute({ schoolId: 'school-1' });

    expect(first?.courses.map(({ name }) => name)).toEqual([
      '1º Primaria',
      '2º Primaria',
      '10º Primaria',
    ]);
  });

  it('keeps the periods in the order of the day and does not change the repository result', async () => {
    const periods = [
      { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
      { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
      { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
    ] as const;
    const original = [{ ...calendar('1', 'B', ['2º', '1º']), periods }, calendar('2', 'A')];
    const { useCase } = listCalendarsWith(original);

    const result = await useCase.execute({ schoolId: 'school-1' });

    expect(result.find(({ id }) => id === '1')?.periods).toEqual(periods);
    expect(original.map(({ id }) => id)).toEqual(['1', '2']);
    expect(original[0]?.courses.map(({ name }) => name)).toEqual(['2º', '1º']);
  });

  it('lets a database failure through', async () => {
    const listBySchool = vi
      .fn<CalendarRepository['listBySchool']>()
      .mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
    const useCase = new ListCalendars({ calendarRepository: { listBySchool } });

    await expect(useCase.execute({ schoolId: 'school-1' })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});
