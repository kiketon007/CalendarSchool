import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
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
import '../i18n/i18n';
import { calendarsService } from '../services/calendarsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { DeleteCalendarModal, type CalendarToDelete } from './DeleteCalendarModal';

const sessionData: SessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
    role: 'ADMIN',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};

const texts = es.calendars.delete;
const calendar: CalendarToDelete = {
  id: 'c1',
  name: 'Primaria',
  courses: [
    { id: 'k1', name: '1º Primaria' },
    { id: 'k2', name: '2º Primaria' },
  ],
};

/** Reglas automáticas de WCAG 2.1 nivel AA. El contraste lo mide el navegador, no jsdom. */
async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
}

const cancelButton = () => screen.getByRole('button', { name: texts.cancel });
const confirmButton = () => screen.getByRole('button', { name: texts.confirm });

describe('DeleteCalendarModal', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof calendarsService.get>;
  let list: MockInstance<typeof calendarsService.list>;
  let remove: MockInstance<typeof calendarsService.delete>;
  let onDeleted: Mock<(calendar: CalendarToDelete, courseCount: number) => void>;
  let onGone: Mock<() => void>;
  let onCancel: Mock<() => void>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi.spyOn(calendarsService, 'get');
    list = vi.spyOn(calendarsService, 'list');
    remove = vi
      .spyOn(calendarsService, 'delete')
      .mockResolvedValue({ status: 'deleted', id: 'c1', courseCount: 2 });
    onDeleted = vi.fn<(calendar: CalendarToDelete, courseCount: number) => void>();
    onGone = vi.fn<() => void>();
    onCancel = vi.fn<() => void>();
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    list.mockRestore();
    remove.mockRestore();
  });

  function renderModal(options: { calendar?: CalendarToDelete | null; strict?: boolean } = {}) {
    const tree = (
      <SessionProvider>
        <DeleteCalendarModal
          calendar={options.calendar === undefined ? calendar : options.calendar}
          onDeleted={onDeleted}
          onGone={onGone}
          onCancel={onCancel}
        />
      </SessionProvider>
    );
    return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  describe('opening', () => {
    it('renders nothing while there is no calendar', () => {
      renderModal({ calendar: null });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is a dialog named by its title, which names the calendar as plain text', async () => {
      renderModal({ calendar: { ...calendar, name: '<b>Primaria</b>' } });

      const dialog = await screen.findByRole('dialog', {
        name: '¿Borrar el calendario «<b>Primaria</b>»?',
      });

      expect(dialog).toHaveTextContent(texts.warning);
    });

    it('lists the courses that will be left without calendar', async () => {
      renderModal();

      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveTextContent(
        'Estos cursos se quedarán sin calendario: 1º Primaria, 2º Primaria',
      );
    });

    it('says that no course follows the calendar when it has none', async () => {
      renderModal({ calendar: { ...calendar, courses: [] } });

      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveTextContent(texts.noCourses);
      expect(dialog).not.toHaveTextContent('se quedarán sin calendario');
    });

    it('asks the API for nothing, also in strict mode: it has the data from the card', async () => {
      renderModal({ strict: true });

      await screen.findByText(texts.warning);

      expect(get).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('focuses Cancel first, the safe option, and has no close button in the header', async () => {
      renderModal();

      await screen.findByText(texts.warning);

      expect(cancelButton()).toHaveFocus();
      expect(confirmButton()).toBeEnabled();
      expect(screen.queryByRole('button', { name: /close|cerrar/i })).not.toBeInTheDocument();
    });
  });

  describe('confirming', () => {
    it('deletes once, with the id of the calendar, and reports it with the count of the server', async () => {
      remove.mockResolvedValue({ status: 'deleted', id: 'c1', courseCount: 3 });
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledExactlyOnceWith(calendar, 3);
      });
      expect(remove).toHaveBeenCalledOnce();
      expect(remove.mock.calls[0]?.[1]).toBe('c1');
    });

    it('sends a single request with a double click while the answer is pending, and shows "Borrando…" with the buttons disabled', async () => {
      remove.mockReturnValue(new Promise(() => undefined));
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.dblClick(confirmButton());

      expect(remove).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: texts.deleting })).toBeDisabled();
      expect(cancelButton()).toBeDisabled();
    });

    it('does not close with Escape while deleting', async () => {
      remove.mockReturnValue(new Promise(() => undefined));
      renderModal();
      await screen.findByText(texts.warning);
      await userEvent.click(confirmButton());

      await userEvent.keyboard('{Escape}');

      expect(onCancel).not.toHaveBeenCalled();
    });

    it('calls onGone when the calendar no longer exists', async () => {
      remove.mockResolvedValue({ status: 'notFound' });
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(onGone).toHaveBeenCalledOnce();
      });
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('does nothing when the session is lost: the layout redirects', async () => {
      remove.mockResolvedValue({ status: 'unauthenticated' });
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(remove).toHaveBeenCalledOnce();
      });
      expect(onDeleted).not.toHaveBeenCalled();
      expect(onGone).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each([
      ['the service is unavailable', { status: 'unavailable' }],
      ['the role cannot delete', { status: 'forbidden' }],
    ] as const)(
      'shows the error inside the dialog, with role alert, and allows trying again when %s',
      async (_name, outcome) => {
        remove.mockResolvedValueOnce(outcome);
        renderModal();
        await screen.findByText(texts.warning);

        await userEvent.click(confirmButton());

        expect(await screen.findByRole('alert')).toHaveTextContent(texts.error);
        expect(onDeleted).not.toHaveBeenCalled();
        await userEvent.click(confirmButton());
        await waitFor(() => {
          expect(onDeleted).toHaveBeenCalledOnce();
        });
      },
    );

    it('forgets the error when the dialog is opened for another calendar', async () => {
      remove.mockResolvedValueOnce({ status: 'unavailable' });
      const view = renderModal();
      await screen.findByText(texts.warning);
      await userEvent.click(confirmButton());
      await screen.findByRole('alert');

      view.rerender(
        <SessionProvider>
          <DeleteCalendarModal
            calendar={{ id: 'c2', name: 'Infantil', courses: [] }}
            onDeleted={onDeleted}
            onGone={onGone}
            onCancel={onCancel}
          />
        </SessionProvider>,
      );

      await screen.findByRole('dialog', { name: '¿Borrar el calendario «Infantil»?' });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('cancelling', () => {
    it('calls onCancel with Cancel and with Escape, and deletes nothing', async () => {
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(cancelButton());
      await userEvent.keyboard('{Escape}');

      expect(onCancel).toHaveBeenCalledTimes(2);
      expect(remove).not.toHaveBeenCalled();
    });
  });

  it('has no accessibility violations open, without courses, deleting and with an error', async () => {
    const open = renderModal();
    await screen.findByText(texts.warning);
    expect(await wcagViolations(document.body)).toEqual([]);
    open.unmount();

    const withoutCourses = renderModal({ calendar: { ...calendar, courses: [] } });
    await screen.findByText(texts.noCourses);
    expect(await wcagViolations(document.body)).toEqual([]);
    withoutCourses.unmount();

    remove.mockReturnValue(new Promise(() => undefined));
    const deleting = renderModal();
    await screen.findByText(texts.warning);
    await userEvent.click(confirmButton());
    expect(await screen.findByRole('button', { name: texts.deleting })).toBeDisabled();
    expect(await wcagViolations(document.body)).toEqual([]);
    deleting.unmount();

    remove.mockResolvedValue({ status: 'unavailable' });
    renderModal();
    await screen.findByText(texts.warning);
    await userEvent.click(confirmButton());
    await screen.findByRole('alert');
    expect(await wcagViolations(document.body)).toEqual([]);
  });
});
