import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { sessionService, type SessionData } from '../services/sessionService';
import { subjectsService, type Subject, type SubjectsOutcome } from '../services/subjectsService';
import { SessionProvider } from '../session/SessionProvider';
import { SubjectsPage } from './SubjectsPage';

const texts = es.subjects;

function sessionOf(role: 'ADMIN' | 'MEMBER'): SessionData {
  return {
    session: { accessToken: 'signed.access.token', expiresIn: 900 },
    user: {
      id: '0192f5a0-0000-7000-8000-0000000000a1',
      email: 'jose.garcia@example.com',
      firstName: 'José María',
      lastName: 'García-López',
      role,
    },
    school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
  };
}

const CREATED_AT = '2026-10-26T09:30:00.000Z';

const english: Subject = {
  id: 'sub-1',
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  description: null,
  color: 'blue',
  createdAt: CREATED_AT,
  courses: [
    { id: 'c1', name: '1º Primaria', sessionsPerWeek: 3 },
    { id: 'c2', name: '2º Primaria', sessionsPerWeek: 1 },
  ],
};

const programming: Subject = {
  id: 'sub-2',
  name: 'Programación',
  code: null,
  type: 'CUSTOM',
  status: 'ACTIVE',
  description: 'Robótica y código',
  color: 'purple',
  createdAt: CREATED_AT,
  courses: [{ id: 'c3', name: '4º Primaria', sessionsPerWeek: 2 }],
};

const french: Subject = {
  id: 'sub-3',
  name: 'Francés',
  code: 'FR-2',
  type: 'ELECTIVE',
  status: 'INACTIVE',
  description: null,
  color: 'red',
  createdAt: CREATED_AT,
  courses: [],
};

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('SubjectsPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let list: MockInstance<typeof subjectsService.list>;

  function signInAs(role: 'ADMIN' | 'MEMBER') {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
  }

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    signInAs('MEMBER');
    list = vi.spyOn(subjectsService, 'list');
  });

  afterEach(async () => {
    refresh.mockRestore();
    list.mockRestore();
    await i18n.changeLanguage('es');
  });

  function renderPage(entry: InitialEntry = '/asignaturas', strict = false) {
    const tree = (
      <MemoryRouter initialEntries={[entry]}>
        <SessionProvider>
          <Routes>
            <Route path="/asignaturas" element={<SubjectsPage />} />
            <Route path="/asignaturas/nueva" element={<div data-testid="create-subject-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  function resolvedList(outcome: SubjectsOutcome) {
    list.mockResolvedValue(outcome);
  }

  function loaded(...subjects: Subject[]) {
    resolvedList({ status: 'loaded', subjects });
  }

  const article = (name: string) => screen.getByRole('article', { name });

  describe('loading the list', () => {
    it('asks for the list once, also in strict mode, and shows that it is loading', async () => {
      loaded(english);
      renderPage('/asignaturas', true);

      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
      await screen.findByRole('heading', { name: 'Inglés' });

      expect(list).toHaveBeenCalledTimes(1);
    });

    it('shows an alert with a button to retry when it fails, and asks again when it is pressed', async () => {
      const user = userEvent.setup();
      resolvedList({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);

      loaded(english);
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(await screen.findByRole('heading', { name: 'Inglés' })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('shows nothing of its own when the session is no longer valid: the layout redirects', async () => {
      resolvedList({ status: 'unauthenticated' });
      renderPage();

      await waitFor(() => {
        expect(list).toHaveBeenCalledOnce();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('article')).not.toBeInTheDocument();
    });
  });

  describe('each subject', () => {
    it('shows its name, code, type, status and color, with the color named', async () => {
      loaded(english, programming, french);
      renderPage();

      const card = within(await screen.findByRole('article', { name: 'Inglés' }));
      expect(card.getByRole('heading', { level: 2, name: 'Inglés' })).toBeInTheDocument();
      expect(card.getByText('Código ING')).toBeInTheDocument();
      expect(card.getByText('Troncal')).toBeInTheDocument();
      expect(card.getByText('Activa')).toBeInTheDocument();
      expect(card.getByRole('img', { name: 'Color: Azul' })).toBeInTheDocument();
      expect(within(article('Francés')).getByText('Inactiva')).toBeInTheDocument();
      expect(within(article('Francés')).getByText('Optativa')).toBeInTheDocument();
      expect(within(article('Programación')).getByText('Propia del centro')).toBeInTheDocument();
    });

    it('does not show a code for a subject that has none', async () => {
      loaded(programming);
      renderPage();

      await screen.findByRole('article', { name: 'Programación' });

      expect(screen.queryByText(/^Código/u)).not.toBeInTheDocument();
    });

    it('shows the description as plain text when it has one', async () => {
      loaded({ ...programming, description: '<b>Robótica</b> y código' });
      renderPage();

      const card = within(await screen.findByRole('article', { name: 'Programación' }));

      expect(card.getByText('<b>Robótica</b> y código')).toBeInTheDocument();
      expect(card.queryByRole('strong')).not.toBeInTheDocument();
    });

    it('lists the subjects in the order the server sends them', async () => {
      loaded(programming, english, french);
      renderPage();

      await screen.findByRole('article', { name: 'Inglés' });

      expect(
        screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
      ).toEqual(['Programación', 'Inglés', 'Francés']);
    });

    it('summarizes the courses and the weekly sessions, with the plural of each number', async () => {
      loaded(english, programming);
      renderPage();

      await screen.findByRole('article', { name: 'Inglés' });

      expect(
        within(article('Inglés')).getByRole('button', {
          name: '2 cursos · 4 sesiones a la semana',
        }),
      ).toBeInTheDocument();
      expect(
        within(article('Programación')).getByRole('button', {
          name: '1 curso · 2 sesiones a la semana',
        }),
      ).toBeInTheDocument();
    });

    it('uses the singular for one session a week', async () => {
      loaded({ ...programming, courses: [{ id: 'c3', name: '4º Primaria', sessionsPerWeek: 1 }] });
      renderPage();

      expect(
        await screen.findByRole('button', { name: '1 curso · 1 sesión a la semana' }),
      ).toBeInTheDocument();
    });

    it('shows "No courses" with a visible note, and nothing to expand, when it has no courses', async () => {
      loaded(french);
      renderPage();

      const card = within(await screen.findByRole('article', { name: 'Francés' }));

      expect(card.getByText(texts.list.noCourses)).toBeInTheDocument();
      expect(card.getByText(texts.list.noCoursesHint)).toBeInTheDocument();
      expect(card.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('expanding the courses', () => {
    it('shows each course with its sessions when the summary is pressed, and hides them when it is pressed again', async () => {
      const user = userEvent.setup();
      loaded(english);
      renderPage();
      const toggle = await screen.findByRole('button', {
        name: '2 cursos · 4 sesiones a la semana',
      });

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('1º Primaria: 3 sesiones')).not.toBeInTheDocument();

      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const courses = screen.getByRole('list', { name: 'Cursos de Inglés' });
      expect(
        within(courses)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['1º Primaria: 3 sesiones', '2º Primaria: 1 sesión']);
      expect(toggle).toHaveAttribute('aria-controls', courses.id);

      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('list', { name: 'Cursos de Inglés' })).not.toBeInTheDocument();
    });

    it('expands each subject on its own', async () => {
      const user = userEvent.setup();
      loaded(english, programming);
      renderPage();
      await screen.findByRole('article', { name: 'Inglés' });

      await user.click(
        within(article('Programación')).getByRole('button', {
          name: '1 curso · 2 sesiones a la semana',
        }),
      );

      expect(screen.getByRole('list', { name: 'Cursos de Programación' })).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Cursos de Inglés' })).not.toBeInTheDocument();
    });
  });

  describe('filtering and searching', () => {
    const names = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

    async function renderThree() {
      loaded(english, programming, french);
      renderPage();
      await screen.findByRole('article', { name: 'Inglés' });
      return userEvent.setup();
    }

    it('filters by type', async () => {
      const user = await renderThree();

      await user.selectOptions(screen.getByLabelText(texts.filters.type), 'CORE');

      expect(names()).toEqual(['Inglés']);
    });

    it('filters by status', async () => {
      const user = await renderThree();

      await user.selectOptions(screen.getByLabelText(texts.filters.status), 'INACTIVE');

      expect(names()).toEqual(['Francés']);
    });

    it('searches by name, without capitals or accents, and by code', async () => {
      const user = await renderThree();
      const search = screen.getByLabelText(texts.filters.search);

      await user.type(search, 'PROG');
      expect(names()).toEqual(['Programación']);

      await user.clear(search);
      await user.type(search, 'fr-2');
      expect(names()).toEqual(['Francés']);

      await user.clear(search);
      await user.type(search, 'ingles');
      expect(names()).toEqual(['Inglés']);
    });

    it('combines the filters and shows that nothing matches, with the full list back when they are cleared', async () => {
      const user = await renderThree();

      await user.selectOptions(screen.getByLabelText(texts.filters.type), 'CORE');
      await user.selectOptions(screen.getByLabelText(texts.filters.status), 'INACTIVE');

      expect(screen.getByRole('status')).toHaveTextContent(texts.noMatches);
      expect(screen.queryByRole('article')).not.toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText(texts.filters.type), '');
      await user.selectOptions(screen.getByLabelText(texts.filters.status), '');

      expect(names()).toEqual(['Inglés', 'Programación', 'Francés']);
      expect(screen.queryByText(texts.noMatches)).not.toBeInTheDocument();
    });

    it('offers "All" first in each filter', async () => {
      await renderThree();

      for (const label of [texts.filters.type, texts.filters.status]) {
        const first = within(screen.getByLabelText(label)).getAllByRole('option')[0];
        expect(first).toHaveTextContent(texts.filters.all);
        expect(screen.getByLabelText(label)).toHaveValue('');
      }
    });

    it('keeps an expanded subject expanded while it stays in the list', async () => {
      const user = await renderThree();
      await user.click(screen.getByRole('button', { name: '2 cursos · 4 sesiones a la semana' }));

      await user.type(screen.getByLabelText(texts.filters.search), 'ing');

      expect(screen.getByRole('list', { name: 'Cursos de Inglés' })).toBeInTheDocument();
    });

    it('does not show the filters when there are no subjects', async () => {
      loaded();
      renderPage();

      await screen.findByText(texts.empty);

      expect(screen.queryByLabelText(texts.filters.search)).not.toBeInTheDocument();
    });
  });

  describe('by role', () => {
    it('shows an administrator the button to create, even with subjects', async () => {
      signInAs('ADMIN');
      loaded(english);
      renderPage();

      const link = await screen.findByRole('link', { name: texts.create });

      expect(link).toHaveAttribute('href', '/asignaturas/nueva');
      expect(screen.queryByText(texts.readOnly)).not.toBeInTheDocument();
    });

    it('shows a member the subjects, no button to create, and why', async () => {
      loaded(english);
      renderPage();

      await screen.findByRole('article', { name: 'Inglés' });

      expect(screen.queryByRole('link', { name: texts.create })).not.toBeInTheDocument();
      expect(screen.getByText(texts.readOnly)).toBeInTheDocument();
    });

    it('shows an administrator a link to edit each subject, named after it', async () => {
      signInAs('ADMIN');
      loaded(english, programming);
      renderPage();

      const edit = await screen.findByRole('link', { name: 'Editar Inglés' });

      expect(edit).toHaveAttribute('href', '/asignaturas/sub-1/editar');
      expect(edit).toHaveTextContent(texts.edit);
      expect(screen.getByRole('link', { name: 'Editar Programación' })).toHaveAttribute(
        'href',
        '/asignaturas/sub-2/editar',
      );
      expect(within(article('Inglés')).getAllByRole('link')).toHaveLength(1);
    });

    it('offers to edit a subject without courses and an inactive one too', async () => {
      signInAs('ADMIN');
      loaded(french);
      renderPage();

      expect(await screen.findByRole('link', { name: 'Editar Francés' })).toBeInTheDocument();
    });

    it('shows a member no link to edit', async () => {
      loaded(english, programming);
      renderPage();

      await screen.findByRole('article', { name: 'Inglés' });

      expect(screen.queryByRole('link', { name: /^Editar/u })).not.toBeInTheDocument();
    });

    it('shows the empty state with the button to an administrator', async () => {
      signInAs('ADMIN');
      loaded();
      renderPage();

      expect(await screen.findByText(texts.empty)).toBeInTheDocument();
      expect(screen.getByText(texts.emptyHint)).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: texts.create })).toHaveLength(1);
    });

    it('shows the empty state without button to a member', async () => {
      loaded();
      renderPage();

      expect(await screen.findByText(texts.empty)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: texts.create })).not.toBeInTheDocument();
      expect(screen.getByText(texts.readOnly)).toBeInTheDocument();
    });
  });

  describe('the notice of arrival', () => {
    const arriving = (state: unknown) => ({ pathname: '/asignaturas', state });

    it('shows the created subject as plain text in a status, not an alert', async () => {
      loaded(english);
      renderPage(arriving({ subjectCreated: 'Inglés <b>2</b>' }) as InitialEntry);

      const notice = await screen.findByText('Asignatura «Inglés <b>2</b>» creada');

      expect(notice).toHaveAttribute('role', 'status');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the updated subject as plain text in a status, not an alert', async () => {
      loaded(english);
      renderPage(arriving({ subjectUpdated: 'Inglés <b>2</b>' }) as InitialEntry);

      const notice = await screen.findByText('Asignatura «Inglés <b>2</b>» actualizada');

      expect(notice).toHaveAttribute('role', 'status');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each([
      ['an empty text', { subjectCreated: '' }],
      ['a number', { subjectCreated: 5 }],
      ['another property', { courseCreated: 'Inglés' }],
      ['an empty updated text', { subjectUpdated: '' }],
      ['an updated number', { subjectUpdated: 5 }],
      ['another updated property', { courseUpdated: 'Inglés' }],
      ['no object', 'Inglés'],
    ])('ignores %s', async (_name, state) => {
      loaded(english);
      renderPage(arriving(state) as InitialEntry);

      await screen.findByRole('article', { name: 'Inglés' });

      expect(screen.queryByText(/(creada|actualizada)$/u)).not.toBeInTheDocument();
    });
  });

  describe('accessibility and language', () => {
    it('has no WCAG 2.1 AA violations with subjects, one of them expanded', async () => {
      const user = userEvent.setup();
      signInAs('ADMIN');
      loaded(english, programming, french);
      const { container } = renderPage();
      await user.click(
        await screen.findByRole('button', { name: '2 cursos · 4 sesiones a la semana' }),
      );

      await expect(wcagViolations(container)).resolves.toEqual([]);
    });

    it('has no violations empty, while loading or with an error', async () => {
      loaded();
      const empty = renderPage();
      await screen.findByText(texts.empty);
      await expect(wcagViolations(empty.container)).resolves.toEqual([]);
      empty.unmount();

      resolvedList({ status: 'unavailable' });
      const failed = renderPage();
      await screen.findByRole('alert');
      await expect(wcagViolations(failed.container)).resolves.toEqual([]);
    });

    it('speaks English when the language changes', async () => {
      await i18n.changeLanguage('en');
      loaded(english);
      renderPage();

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Subjects' }),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('article', { name: 'Inglés' })).getByText('Core'),
      ).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Color: Blue' })).toBeInTheDocument();
    });
  });
});
