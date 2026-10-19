import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { coursesService, type Course, type CoursesOutcome } from '../services/coursesService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
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

function course(id: string, name: string, classNames: string[]): Course {
  return {
    id,
    name,
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

function renderPage(entry: InitialEntry = '/cursos', strict = false) {
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

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    list = vi.spyOn(coursesService, 'list');
  });

  afterEach(() => {
    refresh.mockRestore();
    list.mockRestore();
  });

  it('shows an accessible loading indicator while the list is requested', () => {
    list.mockReturnValue(new Promise<CoursesOutcome>(() => undefined));

    renderPage();

    expect(screen.getByText(es.courses.loading).closest('[role="status"]')).toBeInTheDocument();
  });

  it('asks for the courses only once, also in strict mode', async () => {
    list.mockResolvedValue({ status: 'loaded', courses });

    renderPage('/cursos', true);

    await screen.findByRole('heading', { level: 2, name: '1º Primaria' });
    expect(list).toHaveBeenCalledOnce();
  });

  it('shows every course under an h2 with its classes and "no tutor"', async () => {
    list.mockResolvedValue({ status: 'loaded', courses });

    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: es.courses.title })).toBeVisible();
    const first = screen.getByRole('heading', { level: 2, name: '1º Primaria' });
    expect(first).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: '2º Primaria' })).toBeVisible();
    const classes = screen.getByRole('list', { name: 'Clases de 1º Primaria' });
    expect(
      within(classes)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([`A — ${es.courses.noTutor}`, `B — ${es.courses.noTutor}`]);
  });

  it('keeps the order the service returns', async () => {
    list.mockResolvedValue({
      status: 'loaded',
      courses: [course('c1', '2º Primaria', ['A']), course('c2', '10º Curso', ['A'])],
    });

    renderPage();

    await screen.findByRole('heading', { level: 2, name: '2º Primaria' });
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['2º Primaria', '10º Curso']);
  });

  it('renders names with markup or apostrophes as plain text', async () => {
    list.mockResolvedValue({
      status: 'loaded',
      courses: [course('c1', "<b>D'Arcy</b>", ['<i>A</i>'])],
    });

    renderPage();

    expect(await screen.findByRole('heading', { level: 2, name: "<b>D'Arcy</b>" })).toBeVisible();
    expect(screen.getByText('<i>A</i> — ' + es.courses.noTutor)).toBeVisible();
    expect(document.querySelector('main b, main i')).toBeNull();
  });

  it('shows the empty state when the school has no courses', async () => {
    list.mockResolvedValue({ status: 'loaded', courses: [] });

    renderPage();

    expect(await screen.findByText(es.courses.empty)).toBeVisible();
    expect(screen.getByText(es.courses.emptyHint)).toBeVisible();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it.each([
    ['while loading', () => list.mockReturnValue(new Promise<CoursesOutcome>(() => undefined))],
    ['with courses', () => list.mockResolvedValue({ status: 'loaded', courses })],
    ['when empty', () => list.mockResolvedValue({ status: 'loaded', courses: [] })],
    ['after an error', () => list.mockResolvedValue({ status: 'unavailable' })],
  ])('always offers "Crear curso", linked to /cursos/nuevo, %s', async (_name, setup) => {
    setup();

    renderPage();

    const link = await screen.findByRole('link', { name: es.courses.create });
    expect(link).toHaveAttribute('href', '/cursos/nuevo');
  });

  it('goes to the creation page when "Crear curso" is pressed', async () => {
    list.mockResolvedValue({ status: 'loaded', courses: [] });
    renderPage();

    await userEvent.click(await screen.findByRole('link', { name: es.courses.create }));

    expect(screen.getByTestId('create-course-page')).toBeInTheDocument();
  });

  it('shows an alert with a retry button when the list cannot be loaded, and asks again', async () => {
    list.mockResolvedValueOnce({ status: 'unavailable' });
    list.mockResolvedValueOnce({ status: 'loaded', courses });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(es.courses.loadError);
    await userEvent.click(within(alert).getByRole('button', { name: es.courses.retry }));

    expect(await screen.findByRole('heading', { level: 2, name: '1º Primaria' })).toBeVisible();
    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows neither an error nor the courses when the session is lost: the layout redirects', async () => {
    list.mockResolvedValue({ status: 'unauthenticated' });

    renderPage();

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  describe('notice after creating a course', () => {
    it('shows it in a status region when the navigation brings the name of the new course', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage({ pathname: '/cursos', state: { courseCreated: '1º Primaria' } });

      const notice = await screen.findByText('Curso «1º Primaria» creado');
      expect(notice.closest('[role="status"]')).toBeInTheDocument();
    });

    it('does not show it without that state', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage();

      await screen.findByRole('heading', { level: 2, name: '1º Primaria' });
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

      renderPage({ pathname: '/cursos', state });

      await screen.findByRole('heading', { level: 2, name: '1º Primaria' });
      expect(screen.queryByText(/creado/)).toBeNull();
    });

    it('shows the name of the course as plain text', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage({ pathname: '/cursos', state: { courseCreated: '<b>X</b>' } });

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

      const { container } = renderPage();

      await screen.findByRole('link', { name: es.courses.create });
      await waitFor(() => {
        expect(screen.queryByText(es.courses.loading)).toBeNull();
      });
      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations with the notice of a new course', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      const { container } = renderPage({
        pathname: '/cursos',
        state: { courseCreated: '1º Primaria' },
      });

      await screen.findByText('Curso «1º Primaria» creado');
      expect(await wcagViolations(container)).toEqual([]);
    });

    it('orders the headings h1 then h2', async () => {
      list.mockResolvedValue({ status: 'loaded', courses });

      renderPage();

      await screen.findByRole('heading', { level: 2, name: '1º Primaria' });
      expect(screen.getAllByRole('heading').map((heading) => heading.tagName)).toEqual([
        'H1',
        'H2',
        'H2',
      ]);
    });
  });
});
