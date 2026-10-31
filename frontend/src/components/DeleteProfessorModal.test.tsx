import { render, screen, waitFor, within } from '@testing-library/react';
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
import {
  professorsService,
  type FreedClass,
  type Professor,
  type ProfessorOutcome,
} from '../services/professorsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { DeleteProfessorModal, type ProfessorToDelete } from './DeleteProfessorModal';

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

const texts = es.professors.delete;
const professor: ProfessorToDelete = { id: 'p1', name: 'Ana García' };

const free: Professor = {
  id: 'p1',
  firstName: 'Ana',
  lastName: 'García',
  position: null,
  subjects: [],
  unavailableCount: 0,
  tutoredClass: null,
};
const tutor: Professor = {
  ...free,
  tutoredClass: { id: 'c1', name: 'A', courseId: 'k1', courseName: '1º Primaria' },
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

describe('DeleteProfessorModal', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof professorsService.get>;
  let remove: MockInstance<typeof professorsService.delete>;
  let onDeleted: Mock<(professor: ProfessorToDelete, freedClass: FreedClass) => void>;
  let onGone: Mock<() => void>;
  let onCancel: Mock<() => void>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi
      .spyOn(professorsService, 'get')
      .mockResolvedValue({ status: 'loaded', professor: free });
    remove = vi
      .spyOn(professorsService, 'delete')
      .mockResolvedValue({ status: 'deleted', freedClass: null });
    onDeleted = vi.fn<(professor: ProfessorToDelete, freedClass: FreedClass) => void>();
    onGone = vi.fn<() => void>();
    onCancel = vi.fn<() => void>();
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    remove.mockRestore();
  });

  function renderModal(options: { professor?: ProfessorToDelete | null; strict?: boolean } = {}) {
    const tree = (
      <SessionProvider>
        <DeleteProfessorModal
          professor={options.professor === undefined ? professor : options.professor}
          onDeleted={onDeleted}
          onGone={onGone}
          onCancel={onCancel}
        />
      </SessionProvider>
    );
    return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  describe('asking for the professor', () => {
    it('renders nothing while there is no professor', () => {
      renderModal({ professor: null });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(get).not.toHaveBeenCalled();
    });

    it('asks once for the professor, also in strict mode, and shows a status meanwhile', async () => {
      get.mockImplementation(() => new Promise<ProfessorOutcome>(() => undefined));

      renderModal({ strict: true });

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('status')).toHaveTextContent(texts.loading);
      expect(confirmButton()).toBeDisabled();
      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0]?.[1]).toBe('p1');
    });

    it('is a dialog named by its title, which names the professor as plain text', async () => {
      renderModal({ professor: { id: 'p1', name: '<b>Ana</b> García' } });

      const dialog = await screen.findByRole('dialog', { name: '¿Borrar a <b>Ana</b> García?' });
      expect(dialog.querySelector('b')).toBeNull();
    });

    it('says only that it cannot be undone for a professor with no class', async () => {
      renderModal();

      expect(await screen.findByText(texts.warning)).toBeVisible();
      expect(screen.queryByText(/quedará sin tutor/)).not.toBeInTheDocument();
      expect(confirmButton()).toBeEnabled();
    });

    it('says which class will be left without tutor for a professor who tutors one', async () => {
      get.mockResolvedValue({ status: 'loaded', professor: tutor });

      renderModal();

      expect(
        await screen.findByText('Tutoriza 1º Primaria A: la clase quedará sin tutor.'),
      ).toBeVisible();
      expect(screen.getByText(texts.warning)).toBeVisible();
    });

    it('shows an error with Retry when the professor cannot be loaded, keeps Delete disabled and asks again', async () => {
      get.mockResolvedValueOnce({ status: 'unavailable' });
      renderModal();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(texts.loadError);
      expect(confirmButton()).toBeDisabled();
      await userEvent.click(within(alert).getByRole('button', { name: es.professors.retry }));

      expect(await screen.findByText(texts.warning)).toBeVisible();
      expect(get).toHaveBeenCalledTimes(2);
      expect(confirmButton()).toBeEnabled();
    });

    it('calls onGone when the professor no longer exists', async () => {
      get.mockResolvedValue({ status: 'notFound' });

      renderModal();

      await waitFor(() => {
        expect(onGone).toHaveBeenCalledOnce();
      });
    });

    it('does nothing when the session is lost: the layout redirects', async () => {
      get.mockResolvedValue({ status: 'unauthenticated' });

      renderModal();

      await waitFor(() => {
        expect(get).toHaveBeenCalledOnce();
      });
      expect(onGone).not.toHaveBeenCalled();
      expect(confirmButton()).toBeDisabled();
    });
  });

  describe('confirming', () => {
    it('focuses Cancel first, the safe option, and has no close button in the header', async () => {
      renderModal();

      await screen.findByText(texts.warning);
      expect(cancelButton()).toHaveFocus();
      expect(screen.queryByRole('button', { name: /close|cerrar/i })).not.toBeInTheDocument();
    });

    it('deletes once and reports what was freed', async () => {
      const freedClass = { id: 'c1', name: 'A', courseName: '1º Primaria' };
      remove.mockResolvedValue({ status: 'deleted', freedClass });
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledExactlyOnceWith(professor, freedClass);
      });
      expect(remove).toHaveBeenCalledOnce();
      expect(remove.mock.calls[0]?.[1]).toBe('p1');
    });

    it('reports no freed class when there was none', async () => {
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledExactlyOnceWith(professor, null);
      });
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

    it('calls onGone when the professor no longer exists at confirm time', async () => {
      remove.mockResolvedValue({ status: 'notFound' });
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(onGone).toHaveBeenCalledOnce();
      });
      expect(onDeleted).not.toHaveBeenCalled();
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

  it('has no accessibility violations loading, with a class, with no class and with an error', async () => {
    get.mockImplementationOnce(() => new Promise<ProfessorOutcome>(() => undefined));
    const loading = renderModal();
    await screen.findByText(texts.loading);
    expect(await wcagViolations(document.body)).toEqual([]);
    loading.unmount();

    get.mockResolvedValue({ status: 'loaded', professor: tutor });
    const withClass = renderModal();
    await screen.findByText(texts.warning);
    expect(await wcagViolations(document.body)).toEqual([]);
    withClass.unmount();

    get.mockResolvedValue({ status: 'loaded', professor: free });
    const noClass = renderModal();
    await screen.findByText(texts.warning);
    expect(await wcagViolations(document.body)).toEqual([]);
    noClass.unmount();

    get.mockResolvedValue({ status: 'unavailable' });
    renderModal();
    await screen.findByRole('alert');
    expect(await wcagViolations(document.body)).toEqual([]);
  });
});
