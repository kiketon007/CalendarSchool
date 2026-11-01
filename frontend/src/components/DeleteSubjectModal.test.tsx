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
import i18n from '../i18n/i18n';
import { sessionService, type SessionData } from '../services/sessionService';
import { subjectsService } from '../services/subjectsService';
import { SessionProvider } from '../session/SessionProvider';
import { DeleteSubjectModal, type SubjectToDelete } from './DeleteSubjectModal';

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

const texts = es.subjects.delete;
const subject: SubjectToDelete = {
  id: 's1',
  name: 'Inglés',
  courses: [
    { id: 'k1', name: '1º Primaria', constraintCount: 0, assignmentCount: 0 },
    { id: 'k2', name: '2º Primaria', constraintCount: 0, assignmentCount: 0 },
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

describe('DeleteSubjectModal', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof subjectsService.get>;
  let list: MockInstance<typeof subjectsService.list>;
  let update: MockInstance<typeof subjectsService.update>;
  let remove: MockInstance<typeof subjectsService.delete>;
  let onDeleted: Mock<(subject: SubjectToDelete) => void>;
  let onGone: Mock<() => void>;
  let onCancel: Mock<() => void>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi.spyOn(subjectsService, 'get');
    list = vi.spyOn(subjectsService, 'list');
    update = vi.spyOn(subjectsService, 'update');
    remove = vi.spyOn(subjectsService, 'delete').mockResolvedValue({ status: 'deleted', id: 's1' });
    onDeleted = vi.fn<(subject: SubjectToDelete) => void>();
    onGone = vi.fn<() => void>();
    onCancel = vi.fn<() => void>();
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    list.mockRestore();
    update.mockRestore();
    remove.mockRestore();
  });

  function renderModal(options: { subject?: SubjectToDelete | null; strict?: boolean } = {}) {
    const tree = (
      <SessionProvider>
        <DeleteSubjectModal
          subject={options.subject === undefined ? subject : options.subject}
          onDeleted={onDeleted}
          onGone={onGone}
          onCancel={onCancel}
        />
      </SessionProvider>
    );
    return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  describe('opening', () => {
    it('renders nothing while there is no subject', () => {
      renderModal({ subject: null });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is a dialog named by its title, which names the subject as plain text', async () => {
      renderModal({ subject: { ...subject, name: '<b>Inglés</b>' } });

      const dialog = await screen.findByRole('dialog', {
        name: '¿Borrar la asignatura «<b>Inglés</b>»?',
      });

      expect(dialog).toHaveTextContent(texts.warning);
    });

    it('lists the courses in which the subject is taught', async () => {
      renderModal();

      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveTextContent('Se imparte en: 1º Primaria, 2º Primaria');
    });

    it('adds up the rules of its courses and says they will be deleted too, only when there are some', async () => {
      renderModal({
        subject: {
          ...subject,
          courses: [
            { id: 'k1', name: '1º Primaria', constraintCount: 2, assignmentCount: 0 },
            { id: 'k2', name: '2º Primaria', constraintCount: 1, assignmentCount: 0 },
          ],
        },
      });

      expect(await screen.findByRole('dialog')).toHaveTextContent(
        'Se borrarán también 3 reglas de reparto.',
      );
    });

    it('uses the singular for one rule', async () => {
      renderModal({
        subject: {
          ...subject,
          courses: [{ id: 'k1', name: '1º Primaria', constraintCount: 1, assignmentCount: 0 }],
        },
      });

      expect(await screen.findByRole('dialog')).toHaveTextContent(
        'Se borrará también 1 regla de reparto.',
      );
    });

    it('does not mention rules when the courses have none', async () => {
      renderModal();

      expect(await screen.findByRole('dialog')).not.toHaveTextContent('reglas de reparto');
    });

    it('adds up the assignments of professors of its courses and says they will be removed too, after the rules', async () => {
      renderModal({
        subject: {
          ...subject,
          courses: [
            { id: 'k1', name: '1º Primaria', constraintCount: 2, assignmentCount: 2 },
            { id: 'k2', name: '2º Primaria', constraintCount: 0, assignmentCount: 1 },
          ],
        },
      });

      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveTextContent('Se borrarán también 2 reglas de reparto.');
      expect(dialog).toHaveTextContent('Se quitarán también 3 asignaciones de profesores.');
      expect(dialog.textContent?.indexOf('reglas de reparto')).toBeLessThan(
        dialog.textContent?.indexOf('asignaciones de profesores') ?? 0,
      );
    });

    it('uses the singular for one assignment', async () => {
      renderModal({
        subject: {
          ...subject,
          courses: [{ id: 'k1', name: '1º Primaria', constraintCount: 0, assignmentCount: 1 }],
        },
      });

      expect(await screen.findByRole('dialog')).toHaveTextContent(
        'Se quitará también 1 asignación de profesor.',
      );
    });

    it('does not mention assignments when the courses have none', async () => {
      renderModal();

      expect(await screen.findByRole('dialog')).not.toHaveTextContent('asignaciones de profesor');
      expect(screen.getByRole('dialog')).not.toHaveTextContent('asignación de profesor');
    });

    it('says it in English with its own plural', async () => {
      await i18n.changeLanguage('en');
      renderModal({
        subject: {
          ...subject,
          courses: [{ id: 'k1', name: '1º Primaria', constraintCount: 0, assignmentCount: 4 }],
        },
      });

      expect(await screen.findByRole('dialog')).toHaveTextContent(
        '4 professor assignments will also be removed.',
      );
      await i18n.changeLanguage('es');
    });

    it('says that it is not taught in any course when it has none', async () => {
      renderModal({ subject: { ...subject, courses: [] } });

      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveTextContent(texts.noCourses);
      expect(dialog).not.toHaveTextContent('Se imparte en:');
    });

    it('reminds, as plain text and without any extra button, that it can be deactivated from Edit', async () => {
      renderModal();

      const dialog = await screen.findByRole('dialog');

      expect(dialog).toHaveTextContent(texts.inactivateHint);
      expect(
        within(dialog)
          .getAllByRole('button')
          .map((button) => button.textContent),
      ).toEqual([texts.cancel, texts.confirm]);
      expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    });

    it('asks the API for nothing, also in strict mode: it has the data from the card', async () => {
      renderModal({ strict: true });

      await screen.findByText(texts.warning);

      expect(get).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
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
    it('deletes once, with the id of the subject, and reports it', async () => {
      renderModal();
      await screen.findByText(texts.warning);

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledExactlyOnceWith(subject);
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

    it('calls onGone when the subject no longer exists', async () => {
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

    it('forgets the error when the dialog is opened for another subject', async () => {
      remove.mockResolvedValueOnce({ status: 'unavailable' });
      const view = renderModal();
      await screen.findByText(texts.warning);
      await userEvent.click(confirmButton());
      await screen.findByRole('alert');

      view.rerender(
        <SessionProvider>
          <DeleteSubjectModal
            subject={{ id: 's2', name: 'Música', courses: [] }}
            onDeleted={onDeleted}
            onGone={onGone}
            onCancel={onCancel}
          />
        </SessionProvider>,
      );

      await screen.findByRole('dialog', { name: '¿Borrar la asignatura «Música»?' });
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

    const withoutCourses = renderModal({ subject: { ...subject, courses: [] } });
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
