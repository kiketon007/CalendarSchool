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
  coursesService,
  type CourseImpact,
  type CourseImpactOutcome,
  type DeleteCourseOutcome,
} from '../services/coursesService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { DeleteCourseModal, type CourseToDelete } from './DeleteCourseModal';

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

const texts = es.courses.delete;
const course = { id: 'c1', name: '1º Primaria' };
const threeClasses: CourseImpact = { classCount: 3, studentCount: 0 };

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

describe('DeleteCourseModal', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let getImpact: MockInstance<typeof coursesService.getImpact>;
  let remove: MockInstance<typeof coursesService.delete>;
  let onDeleted: Mock<(course: CourseToDelete, deleted: CourseImpact) => void>;
  let onGone: Mock<() => void>;
  let onCancel: Mock<() => void>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    getImpact = vi
      .spyOn(coursesService, 'getImpact')
      .mockResolvedValue({ status: 'loaded', impact: threeClasses });
    remove = vi
      .spyOn(coursesService, 'delete')
      .mockResolvedValue({ status: 'deleted', deleted: threeClasses });
    onDeleted = vi.fn<(course: CourseToDelete, deleted: CourseImpact) => void>();
    onGone = vi.fn<() => void>();
    onCancel = vi.fn<() => void>();
  });

  afterEach(() => {
    refresh.mockRestore();
    getImpact.mockRestore();
    remove.mockRestore();
  });

  function renderModal(options: { course?: typeof course | null; strict?: boolean } = {}) {
    const tree = (
      <SessionProvider>
        <DeleteCourseModal
          course={options.course === undefined ? course : options.course}
          onDeleted={onDeleted}
          onGone={onGone}
          onCancel={onCancel}
        />
      </SessionProvider>
    );
    return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  describe('asking for the impact', () => {
    it('renders nothing while there is no course', () => {
      renderModal({ course: null });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(getImpact).not.toHaveBeenCalled();
    });

    it('asks once for the impact of the course, also in strict mode, and shows a status meanwhile', async () => {
      getImpact.mockImplementation(() => new Promise<CourseImpactOutcome>(() => undefined));

      renderModal({ strict: true });

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('status')).toHaveTextContent(texts.loading);
      expect(confirmButton()).toBeDisabled();
      expect(getImpact).toHaveBeenCalledTimes(1);
      expect(getImpact.mock.calls[0]?.[1]).toBe('c1');
    });

    it('is a dialog named by its title, which names the course as plain text', async () => {
      renderModal({ course: { id: 'c1', name: '<b>1º</b> Primaria' } });

      const dialog = await screen.findByRole('dialog', { name: '¿Borrar «<b>1º</b> Primaria»?' });
      expect(dialog.querySelector('b')).toBeNull();
    });

    it('says how many classes will be deleted, with its plural, and that it cannot be undone', async () => {
      renderModal();

      expect(await screen.findByText('Se borrarán sus 3 clases.')).toBeVisible();
      expect(screen.getByText(texts.warning)).toBeVisible();
      expect(confirmButton()).toBeEnabled();
    });

    it('uses the singular for a single class', async () => {
      getImpact.mockResolvedValue({ status: 'loaded', impact: { classCount: 1, studentCount: 0 } });

      renderModal();

      expect(await screen.findByText('Se borrará su clase.')).toBeVisible();
    });

    it('tells how many students are assigned only when there are some', async () => {
      getImpact.mockResolvedValue({
        status: 'loaded',
        impact: { classCount: 3, studentCount: 12 },
      });

      renderModal();

      expect(await screen.findByText('Tiene 12 alumnos asignados.')).toBeVisible();
    });

    it('does not mention students when there are none', async () => {
      renderModal();

      await screen.findByText('Se borrarán sus 3 clases.');
      expect(screen.queryByText(/alumno/)).toBeNull();
    });

    it('asks again, for the new course, when the course changes', async () => {
      const view = renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');

      view.rerender(
        <SessionProvider>
          <DeleteCourseModal
            course={{ id: 'c2', name: '2º Primaria' }}
            onDeleted={onDeleted}
            onGone={onGone}
            onCancel={onCancel}
          />
        </SessionProvider>,
      );

      await waitFor(() => {
        expect(getImpact).toHaveBeenCalledTimes(2);
      });
      expect(getImpact.mock.calls[1]?.[1]).toBe('c2');
    });

    it('shows an alert with "Reintentar" when the impact cannot be read, keeps Delete disabled and retries', async () => {
      getImpact.mockResolvedValueOnce({ status: 'unavailable' });

      renderModal();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);
      expect(confirmButton()).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: es.courses.retry }));
      expect(await screen.findByText('Se borrarán sus 3 clases.')).toBeVisible();
      expect(confirmButton()).toBeEnabled();
      expect(getImpact).toHaveBeenCalledTimes(2);
    });

    it('calls onGone, and nothing else, when the course no longer exists', async () => {
      getImpact.mockResolvedValue({ status: 'notFound' });

      renderModal();

      await waitFor(() => {
        expect(onGone).toHaveBeenCalledTimes(1);
      });
      expect(onDeleted).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe('cancelling', () => {
    it('starts with the focus on Cancel, the safe choice', async () => {
      renderModal();

      await screen.findByRole('dialog');
      await waitFor(() => {
        expect(cancelButton()).toHaveFocus();
      });
    });

    it('calls onCancel and sends nothing when Cancel is pressed', async () => {
      renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');

      await userEvent.click(cancelButton());

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(remove).not.toHaveBeenCalled();
    });

    it('calls onCancel and sends nothing when Escape is pressed', async () => {
      renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');

      await userEvent.keyboard('{Escape}');

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(remove).not.toHaveBeenCalled();
    });

    it('has no close button in the header, whose name would clash with Cancel', async () => {
      renderModal();
      await screen.findByRole('dialog');

      expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
        texts.cancel,
        texts.confirm,
      ]);
    });
  });

  describe('deleting', () => {
    it('sends a single DELETE for the course and reports what was really deleted', async () => {
      remove.mockResolvedValue({ status: 'deleted', deleted: { classCount: 2, studentCount: 5 } });
      renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledTimes(1);
      });
      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove.mock.calls[0]?.[1]).toBe('c1');
      expect(onDeleted).toHaveBeenCalledWith(course, { classCount: 2, studentCount: 5 });
    });

    it('sends a single request when Delete is pressed twice in a row, and disables both buttons meanwhile', async () => {
      let resolve: (outcome: DeleteCourseOutcome) => void = () => undefined;
      remove.mockReturnValue(
        new Promise<DeleteCourseOutcome>((done) => {
          resolve = done;
        }),
      );
      renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');

      await userEvent.dblClick(confirmButton());

      expect(remove).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: texts.deleting })).toBeDisabled();
      expect(cancelButton()).toBeDisabled();
      resolve({ status: 'deleted', deleted: threeClasses });
      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledTimes(1);
      });
    });

    it('ignores Escape while deleting', async () => {
      remove.mockReturnValue(new Promise<DeleteCourseOutcome>(() => undefined));
      renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');
      await userEvent.click(confirmButton());

      await userEvent.keyboard('{Escape}');

      expect(onCancel).not.toHaveBeenCalled();
    });

    it('calls onGone when the course was already deleted by someone else', async () => {
      remove.mockResolvedValue({ status: 'notFound' });
      renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(onGone).toHaveBeenCalledTimes(1);
      });
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('keeps the dialog open with an alert, without technical details, when deleting fails, and allows trying again', async () => {
      remove.mockResolvedValueOnce({ status: 'unavailable' });
      renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');

      await userEvent.click(confirmButton());

      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(texts.error);
      expect(confirmButton()).toBeEnabled();
      expect(cancelButton()).toBeEnabled();
      expect(onDeleted).not.toHaveBeenCalled();

      await userEvent.click(confirmButton());
      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledTimes(1);
      });
      expect(remove).toHaveBeenCalledTimes(2);
    });

    it('does nothing visible when the session is no longer valid (the layout redirects)', async () => {
      remove.mockResolvedValue({ status: 'unauthenticated' });
      renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');

      await userEvent.click(confirmButton());

      await waitFor(() => {
        expect(remove).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(onDeleted).not.toHaveBeenCalled();
      expect(onGone).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has no WCAG violations while loading', async () => {
      getImpact.mockImplementation(() => new Promise<CourseImpactOutcome>(() => undefined));
      renderModal();
      await screen.findByRole('dialog');

      expect(await wcagViolations(document.body)).toEqual([]);
    });

    it('has no WCAG violations with the impact', async () => {
      getImpact.mockResolvedValue({
        status: 'loaded',
        impact: { classCount: 3, studentCount: 12 },
      });
      renderModal();
      await screen.findByText('Tiene 12 alumnos asignados.');

      expect(await wcagViolations(document.body)).toEqual([]);
    });

    it('has no WCAG violations when the impact cannot be read', async () => {
      getImpact.mockResolvedValue({ status: 'unavailable' });
      renderModal();
      await screen.findByRole('alert');

      expect(await wcagViolations(document.body)).toEqual([]);
    });

    it('has no WCAG violations when deleting fails', async () => {
      remove.mockResolvedValue({ status: 'unavailable' });
      renderModal();
      await screen.findByText('Se borrarán sus 3 clases.');
      await userEvent.click(confirmButton());
      await screen.findByRole('alert');

      expect(await wcagViolations(document.body)).toEqual([]);
    });
  });
});
