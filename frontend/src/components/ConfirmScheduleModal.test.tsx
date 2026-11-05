import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
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
import { scheduleDraftService } from '../services/scheduleDraftService';
import {
  scheduleService,
  type ConfirmScheduleOutcome,
  type ScheduleSummary,
} from '../services/scheduleService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { exportDraft, exportIndex } from '../testSupport/exportDraft';
import { indexDraft } from '../utils/scheduleDraftViews';
import { ConfirmScheduleModal } from './ConfirmScheduleModal';

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

const texts = es.schedule.confirm;
const SCHEDULE_ID = exportDraft.id;
const confirmed: ScheduleSummary = {
  id: SCHEDULE_ID,
  status: 'OFFICIAL',
  generatedAt: exportDraft.generatedAt,
  placedSessions: 7,
  confirmedAt: '2026-11-05T09:10:00.000Z',
  confirmedBy: { firstName: 'José María', lastName: 'García-López' },
  replacedAt: null,
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

const confirmButton = () => screen.getByRole('button', { name: texts.confirm });
const cancelButton = () => screen.getByRole('button', { name: texts.cancel });

describe('ConfirmScheduleModal', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let confirm: MockInstance<typeof scheduleService.confirm>;
  let getDraft: MockInstance<typeof scheduleDraftService.getDraft>;
  let onConfirmed: Mock<(schedule: ScheduleSummary) => void>;
  let onHide: Mock<() => void>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    confirm = vi
      .spyOn(scheduleService, 'confirm')
      .mockResolvedValue({ status: 'confirmed', schedule: confirmed });
    getDraft = vi
      .spyOn(scheduleDraftService, 'getDraft')
      .mockResolvedValue({ status: 'loaded', schedule: exportDraft });
    onConfirmed = vi.fn<(schedule: ScheduleSummary) => void>();
    onHide = vi.fn<() => void>();
  });

  afterEach(async () => {
    refresh.mockRestore();
    confirm.mockRestore();
    getDraft.mockRestore();
    await i18n.changeLanguage('es');
  });

  function renderModal(
    options: {
      index?: typeof exportIndex | null;
      officialConfirmedAt?: string | null;
      show?: boolean;
    } = {},
  ) {
    return render(
      <MemoryRouter>
        <SessionProvider>
          <ConfirmScheduleModal
            show={options.show ?? true}
            scheduleId={SCHEDULE_ID}
            officialConfirmedAt={options.officialConfirmedAt ?? null}
            index={options.index === undefined ? exportIndex : options.index}
            onConfirmed={onConfirmed}
            onHide={onHide}
          />
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  describe('what it says', () => {
    it('is a dialog named by its question, which explains what confirming does', async () => {
      renderModal();

      const dialog = await screen.findByRole('dialog', { name: texts.title });
      expect(within(dialog).getByText(texts.body)).toBeVisible();
    });

    it('does not talk about replacing when there is no official yet', async () => {
      renderModal();
      await screen.findByRole('dialog');

      expect(screen.queryByText(/Sustituirá/u)).not.toBeInTheDocument();
    });

    it('says which official it replaces, and that it is kept', async () => {
      renderModal({ officialConfirmedAt: '2026-11-03T10:00:00.000Z' });

      const dialog = await screen.findByRole('dialog');
      const date = new Intl.DateTimeFormat('es', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date('2026-11-03T10:00:00.000Z'));
      expect(dialog).toHaveTextContent(`Sustituirá al horario oficial confirmado el ${date}`);
      expect(dialog).toHaveTextContent('se conserva');
    });

    it('lists what changed since it was generated, with its plurals, and says it can still be confirmed', async () => {
      renderModal();

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(texts.gapsTitle)).toBeVisible();
      expect(within(dialog).getByText('2 sesiones sin profesor')).toBeVisible();
      expect(within(dialog).getByText('1 sesión fuera del calendario actual')).toBeVisible();
      expect(within(dialog).getByText('1 curso sin calendario')).toBeVisible();
      expect(within(dialog).getByText(texts.gapsNote)).toBeVisible();
      expect(confirmButton()).toBeEnabled();
    });

    it('says nothing about changes when the schedule still matches the data', async () => {
      const clean = indexDraft({
        ...exportDraft,
        courses: exportDraft.courses.filter(({ calendar }) => calendar !== null),
        entries: exportDraft.entries.filter(
          ({ professorId, sessionNumber, courseId }) =>
            professorId !== null && sessionNumber <= 3 && courseId !== 'course-7',
        ),
      });
      renderModal({ index: clean });
      await screen.findByRole('dialog');

      expect(screen.queryByText(texts.gapsTitle)).not.toBeInTheDocument();
    });

    it('writes the numbers as plain text, not as markup', async () => {
      renderModal();
      const dialog = await screen.findByRole('dialog');

      expect(dialog.querySelector('script, img')).toBeNull();
    });
  });

  describe('when the page has not loaded the draft', () => {
    it('asks for it once on opening to count what changed, also in strict mode', async () => {
      renderModal({ index: null });

      expect(await screen.findByText('2 sesiones sin profesor')).toBeVisible();
      expect(getDraft).toHaveBeenCalledTimes(1);
    });

    it('does not ask for it when the page already has it', async () => {
      renderModal();
      await screen.findByRole('dialog');

      expect(getDraft).not.toHaveBeenCalled();
    });

    it('lets confirm while it loads, and without numbers if it cannot', async () => {
      getDraft.mockResolvedValue({ status: 'unavailable' });
      renderModal({ index: null });
      await screen.findByRole('dialog');

      expect(confirmButton()).toBeEnabled();
      await waitFor(() => {
        expect(getDraft).toHaveBeenCalled();
      });
      expect(screen.queryByText(texts.gapsTitle)).not.toBeInTheDocument();
    });

    it('does not count what changed in a draft that is not the one being confirmed', async () => {
      getDraft.mockResolvedValue({
        status: 'loaded',
        schedule: { ...exportDraft, id: 'another-draft' },
      });
      renderModal({ index: null });
      await screen.findByRole('dialog');
      await waitFor(() => {
        expect(getDraft).toHaveBeenCalled();
      });

      expect(screen.queryByText(texts.gapsTitle)).not.toBeInTheDocument();
    });
  });

  describe('confirming', () => {
    it('sends one confirmation for the draft and hands the confirmed schedule over', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.click(confirmButton());

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm.mock.calls[0]?.[1]).toBe(SCHEDULE_ID);
      await waitFor(() => {
        expect(onConfirmed).toHaveBeenCalledExactlyOnceWith(confirmed);
      });
    });

    it('sends a single request on a double click, and shows it is working', async () => {
      const user = userEvent.setup();
      let finish: (outcome: ConfirmScheduleOutcome) => void = () => undefined;
      confirm.mockReturnValue(
        new Promise<ConfirmScheduleOutcome>((resolve) => {
          finish = resolve;
        }),
      );
      renderModal();
      await screen.findByRole('dialog');

      await user.dblClick(confirmButton());

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: texts.confirming })).toBeDisabled();
      expect(cancelButton()).toBeDisabled();
      finish({ status: 'confirmed', schedule: confirmed });
      await waitFor(() => {
        expect(onConfirmed).toHaveBeenCalledTimes(1);
      });
    });

    it('does not close with Escape while it confirms', async () => {
      const user = userEvent.setup();
      confirm.mockReturnValue(new Promise<ConfirmScheduleOutcome>(() => undefined));
      renderModal();
      await screen.findByRole('dialog');
      await user.click(confirmButton());

      await user.keyboard('{Escape}');

      expect(onHide).not.toHaveBeenCalled();
    });

    it('closes without confirming on Cancel and on Escape', async () => {
      const user = userEvent.setup();
      renderModal();
      await screen.findByRole('dialog');

      await user.click(cancelButton());
      await user.keyboard('{Escape}');

      expect(onHide).toHaveBeenCalledTimes(2);
      expect(confirm).not.toHaveBeenCalled();
    });
  });

  describe('when it cannot confirm', () => {
    it('says the draft no longer exists and offers the way back, without closing', async () => {
      const user = userEvent.setup();
      confirm.mockResolvedValue({ status: 'notFound' });
      renderModal();
      await screen.findByRole('dialog');

      await user.click(confirmButton());

      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findByText(texts.gone)).toBeVisible();
      expect(within(dialog).getByRole('link', { name: texts.goneLink })).toHaveAttribute(
        'href',
        '/horarios',
      );
      expect(onConfirmed).not.toHaveBeenCalled();
      expect(onHide).not.toHaveBeenCalled();
    });

    it('says it was already confirmed or discarded', async () => {
      const user = userEvent.setup();
      confirm.mockResolvedValue({ status: 'notDraft' });
      renderModal();
      await screen.findByRole('dialog');

      await user.click(confirmButton());

      expect(await screen.findByText(texts.notDraft)).toBeVisible();
      expect(onConfirmed).not.toHaveBeenCalled();
    });

    it('shows an alert with Try again when the request fails, and tries again', async () => {
      const user = userEvent.setup();
      confirm.mockResolvedValueOnce({ status: 'unavailable' });
      renderModal();
      await screen.findByRole('dialog');

      await user.click(confirmButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.failed);
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(confirm).toHaveBeenCalledTimes(2);
      await waitFor(() => {
        expect(onConfirmed).toHaveBeenCalledTimes(1);
      });
    });

    it('treats a forbidden answer as a failure, without confirming', async () => {
      const user = userEvent.setup();
      confirm.mockResolvedValue({ status: 'forbidden' });
      renderModal();
      await screen.findByRole('dialog');

      await user.click(confirmButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.failed);
      expect(onConfirmed).not.toHaveBeenCalled();
    });

    it('forgets the error when it is opened again', async () => {
      const user = userEvent.setup();
      confirm.mockResolvedValue({ status: 'notDraft' });
      const view = renderModal();
      await screen.findByRole('dialog');
      await user.click(confirmButton());
      await screen.findByText(texts.notDraft);

      view.rerender(
        <MemoryRouter>
          <SessionProvider>
            <ConfirmScheduleModal
              show={false}
              scheduleId={SCHEDULE_ID}
              officialConfirmedAt={null}
              index={exportIndex}
              onConfirmed={onConfirmed}
              onHide={onHide}
            />
          </SessionProvider>
        </MemoryRouter>,
      );
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      view.rerender(
        <MemoryRouter>
          <SessionProvider>
            <ConfirmScheduleModal
              show
              scheduleId={SCHEDULE_ID}
              officialConfirmedAt={null}
              index={exportIndex}
              onConfirmed={onConfirmed}
              onHide={onHide}
            />
          </SessionProvider>
        </MemoryRouter>,
      );
      await screen.findByRole('dialog');

      expect(screen.queryByText(texts.notDraft)).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has no WCAG violations, with changes, with an official to replace and in English', async () => {
      const { unmount } = renderModal({ officialConfirmedAt: '2026-11-03T10:00:00.000Z' });
      const dialog = await screen.findByRole('dialog');
      await expect(wcagViolations(dialog)).resolves.toEqual([]);
      unmount();

      await i18n.changeLanguage('en');
      renderModal();
      await expect(wcagViolations(await screen.findByRole('dialog'))).resolves.toEqual([]);
    });

    it('has no WCAG violations when it reports an error', async () => {
      const user = userEvent.setup();
      confirm.mockResolvedValue({ status: 'notFound' });
      renderModal();
      await screen.findByRole('dialog');
      await user.click(confirmButton());
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByText(texts.gone);

      await expect(wcagViolations(dialog)).resolves.toEqual([]);
    });
  });
});
