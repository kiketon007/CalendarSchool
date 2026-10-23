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
import { sessionService, type SessionData } from '../services/sessionService';
import { studentsService } from '../services/studentsService';
import { SessionProvider } from '../session/SessionProvider';
import { DeleteStudentModal, type StudentToDelete } from './DeleteStudentModal';

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

const texts = es.students.delete;
const student: StudentToDelete = { id: 's1', name: 'Ana García' };

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

describe('DeleteStudentModal', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof studentsService.get>;
  let remove: MockInstance<typeof studentsService.delete>;
  let onDeleted: Mock<(student: StudentToDelete) => void>;
  let onGone: Mock<() => void>;
  let onCancel: Mock<() => void>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi.spyOn(studentsService, 'get');
    remove = vi.spyOn(studentsService, 'delete').mockResolvedValue({ status: 'deleted', id: 's1' });
    onDeleted = vi.fn<(student: StudentToDelete) => void>();
    onGone = vi.fn<() => void>();
    onCancel = vi.fn<() => void>();
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    remove.mockRestore();
  });

  function renderModal(options: { student?: StudentToDelete | null; strict?: boolean } = {}) {
    const tree = (
      <SessionProvider>
        <DeleteStudentModal
          student={options.student === undefined ? student : options.student}
          onDeleted={onDeleted}
          onGone={onGone}
          onCancel={onCancel}
        />
      </SessionProvider>
    );
    return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  describe('opening', () => {
    it('renders nothing while there is no student', () => {
      renderModal({ student: null });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is a dialog named by its title, which names the student as plain text', async () => {
      renderModal({ student: { id: 's1', name: '<b>Ana</b> García' } });

      const dialog = await screen.findByRole('dialog', { name: '¿Borrar a <b>Ana</b> García?' });

      expect(dialog).toHaveTextContent(texts.warning);
    });

    it('asks the API for nothing, also in strict mode: it has the name from the row', async () => {
      renderModal({ strict: true });

      await screen.findByText(texts.warning);

      expect(get).not.toHaveBeenCalled();
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
    it('deletes once, with the id of the student, and reports it', async () => {
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledExactlyOnceWith(student);
      });
      expect(remove).toHaveBeenCalledOnce();
      expect(remove.mock.calls[0]?.[1]).toBe('s1');
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

    it('calls onGone when the student no longer exists', async () => {
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

    it('shows the error inside the dialog, with role alert, and allows trying again', async () => {
      remove.mockResolvedValueOnce({ status: 'unavailable' });
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(confirmButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.error);
      expect(onDeleted).not.toHaveBeenCalled();
      await userEvent.click(confirmButton());
      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledOnce();
      });
    });

    it('forgets the error when the dialog is opened for another student', async () => {
      remove.mockResolvedValueOnce({ status: 'unavailable' });
      const view = renderModal();
      await screen.findByText(texts.warning);
      await userEvent.click(confirmButton());
      await screen.findByRole('alert');

      view.rerender(
        <SessionProvider>
          <DeleteStudentModal
            student={{ id: 's2', name: 'Juan López' }}
            onDeleted={onDeleted}
            onGone={onGone}
            onCancel={onCancel}
          />
        </SessionProvider>,
      );

      await screen.findByRole('dialog', { name: '¿Borrar a Juan López?' });
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

  it('has no accessibility violations open, deleting and with an error', async () => {
    const open = renderModal();
    await screen.findByText(texts.warning);
    expect(await wcagViolations(document.body)).toEqual([]);
    open.unmount();

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
