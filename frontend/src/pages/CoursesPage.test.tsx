import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { coursesService, type Course, type CoursesOutcome } from '../services/coursesService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { CoursesPage } from './CoursesPage';

const sessionData: SessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
    role: 'MEMBER',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};

const CREATED_AT = '2026-10-19T09:30:00.000Z';

function course(id: string, name: string, classNames: string[], createdAt = CREATED_AT): Course {
  return {
    id,
    name,
    createdAt,
    classes: classNames.map((className) => ({
      id: `${id}-${className}`,
      name: className,
      tutor: null,
    })),
  };
}

const courses: Course[] = [
  course('c1', '1º Primaria', ['A', 'B']),
  course('c2', '2º Primaria', ['A']),
];

/** Cuatro cursos para probar la búsqueda. */
const searchable: Course[] = [
  course('s1', '1º Primaria', ['A']),
  course('s2', '2º Primaria', ['A']),
  course('s3', 'Educación Infantil', ['A', 'B']),
  course('s4', 'ESO', ['A']),
];

const DESKTOP = 1280;
const MOBILE = 360;

/** Fecha de creación como la muestra la página, con el idioma activo. */
function formattedDate(iso: string): string {
  return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));
}

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('CoursesPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let list: MockInstance<typeof coursesService.list>;
  let media: MatchMediaControl;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    list = vi.spyOn(coursesService, 'list');
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    list.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  /** Monta la página con la ventana al ancho indicado. */
  function renderPage(entry: InitialEntry = '/cursos', width = DESKTOP, strict = false) {
    media.setWidth(width);
    const tree = (
      <MemoryRouter initialEntries={[entry]}>
        <SessionProvider>
          <Routes>
            <Route path="/cursos" element={<CoursesPage />} />
            <Route path="/cursos/nuevo" element={<div data-testid="create-course-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  describe('table on a wide screen', () => {
    it('shows a table named by the title with the four columns and one row per course', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage();

      const table = await screen.findByRole('table', { name: es.courses.title });
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((header) => header.textContent),
      ).toEqual([
        es.courses.fields.course,
        es.courses.fields.classes,
        es.courses.fields.tutors,
        es.courses.fields.created,
      ]);
      expect(
        within(table)
          .getAllByRole('rowheader')
          .map((header) => header.textContent),
      ).toEqual(['1º Primaria', '2º Primaria']);
    });

    it('shows in every row the classes, "no tutor" and the creation date', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage();

      const row = (await screen.findByRole('rowheader', { name: '1º Primaria' })).closest('tr');
      const cells = within(row as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent);
      expect(cells).toEqual(['2 clases: A, B', es.courses.noTutor, formattedDate(CREATED_AT)]);
    });

    it('uses the singular for a course with a single class', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage();

      expect(await screen.findByText('1 clase: A')).toBeVisible();
    });

    it('does not draw the cards', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage();

      await screen.findByRole('table');
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
      expect(screen.queryByRole('list')).toBeNull();
    });
  });

  describe('cards on a narrow screen', () => {
    it('shows one card per course with its name as an h2 and the same data, and no table', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage('/cursos', MOBILE);

      const heading = await screen.findByRole('heading', { level: 2, name: '1º Primaria' });
      expect(screen.queryByRole('table')).toBeNull();
      const card = heading.closest('li') as HTMLElement;
      expect(within(card).getByText('2 clases: A, B')).toBeVisible();
      expect(within(card).getByText(es.courses.noTutor)).toBeVisible();
      expect(within(card).getByText(formattedDate(CREATED_AT))).toBeVisible();
      expect(
        within(card)
          .getAllByRole('term')
          .map((term) => term.textContent),
      ).toEqual([es.courses.fields.classes, es.courses.fields.tutors, es.courses.fields.created]);
    });

    it('lists the cards under the title, in the order of the service', async () => {
      list.mockResolvedValue({
        status: 'loaded',
        courses: [course('c1', '2º Primaria', ['A']), course('c2', '10º Curso', ['A'])],
      });

      renderPage('/cursos', MOBILE);

      await screen.findByRole('heading', { level: 2, name: '2º Primaria' });
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
      ).toEqual(['2º Primaria', '10º Curso']);
      expect(screen.getByRole('list', { name: es.courses.title })).toBeVisible();
    });

    it('orders the headings h1 then h2', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage('/cursos', MOBILE);

      await screen.findByRole('heading', { level: 2, name: '1º Primaria' });
      expect(screen.getAllByRole('heading').map((heading) => heading.tagName)).toEqual([
        'H1',
        'H2',
        'H2',
      ]);
    });
  });

  it('switches from the table to the cards when the window narrows, without asking again', async () => {
    list.mockResolvedValue({ status: 'loaded', courses });
    renderPage();
    await screen.findByRole('table');

    act(() => {
      media.setWidth(MOBILE);
    });

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: '1º Primaria' })).toBeVisible();
    expect(list).toHaveBeenCalledOnce();
  });

  it('shows the creation date and the headings in English with the English language', async () => {
    await i18n.changeLanguage('en');
    list.mockResolvedValue({ status: 'loaded', courses });

    renderPage();

    const table = await screen.findByRole('table', { name: en.courses.title });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      en.courses.fields.course,
      en.courses.fields.classes,
      en.courses.fields.tutors,
      en.courses.fields.created,
    ]);
    const row = within(table).getByRole('rowheader', { name: '1º Primaria' }).closest('tr');
    expect(within(row as HTMLElement).getByText('2 classes: A, B')).toBeVisible();
    expect(within(row as HTMLElement).getByText(en.courses.noTutor)).toBeVisible();
    expect(within(row as HTMLElement).getByText(formattedDate(CREATED_AT))).toBeVisible();
  });

  describe.each([
    ['on a wide screen', DESKTOP],
    ['on a narrow screen', MOBILE],
  ])('%s', (_label, width) => {
    it('shows an accessible loading indicator while the list is requested', () => {
      list.mockReturnValue(new Promise<CoursesOutcome>(() => undefined));

      renderPage('/cursos', width);

      expect(screen.getByText(es.courses.loading).closest('[role="status"]')).toBeInTheDocument();
    });

    it('asks for the courses only once, also in strict mode', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage('/cursos', width, true);

      await screen.findByText('1 clase: A');
      expect(list).toHaveBeenCalledOnce();
    });

    it('renders names with markup or apostrophes as plain text', async () => {
      list.mockResolvedValue({
        status: 'loaded',
        courses: [course('c1', "<b>D'Arcy</b>", ['<i>A</i>'])],
      });

      renderPage('/cursos', width);

      expect(await screen.findByText("<b>D'Arcy</b>")).toBeVisible();
      expect(screen.getByText('1 clase: <i>A</i>')).toBeVisible();
      expect(document.querySelector('main b, main i')).toBeNull();
    });

    it('offers no edit, delete or schedule actions, no student column and no disabled buttons', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage('/cursos', width);

      await screen.findByText('1 clase: A');
      expect(screen.queryAllByRole('button')).toEqual([]);
      expect(screen.queryByText(/alumnos|editar|borrar|horario/i)).toBeNull();
    });

    it('shows the empty state, without a search box, when the school has no courses', async () => {
      list.mockResolvedValue({ status: 'loaded', courses: [] });

      renderPage('/cursos', width);

      expect(await screen.findByText(es.courses.empty)).toBeVisible();
      expect(screen.getByText(es.courses.emptyHint)).toBeVisible();
      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(screen.queryByRole('table')).toBeNull();
    });

    it.each([
      ['while loading', () => list.mockReturnValue(new Promise<CoursesOutcome>(() => undefined))],
      ['with courses', () => list.mockResolvedValue({ status: 'loaded', courses })],
      ['when empty', () => list.mockResolvedValue({ status: 'loaded', courses: [] })],
      ['after an error', () => list.mockResolvedValue({ status: 'unavailable' })],
    ])('always offers "Crear curso", linked to /cursos/nuevo, %s', async (_name, setup) => {
      setup();

      renderPage('/cursos', width);

      const link = await screen.findByRole('link', { name: es.courses.create });
      expect(link).toHaveAttribute('href', '/cursos/nuevo');
    });

    it('goes to the creation page when "Crear curso" is pressed', async () => {
      list.mockResolvedValue({ status: 'loaded', courses: [] });
      renderPage('/cursos', width);

      await userEvent.click(await screen.findByRole('link', { name: es.courses.create }));

      expect(screen.getByTestId('create-course-page')).toBeInTheDocument();
    });

    it('shows an alert with a retry button when the list cannot be loaded, and asks again', async () => {
      list.mockResolvedValueOnce({ status: 'unavailable' });
      list.mockResolvedValueOnce({ status: 'loaded', courses });
      renderPage('/cursos', width);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(es.courses.loadError);
      expect(screen.queryByRole('searchbox')).toBeNull();
      await userEvent.click(within(alert).getByRole('button', { name: es.courses.retry }));

      expect(await screen.findByText('1 clase: A')).toBeVisible();
      expect(list).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows neither an error nor the courses when the session is lost: the layout redirects', async () => {
      list.mockResolvedValue({ status: 'unauthenticated' });

      renderPage('/cursos', width);

      await waitFor(() => {
        expect(list).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    });

    describe('notice after creating a course', () => {
      it('shows it in a status region when the navigation brings the name of the new course', async () => {
        list.mockResolvedValue({ status: 'loaded', courses });

        renderPage({ pathname: '/cursos', state: { courseCreated: '1º Primaria' } }, width);

        const notice = await screen.findByText('Curso «1º Primaria» creado');
        expect(notice.closest('[role="status"]')).toBeInTheDocument();
      });

      it('does not show it without that state', async () => {
        list.mockResolvedValue({ status: 'loaded', courses });

        renderPage('/cursos', width);

        await screen.findByText('1 clase: A');
        expect(screen.queryByText(/creado/)).toBeNull();
      });

      it.each([
        ['a boolean', { courseCreated: true }],
        ['a number', { courseCreated: 5 }],
        ['an empty text', { courseCreated: '' }],
        ['another property', { other: 'x' }],
        ['a text instead of an object', 'x'],
      ])('ignores a state with %s', async (_name, state) => {
        list.mockResolvedValue({ status: 'loaded', courses });

        renderPage({ pathname: '/cursos', state }, width);

        await screen.findByText('1 clase: A');
        expect(screen.queryByText(/creado/)).toBeNull();
      });

      it('shows the name of the course as plain text', async () => {
        list.mockResolvedValue({ status: 'loaded', courses });

        renderPage({ pathname: '/cursos', state: { courseCreated: '<b>X</b>' } }, width);

        expect(await screen.findByText('Curso «<b>X</b>» creado')).toBeVisible();
      });
    });

    describe('accessibility', () => {
      it.each<[string, CoursesOutcome]>([
        ['with courses', { status: 'loaded', courses }],
        ['empty', { status: 'loaded', courses: [] }],
        ['with an error', { status: 'unavailable' }],
      ])('has no WCAG violations %s', async (_name, outcome) => {
        list.mockResolvedValue(outcome);

        const { container } = renderPage('/cursos', width);

        await screen.findByRole('link', { name: es.courses.create });
        await waitFor(() => {
          expect(screen.queryByText(es.courses.loading)).toBeNull();
        });
        expect(await wcagViolations(container)).toEqual([]);
      });

      it('has no WCAG violations with the notice of a new course', async () => {
        list.mockResolvedValue({ status: 'loaded', courses });

        const { container } = renderPage(
          { pathname: '/cursos', state: { courseCreated: '1º Primaria' } },
          width,
        );

        await screen.findByText('Curso «1º Primaria» creado');
        expect(await wcagViolations(container)).toEqual([]);
      });
    });

    describe('search', () => {
      const searchbox = () => screen.getByRole('searchbox', { name: es.courses.search.label });
      const visibleNames = () =>
        width === DESKTOP
          ? screen.queryAllByRole('rowheader').map((header) => header.textContent)
          : screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);

      beforeEach(() => {
        list.mockResolvedValue({ status: 'loaded', courses: searchable });
      });

      it('shows the search box above the list once the courses are loaded', async () => {
        renderPage('/cursos', width);

        await screen.findByRole('searchbox');

        expect(searchbox()).toHaveValue('');
        expect(visibleNames()).toEqual(['1º Primaria', '2º Primaria', 'Educación Infantil', 'ESO']);
        expect(screen.queryByRole('status')).toBeNull();
      });

      it('filters while typing, keeps the order, and says how many courses are shown', async () => {
        renderPage('/cursos', width);
        await screen.findByRole('searchbox');

        await userEvent.type(searchbox(), 'primaria');

        expect(visibleNames()).toEqual(['1º Primaria', '2º Primaria']);
        expect(screen.getByRole('status')).toHaveTextContent('Mostrando 2 de 4 cursos');
      });

      it('filters from the first character', async () => {
        renderPage('/cursos', width);
        await screen.findByRole('searchbox');

        await userEvent.type(searchbox(), 'e');

        expect(visibleNames()).toEqual(['Educación Infantil', 'ESO']);
        await userEvent.type(searchbox(), 's');
        expect(visibleNames()).toEqual(['ESO']);
      });

      it.each([
        ['educacion', ['Educación Infantil']],
        ['EDUCACIÓN', ['Educación Infantil']],
        ['  eso  ', ['ESO']],
        ['1º', ['1º Primaria']],
        ['1ª', []],
      ])('searching "%s" shows %j', async (text, expected) => {
        renderPage('/cursos', width);
        await screen.findByRole('searchbox');

        await userEvent.type(searchbox(), text);

        expect(visibleNames()).toEqual(expected);
      });

      it('does not ask the server again while searching', async () => {
        renderPage('/cursos', width);
        await screen.findByRole('searchbox');

        await userEvent.type(searchbox(), 'primaria');

        expect(list).toHaveBeenCalledOnce();
      });

      it('treats a search of only spaces as empty: all courses and no indicator', async () => {
        renderPage('/cursos', width);
        await screen.findByRole('searchbox');

        await userEvent.type(searchbox(), '   ');

        expect(visibleNames()).toHaveLength(4);
        expect(screen.queryByRole('status')).toBeNull();
      });

      it('shows the message and the clear button when nothing matches', async () => {
        renderPage('/cursos', width);
        await screen.findByRole('searchbox');

        await userEvent.type(searchbox(), 'XYZ');

        expect(screen.getByText('No hay cursos que coincidan con «XYZ»')).toBeVisible();
        expect(screen.getByRole('button', { name: es.courses.search.clear })).toBeVisible();
        expect(visibleNames()).toEqual([]);
        expect(screen.queryByRole('table')).toBeNull();
      });

      it('clears the search, shows every course again and gives the focus back to the box', async () => {
        renderPage('/cursos', width);
        await screen.findByRole('searchbox');
        await userEvent.type(searchbox(), 'XYZ');

        await userEvent.click(screen.getByRole('button', { name: es.courses.search.clear }));

        expect(searchbox()).toHaveValue('');
        expect(searchbox()).toHaveFocus();
        expect(visibleNames()).toHaveLength(4);
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.queryByText(/No hay cursos que coincidan/)).toBeNull();
      });

      it('keeps the search when the window changes its width', async () => {
        renderPage('/cursos', width);
        await screen.findByRole('searchbox');
        await userEvent.type(searchbox(), 'primaria');

        act(() => {
          media.setWidth(width === DESKTOP ? MOBILE : DESKTOP);
        });

        expect(searchbox()).toHaveValue('primaria');
        expect(screen.getByRole('status')).toHaveTextContent('Mostrando 2 de 4 cursos');
      });

      it('keeps the search out of the URL and the browser storage', async () => {
        localStorage.clear();
        sessionStorage.clear();
        renderPage('/cursos', width);
        await screen.findByRole('searchbox');

        await userEvent.type(searchbox(), 'primaria');

        expect(localStorage).toHaveLength(0);
        expect(sessionStorage).toHaveLength(0);
        expect(window.location.search).toBe('');
      });

      it.each([
        ['filtered', 'primaria'],
        ['without results', 'XYZ'],
      ])('has no WCAG violations %s', async (_name, text) => {
        const { container } = renderPage('/cursos', width);
        await screen.findByRole('searchbox');
        await userEvent.type(searchbox(), text);

        expect(await wcagViolations(container)).toEqual([]);
      });
    });
  });
});
