import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import {
  constraintsService,
  type ConstraintsOutcome,
  type SchedulingConstraint,
} from '../services/constraintsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { ConstraintsPage } from './ConstraintsPage';

const texts = es.constraints;
const DESKTOP = 1280;
const PHONE = 360;

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

const first = { id: 'course-1', name: '1º Primaria' };
const second = { id: 'course-2', name: '2º Primaria' };
const tenth = { id: 'course-10', name: '10º Primaria' };
const englishSubject = {
  id: 'subject-1',
  name: 'Inglés',
  code: 'ING',
  color: 'blue',
  status: 'ACTIVE',
} as const;
const religionSubject = {
  id: 'subject-2',
  name: 'Religión',
  code: null,
  color: 'green',
  status: 'ACTIVE',
} as const;
const musicSubject = {
  id: 'subject-3',
  name: 'Música',
  code: 'MUS',
  color: 'red',
  status: 'INACTIVE',
} as const;

const maxRule: SchedulingConstraint = {
  id: 'rule-1',
  type: 'MAX_PER_DAY',
  course: first,
  subject: englishSubject,
  maxPerDay: 2,
  blockSize: null,
  slotCount: null,
  warnings: [],
};
const forbiddenRule: SchedulingConstraint = {
  id: 'rule-2',
  type: 'FORBIDDEN_SLOTS',
  course: first,
  subject: religionSubject,
  maxPerDay: null,
  blockSize: null,
  slotCount: 18,
  warnings: [{ code: 'SUBJECT_DOES_NOT_FIT' }],
};
const blockRule: SchedulingConstraint = {
  id: 'rule-3',
  type: 'BLOCK',
  course: second,
  subject: musicSubject,
  maxPerDay: null,
  blockSize: 2,
  slotCount: null,
  warnings: [{ code: 'BLOCK_LARGER_THAN_LOAD' }, { code: 'COURSE_WITHOUT_CALENDAR' }],
};
const preferredRule: SchedulingConstraint = {
  id: 'rule-4',
  type: 'PREFERRED_SLOTS',
  course: tenth,
  subject: englishSubject,
  maxPerDay: null,
  blockSize: null,
  slotCount: 1,
  warnings: [{ code: 'PREFERRED_SLOTS_FORBIDDEN', count: 1 }],
};
const all = [maxRule, forbiddenRule, blockRule, preferredRule];

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('ConstraintsPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let list: MockInstance<typeof constraintsService.list>;
  let media: MatchMediaControl;

  function signInAs(role: 'ADMIN' | 'MEMBER') {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
  }

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    signInAs('MEMBER');
    list = vi.spyOn(constraintsService, 'list');
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    list.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderPage(width = DESKTOP, strict = false) {
    media.setWidth(width);
    const tree = (
      <MemoryRouter initialEntries={['/reglas']}>
        <SessionProvider>
          <Routes>
            <Route path="/reglas" element={<ConstraintsPage />} />
            <Route path="/cursos" element={<div data-testid="courses-page" />} />
            <Route path="/cursos/:id/carga" element={<div data-testid="workload-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  function respond(outcome: ConstraintsOutcome) {
    list.mockResolvedValue(outcome);
  }

  function loaded(...constraints: SchedulingConstraint[]) {
    respond({ status: 'loaded', constraints });
  }

  describe('loading the list', () => {
    it('asks for the list once, also in strict mode, and shows that it is loading', async () => {
      loaded(maxRule);
      renderPage(DESKTOP, true);

      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
      await screen.findByRole('table');

      expect(list).toHaveBeenCalledTimes(1);
    });

    it('shows an alert with a button to retry when it fails, and asks again when it is pressed', async () => {
      const user = userEvent.setup();
      respond({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);

      loaded(maxRule);
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('shows nothing of its own when the session is no longer valid: the layout redirects', async () => {
      respond({ status: 'unauthenticated' });
      renderPage();

      await waitFor(() => {
        expect(list).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a phone', PHONE],
  ])('on %s', (_name, width) => {
    const isWide = width === DESKTOP;

    /** Las reglas pintadas, cada una en su fila o su tarjeta. */
    function items(): HTMLElement[] {
      return isWide
        ? within(screen.getByRole('table')).getAllByRole('row').slice(1)
        : within(screen.getByRole('list', { name: texts.list })).getAllByRole('listitem');
    }

    it('shows the course, the subject, the rule, the detail and the count in their order', async () => {
      loaded(maxRule, forbiddenRule);
      renderPage(width);

      await screen.findAllByText(texts.types.MAX_PER_DAY);

      const rows = items();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent('1º Primaria');
      expect(rows[0]).toHaveTextContent('Inglés');
      expect(rows[0]).toHaveTextContent(texts.types.MAX_PER_DAY);
      expect(rows[0]).toHaveTextContent('Hasta 2 al día');
      expect(rows[1]).toHaveTextContent('Religión');
      expect(rows[1]).toHaveTextContent(texts.types.FORBIDDEN_SLOTS);
      expect(rows[1]).toHaveTextContent('18 franjas');
      expect(screen.getByTestId('constraints-count')).toHaveTextContent('2 reglas');
    });

    it('describes each type with its own detail and the plural of the slots', async () => {
      loaded(blockRule, preferredRule, { ...forbiddenRule, slotCount: 0 });
      renderPage(width);

      await screen.findAllByText(texts.types.BLOCK);

      const [block, preferred, empty] = items();
      expect(block).toHaveTextContent('En bloques de 2');
      expect(preferred).toHaveTextContent('1 franja');
      expect(preferred).not.toHaveTextContent('1 franjas');
      expect(empty).toHaveTextContent('0 franjas');
    });

    it('shows the code, the inactive subjects and the colour with its name', async () => {
      loaded(maxRule, blockRule);
      renderPage(width);

      await screen.findAllByText('Inglés');

      const [english, music] = items();
      expect(english).toHaveTextContent('ING');
      expect(
        within(english as HTMLElement).getByRole('img', { name: /azul/i }),
      ).toBeInTheDocument();
      expect(english).not.toHaveTextContent(texts.inactive);
      expect(music).toHaveTextContent(texts.inactive);
    });

    it('shows the warnings of each rule in red, with their text, in a region named after the rule', async () => {
      loaded(maxRule, forbiddenRule, blockRule);
      renderPage(width);

      await screen.findAllByText('Religión');

      const [english, religion, music] = items();
      expect(within(english as HTMLElement).queryByRole('status')).not.toBeInTheDocument();
      const warnings = within(religion as HTMLElement).getByRole('status', {
        name: 'Avisos de Religión, Franjas prohibidas, 1º Primaria',
      });
      expect(warnings).toHaveTextContent(es.workload.subjectWarnings.SUBJECT_DOES_NOT_FIT);
      expect(
        within(warnings).getByText(es.workload.subjectWarnings.SUBJECT_DOES_NOT_FIT),
      ).toHaveClass('text-danger');
      expect(music).toHaveTextContent(es.workload.subjectWarnings.BLOCK_LARGER_THAN_LOAD);
      expect(music).toHaveTextContent(es.workload.subjectWarnings.COURSE_WITHOUT_CALENDAR);
    });

    it.each([
      ['ADMIN', texts.edit, 'Editar'],
      ['MEMBER', texts.view, 'Ver'],
    ] as const)(
      'offers %s the link %s to where each rule is defined',
      async (role, label, prefix) => {
        signInAs(role);
        loaded(...all);
        renderPage(width);

        await screen.findAllByText('Inglés');

        const link = (name: string) => screen.getByRole('link', { name });
        expect(link(`${prefix} Máximo al día de Inglés en 1º Primaria`)).toHaveAttribute(
          'href',
          '/cursos/course-1/carga',
        );
        expect(link(`${prefix} Bloques de Música en 2º Primaria`)).toHaveAttribute(
          'href',
          '/cursos/course-2/carga',
        );
        expect(link(`${prefix} Franjas prohibidas de Religión en 1º Primaria`)).toHaveAttribute(
          'href',
          '/cursos/course-1/carga/subject-2/prohibidas',
        );
        expect(link(`${prefix} Franjas preferidas de Inglés en 10º Primaria`)).toHaveAttribute(
          'href',
          '/cursos/course-10/carga/subject-1/preferidas',
        );
        expect(screen.getAllByRole('link', { name: new RegExp(`^${label}`) })).toHaveLength(4);
      },
    );

    it('goes to the workload of the course when the link is followed', async () => {
      const user = userEvent.setup();
      signInAs('ADMIN');
      loaded(maxRule);
      renderPage(width);

      await user.click(
        await screen.findByRole('link', { name: 'Editar Máximo al día de Inglés en 1º Primaria' }),
      );

      expect(screen.getByTestId('workload-page')).toBeInTheDocument();
    });

    describe('filters', () => {
      async function renderAll() {
        loaded(...all);
        renderPage(width);
        await screen.findAllByText('Inglés');
      }

      const names = () => items().map((item) => item.textContent);
      const subjectsShown = () =>
        items().map((item) => /Inglés|Religión|Música/.exec(item.textContent)?.[0]);

      it('offers the four types and only the courses that have rules, in natural order', async () => {
        await renderAll();

        const type = screen.getByLabelText(texts.filters.type);
        expect(
          within(type)
            .getAllByRole('option')
            .map((option) => option.textContent),
        ).toEqual([
          texts.filters.all,
          texts.types.MAX_PER_DAY,
          texts.types.BLOCK,
          texts.types.FORBIDDEN_SLOTS,
          texts.types.PREFERRED_SLOTS,
        ]);
        const course = screen.getByLabelText(texts.filters.course);
        expect(
          within(course)
            .getAllByRole('option')
            .map((option) => option.textContent),
        ).toEqual([texts.filters.all, '1º Primaria', '2º Primaria', '10º Primaria']);
      });

      it('filters by type', async () => {
        const user = userEvent.setup();
        await renderAll();

        await user.selectOptions(screen.getByLabelText(texts.filters.type), 'FORBIDDEN_SLOTS');

        expect(subjectsShown()).toEqual(['Religión']);
        expect(screen.getByTestId('constraints-count')).toHaveTextContent('1 regla');
      });

      it('filters by course', async () => {
        const user = userEvent.setup();
        await renderAll();

        await user.selectOptions(screen.getByLabelText(texts.filters.course), 'course-1');

        expect(subjectsShown()).toEqual(['Inglés', 'Religión']);
      });

      it('searches by name or code of the subject', async () => {
        const user = userEvent.setup();
        await renderAll();

        await user.type(screen.getByLabelText(texts.filters.search), 'ingl');
        expect(subjectsShown()).toEqual(['Inglés', 'Inglés']);

        await user.clear(screen.getByLabelText(texts.filters.search));
        await user.type(screen.getByLabelText(texts.filters.search), 'MUS');
        expect(subjectsShown()).toEqual(['Música']);
      });

      it('keeps only the rules with warnings', async () => {
        const user = userEvent.setup();
        await renderAll();

        await user.click(screen.getByRole('checkbox', { name: texts.filters.onlyWithWarnings }));

        expect(subjectsShown()).toEqual(['Religión', 'Música', 'Inglés']);
        expect(names()).toHaveLength(3);
      });

      it('combines the filters', async () => {
        const user = userEvent.setup();
        await renderAll();

        await user.click(screen.getByRole('checkbox', { name: texts.filters.onlyWithWarnings }));
        await user.type(screen.getByLabelText(texts.filters.search), 'ingl');
        await user.selectOptions(screen.getByLabelText(texts.filters.course), 'course-10');

        expect(items()).toHaveLength(1);
        expect(items()[0]).toHaveTextContent(texts.types.PREFERRED_SLOTS);
      });

      it('says that nothing matches and clears the filters, giving the focus to the search', async () => {
        const user = userEvent.setup();
        await renderAll();
        await user.selectOptions(screen.getByLabelText(texts.filters.type), 'BLOCK');
        await user.selectOptions(screen.getByLabelText(texts.filters.course), 'course-1');

        expect(screen.getByText(texts.noMatches)).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.getByTestId('constraints-count')).toHaveTextContent('0 reglas');

        await user.click(screen.getByRole('button', { name: texts.filters.clear }));

        expect(items()).toHaveLength(4);
        expect(screen.queryByText(texts.noMatches)).not.toBeInTheDocument();
        expect(screen.getByLabelText(texts.filters.search)).toHaveFocus();
        expect(screen.getByLabelText(texts.filters.type)).toHaveValue('');
        expect(screen.getByLabelText(texts.filters.course)).toHaveValue('');
        expect(
          screen.getByRole('checkbox', { name: texts.filters.onlyWithWarnings }),
        ).not.toBeChecked();
      });

      it('does not ask for the list again when a filter changes', async () => {
        const user = userEvent.setup();
        await renderAll();

        await user.selectOptions(screen.getByLabelText(texts.filters.type), 'BLOCK');

        expect(list).toHaveBeenCalledTimes(1);
      });
    });

    it('has no accessibility violations', async () => {
      signInAs('ADMIN');
      loaded(...all);
      const { container } = renderPage(width);

      await screen.findAllByText('Inglés');

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe('the table on a wide screen', () => {
    it('is named by the title, with column headers and the course as the header of each row', async () => {
      loaded(maxRule, forbiddenRule);
      renderPage(DESKTOP);

      const table = await screen.findByRole('table', { name: texts.title });

      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((header) => header.textContent),
      ).toEqual([
        texts.fields.course,
        texts.fields.subject,
        texts.fields.rule,
        texts.fields.detail,
        texts.fields.warnings,
        texts.fields.actions,
      ]);
      expect(
        within(table)
          .getAllByRole('rowheader')
          .map((cell) => cell.textContent),
      ).toEqual(['1º Primaria', '1º Primaria']);
    });

    it('does not draw the cards', async () => {
      loaded(maxRule);
      renderPage(DESKTOP);

      await screen.findByRole('table');

      expect(screen.queryByRole('list', { name: texts.list })).not.toBeInTheDocument();
    });
  });

  describe('cards on a phone', () => {
    it('draws a list of cards and no table, each with a heading of its subject', async () => {
      loaded(maxRule, forbiddenRule);
      renderPage(PHONE);

      const cards = await screen.findByRole('list', { name: texts.list });

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(
        within(cards)
          .getAllByRole('heading', { level: 2 })
          .map((heading) => heading.textContent),
      ).toEqual(['Inglés', 'Religión']);
    });
  });

  describe('without rules', () => {
    it('says that there are none and links to the courses, without filters nor count', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage();

      expect(await screen.findByText(texts.empty)).toBeInTheDocument();
      expect(screen.queryByRole('search')).not.toBeInTheDocument();
      expect(screen.queryByTestId('constraints-count')).not.toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: texts.goToCourses }));

      expect(screen.getByTestId('courses-page')).toBeInTheDocument();
    });
  });

  describe('the page', () => {
    it('has the title as the main heading and the main landmark', async () => {
      loaded(maxRule);
      renderPage();

      expect(
        await screen.findByRole('heading', { level: 1, name: texts.title }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('constraints-page')).toBeInTheDocument();
    });

    it('is shown in English', async () => {
      await i18n.changeLanguage('en');
      loaded(maxRule);
      renderPage();

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Scheduling rules' }),
      ).toBeInTheDocument();
      expect(within(screen.getByRole('table')).getByText('Maximum per day')).toBeInTheDocument();
      expect(screen.getByText('Up to 2 per day')).toBeInTheDocument();
    });
  });
});
