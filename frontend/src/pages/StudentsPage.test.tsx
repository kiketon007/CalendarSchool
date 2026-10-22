import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
  type InitialEntry,
} from 'react-router';
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

/** Muestra la dirección y cómo se llegó a ella (`REPLACE` si no se añadió una entrada al historial). */
function LocationProbe() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <>
      <span data-testid="location">{`${location.pathname}${location.search}`}</span>
      <span data-testid="navigation-type">{type}</span>
    </>
  );
}

/** Destino de «Editar»: muestra la ruta y el estado de la navegación con que se llegó. */
function EditProbe() {
  const location = useLocation();
  return (
    <span data-testid="edit-destination">
      {`${location.pathname} ${JSON.stringify(location.state as unknown)}`}
    </span>
  );
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
    // jsdom no implementa `scrollIntoView`, que la página llama al cambiar de página; los tests de la
    // paginación lo sustituyen por un espía para comprobarlo.
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(async () => {
    refresh.mockRestore();
    list.mockRestore();
    media.restore();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
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
            <Route path="/alumnos/:id/editar" element={<EditProbe />} />
          </Routes>
          <LocationProbe />
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
      // El texto de la opción «Sin curso» del filtro es otro elemento: se mira solo la celda o la tarjeta.
      expect(screen.getByText('Sin curso', { selector: 'td, dd' })).toBeVisible();
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
      es.students.actions,
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

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('total and pagination (US15) on %s', (_name, width) => {
    const PAGE_SIZE = 20;
    /** `count` alumnos con apellidos ordenados: «Apellido01, Nombre01»… */
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => {
        const label = String(index + 1).padStart(2, '0');
        return student(`m${label}`, `Nombre${label}`, `Apellido${label}`);
      });
    const nameOf = (index: number) =>
      `Apellido${String(index).padStart(2, '0')}, Nombre${String(index).padStart(2, '0')}`;
    const range = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, index) => nameOf(from + index));
    const shownNames = () =>
      (width === DESKTOP
        ? screen.queryAllByRole('rowheader')
        : screen.queryAllByRole('heading', { level: 2 })
      ).map((element) => element.textContent);
    const navigation = () => screen.queryByRole('navigation', { name: es.students.pagination });
    let scrollIntoView: Mock<(arg?: boolean | ScrollIntoViewOptions) => void>;

    beforeEach(() => {
      scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
      Element.prototype.scrollIntoView = scrollIntoView;
    });

    afterEach(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    });

    it('shows the total with its plural', async () => {
      resolvedList({ status: 'loaded', students });
      const four = renderPage('/alumnos', width);
      expect(await screen.findByTestId('students-count')).toHaveTextContent('4 alumnos');
      four.unmount();

      resolvedList({ status: 'loaded', students: [students[0] as StudentSummary] });
      renderPage('/alumnos', width);
      expect(await screen.findByTestId('students-count')).toHaveTextContent(/^1 alumno$/);
    });

    it('shows neither the total nor the pagination without students', async () => {
      resolvedList({ status: 'loaded', students: [] });

      renderPage('/alumnos', width);

      await screen.findByText(es.students.empty);
      expect(screen.queryByTestId('students-count')).not.toBeInTheDocument();
      expect(navigation()).not.toBeInTheDocument();
    });

    it('shows everything and no pagination with exactly 20 students', async () => {
      resolvedList({ status: 'loaded', students: many(PAGE_SIZE) });

      renderPage('/alumnos', width);

      await screen.findByTestId('students-count');
      expect(shownNames()).toEqual(range(1, 20));
      expect(navigation()).not.toBeInTheDocument();
    });

    it('shows the first 20 of 45 in the order of the service, with the total and the page indicator', async () => {
      resolvedList({ status: 'loaded', students: many(45) });

      renderPage('/alumnos', width);

      expect(await screen.findByTestId('students-count')).toHaveTextContent('45 alumnos');
      expect(shownNames()).toEqual(range(1, 20));
      expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: es.pagination.previous })).toBeDisabled();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('goes forward and back through the pages without asking for the list again', async () => {
      resolvedList({ status: 'loaded', students: many(45) });
      renderPage('/alumnos', width);
      await screen.findByTestId('students-count');

      await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
      expect(shownNames()).toEqual(range(21, 40));
      expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
      expect(shownNames()).toEqual(range(41, 45));
      expect(screen.getByRole('button', { name: es.pagination.next })).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: es.pagination.previous }));
      expect(shownNames()).toEqual(range(21, 40));

      expect(list).toHaveBeenCalledOnce();
    });

    it('scrolls to the total, without moving the focus, when the page changes', async () => {
      resolvedList({ status: 'loaded', students: many(45) });
      renderPage('/alumnos', width);
      await screen.findByTestId('students-count');

      await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));

      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: es.pagination.next })).toHaveFocus();
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('search and filters (US15) on %s', (_name, width) => {
    const texts = es.students.filters;
    const C1 = { id: 'c1', name: '1º Primaria' };
    const C2 = { id: 'c2', name: '2º Primaria' };
    /** En el orden del servicio: apellidos y nombre. */
    const people: StudentSummary[] = [
      student('f1', 'Ana', 'García', {
        course: C1,
        cafeteria: true,
        scholarship: false,
      }),
      student('f2', 'Juan', 'García López', {
        course: C1,
        class: { id: 'c1-A', name: 'A' },
        cafeteria: true,
        scholarship: true,
      }),
      student('f3', 'José', 'Muñoz', { course: C1, class: { id: 'c1-B', name: 'B' } }),
      student('f4', 'Luis', 'Pérez', { course: C2, class: { id: 'c2-B', name: 'B' } }),
      student('f5', 'Pau', 'Soler'),
    ];
    const namesShown = () =>
      (width === DESKTOP
        ? screen.queryAllByRole('rowheader')
        : screen.queryAllByRole('heading', { level: 2 })
      ).map((element) => element.textContent);
    const searchBox = () => screen.getByRole('searchbox', { name: texts.search });
    const courseSelect = () => screen.getByLabelText(texts.course);
    const classSelect = () => screen.getByLabelText(texts.class);
    const cafeteriaSelect = () => screen.getByLabelText(texts.cafeteria);
    const scholarshipSelect = () => screen.getByLabelText(texts.scholarship);
    const optionsOf = (select: HTMLElement) =>
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent);

    async function loadPeople(entry: InitialEntry = '/alumnos') {
      resolvedList({ status: 'loaded', students: people });
      const view = renderPage(entry, width);
      await screen.findByTestId('students-count');
      return view;
    }

    it('shows the filter bar only when there are students', async () => {
      resolvedList({ status: 'loaded', students: [] });
      const empty = renderPage('/alumnos', width);
      await screen.findByText(es.students.empty);
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(texts.course)).not.toBeInTheDocument();
      empty.unmount();

      await loadPeople();

      expect(searchBox()).toBeVisible();
      expect(courseSelect()).toBeVisible();
      expect(classSelect()).toBeVisible();
      expect(cafeteriaSelect()).toBeVisible();
      expect(scholarshipSelect()).toBeVisible();
    });

    describe('search', () => {
      it('finds every word in the first name or the last names, in any order, without accents or capitals', async () => {
        await loadPeople();

        await userEvent.type(searchBox(), 'juan garcia');
        expect(namesShown()).toEqual(['García López, Juan']);

        await userEvent.clear(searchBox());
        await userEvent.type(searchBox(), 'JOSE munoz');
        expect(namesShown()).toEqual(['Muñoz, José']);

        await userEvent.clear(searchBox());
        await userEvent.type(searchBox(), 'garcia');
        expect(namesShown()).toEqual(['García, Ana', 'García López, Juan']);
      });

      it('asks for nothing more while typing', async () => {
        await loadPeople();

        await userEvent.type(searchBox(), 'ana');

        expect(list).toHaveBeenCalledOnce();
      });

      it('limits the text to 100 characters', async () => {
        await loadPeople();

        expect(searchBox()).toHaveAttribute('maxlength', '100');
      });
    });

    describe('course and class', () => {
      it('offers the courses with students, in natural order, and "Sin curso" only if there are students without one', async () => {
        await loadPeople();

        expect(optionsOf(courseSelect())).toEqual([
          texts.allCourses,
          '1º Primaria',
          '2º Primaria',
          es.students.noCourse,
        ]);
        expect(courseSelect()).toHaveValue('');
      });

      it('does not offer "Sin curso" when every student has a course', async () => {
        resolvedList({ status: 'loaded', students: people.slice(0, 4) });
        renderPage('/alumnos', width);
        await screen.findByTestId('students-count');

        expect(optionsOf(courseSelect())).toEqual([texts.allCourses, '1º Primaria', '2º Primaria']);
      });

      it('filters by course and by "Sin curso"', async () => {
        await loadPeople();

        await userEvent.selectOptions(courseSelect(), '1º Primaria');
        expect(namesShown()).toEqual(['García, Ana', 'García López, Juan', 'Muñoz, José']);

        await userEvent.selectOptions(courseSelect(), es.students.noCourse);
        expect(namesShown()).toEqual(['Soler, Pau']);
      });

      it('disables the class, with a help text linked to it, until a course is chosen', async () => {
        await loadPeople();

        expect(classSelect()).toBeDisabled();
        expect(classSelect()).toHaveAccessibleDescription(texts.classNeedsCourse);

        await userEvent.selectOptions(courseSelect(), es.students.noCourse);
        expect(classSelect()).toBeDisabled();

        await userEvent.selectOptions(courseSelect(), '1º Primaria');
        expect(classSelect()).toBeEnabled();
        expect(classSelect()).not.toHaveAccessibleDescription();
      });

      it('offers the classes of the chosen course, with "Sin clase" only if some student has none, and filters by them', async () => {
        await loadPeople();
        await userEvent.selectOptions(courseSelect(), '1º Primaria');

        expect(optionsOf(classSelect())).toEqual([
          texts.allClasses,
          'A',
          'B',
          es.students.form.classNone,
        ]);

        await userEvent.selectOptions(classSelect(), 'A');
        expect(namesShown()).toEqual(['García López, Juan']);

        await userEvent.selectOptions(classSelect(), es.students.form.classNone);
        expect(namesShown()).toEqual(['García, Ana']);

        await userEvent.selectOptions(courseSelect(), '2º Primaria');
        expect(optionsOf(classSelect())).toEqual([texts.allClasses, 'B']);
      });

      it('goes back to "all the classes" when the course changes', async () => {
        await loadPeople();
        await userEvent.selectOptions(courseSelect(), '1º Primaria');
        await userEvent.selectOptions(classSelect(), 'A');
        expect(namesShown()).toEqual(['García López, Juan']);

        await userEvent.selectOptions(courseSelect(), '2º Primaria');

        expect(classSelect()).toHaveValue('');
        expect(namesShown()).toEqual(['Pérez, Luis']);
      });
    });

    describe('cafeteria and scholarship', () => {
      it('offers the cafeteria answers and filters by them', async () => {
        await loadPeople();

        expect(optionsOf(cafeteriaSelect())).toEqual([
          texts.cafeteriaAll,
          texts.cafeteriaYes,
          texts.cafeteriaNo,
        ]);
        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaYes);
        expect(namesShown()).toEqual(['García, Ana', 'García López, Juan']);

        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaNo);
        expect(namesShown()).toEqual(['Muñoz, José', 'Pérez, Luis', 'Soler, Pau']);
      });

      it('disables the scholarship, with a help text linked to it, unless the cafeteria is "yes"', async () => {
        await loadPeople();
        expect(scholarshipSelect()).toBeDisabled();
        expect(scholarshipSelect()).toHaveAccessibleDescription(texts.scholarshipNeedsCafeteria);

        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaYes);
        expect(scholarshipSelect()).toBeEnabled();
        expect(scholarshipSelect()).not.toHaveAccessibleDescription();

        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaNo);
        expect(scholarshipSelect()).toBeDisabled();
      });

      it('filters by scholarship among those who eat at the cafeteria', async () => {
        await loadPeople();
        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaYes);

        expect(optionsOf(scholarshipSelect())).toEqual([
          texts.scholarshipAll,
          texts.scholarshipYes,
          texts.scholarshipNo,
        ]);
        await userEvent.selectOptions(scholarshipSelect(), texts.scholarshipYes);
        expect(namesShown()).toEqual(['García López, Juan']);

        await userEvent.selectOptions(scholarshipSelect(), texts.scholarshipNo);
        expect(namesShown()).toEqual(['García, Ana']);
      });

      it('forgets the scholarship when the cafeteria stops being "yes"', async () => {
        await loadPeople();
        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaYes);
        await userEvent.selectOptions(scholarshipSelect(), texts.scholarshipYes);

        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaNo);
        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaYes);

        expect(scholarshipSelect()).toHaveValue('all');
        expect(namesShown()).toEqual(['García, Ana', 'García López, Juan']);
      });
    });

    describe('combined', () => {
      it('applies the search and every filter at once and says how many of how many are shown', async () => {
        await loadPeople();

        await userEvent.type(searchBox(), 'garcia');
        await userEvent.selectOptions(courseSelect(), '1º Primaria');
        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaYes);
        await userEvent.selectOptions(scholarshipSelect(), texts.scholarshipYes);

        expect(namesShown()).toEqual(['García López, Juan']);
        const count = screen.getByTestId('students-count');
        expect(count).toHaveTextContent('Mostrando 1 de 5 alumnos');
        expect(count).toHaveAttribute('role', 'status');
      });

      it('shows the plain total, not as a status, while nothing is filtered', async () => {
        await loadPeople();

        const count = screen.getByTestId('students-count');
        expect(count).toHaveTextContent(/^5 alumnos$/);
        expect(count).not.toHaveAttribute('role');
      });

      it('goes back to the first page when a filter or the search changes', async () => {
        const forty = Array.from({ length: 45 }, (_, index) => {
          const label = String(index + 1).padStart(2, '0');
          return student(`p${label}`, `Nombre${label}`, `Apellido${label}`, { course: C1 });
        });
        resolvedList({ status: 'loaded', students: forty });
        renderPage('/alumnos', width);
        await screen.findByTestId('students-count');

        await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
        expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaNo);
        expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
        await userEvent.type(searchBox(), 'nombre');
        expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
        await userEvent.selectOptions(courseSelect(), '1º Primaria');
        expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
      });
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('filters in the URL and empty results (US15) on %s', (_name, width) => {
    const texts = es.students.filters;
    const C1 = { id: 'c1', name: '1º Primaria' };
    const C2 = { id: 'c2', name: '2º Primaria' };
    const people: StudentSummary[] = [
      student('u1', 'Ana', 'García', { course: C1, cafeteria: true, scholarship: false }),
      student('u2', 'Juan', 'García López', {
        course: C1,
        class: { id: 'c1-A', name: 'A' },
        cafeteria: true,
        scholarship: true,
      }),
      student('u3', 'José', 'Muñoz', { course: C1, class: { id: 'c1-B', name: 'B' } }),
      student('u4', 'Luis', 'Pérez', { course: C2, class: { id: 'c2-B', name: 'B' } }),
      student('u5', 'Pau', 'Soler'),
    ];
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => {
        const label = String(index + 1).padStart(2, '0');
        return student(`m${label}`, `Nombre${label}`, `Apellido${label}`, { course: C1 });
      });
    const namesShown = () =>
      (width === DESKTOP
        ? screen.queryAllByRole('rowheader')
        : screen.queryAllByRole('heading', { level: 2 })
      ).map((element) => element.textContent);
    const searchBox = () => screen.getByRole('searchbox', { name: texts.search });
    const courseSelect = () => screen.getByLabelText(texts.course);
    const classSelect = () => screen.getByLabelText(texts.class);
    const cafeteriaSelect = () => screen.getByLabelText(texts.cafeteria);
    const scholarshipSelect = () => screen.getByLabelText(texts.scholarship);
    const where = () => screen.getByTestId('location').textContent;
    const navigationType = () => screen.getByTestId('navigation-type').textContent;

    async function open(entry: InitialEntry, students: StudentSummary[] = people) {
      resolvedList({ status: 'loaded', students });
      const view = renderPage(entry, width);
      await screen.findByTestId('students-count');
      return view;
    }

    describe('reading the URL', () => {
      it('starts with the filters and the page of the URL', async () => {
        await open('/alumnos?curso=c1&clase=c1-A&comedor=si&beca=si');

        expect(courseSelect()).toHaveValue('c1');
        expect(classSelect()).toHaveValue('c1-A');
        expect(cafeteriaSelect()).toHaveValue('yes');
        expect(scholarshipSelect()).toHaveValue('yes');
        expect(namesShown()).toEqual(['García López, Juan']);
        expect(screen.getByTestId('students-count')).toHaveTextContent('Mostrando 1 de 5 alumnos');
      });

      it('starts on the page of the URL', async () => {
        await open('/alumnos?pagina=2', many(45));

        expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
        expect(namesShown()[0]).toBe('Apellido21, Nombre21');
      });

      it('ignores what no loaded student has, without an error and leaving the URL as it was', async () => {
        await open('/alumnos?curso=zzz&clase=c1-A&comedor=quizas&beca=si&pagina=abc');

        expect(courseSelect()).toHaveValue('');
        expect(classSelect()).toHaveValue('');
        expect(cafeteriaSelect()).toHaveValue('all');
        expect(scholarshipSelect()).toHaveValue('all');
        expect(namesShown()).toHaveLength(5);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(where()).toBe('/alumnos?curso=zzz&clase=c1-A&comedor=quizas&beca=si&pagina=abc');
      });

      it('shows the last page when the page of the URL is beyond it', async () => {
        await open('/alumnos?pagina=99', many(45));

        expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
        expect(namesShown()).toHaveLength(5);
      });

      it('does not apply the scholarship without the cafeteria "yes", nor a class without a course', async () => {
        await open('/alumnos?beca=si&clase=c1-A');

        expect(scholarshipSelect()).toBeDisabled();
        expect(classSelect()).toBeDisabled();
        expect(namesShown()).toHaveLength(5);
      });

      it('does not touch the URL while the list is loading, and applies it when it arrives', async () => {
        let resolveList: (outcome: StudentsOutcome) => void = () => undefined;
        list.mockReturnValue(
          new Promise<StudentsOutcome>((resolve) => {
            resolveList = resolve;
          }),
        );
        renderPage('/alumnos?curso=c1&comedor=si', width);
        await screen.findByRole('status');
        expect(where()).toBe('/alumnos?curso=c1&comedor=si');

        resolveList({ status: 'loaded', students: people });

        await screen.findByTestId('students-count');
        expect(courseSelect()).toHaveValue('c1');
        expect(where()).toBe('/alumnos?curso=c1&comedor=si');
      });
    });

    describe('writing the URL', () => {
      it('writes each filter and the page, without the default values, replacing the entry', async () => {
        await open('/alumnos');
        expect(where()).toBe('/alumnos');

        await userEvent.selectOptions(courseSelect(), '1º Primaria');
        expect(where()).toBe('/alumnos?curso=c1');
        await userEvent.selectOptions(classSelect(), 'A');
        expect(where()).toBe('/alumnos?curso=c1&clase=c1-A');
        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaYes);
        await userEvent.selectOptions(scholarshipSelect(), texts.scholarshipYes);
        expect(where()).toBe('/alumnos?curso=c1&clase=c1-A&comedor=si&beca=si');
        expect(navigationType()).toBe('REPLACE');

        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaNo);
        expect(where()).toBe('/alumnos?curso=c1&clase=c1-A&comedor=no');

        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaAll);
        await userEvent.selectOptions(courseSelect(), texts.allCourses);
        expect(where()).toBe('/alumnos');
      });

      it('writes "sin-curso" and "sin-clase"', async () => {
        await open('/alumnos');

        await userEvent.selectOptions(courseSelect(), es.students.noCourse);
        expect(where()).toBe('/alumnos?curso=sin-curso');
        await userEvent.selectOptions(courseSelect(), '1º Primaria');
        await userEvent.selectOptions(classSelect(), es.students.form.classNone);
        expect(where()).toBe('/alumnos?curso=c1&clase=sin-clase');
      });

      it('writes the page when it changes and drops it when a filter changes', async () => {
        await open('/alumnos', many(45));

        await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
        expect(where()).toBe('/alumnos?pagina=2');
        await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
        expect(where()).toBe('/alumnos?pagina=3');
        await userEvent.click(screen.getByRole('button', { name: es.pagination.previous }));
        await userEvent.click(screen.getByRole('button', { name: es.pagination.previous }));
        expect(where()).toBe('/alumnos');

        await userEvent.click(screen.getByRole('button', { name: es.pagination.next }));
        await userEvent.selectOptions(cafeteriaSelect(), texts.cafeteriaNo);
        expect(where()).toBe('/alumnos?comedor=no');
      });

      it('never writes the search text, but going back to the first page does show in the URL', async () => {
        await open('/alumnos?curso=c1&pagina=2', many(45));

        await userEvent.type(searchBox(), 'nombre');

        expect(where()).toBe('/alumnos?curso=c1');
        expect(where()).not.toMatch(/nombre/i);
      });

      it('keeps the notice that came with the navigation when a filter changes', async () => {
        resolvedList({ status: 'loaded', students: people });
        renderPage({ pathname: '/alumnos', state: { studentCreated: 'Juan García' } }, width);
        await screen.findByTestId('students-count');
        expect(screen.getByText('Alumno «Juan García» creado')).toBeVisible();

        await userEvent.selectOptions(courseSelect(), '1º Primaria');

        expect(screen.getByText('Alumno «Juan García» creado')).toBeVisible();
      });
    });

    describe('no results', () => {
      it('says so, offers to clear the filters and shows neither the list nor the pagination', async () => {
        await open('/alumnos', many(45));

        await userEvent.type(searchBox(), 'zzzzz');

        const count = screen.getByTestId('students-count');
        expect(count).toHaveTextContent(texts.noResults);
        expect(count).toHaveAttribute('role', 'status');
        expect(screen.getByRole('button', { name: texts.clear })).toBeVisible();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.queryAllByRole('listitem')).toHaveLength(0);
        expect(screen.queryByRole('navigation', { name: es.students.pagination })).toBeNull();
      });

      it('clears the search and every filter, goes back to the first page and focuses the search', async () => {
        await open('/alumnos?curso=c1&comedor=si&pagina=2', many(45));
        await userEvent.type(searchBox(), 'zzzzz');
        expect(namesShown()).toEqual([]);

        await userEvent.click(screen.getByRole('button', { name: texts.clear }));

        expect(searchBox()).toHaveValue('');
        expect(searchBox()).toHaveFocus();
        expect(courseSelect()).toHaveValue('');
        expect(cafeteriaSelect()).toHaveValue('all');
        expect(where()).toBe('/alumnos');
        expect(screen.getByTestId('students-count')).toHaveTextContent(/^45 alumnos$/);
        expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
      });

      it('has no accessibility violations with data, with filters and without results', async () => {
        const view = await open('/alumnos?curso=c1&comedor=si');
        expect(await wcagViolations(view.container)).toEqual([]);

        await userEvent.type(searchBox(), 'zzzzz');
        expect(await wcagViolations(view.container)).toEqual([]);
      });
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a narrow screen', MOBILE],
  ])('edit action and update notice (US17) on %s', (_name, width) => {
    const editLink = (name: string) => screen.getByRole('link', { name: `Editar ${name}` });

    it('offers an "Edit" link per student, named with the surname and the name, to its page', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage('/alumnos', width);

      await screen.findByText('Álvarez, Ana');

      expect(screen.getAllByRole('link', { name: /^Editar / })).toHaveLength(4);
      expect(editLink('Álvarez, Ana')).toHaveAttribute('href', '/alumnos/s1/editar');
      expect(editLink('Pérez, Luis')).toHaveAttribute('href', '/alumnos/s4/editar');
      expect(editLink('García, Juan')).toHaveTextContent(es.students.editLink);
    });

    it('has the visible text inside the accessible name of each link', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage('/alumnos', width);

      await screen.findByText('Álvarez, Ana');

      for (const link of screen.getAllByRole('link', { name: /^Editar / })) {
        expect(link.getAttribute('aria-label')).toContain(link.textContent);
      }
    });

    it('encodes the id in the address', async () => {
      resolvedList({
        status: 'loaded',
        students: [student('a/b c', 'Ana', 'Álvarez')],
      });
      renderPage('/alumnos', width);

      await screen.findByText('Álvarez, Ana');

      expect(editLink('Álvarez, Ana')).toHaveAttribute('href', '/alumnos/a%2Fb%20c/editar');
    });

    it('only links the students of the page that is shown', async () => {
      resolvedList({
        status: 'loaded',
        students: Array.from({ length: 45 }, (_, index) =>
          student(`m${String(index)}`, `Nombre${String(index)}`, `Apellido${String(index)}`),
        ),
      });
      renderPage('/alumnos?pagina=3', width);

      await screen.findByTestId('students-count');

      expect(screen.getAllByRole('link', { name: /^Editar / })).toHaveLength(5);
    });

    it('goes to the edition carrying the search of the list, with its filters and its page', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage('/alumnos?curso=c1&comedor=si', width);
      await screen.findByTestId('students-count');

      await userEvent.click(editLink('García, Juan'));

      expect(await screen.findByTestId('edit-destination')).toHaveTextContent(
        '/alumnos/s2/editar {"listSearch":"?curso=c1&comedor=si"}',
      );
    });

    it('goes to the edition with an empty search when the list has no filters', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage('/alumnos', width);
      await screen.findByTestId('students-count');

      await userEvent.click(editLink('Álvarez, Ana'));

      expect(await screen.findByTestId('edit-destination')).toHaveTextContent(
        '/alumnos/s1/editar {"listSearch":""}',
      );
    });

    it('carries the filters that were written when a filter is changed in the page', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage('/alumnos', width);
      await screen.findByTestId('students-count');
      await userEvent.selectOptions(
        screen.getByLabelText(es.students.filters.cafeteria),
        es.students.filters.cafeteriaYes,
      );

      await userEvent.click(editLink('García, Juan'));

      expect(await screen.findByTestId('edit-destination')).toHaveTextContent(
        '{"listSearch":"?comedor=si"}',
      );
    });

    it('never carries the search text, only the filters of the URL', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage('/alumnos', width);
      await screen.findByTestId('students-count');
      await userEvent.type(
        screen.getByRole('searchbox', { name: es.students.filters.search }),
        'garcia',
      );

      await userEvent.click(editLink('García, Juan'));

      expect(await screen.findByTestId('edit-destination')).toHaveTextContent('{"listSearch":""}');
    });

    it('shows the update notice that comes with the navigation, as plain text and as a status', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage({ pathname: '/alumnos', state: { studentUpdated: '<b>Juan</b> García' } }, width);

      const notice = await screen.findByText('Alumno «<b>Juan</b> García» actualizado');

      expect(notice).toHaveAttribute('role', 'status');
      expect(notice.querySelector('b')).toBeNull();
      expect(screen.queryByText(/creado/)).not.toBeInTheDocument();
    });

    it.each([
      ['a name that is not text', { studentUpdated: 5 }],
      ['an empty name', { studentUpdated: '' }],
      ['an unrelated state', { listSearch: '?curso=c1' }],
    ])('ignores %s in the state of the navigation', async (_label, state) => {
      resolvedList({ status: 'loaded', students });
      renderPage({ pathname: '/alumnos', state }, width);

      await screen.findByText('Álvarez, Ana');

      expect(screen.queryByText(/actualizado/)).not.toBeInTheDocument();
    });

    it('keeps the update notice when a filter changes', async () => {
      resolvedList({ status: 'loaded', students });
      renderPage({ pathname: '/alumnos', state: { studentUpdated: 'Juan García' } }, width);
      await screen.findByTestId('students-count');
      expect(screen.getByText('Alumno «Juan García» actualizado')).toBeVisible();

      await userEvent.selectOptions(
        screen.getByLabelText(es.students.filters.course),
        '1º Primaria',
      );

      expect(screen.getByText('Alumno «Juan García» actualizado')).toBeVisible();
    });

    it('does not fail when the student that was edited no longer matches the filters of the URL', async () => {
      // Se editó a «Eva Gil» y ya no cumple `curso=c2`: no aparece, sin error, y el aviso sigue.
      resolvedList({ status: 'loaded', students });
      renderPage(
        { pathname: '/alumnos', search: '?curso=c2', state: { studentUpdated: 'Eva Gil' } },
        width,
      );

      expect(await screen.findByText('Alumno «Eva Gil» actualizado')).toBeVisible();
      expect(screen.queryByText('Gil, Eva')).not.toBeInTheDocument();
      expect(screen.getByText('Pérez, Luis')).toBeVisible();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('has no accessibility violations with the edit links and the notice', async () => {
      resolvedList({ status: 'loaded', students });
      const view = renderPage(
        { pathname: '/alumnos', state: { studentUpdated: 'Juan García' } },
        width,
      );
      await screen.findByText('Álvarez, Ana');

      expect(await wcagViolations(view.container)).toEqual([]);
    });
  });

  it('shows the actions column header only on a wide screen', async () => {
    resolvedList({ status: 'loaded', students });
    renderPage('/alumnos', DESKTOP);
    expect(await screen.findByRole('columnheader', { name: es.students.actions })).toBeVisible();
  });

  it('has no actions column on a narrow screen: the link goes at the foot of each card', async () => {
    resolvedList({ status: 'loaded', students });
    renderPage('/alumnos', MOBILE);
    await screen.findByText('Álvarez, Ana');

    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    for (const item of screen.getAllByRole('listitem')) {
      expect(within(item).getByRole('link', { name: /^Editar / })).toBeVisible();
    }
  });

  it('shows the page in English', async () => {
    await i18n.changeLanguage('en');
    resolvedList({ status: 'loaded', students: [] });
    renderPage('/alumnos', DESKTOP);

    expect(await screen.findByText('There are no students yet')).toBeVisible();
  });
});
