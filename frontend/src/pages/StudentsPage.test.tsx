import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import {
  studentsService,
  type StudentsOutcome,
  type StudentSummary,
} from '../services/studentsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { StudentsPage } from './StudentsPage';

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

function student(
  id: string,
  firstName: string,
  lastName: string,
  overrides: Partial<StudentSummary> = {},
): StudentSummary {
  return {
    id,
    firstName,
    lastName,
    course: null,
    class: null,
    cafeteria: false,
    scholarship: null,
    ...overrides,
  };
}

/** Ya en el orden en que lo devuelve el servicio: la página no lo reordena. */
const students: StudentSummary[] = [
  student('s1', 'Ana', 'Álvarez'),
  student('s2', 'Juan', 'García', {
    course: { id: 'c1', name: '1º Primaria' },
    class: { id: 'c1-A', name: 'A' },
    cafeteria: true,
    scholarship: true,
  }),
  student('s3', 'Eva', 'Gil', {
    course: { id: 'c1', name: '1º Primaria' },
    cafeteria: true,
    scholarship: false,
  }),
  student('s4', 'Luis', 'Pérez', {
    course: { id: 'c2', name: '2º Primaria' },
    class: { id: 'c2-B', name: 'B' },
  }),
];

const DESKTOP = 1280;
const MOBILE = 360;

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('StudentsPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let list: MockInstance<typeof studentsService.list>;
  let media: MatchMediaControl;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    list = vi.spyOn(studentsService, 'list');
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    list.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderPage(entry: InitialEntry = '/alumnos', width = DESKTOP, strict = false) {
    media.setWidth(width);
    const tree = (
      <MemoryRouter initialEntries={[entry]}>
        <SessionProvider>
          <Routes>
            <Route path="/alumnos" element={<StudentsPage />} />
            <Route path="/alumnos/nuevo" element={<div data-testid="create-student-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  function resolvedList(outcome: StudentsOutcome) {
    list.mockResolvedValue(outcome);
  }

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('on %s', (_name, width) => {
    it('shows the students in the order of the service, with course and class, and cafeteria', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage('/alumnos', width);

      const names = await screen.findAllByText(/^(Álvarez|García|Gil|Pérez), /);

      expect(names.map((node) => node.textContent)).toEqual([
        'Álvarez, Ana',
        'García, Juan',
        'Gil, Eva',
        'Pérez, Luis',
      ]);
      expect(screen.getByText('1º Primaria A')).toBeVisible();
      expect(screen.getByText('1º Primaria · Sin clase')).toBeVisible();
      expect(screen.getByText('2º Primaria B')).toBeVisible();
      expect(screen.getByText('Sin curso')).toBeVisible();
      expect(screen.getByText('Sí · Con beca')).toBeVisible();
      expect(screen.getByText('Sí')).toBeVisible();
      expect(screen.getAllByText('No')).toHaveLength(2);
    });

    it('never shows the food type, the observations or the school', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage('/alumnos', width);

      await screen.findByText('Álvarez, Ana');

      expect(document.body).not.toHaveTextContent(/Vegetariana|Observaciones/);
    });

    it('shows the empty state with "Create student" when there are no students', async () => {
      resolvedList({ status: 'loaded', students: [] });
      renderPage('/alumnos', width);

      expect(await screen.findByText(es.students.empty)).toBeVisible();
      expect(screen.getByText(es.students.emptyHint)).toBeVisible();
      expect(screen.getAllByRole('link', { name: es.students.create })).not.toHaveLength(0);
    });

    it('always offers "Create student", which goes to the form', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage('/alumnos', width);

      await userEvent.click(await screen.findByRole('link', { name: es.students.create }));

      expect(await screen.findByTestId('create-student-page')).toBeInTheDocument();
    });

    it('shows a status while loading', async () => {
      list.mockReturnValue(new Promise(() => undefined));
      renderPage('/alumnos', width);

      expect(await screen.findByRole('status')).toHaveTextContent(es.students.loading);
    });

    it('shows an error with "Retry" when the list cannot be loaded, and asks again', async () => {
      list.mockResolvedValueOnce({ status: 'unavailable' });
      list.mockResolvedValueOnce({ status: 'loaded', students });
      renderPage('/alumnos', width);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(es.students.loadError);
      await userEvent.click(within(alert).getByRole('button', { name: es.students.retry }));

      expect(await screen.findByText('Álvarez, Ana')).toBeVisible();
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('shows the notice that comes with the navigation, as plain text', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage({ pathname: '/alumnos', state: { studentCreated: '<b>Juan</b> García' } }, width);

      const notice = await screen.findByText('Alumno «<b>Juan</b> García» creado');

      expect(notice).toHaveAttribute('role', 'status');
      expect(notice.querySelector('b')).toBeNull();
    });

    it.each([
      ['a name that is not text', { studentCreated: 5 }],
      ['an empty name', { studentCreated: '' }],
      ['an unrelated state', { other: 'x' }],
    ])('ignores %s in the state of the navigation', async (_label, state) => {
      resolvedList({ status: 'loaded', students });
      renderPage({ pathname: '/alumnos', state }, width);

      await screen.findByText('Álvarez, Ana');

      expect(screen.queryByText(/creado/)).not.toBeInTheDocument();
    });

    it('does nothing more when the session is lost: the layout redirects', async () => {
      resolvedList({ status: 'unauthenticated' });
      renderPage('/alumnos', width);

      await waitFor(() => {
        expect(list).toHaveBeenCalledOnce();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('has no accessibility violations empty, loaded and with an error', async () => {
      resolvedList({ status: 'loaded', students });
      const loaded = renderPage('/alumnos', width);
      await screen.findByText('Álvarez, Ana');
      expect(await wcagViolations(loaded.container)).toEqual([]);
      loaded.unmount();

      resolvedList({ status: 'loaded', students: [] });
      const empty = renderPage('/alumnos', width);
      await screen.findByText(es.students.empty);
      expect(await wcagViolations(empty.container)).toEqual([]);
      empty.unmount();

      resolvedList({ status: 'unavailable' });
      const failed = renderPage('/alumnos', width);
      await screen.findByRole('alert');
      expect(await wcagViolations(failed.container)).toEqual([]);
    });
  });

  it('shows a table with the columns and the name as a row header on a wide screen', async () => {
    resolvedList({ status: 'loaded', students });
    renderPage('/alumnos', DESKTOP);

    const table = await screen.findByRole('table', { name: es.students.title });

    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      es.students.fields.name,
      es.students.fields.courseClass,
      es.students.fields.cafeteria,
    ]);
    expect(within(table).getByRole('rowheader', { name: 'García, Juan' })).toBeVisible();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows one card per student, with the name as a heading, on a narrow screen', async () => {
    resolvedList({ status: 'loaded', students });
    renderPage('/alumnos', MOBILE);

    expect(await screen.findByRole('heading', { level: 2, name: 'García, Juan' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('asks for the list once, also in strict mode', async () => {
    resolvedList({ status: 'loaded', students });
    renderPage('/alumnos', DESKTOP, true);

    await screen.findByText('Álvarez, Ana');

    expect(list).toHaveBeenCalledOnce();
  });

  it('switches between the table and the cards when the window changes', async () => {
    resolvedList({ status: 'loaded', students });
    renderPage('/alumnos', DESKTOP);
    await screen.findByRole('table');

    media.setWidth(MOBILE);

    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('shows the page in English', async () => {
    await i18n.changeLanguage('en');
    resolvedList({ status: 'loaded', students: [] });
    renderPage('/alumnos', DESKTOP);

    expect(await screen.findByText('There are no students yet')).toBeVisible();
  });
});
