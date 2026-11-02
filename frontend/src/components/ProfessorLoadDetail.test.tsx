import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import type { Calendar } from '../services/calendarsService';
import type { ProfessorLoad } from '../services/professorsSummaryService';
import {
  ProfessorLoadDetail,
  type AvailabilityState,
  type CalendarsState,
} from './ProfessorLoadDetail';

const texts = es.professors.summary.detail;

const subject = (
  subjectName: string,
  courseId: string,
  courseName: string,
  className: string,
  sessionsPerWeek: number,
): ProfessorLoad['subjects'][number] => ({
  subjectId: `s-${subjectName}`,
  subjectName,
  courseId,
  courseName,
  classId: `k-${courseId}-${className}`,
  className,
  sessionsPerWeek,
});

/** Ana: 10 sesiones en «Mixto» (15 de 60 y 10 de 45 minutos a la semana). */
const ana: ProfessorLoad = {
  id: 'p-ana',
  firstName: 'Ana',
  lastName: 'García',
  subjects: [
    subject('Lengua', 'course-1', '1º Primaria', 'A', 5),
    subject('Lengua', 'course-1', '1º Primaria', 'B', 5),
  ],
  courses: [{ id: 'course-1', name: '1º Primaria' }],
  calendars: [
    {
      calendar: { id: 'cal-1', name: 'Mixto' },
      sessions: 10,
      available: 25,
      minMinutes: 450,
      maxMinutes: 600,
    },
  ],
  sessionsPerWeek: 10,
  minMinutes: 450,
  maxMinutes: 600,
  status: 'FITS',
  warnings: [],
};

/** Eva: 3 sesiones en «Mixto», 2 en «Corto» (todas de 45 minutos) y 3 en un curso sin calendario. */
const eva: ProfessorLoad = {
  id: 'p-eva',
  firstName: 'Eva',
  lastName: 'Pérez',
  subjects: [
    subject('Inglés', 'course-1', '1º Primaria', 'A', 3),
    subject('Música', 'course-2', '2º Primaria', 'A', 1),
    subject('Plástica', 'course-2', '2º Primaria', 'B', 1),
    subject('Lengua 6', 'course-6', '6º Primaria', 'A', 3),
  ],
  courses: [
    { id: 'course-1', name: '1º Primaria' },
    { id: 'course-2', name: '2º Primaria' },
    { id: 'course-6', name: '6º Primaria' },
  ],
  calendars: [
    {
      calendar: { id: 'cal-2', name: 'Corto' },
      sessions: 2,
      available: 25,
      minMinutes: 90,
      maxMinutes: 90,
    },
    {
      calendar: { id: 'cal-1', name: 'Mixto' },
      sessions: 3,
      available: 25,
      minMinutes: 135,
      maxMinutes: 180,
    },
  ],
  sessionsPerWeek: 8,
  minMinutes: 225,
  maxMinutes: 270,
  status: 'FITS',
  warnings: [],
};

const sessions = (...ends: [string, string][]) =>
  ends.map(([startTime, endTime]) => ({ type: 'SESSION' as const, startTime, endTime }));

const mixed: Calendar = {
  id: 'cal-1',
  name: 'Mixto',
  periods: [
    ...sessions(['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00']),
    { type: 'BREAK', startTime: '12:00', endTime: '12:30' },
    ...sessions(['12:30', '13:15'], ['13:15', '14:00']),
  ],
  courses: [{ id: 'course-1', name: '1º Primaria' }],
  createdAt: '2026-11-01T10:00:00.000Z',
};

const short: Calendar = {
  id: 'cal-2',
  name: 'Corto',
  periods: sessions(['09:00', '09:45'], ['10:00', '10:45']),
  courses: [{ id: 'course-2', name: '2º Primaria' }],
  createdAt: '2026-11-01T10:00:00.000Z',
};

const loaded = (...calendars: Calendar[]): CalendarsState => ({ status: 'loaded', calendars });

const noIntervals: AvailabilityState = { status: 'loaded', intervals: [] };

function renderDetail(
  professor: ProfessorLoad,
  calendars: CalendarsState,
  availability: AvailabilityState = noIntervals,
  onRetry: () => void = () => undefined,
) {
  return render(
    <MemoryRouter>
      <ProfessorLoadDetail
        id="detail-1"
        professor={professor}
        calendars={calendars}
        availability={availability}
        onRetry={onRetry}
      />
    </MemoryRouter>,
  );
}

describe('ProfessorLoadDetail', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('is a region named after the professor', () => {
    renderDetail(ana, loaded(mixed));

    const region = screen.getByRole('region', { name: 'Detalle de García, Ana' });
    expect(region).toHaveAttribute('id', 'detail-1');
  });

  describe('the assignments', () => {
    it('lists each one with its sessions and the calendar of its course with the length of its sessions', () => {
      renderDetail(ana, loaded(mixed));

      const list = screen.getByRole('list', { name: texts.assignments.title });
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        'Lengua · 1º Primaria A · 5 sesiones · «Mixto», sesiones de 45 a 60 min',
        'Lengua · 1º Primaria B · 5 sesiones · «Mixto», sesiones de 45 a 60 min',
      ]);
    });

    it('says one length when every session of the calendar lasts the same', () => {
      renderDetail(eva, loaded(mixed, short));

      expect(
        screen.getByText('Música · 2º Primaria A · 1 sesión · «Corto», sesiones de 45 min'),
      ).toBeInTheDocument();
    });

    it('says that a course without a calendar has none', () => {
      renderDetail(eva, loaded(mixed, short));

      expect(
        screen.getByText('Lengua 6 · 6º Primaria A · 3 sesiones · sin calendario'),
      ).toBeInTheDocument();
    });

    it.each<[string, CalendarsState]>([
      ['while the calendars load', { status: 'loading' }],
      ['when the calendars cannot be loaded', { status: 'error' }],
    ])('says only the sessions %s', (_name, state) => {
      renderDetail(ana, state);

      const items = within(
        screen.getByRole('list', { name: texts.assignments.title }),
      ).getAllByRole('listitem');
      expect(items.map((item) => item.textContent)).toEqual([
        'Lengua · 1º Primaria A · 5 sesiones',
        'Lengua · 1º Primaria B · 5 sesiones',
      ]);
    });
  });

  describe('by calendar', () => {
    it('gives a line per calendar with its sessions, the ones the professor can give and the range, and the total', () => {
      renderDetail(eva, loaded(mixed, short));

      const list = screen.getByRole('list', { name: texts.calendars.title });
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        '«Corto»: 2 sesiones · puede dar 25 · 1 h 30 min',
        '«Mixto»: 3 sesiones · puede dar 25 · 2 h 15 min – 3 h',
      ]);
      expect(screen.getByText('Total: 3 h 45 min – 4 h 30 min')).toBeInTheDocument();
    });

    it('does not depend on the calendars being loaded', () => {
      renderDetail(ana, { status: 'loading' });

      expect(
        screen.getByText('«Mixto»: 10 sesiones · puede dar 25 · 7 h 30 min – 10 h'),
      ).toBeInTheDocument();
      expect(screen.getByText('Total: 7 h 30 min – 10 h')).toBeInTheDocument();
    });

    it('uses the singular with one session', () => {
      const one: ProfessorLoad = {
        ...ana,
        calendars: [{ ...ana.calendars[0]!, sessions: 1, minMinutes: 45, maxMinutes: 60 }],
        minMinutes: 45,
        maxMinutes: 60,
      };
      renderDetail(one, loaded(mixed));

      expect(
        screen.getByText('«Mixto»: 1 sesión · puede dar 25 · 45 min – 1 h'),
      ).toBeInTheDocument();
    });

    it('is not drawn for a professor whose courses have no calendar', () => {
      const without: ProfessorLoad = {
        ...eva,
        subjects: [subject('Lengua 6', 'course-6', '6º Primaria', 'A', 3)],
        courses: [{ id: 'course-6', name: '6º Primaria' }],
        calendars: [],
        sessionsPerWeek: 3,
        minMinutes: 0,
        maxMinutes: 0,
      };
      renderDetail(without, loaded(mixed));

      expect(
        screen.queryByRole('heading', { name: texts.calendars.title }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/^Total:/)).not.toBeInTheDocument();
    });
  });

  describe('the availability', () => {
    const availability = texts.availability;
    const grid = (name: string) => screen.getByRole('table', { name });

    it('draws the grid of the calendar, read only, and says that the professor is always available without intervals', () => {
      renderDetail(ana, loaded(mixed));

      expect(screen.getByRole('heading', { name: availability.title })).toBeInTheDocument();
      expect(screen.getByText(availability.always)).toBeInTheDocument();
      const table = grid('Disponibilidad de García, Ana en «Mixto»');
      expect(within(table).queryByRole('button')).not.toBeInTheDocument();
      expect(within(table).queryByText('No disponible')).not.toBeInTheDocument();
      expect(within(table).getAllByRole('row').length).toBeGreaterThan(5);
    });

    it('marks the cells that are not available and the partial ones', () => {
      renderDetail(ana, loaded(mixed), {
        status: 'loaded',
        // El lunes de 09:00 a 10:00 es la 1.ª sesión entera; el martes de 09:30 a 10:00 solo la mitad.
        intervals: [
          { dayOfWeek: 1, startMinute: 540, endMinute: 600 },
          { dayOfWeek: 2, startMinute: 570, endMinute: 600 },
        ],
      });

      const table = grid('Disponibilidad de García, Ana en «Mixto»');
      expect(within(table).getAllByText('No disponible')).toHaveLength(1);
      expect(within(table).getAllByText('Parcialmente no disponible')).toHaveLength(1);
      expect(screen.queryByText(availability.always)).not.toBeInTheDocument();
    });

    it('offers a selector of calendar when the professor has several, starting at the one with the most load', async () => {
      const user = userEvent.setup();
      renderDetail(eva, loaded(mixed, short));

      const select = screen.getByRole('combobox', { name: availability.calendar });
      expect(select).toHaveValue('cal-1');
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Corto', 'Mixto']);
      expect(grid('Disponibilidad de Pérez, Eva en «Mixto»')).toBeInTheDocument();

      await user.selectOptions(select, 'cal-2');

      expect(grid('Disponibilidad de Pérez, Eva en «Corto»')).toBeInTheDocument();
    });

    it('does not offer a selector with a single calendar', () => {
      renderDetail(ana, loaded(mixed));

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('says why there is no grid when no course of the professor has a calendar', () => {
      const without: ProfessorLoad = { ...ana, calendars: [], minMinutes: 0, maxMinutes: 0 };
      renderDetail(without, loaded(mixed));

      expect(screen.getByText(availability.noCalendar)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it.each<[string, CalendarsState, AvailabilityState]>([
      ['the availability loads', loaded(mixed), { status: 'loading' }],
      ['the calendars load', { status: 'loading' }, noIntervals],
    ])('shows that it is loading while %s', (_name, calendars, state) => {
      renderDetail(ana, calendars, state);

      expect(screen.getByRole('status')).toHaveTextContent(availability.loading);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it.each<[string, CalendarsState, AvailabilityState]>([
      ['the availability fails', loaded(mixed), { status: 'error' }],
      ['the calendars fail', { status: 'error' }, noIntervals],
    ])(
      'shows an alert with Retry inside the detail when %s, and keeps the rest',
      async (_name, calendars, state) => {
        const user = userEvent.setup();
        const onRetry = vi.fn();
        renderDetail(ana, calendars, state, onRetry);

        expect(screen.getByRole('alert')).toHaveTextContent(availability.loadError);
        expect(screen.getByText('Total: 7 h 30 min – 10 h')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: availability.retry }));

        expect(onRetry).toHaveBeenCalledOnce();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
      },
    );

    it('fails like a load error when the calendar of the professor is not among the calendars', () => {
      renderDetail(ana, loaded(short));

      expect(screen.getByRole('alert')).toHaveTextContent(availability.loadError);
    });
  });

  describe('the warnings', () => {
    const warnings = texts.warnings;
    const withWarnings = (list: ProfessorLoad['warnings']): ProfessorLoad => ({
      ...eva,
      warnings: list,
    });
    const items = () =>
      within(screen.getByRole('list', { name: warnings.title })).getAllByRole('listitem');

    it('is not drawn without warnings', () => {
      renderDetail(ana, loaded(mixed));

      expect(screen.queryByRole('heading', { name: warnings.title })).not.toBeInTheDocument();
    });

    it('explains that the professor passes 23 hours and links to the matrix of each course where they teach', () => {
      renderDetail(withWarnings([{ code: 'EXCEEDS_MAX_HOURS' }]), loaded(mixed, short));

      const [item] = items();
      expect(item).toHaveTextContent(
        'Aunque le tocaran las sesiones más cortas pasaría de 23 h: hay que quitarle asignaciones.',
      );
      expect(
        within(item as HTMLElement)
          .getAllByRole('link')
          .map((link) => [link.textContent, link.getAttribute('href')]),
      ).toEqual([
        ['Profesores de 1º Primaria', '/cursos/course-1/profesores'],
        ['Profesores de 2º Primaria', '/cursos/course-2/profesores'],
        ['Profesores de 6º Primaria', '/cursos/course-6/profesores'],
      ]);
    });

    it('explains that the professor may pass 23 hours, with the same links', () => {
      renderDetail(withWarnings([{ code: 'MAY_EXCEED_MAX_HOURS' }]), loaded(mixed, short));

      const [item] = items();
      expect(item).toHaveTextContent(
        'Según las sesiones que le toquen puede pasar de 23 h; la generación de horarios intentará no pasar de ese máximo.',
      );
      expect(within(item as HTMLElement).getAllByRole('link')).toHaveLength(3);
    });

    it('explains that the availability is not enough and links to the availability of the professor', () => {
      renderDetail(
        withWarnings([
          {
            code: 'AVAILABILITY_INSUFFICIENT',
            calendar: { id: 'cal-1', name: 'Mixto' },
            sessions: 22,
            available: 20,
          },
        ]),
        loaded(mixed, short),
      );

      const [item] = items();
      expect(item).toHaveTextContent(
        'En «Mixto» tiene 22 sesiones y solo puede dar 20: amplía su disponibilidad o quítale asignaciones.',
      );
      expect(
        within(item as HTMLElement).getByRole('link', {
          name: 'Editar la disponibilidad de Pérez, Eva',
        }),
      ).toHaveAttribute('href', '/profesores/p-eva/disponibilidad');
    });

    it.each([
      [1, '6º Primaria no tiene calendario: su asignación no cuenta hasta que se le asigne uno.'],
      [
        3,
        '6º Primaria no tiene calendario: sus 3 asignaciones no cuentan hasta que se le asigne uno.',
      ],
    ])(
      'explains that a course without calendar does not count (%i assignments) and links to the calendars',
      (assignmentCount, text) => {
        renderDetail(
          withWarnings([
            {
              code: 'COURSE_WITHOUT_CALENDAR',
              course: { id: 'course-6', name: '6º Primaria' },
              assignmentCount,
            },
          ]),
          loaded(mixed, short),
        );

        const [item] = items();
        expect(item).toHaveTextContent(text);
        expect(
          within(item as HTMLElement).getByRole('link', { name: warnings.calendarsLink }),
        ).toHaveAttribute('href', '/calendarios');
      },
    );

    it('explains that the professor teaches in several calendars, without a link', () => {
      renderDetail(
        withWarnings([{ code: 'SEVERAL_CALENDARS', calendarCount: 2 }]),
        loaded(mixed, short),
      );

      const [item] = items();
      expect(item).toHaveTextContent(
        'Da clase en 2 calendarios: el resumen no sabe si sus sesiones se solapan en la hora; lo comprueba la generación de horarios.',
      );
      expect(within(item as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
    });

    it('keeps the order of the summary', () => {
      renderDetail(
        withWarnings([
          { code: 'MAY_EXCEED_MAX_HOURS' },
          { code: 'SEVERAL_CALENDARS', calendarCount: 2 },
        ]),
        loaded(mixed, short),
      );

      expect(items()[0]).toHaveTextContent('puede pasar de 23 h');
      expect(items()[1]).toHaveTextContent('Da clase en 2 calendarios');
    });

    it('says it in English with its own plurals', async () => {
      await i18n.changeLanguage('en');
      renderDetail(
        withWarnings([
          {
            code: 'COURSE_WITHOUT_CALENDAR',
            course: { id: 'course-6', name: '6º Primaria' },
            assignmentCount: 1,
          },
        ]),
        loaded(mixed, short),
      );

      const [item] = within(screen.getByRole('list', { name: 'Warnings' })).getAllByRole(
        'listitem',
      );
      expect(item).toHaveTextContent(
        '6º Primaria has no calendar: its assignment does not count until one is given to it.',
      );
      expect(screen.getByRole('link', { name: 'Calendars' })).toBeInTheDocument();
    });
  });

  it('has a heading for each section', () => {
    renderDetail(ana, loaded(mixed));

    expect(screen.getByRole('heading', { name: texts.assignments.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: texts.calendars.title })).toBeInTheDocument();
  });

  it('says it in English with its own plurals', async () => {
    await i18n.changeLanguage('en');
    renderDetail(ana, loaded(mixed));

    expect(
      screen.getAllByText(
        'Lengua · 1º Primaria A · 5 sessions · "Mixto", sessions of 45 to 60 min',
      ),
    ).toHaveLength(1);
    expect(
      screen.getByText('"Mixto": 10 sessions · can give 25 · 7 h 30 min – 10 h'),
    ).toBeInTheDocument();
  });
});
