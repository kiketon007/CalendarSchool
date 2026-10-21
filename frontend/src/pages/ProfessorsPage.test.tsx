import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
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
            <Route
              path="/profesores/:id/editar"
              element={<div data-testid="edit-professor-page" />}
            />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  describe('table on a wide screen', () => {
    it('shows a table named by the title with Name, Position, Tutorship and Actions, and a row header per professor', async () => {
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
        es.professors.fields.tutorship,
        es.professors.actions,
      ]);
      expect(
        within(table)
          .getAllByRole('rowheader')
          .map((header) => header.textContent),
      ).toEqual(['García, Ana', 'Pérez, Luis', 'Ruiz, Eva']);
    });

    it('shows the position and the tutorship of each professor, "no position" and "no tutorship" when missing', async () => {
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
        'Tutor de 1º Primaria A',
        `${es.professors.editLink}${es.professors.deleteButton}`,
      ]);
      expect(headOfStudies?.map((cell) => cell.textContent)).toEqual([
        es.professors.positions.JEFE_ESTUDIOS,
        es.professors.noTutorship,
        `${es.professors.editLink}${es.professors.deleteButton}`,
      ]);
      expect(none?.map((cell) => cell.textContent)).toEqual([
        es.professors.positions.none,
        es.professors.noTutorship,
        `${es.professors.editLink}${es.professors.deleteButton}`,
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

    it('does not offer actions of later stories, only Edit and Delete', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage();

      await screen.findByRole('table', { name: es.professors.title });
      expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(
        Array<string>(3).fill(es.professors.deleteButton),
      );
      expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
        es.professors.create,
        ...Array<string>(3).fill(es.professors.editLink),
      ]);
      // La búsqueda ya existe (US11): sigue sin haber botones ni enlaces de historias futuras.
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
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

    it('shows the position and the tutorship in each card', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage('/profesores', MOBILE);

      const card = (await screen.findByRole('heading', { name: 'García, Ana' })).closest(
        'li',
      ) as HTMLElement;
      expect(within(card).getByText(es.professors.positions.DIRECTOR)).toBeInTheDocument();
      expect(within(card).getByText('Tutor de 1º Primaria A')).toBeInTheDocument();
      const other = (await screen.findByRole('heading', { name: 'Ruiz, Eva' })).closest(
        'li',
      ) as HTMLElement;
      expect(within(other).getByText(es.professors.positions.none)).toBeInTheDocument();
      expect(within(other).getByText(es.professors.noTutorship)).toBeInTheDocument();
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('total, tutorship and pagination on %s', (_name, width) => {
    const PAGE_SIZE = 20;
    const many = (count: number): Professor[] =>
      Array.from({ length: count }, (_, index) => {
        const label = String(index + 1).padStart(2, '0');
        return professor(`m${label}`, `Nombre${label}`, `Apellido${label}`);
      });
    const nameOf = (index: number) =>
      `Apellido${String(index).padStart(2, '0')}, Nombre${String(index).padStart(2, '0')}`;
    const shownNames = () =>
      (width === DESKTOP
        ? screen.queryAllByRole('rowheader')
        : screen.queryAllByRole('heading', { level: 2 })
      ).map((element) => element.textContent);
    const range = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, index) => nameOf(from + index));
    const navigation = () => screen.queryByRole('navigation', { name: es.professors.pagination });
    let scrollIntoView: Mock<(arg?: boolean | ScrollIntoViewOptions) => void>;

    beforeEach(() => {
      scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
      Element.prototype.scrollIntoView = scrollIntoView;
    });

    afterEach(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    });

    it('shows the total with its plural', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      const three = renderPage('/profesores', width);
      expect(await screen.findByTestId('professors-count')).toHaveTextContent('3 profesores');
      three.unmount();

      list.mockResolvedValue({ status: 'loaded', professors: [professors[0] as Professor] });
      renderPage('/profesores', width);
      expect(await screen.findByTestId('professors-count')).toHaveTextContent(/^1 profesor$/);
    });

    it('shows the tutorship in grey when there is none', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage('/profesores', width);

      expect(await screen.findAllByText(es.professors.noTutorship)).not.toHaveLength(0);
      for (const element of screen.getAllByText(es.professors.noTutorship)) {
        expect(element).toHaveClass('text-body-secondary');
      }
      expect(screen.getByText('Tutor de 1º Primaria A')).not.toHaveClass('text-body-secondary');
    });

    it('breaks the names that are long instead of overflowing', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage('/profesores', width);

      const name = await screen.findByText('García, Ana');
      expect(name).toHaveClass('text-break');
    });

    it('shows neither the total nor the pagination without professors', async () => {
      list.mockResolvedValue({ status: 'loaded', professors: [] });

      renderPage('/profesores', width);

      await screen.findByText(es.professors.empty);
      expect(screen.queryByTestId('professors-count')).not.toBeInTheDocument();
      expect(navigation()).not.toBeInTheDocument();
    });

    it('shows everything and no pagination with exactly 20 professors', async () => {
      list.mockResolvedValue({ status: 'loaded', professors: many(PAGE_SIZE) });

      renderPage('/profesores', width);

      await screen.findByTestId('professors-count');
      expect(shownNames()).toEqual(range(1, 20));
      expect(navigation()).not.toBeInTheDocument();
    });

    it('shows the first 20 of 45 in the order of the service, with the total and the page indicator', async () => {
      list.mockResolvedValue({ status: 'loaded', professors: many(45) });

      renderPage('/profesores', width);

      expect(await screen.findByTestId('professors-count')).toHaveTextContent('45 profesores');
      expect(shownNames()).toEqual(range(1, 20));
      expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: es.pagination.previous })).toBeDisabled();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('goes forward and back through the pages, the same list in the table and in the cards', async () => {
      list.mockResolvedValue({ status: 'loaded', professors: many(45) });
      renderPage('/profesores', width);
      await screen.findByTestId('professors-count');

      await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
      expect(shownNames()).toEqual(range(21, 40));
      expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
      expect(shownNames()).toEqual(range(41, 45));
      expect(screen.getByRole('button', { name: es.pagination.next })).toBeDisabled();
      expect(screen.getByRole('button', { name: es.pagination.previous })).toHaveFocus();

      await userEvent.click(screen.getByRole('button', { name: es.pagination.previous }));
      expect(shownNames()).toEqual(range(21, 40));
      expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
      expect(screen.getByTestId('professors-count')).toHaveTextContent('45 profesores');
    });

    it('has no accessibility violations with the pagination', async () => {
      list.mockResolvedValue({ status: 'loaded', professors: many(45) });
      const { container } = renderPage('/profesores', width);
      await screen.findByTestId('professors-count');

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('search on %s', (_name, width) => {
    const search = es.professors.search;
    const searchField = () => screen.getByRole('searchbox', { name: search.label });
    const shownNames = () =>
      (width === DESKTOP
        ? screen.queryAllByRole('rowheader')
        : screen.queryAllByRole('heading', { level: 2 })
      ).map((element) => element.textContent);
    const juanes: Professor[] = [
      professor('j1', 'Ana', 'García'),
      professor('j2', 'Juana', 'López'),
      professor('j3', 'Juan', 'Pérez'),
    ];

    async function renderLoaded(loaded: Professor[]) {
      list.mockResolvedValue({ status: 'loaded', professors: loaded });
      const view = renderPage('/profesores', width);
      await screen.findByTestId('professors-count');
      return view;
    }

    it('offers a search field with a visible label and at most 100 characters', async () => {
      await renderLoaded(juanes);

      expect(searchField()).toHaveAttribute('maxLength', '100');
      expect(screen.getByText(search.label)).toBeVisible();
    });

    it('offers no search field without professors', async () => {
      list.mockResolvedValue({ status: 'loaded', professors: [] });
      renderPage('/profesores', width);

      await screen.findByText(es.professors.empty);
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });

    it('filters while typing, in the order of the service, and announces the result', async () => {
      await renderLoaded(juanes);

      await userEvent.type(searchField(), 'juan');

      expect(shownNames()).toEqual(['López, Juana', 'Pérez, Juan']);
      const count = screen.getByTestId('professors-count');
      expect(count).toHaveAttribute('role', 'status');
      expect(count).toHaveTextContent('Mostrando 2 de 3 profesores');
    });

    it('shows everything and the plain total with an empty or blank query', async () => {
      await renderLoaded(juanes);

      await userEvent.type(searchField(), '   ');

      expect(shownNames()).toHaveLength(3);
      const count = screen.getByTestId('professors-count');
      expect(count).not.toHaveAttribute('role');
      expect(count).toHaveTextContent('3 profesores');
    });

    it('finds with several words in any order', async () => {
      await renderLoaded([
        professor('a1', 'Ana', 'García'),
        professor('a2', 'Luis', 'García'),
        professor('a3', 'Ana', 'Pérez'),
      ]);

      await userEvent.type(searchField(), 'garcia ana');

      expect(shownNames()).toEqual(['García, Ana']);
    });

    it('says that nothing matches, as plain text, and clears the search giving the focus back', async () => {
      await renderLoaded(juanes);

      await userEvent.type(searchField(), '<b>x</b>');

      const count = screen.getByTestId('professors-count');
      expect(count).toHaveAttribute('role', 'status');
      expect(count).toHaveTextContent(search.noResults.replace('{{query}}', '<b>x</b>'));
      expect(count.querySelector('b')).toBeNull();
      expect(shownNames()).toEqual([]);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: search.clear }));

      expect(searchField()).toHaveValue('');
      expect(searchField()).toHaveFocus();
      expect(shownNames()).toHaveLength(3);
      expect(screen.queryByRole('button', { name: search.clear })).not.toBeInTheDocument();
    });

    it('paginates the result and goes back to the first page when the query changes', async () => {
      const martins = Array.from({ length: 25 }, (_, index) => {
        const label = String(index + 1).padStart(2, '0');
        return professor(`mt${label}`, `Nombre${label}`, 'Martín');
      });
      const others = Array.from({ length: 20 }, (_, index) => {
        const label = String(index + 1).padStart(2, '0');
        return professor(`rz${label}`, `Otro${label}`, 'Ruiz');
      });
      Element.prototype.scrollIntoView = vi.fn();
      try {
        await renderLoaded([...martins, ...others]);
        await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
        expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();

        await userEvent.type(searchField(), 'martin');

        expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
        expect(shownNames()).toHaveLength(20);
        expect(shownNames()[0]).toBe('Martín, Nombre01');
        expect(screen.getByTestId('professors-count')).toHaveTextContent(
          'Mostrando 25 de 45 profesores',
        );
      } finally {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      }
    });

    it('has no accessibility violations with a search and without results', async () => {
      const { container } = await renderLoaded(juanes);

      await userEvent.type(searchField(), 'juan');
      expect(await wcagViolations(container)).toEqual([]);

      await userEvent.type(searchField(), 'zzz');
      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('editing on %s', (_name, width) => {
    it('offers an Edit link per professor, named after the professor and pointing at their edition', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage('/profesores', width);

      const link = await screen.findByRole('link', { name: 'Editar García, Ana' });
      expect(link).toHaveAttribute('href', '/profesores/p1/editar');
      expect(link).toHaveTextContent(es.professors.editLink);
      expect(screen.getAllByRole('link', { name: /^Editar / })).toHaveLength(3);
    });

    it('goes to the edition when the link is pressed', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      renderPage('/profesores', width);

      await userEvent.click(await screen.findByRole('link', { name: 'Editar Pérez, Luis' }));

      expect(await screen.findByTestId('edit-professor-page')).toBeInTheDocument();
    });

    it('shows the notice of an updated professor as plain text', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage(
        { pathname: '/profesores', state: { professorUpdated: '<b>Ana</b> García' } },
        width,
      );

      const notice = await screen.findByText(
        es.professors.updated.replace('{{name}}', '<b>Ana</b> García'),
      );
      expect(notice).toHaveAttribute('role', 'status');
      expect(notice.querySelector('b')).toBeNull();
    });

    it('says who is left without tutorship when the edition took a class from another professor', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage(
        {
          pathname: '/profesores',
          state: { professorUpdated: 'Ana García', replacedTutor: 'Luis Pérez' },
        },
        width,
      );

      expect(
        await screen.findByText(
          es.professors.updatedReplacing
            .replace('{{name}}', 'Ana García')
            .replace('{{tutor}}', 'Luis Pérez'),
        ),
      ).toHaveAttribute('role', 'status');
    });

    it.each([
      ['an empty name', { professorUpdated: '' }],
      ['another shape', { professorUpdated: 5 }],
      ['a replaced tutor without a professor', { replacedTutor: 'Luis Pérez' }],
    ])('shows no notice with %s', async (_label, state) => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage({ pathname: '/profesores', state }, width);

      await screen.findByText('García, Ana');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('has no accessibility violations with the actions', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      const { container } = renderPage('/profesores', width);
      await screen.findByText('García, Ana');

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('deleting on %s', (_name, width) => {
    const texts = es.professors.delete;
    const deleteButton = (name: string) => screen.findByRole('button', { name: `Borrar ${name}` });
    const confirm = () => screen.findByRole('button', { name: texts.confirm });
    let get: MockInstance<typeof professorsService.get>;
    let remove: MockInstance<typeof professorsService.delete>;

    beforeEach(() => {
      get = vi.spyOn(professorsService, 'get').mockImplementation((_client, id) =>
        Promise.resolve({
          status: 'loaded',
          professor: professors.find((professor) => professor.id === id) as Professor,
        }),
      );
      remove = vi
        .spyOn(professorsService, 'delete')
        .mockResolvedValue({ status: 'deleted', freedClass: null });
    });

    afterEach(() => {
      get.mockRestore();
      remove.mockRestore();
    });

    it('offers a Delete button per professor, named after the professor', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });

      renderPage('/profesores', width);

      expect(await deleteButton('García, Ana')).toHaveTextContent(es.professors.deleteButton);
      expect(screen.getAllByRole('button', { name: /^Borrar / })).toHaveLength(3);
    });

    it('opens the dialog of the professor, asks for them once and does not delete on cancel', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      renderPage('/profesores', width);

      const button = await deleteButton('García, Ana');
      await userEvent.click(button);

      expect(
        await screen.findByRole('dialog', { name: '¿Borrar a Ana García?' }),
      ).toBeInTheDocument();
      expect(
        await screen.findByText('Tutoriza 1º Primaria A: la clase quedará sin tutor.'),
      ).toBeVisible();
      expect(get).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole('button', { name: texts.cancel }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(remove).not.toHaveBeenCalled();
      expect(screen.getByText('García, Ana')).toBeInTheDocument();
      expect(button).toHaveFocus();
    });

    it('removes the professor without asking for the list again, says it, and moves the focus to the title', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      renderPage('/profesores', width);
      await userEvent.click(await deleteButton('Pérez, Luis'));

      await userEvent.click(await confirm());

      expect(await screen.findByText(/Profesor «Luis Pérez» eliminado/)).toHaveAttribute(
        'role',
        'status',
      );
      expect(screen.queryByText('Pérez, Luis')).not.toBeInTheDocument();
      expect(screen.getByTestId('professors-count')).toHaveTextContent('2 profesores');
      expect(list).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
      });
    });

    it('says which class was left without tutor', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      remove.mockResolvedValue({
        status: 'deleted',
        freedClass: { id: 'c1-A', name: 'A', courseName: '1º Primaria' },
      });
      renderPage('/profesores', width);
      await userEvent.click(await deleteButton('García, Ana'));

      await userEvent.click(await confirm());

      expect(
        await screen.findByText(
          'Profesor «Ana García» eliminado. La clase 1º Primaria A queda sin tutor.',
        ),
      ).toBeVisible();
    });

    it('shows the empty state when the last professor is deleted', async () => {
      list.mockResolvedValue({ status: 'loaded', professors: [professors[2] as Professor] });
      renderPage('/profesores', width);
      await userEvent.click(await deleteButton('Ruiz, Eva'));

      await userEvent.click(await confirm());

      expect(await screen.findByText(es.professors.empty)).toBeVisible();
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
      expect(screen.queryByTestId('professors-count')).not.toBeInTheDocument();
    });

    it('keeps the search and recalculates the result, and says nothing matches when its only result goes', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      renderPage('/profesores', width);
      await userEvent.type(await screen.findByRole('searchbox'), 'luis');
      expect(screen.getByTestId('professors-count')).toHaveTextContent(
        'Mostrando 1 de 3 profesores',
      );
      await userEvent.click(await deleteButton('Pérez, Luis'));

      await userEvent.click(await confirm());

      expect(await screen.findByText(/Profesor «Luis Pérez» eliminado/)).toBeVisible();
      expect(screen.getByTestId('professors-count')).toHaveTextContent(
        es.professors.search.noResults.replace('{{query}}', 'luis'),
      );
      expect(screen.getByRole('searchbox')).toHaveValue('luis');
    });

    it('goes back to the previous page when the only professor of the last page is deleted', async () => {
      const many = Array.from({ length: 21 }, (_, index) => {
        const label = String(index + 1).padStart(2, '0');
        return professor(`m${label}`, `Nombre${label}`, `Apellido${label}`);
      });
      list.mockResolvedValue({ status: 'loaded', professors: many });
      get.mockImplementation((_client, id) =>
        Promise.resolve({
          status: 'loaded',
          professor: many.find((item) => item.id === id) as Professor,
        }),
      );
      Element.prototype.scrollIntoView = vi.fn();
      try {
        renderPage('/profesores', width);
        await userEvent.click(await screen.findByRole('button', { name: es.pagination.next }));
        expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
        await userEvent.click(await deleteButton('Apellido21, Nombre21'));

        await userEvent.click(await confirm());

        expect(await screen.findByText(/eliminado/)).toBeVisible();
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
        expect(screen.getByTestId('professors-count')).toHaveTextContent('20 profesores');
      } finally {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      }
    });

    it('says the professor no longer exists and asks for the list again when someone else deleted them', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      remove.mockResolvedValue({ status: 'notFound' });
      renderPage('/profesores', width);
      await userEvent.click(await deleteButton('Pérez, Luis'));

      await userEvent.click(await confirm());

      expect(await screen.findByText(texts.gone)).toHaveAttribute('role', 'status');
      await waitFor(() => {
        expect(list).toHaveBeenCalledTimes(2);
      });
    });

    it('keeps the dialog open with the error and the professor in the list when deleting fails', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      remove.mockResolvedValue({ status: 'unavailable' });
      renderPage('/profesores', width);
      await userEvent.click(await deleteButton('Pérez, Luis'));

      await userEvent.click(await confirm());

      expect(await screen.findByText(texts.error)).toBeVisible();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Pérez, Luis')).toBeInTheDocument();
    });

    it('has no accessibility violations with the dialog open', async () => {
      list.mockResolvedValue({ status: 'loaded', professors });
      renderPage('/profesores', width);
      await userEvent.click(await deleteButton('García, Ana'));
      await screen.findByText('Tutoriza 1º Primaria A: la clase quedará sin tutor.');

      expect(await wcagViolations(document.body)).toEqual([]);
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
