import { describe, expect, it, vi } from 'vitest';
import type { components } from '../api/generated/schema';
import { scheduleDraftService } from './scheduleDraftService';

type Draft = components['schemas']['ScheduleDetail'];

const draft: Draft = {
  id: '0192f5a0-0000-7000-8000-0000000000a2',
  status: 'DRAFT',
  generatedAt: '2026-11-04T08:00:05.000Z',
  placedSessions: 2,
  confirmedAt: null,
  confirmedBy: null,
  replacedAt: null,
  courses: [
    {
      id: 'course-1',
      name: '1º Primaria',
      calendar: {
        id: 'calendar-1',
        name: 'Primaria',
        periods: [
          { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
          { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
          { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
        ],
      },
      classes: [{ id: 'class-1a', name: 'A' }],
    },
  ],
  subjects: [{ id: 'subject-1', name: 'Inglés', code: 'ING', color: 'blue' }],
  professors: [{ id: 'professor-1', firstName: 'Ana', lastName: 'García' }],
  entries: [
    {
      courseId: 'course-1',
      classId: 'class-1a',
      subjectId: 'subject-1',
      professorId: 'professor-1',
      dayOfWeek: 1,
      sessionNumber: 1,
      startTime: '09:00',
      endTime: '09:45',
    },
    {
      courseId: 'course-1',
      classId: 'class-1a',
      subjectId: 'subject-1',
      professorId: null,
      dayOfWeek: 2,
      sessionNumber: 2,
      startTime: '10:15',
      endTime: '11:00',
    },
  ],
};

/** El mismo horario ya confirmado como oficial por Ana García. */
const official: Draft = {
  ...draft,
  status: 'OFFICIAL',
  confirmedAt: '2026-11-05T09:10:00.000Z',
  confirmedBy: { firstName: 'Ana', lastName: 'García' },
  replacedAt: null,
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const errorBody = (code: string) => ({ success: false, error: { code, message: 'x' } });
const answer = (schedule: unknown) => jsonResponse(200, { success: true, data: { schedule } });

function clientReturning(response: Response | Error) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

/** Un borrador con un cambio, para comprobar que la validación lo rechaza. */
function changed(change: (copy: Draft) => void): Draft {
  const copy = structuredClone(draft);
  change(copy);
  return copy;
}

describe('scheduleDraftService.getDraft', () => {
  it('asks for GET /api/schedule/draft through the authenticated client', async () => {
    const client = clientReturning(answer(draft));

    await scheduleDraftService.getDraft(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/schedule/draft');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the draft as it comes, with an entry without professor', async () => {
    const outcome = await scheduleDraftService.getDraft(clientReturning(answer(draft)));

    expect(outcome).toEqual({ status: 'loaded', schedule: draft });
  });

  it('returns null when the school has no draft', async () => {
    const outcome = await scheduleDraftService.getDraft(clientReturning(answer(null)));

    expect(outcome).toEqual({ status: 'loaded', schedule: null });
  });

  it('accepts a course without calendar and a draft without entries', async () => {
    const withoutCalendar = changed((copy) => {
      const course = copy.courses[0];
      if (course !== undefined) {
        course.calendar = null;
      }
    });
    const empty: Draft = { ...draft, courses: [], subjects: [], professors: [], entries: [] };

    for (const schedule of [withoutCalendar, empty]) {
      expect(await scheduleDraftService.getDraft(clientReturning(answer(schedule)))).toEqual({
        status: 'loaded',
        schedule,
      });
    }
  });

  it('is unauthenticated on 401', async () => {
    const outcome = await scheduleDraftService.getDraft(
      clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
    );

    expect(outcome).toEqual({ status: 'unauthenticated' });
  });

  it('is unavailable when the request fails', async () => {
    const outcome = await scheduleDraftService.getDraft(clientReturning(new Error('offline')));

    expect(outcome).toEqual({ status: 'unavailable' });
  });

  it.each([
    ['503', jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))],
    ['500', jsonResponse(500, errorBody('INTERNAL_ERROR'))],
    ['a 200 without data', jsonResponse(200, { success: true })],
    ['a 200 without the schedule key', jsonResponse(200, { success: true, data: {} })],
    ['a 200 that is not JSON', new Response('<html>', { status: 200 })],
    ['a draft that is not an object', answer('draft')],
    ['a draft without id', answer({ ...draft, id: undefined })],
    ['a status that is not DRAFT', answer({ ...draft, status: 'OFFICIAL' })],
    ['a generation date that is not a date', answer({ ...draft, generatedAt: 'ayer' })],
    ['negative placed sessions', answer({ ...draft, placedSessions: -1 })],
    ['courses that are not a list', answer({ ...draft, courses: {} })],
    [
      'a subject with a color that does not exist',
      answer(
        changed((copy) => {
          const subject = copy.subjects[0];
          if (subject !== undefined) {
            subject.color = 'magenta' as never;
          }
        }),
      ),
    ],
    [
      'a subject with a code that is not text',
      answer(
        changed((copy) => {
          const subject = copy.subjects[0];
          if (subject !== undefined) {
            subject.code = 3 as never;
          }
        }),
      ),
    ],
    [
      'a professor without last name',
      answer(
        changed((copy) => {
          const professor = copy.professors[0];
          if (professor !== undefined) {
            professor.lastName = undefined as never;
          }
        }),
      ),
    ],
    [
      'a period of a kind that does not exist',
      answer(
        changed((copy) => {
          const period = copy.courses[0]?.calendar?.periods[0];
          if (period !== undefined) {
            period.type = 'RECESS' as never;
          }
        }),
      ),
    ],
    [
      'a period with a bad hour',
      answer(
        changed((copy) => {
          const period = copy.courses[0]?.calendar?.periods[0];
          if (period !== undefined) {
            period.startTime = '9:00';
          }
        }),
      ),
    ],
    [
      'a class without name',
      answer(
        changed((copy) => {
          const schoolClass = copy.courses[0]?.classes[0];
          if (schoolClass !== undefined) {
            schoolClass.name = undefined as never;
          }
        }),
      ),
    ],
    [
      'a day outside Monday to Friday',
      answer(
        changed((copy) => {
          const entry = copy.entries[0];
          if (entry !== undefined) {
            entry.dayOfWeek = 6;
          }
        }),
      ),
    ],
    [
      'a session number that is not a positive integer',
      answer(
        changed((copy) => {
          const entry = copy.entries[0];
          if (entry !== undefined) {
            entry.sessionNumber = 0;
          }
        }),
      ),
    ],
    [
      'an entry that ends before it starts',
      answer(
        changed((copy) => {
          const entry = copy.entries[0];
          if (entry !== undefined) {
            entry.startTime = '10:00';
            entry.endTime = '09:00';
          }
        }),
      ),
    ],
    [
      'an entry with a bad hour',
      answer(
        changed((copy) => {
          const entry = copy.entries[0];
          if (entry !== undefined) {
            entry.endTime = '25:00';
          }
        }),
      ),
    ],
    [
      'an entry of a course that is not in the draft',
      answer(
        changed((copy) => {
          const entry = copy.entries[0];
          if (entry !== undefined) {
            entry.courseId = 'course-9';
          }
        }),
      ),
    ],
    [
      'an entry of a class that is not in its course',
      answer(
        changed((copy) => {
          const entry = copy.entries[0];
          if (entry !== undefined) {
            entry.classId = 'class-9';
          }
        }),
      ),
    ],
    [
      'an entry of a subject that is not in the draft',
      answer(
        changed((copy) => {
          const entry = copy.entries[0];
          if (entry !== undefined) {
            entry.subjectId = 'subject-9';
          }
        }),
      ),
    ],
    [
      'an entry of a professor that is not in the draft',
      answer(
        changed((copy) => {
          const entry = copy.entries[0];
          if (entry !== undefined) {
            entry.professorId = 'professor-9';
          }
        }),
      ),
    ],
  ])('is unavailable on %s', async (_name, response) => {
    expect(await scheduleDraftService.getDraft(clientReturning(response))).toEqual({
      status: 'unavailable',
    });
  });
});

describe('scheduleDraftService.getDraft with a confirmation', () => {
  it('rejects a draft that carries a confirmation, or an official one', async () => {
    for (const schedule of [
      { ...draft, confirmedAt: '2026-11-05T09:10:00.000Z' },
      { ...draft, confirmedBy: { firstName: 'Ana', lastName: 'García' } },
      { ...draft, replacedAt: '2026-11-06T09:10:00.000Z' },
      official,
    ]) {
      expect(await scheduleDraftService.getDraft(clientReturning(answer(schedule)))).toEqual({
        status: 'unavailable',
      });
    }
  });
});

describe('scheduleDraftService.getOfficial', () => {
  it('asks for GET /api/schedule/official through the authenticated client', async () => {
    const client = clientReturning(answer(official));

    await scheduleDraftService.getOfficial(client);

    expect(client).toHaveBeenCalledOnce();
    expect(client.mock.calls[0]?.[0]).toBe('/api/schedule/official');
    expect(client.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it('returns the official as it comes, with who and when confirmed it', async () => {
    const outcome = await scheduleDraftService.getOfficial(clientReturning(answer(official)));

    expect(outcome).toEqual({ status: 'loaded', schedule: official });
  });

  it('accepts an official that was already replaced', async () => {
    const replaced: Draft = { ...official, replacedAt: '2026-11-06T09:10:00.000Z' };

    expect(await scheduleDraftService.getOfficial(clientReturning(answer(replaced)))).toEqual({
      status: 'loaded',
      schedule: replaced,
    });
  });

  it('returns null when the school has no official', async () => {
    const outcome = await scheduleDraftService.getOfficial(clientReturning(answer(null)));

    expect(outcome).toEqual({ status: 'loaded', schedule: null });
  });

  it('is unauthenticated on 401 and unavailable when the request fails or the server does', async () => {
    expect(
      await scheduleDraftService.getOfficial(
        clientReturning(jsonResponse(401, errorBody('INVALID_SESSION'))),
      ),
    ).toEqual({ status: 'unauthenticated' });
    expect(await scheduleDraftService.getOfficial(clientReturning(new Error('offline')))).toEqual({
      status: 'unavailable',
    });
    expect(
      await scheduleDraftService.getOfficial(
        clientReturning(jsonResponse(503, errorBody('DATABASE_UNAVAILABLE'))),
      ),
    ).toEqual({ status: 'unavailable' });
  });

  it.each([
    ['a draft', draft],
    ['an official without confirmedAt', { ...official, confirmedAt: null }],
    ['an official without confirmedBy', { ...official, confirmedBy: null }],
    ['an official with a confirmedAt that is not a date', { ...official, confirmedAt: 'ayer' }],
    ['an official with a replacedAt that is not a date', { ...official, replacedAt: 'ayer' }],
    [
      'a confirmedBy without a last name',
      { ...official, confirmedBy: { firstName: 'Ana', lastName: 3 } },
    ],
    [
      'an official without the confirmation keys',
      (({ confirmedAt: _a, ...rest }) => rest)(official),
    ],
  ])('is unavailable for %s', async (_name, schedule) => {
    expect(await scheduleDraftService.getOfficial(clientReturning(answer(schedule)))).toEqual({
      status: 'unavailable',
    });
  });

  it('keeps validating the references and the hours like the draft does', async () => {
    const broken = changed((copy) => {
      const entry = copy.entries[0];
      if (entry !== undefined) {
        entry.subjectId = 'missing';
      }
    });

    expect(
      await scheduleDraftService.getOfficial(
        clientReturning(
          answer({
            ...broken,
            ...{ status: 'OFFICIAL' },
            confirmedAt: official.confirmedAt,
            confirmedBy: official.confirmedBy,
          }),
        ),
      ),
    ).toEqual({ status: 'unavailable' });
  });
});
