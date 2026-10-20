import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import {
  professorsService,
  type Professor,
  type ProfessorsOutcome,
} from '../services/professorsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { ProfessorsPage } from './ProfessorsPage';

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

function professor(
  id: string,
  firstName: string,
  lastName: string,
  position: Professor['position'] = null,
  tutoredClass: Professor['tutoredClass'] = null,
): Professor {
  return { id, firstName, lastName, position, subjects: [], tutoredClass };
}

/** Ya en el orden en que lo devuelve el servicio: la página no lo reordena. */
const professors: Professor[] = [
  professor('p1', 'Ana', 'García', 'DIRECTOR', {
    id: 'c1-A',
    name: 'A',
    courseId: 'c1',
    courseName: '1º Primaria',
  }),
  professor('p2', 'Luis', 'Pérez', 'JEFE_ESTUDIOS'),
  professor('p3', 'Eva', 'Ruiz'),
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

describe('ProfessorsPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let list: MockInstance<typeof professorsService.list>;
  let media: MatchMediaControl;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    list = vi.spyOn(professorsService, 'list');
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    list.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderPage(entry: InitialEntry = '/profesores', width = DESKTOP, strict = false) {
    media.setWidth(width);
    const tree = (
      <MemoryRouter initialEntries={[entry]}>
        <SessionProvider>
          <Routes>
            <Route path="/profesores" element={<ProfessorsPage />} />
            <Route path="/profesores/nuevo" element={<div data-testid="create-professor-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  describe('table on a wide screen', () => {
    it('shows a table named by the title with Name, Position and Class, and a row header per professor', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage();

      const table = await screen.findByRole('table', { name: es.professors.title });
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((header) => header.textContent),
      ).toEqual([
        es.professors.fields.name,
        es.professors.fields.position,
        es.professors.fields.class,
      ]);
      expect(
        within(table)
          .getAllByRole('rowheader')
          .map((header) => header.textContent),
      ).toEqual(['García, Ana', 'Pérez, Luis', 'Ruiz, Eva']);
    });

    it('shows the position and the class of each professor, "no position" and "no class" when missing', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage();

      const rowOf = async (name: string) =>
        within(
          (await screen.findByRole('rowheader', { name })).closest('tr') as HTMLElement,
        ).getAllByRole('cell');
      const [director, headOfStudies, none] = await Promise.all([
        rowOf('García, Ana'),
        rowOf('Pérez, Luis'),
        rowOf('Ruiz, Eva'),
      ]);
      expect(director?.map((cell) => cell.textContent)).toEqual([
        es.professors.positions.DIRECTOR,
        '1º Primaria · A',
      ]);
      expect(headOfStudies?.map((cell) => cell.textContent)).toEqual([
        es.professors.positions.JEFE_ESTUDIOS,
        es.professors.noClass,
      ]);
      expect(none?.map((cell) => cell.textContent)).toEqual([
        es.professors.positions.none,
        es.professors.noClass,
      ]);
    });

    it('keeps the order of the service', async () => {
      list.mockResolvedValue({
        status: 'loaded',
        professors: [professors[2] as Professor, professors[0] as Professor],
      });

      renderPage();

      const table = await screen.findByRole('table', { name: es.professors.title });
      expect(
        within(table)
          .getAllByRole('rowheader')
          .map((header) => header.textContent),
      ).toEqual(['Ruiz, Eva', 'García, Ana']);
    });

    it('does not offer actions of future stories', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage();

      await screen.findByRole('table', { name: es.professors.title });
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
        es.professors.create,
      ]);
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });
  });

  describe('cards on a narrow screen', () => {
    it('shows a card per professor with an h2, and no table', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage('/profesores', MOBILE);

      await screen.findByRole('heading', { level: 2, name: 'García, Ana' });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
      ).toEqual(['García, Ana', 'Pérez, Luis', 'Ruiz, Eva']);
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('shows the position and the class in each card', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage('/profesores', MOBILE);

      const card = (await screen.findByRole('heading', { name: 'García, Ana' })).closest(
        'li',
      ) as HTMLElement;
      expect(within(card).getByText(es.professors.positions.DIRECTOR)).toBeInTheDocument();
      expect(within(card).getByText('1º Primaria · A')).toBeInTheDocument();
      const other = (await screen.findByRole('heading', { name: 'Ruiz, Eva' })).closest(
        'li',
      ) as HTMLElement;
      expect(within(other).getByText(es.professors.positions.none)).toBeInTheDocument();
      expect(within(other).getByText(es.professors.noClass)).toBeInTheDocument();
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('on %s', (_name, width) => {
    it('asks for the list once, even in strict mode', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage('/profesores', width, true);

      await screen.findByText('García, Ana');
      expect(list).toHaveBeenCalledTimes(1);
    });

    it('shows a loading status while the list is pending', async () => {
      list.mockReturnValue(new Promise<ProfessorsOutcome>(() => undefined));

      renderPage('/profesores', width);

      expect(await screen.findByText(es.professors.loading)).toBeInTheDocument();
    });

    it('shows an error with Retry and asks again when it is pressed', async () => {
      list.mockResolvedValueOnce({ status: 'unavailable' });
      list.mockResolvedValueOnce({ status: 'loaded', professors });
      renderPage('/profesores', width);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(es.professors.loadError);
      await userEvent.click(within(alert).getByRole('button', { name: es.professors.retry }));

      expect(await screen.findByText('García, Ana')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('shows the empty state with a Create professor link', async () => {
      list.mockResolvedValue({ status: 'loaded', professors: [] });

      renderPage('/profesores', width);

      expect(await screen.findByText(es.professors.empty)).toBeInTheDocument();
      expect(screen.getByText(es.professors.emptyHint)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: es.professors.create })).toHaveAttribute(
        'href',
        '/profesores/nuevo',
      );
    });

    it('always offers Create professor, also with professors', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage('/profesores', width);

      await userEvent.click(await screen.findByRole('link', { name: es.professors.create }));
      expect(await screen.findByTestId('create-professor-page')).toBeInTheDocument();
    });

    it('shows the notice of a created professor as plain text, not as markup', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage(
        { pathname: '/profesores', state: { professorCreated: '<b>Ana</b> García' } },
        width,
      );

      const notice = await screen.findByText(
        es.professors.created.replace('{{name}}', '<b>Ana</b> García'),
      );
      expect(notice).toHaveAttribute('role', 'status');
      expect(notice.querySelector('b')).toBeNull();
    });

    it.each([
      ['a text that is not a name', { professorCreated: '' }],
      ['another shape', { professorCreated: 5 }],
      ['no state', undefined],
    ])('shows no notice with %s', async (_label, state) => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage({ pathname: '/profesores', state }, width);

      await screen.findByText('García, Ana');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('does not pass axe in any state', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      const loaded = renderPage('/profesores', width);
      await screen.findByText('García, Ana');
      expect(await wcagViolations(loaded.container)).toEqual([]);
      loaded.unmount();

      list.mockResolvedValue({ status: 'loaded', professors: [] });
      const empty = renderPage('/profesores', width);
      await screen.findByText(es.professors.empty);
      expect(await wcagViolations(empty.container)).toEqual([]);
      empty.unmount();

      list.mockResolvedValue({ status: 'unavailable' });
      const failed = renderPage('/profesores', width);
      await screen.findByRole('alert');
      expect(await wcagViolations(failed.container)).toEqual([]);
      failed.unmount();

      list.mockReturnValue(new Promise<ProfessorsOutcome>(() => undefined));
      const loading = renderPage('/profesores', width);
      await waitFor(() => {
        expect(screen.getByText(es.professors.loading)).toBeInTheDocument();
      });
      expect(await wcagViolations(loading.container)).toEqual([]);
    });
  });
});
