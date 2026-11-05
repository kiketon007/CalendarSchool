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
import { scheduleService, type DiscardScheduleOutcome } from '../services/scheduleService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { DiscardScheduleDraftModal } from './DiscardScheduleDraftModal';

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

const texts = es.schedule.discard;
const SCHEDULE_ID = '0192f5a0-0000-7000-8000-0000000000a3';

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

const discardButton = () => screen.getByRole('button', { name: texts.confirm });
const cancelButton = () => screen.getByRole('button', { name: texts.cancel });

describe('DiscardScheduleDraftModal', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let discard: MockInstance<typeof scheduleService.discard>;
  let onDiscarded: Mock<() => void>;
  let onHide: Mock<() => void>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    discard = vi.spyOn(scheduleService, 'discard').mockResolvedValue({ status: 'discarded' });
    onDiscarded = vi.fn<() => void>();
    onHide = vi.fn<() => void>();
  });

  afterEach(async () => {
    refresh.mockRestore();
    discard.mockRestore();
    await i18n.changeLanguage('es');
  });

  const modalTree = (show: boolean) => (
    <MemoryRouter>
      <SessionProvider>
        <DiscardScheduleDraftModal
          show={show}
          scheduleId={SCHEDULE_ID}
          onDiscarded={onDiscarded}
          onHide={onHide}
        />
      </SessionProvider>
    </MemoryRouter>
  );
  const renderModal = (show = true) => render(modalTree(show));

  it('is a dialog named by its question, which says it cannot be undone and the official does not change', async () => {
    renderModal();

    const dialog = await screen.findByRole('dialog', { name: texts.title });
    expect(within(dialog).getByText(texts.body)).toBeVisible();
  });

  it('does not render anything while it is closed', () => {
    renderModal(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('sends one request for the draft and tells the page it was discarded', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('dialog');

    await user.click(discardButton());

    expect(discard).toHaveBeenCalledTimes(1);
    expect(discard.mock.calls[0]?.[1]).toBe(SCHEDULE_ID);
    await waitFor(() => {
      expect(onDiscarded).toHaveBeenCalledTimes(1);
    });
  });

  it('sends a single request on a double click, and shows it is working', async () => {
    const user = userEvent.setup();
    let finish: (outcome: DiscardScheduleOutcome) => void = () => undefined;
    discard.mockReturnValue(
      new Promise<DiscardScheduleOutcome>((resolve) => {
        finish = resolve;
      }),
    );
    renderModal();
    await screen.findByRole('dialog');

    await user.dblClick(discardButton());

    expect(discard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: texts.discarding })).toBeDisabled();
    expect(cancelButton()).toBeDisabled();
    finish({ status: 'discarded' });
    await waitFor(() => {
      expect(onDiscarded).toHaveBeenCalledTimes(1);
    });
  });

  it('does not close with Escape while it discards', async () => {
    const user = userEvent.setup();
    discard.mockReturnValue(new Promise<DiscardScheduleOutcome>(() => undefined));
    renderModal();
    await screen.findByRole('dialog');
    await user.click(discardButton());

    await user.keyboard('{Escape}');

    expect(onHide).not.toHaveBeenCalled();
  });

  it('closes without discarding on Cancel and on Escape', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('dialog');

    await user.click(cancelButton());
    await user.keyboard('{Escape}');

    expect(onHide).toHaveBeenCalledTimes(2);
    expect(discard).not.toHaveBeenCalled();
  });

  describe('when it cannot discard', () => {
    it('says the draft no longer exists and offers the way back, without closing', async () => {
      const user = userEvent.setup();
      discard.mockResolvedValue({ status: 'notFound' });
      renderModal();
      await screen.findByRole('dialog');

      await user.click(discardButton());

      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findByText(texts.gone)).toBeVisible();
      expect(within(dialog).getByRole('link', { name: texts.goneLink })).toHaveAttribute(
        'href',
        '/horarios',
      );
      expect(onDiscarded).not.toHaveBeenCalled();
      expect(onHide).not.toHaveBeenCalled();
    });

    it('says it was already confirmed or discarded', async () => {
      const user = userEvent.setup();
      discard.mockResolvedValue({ status: 'notDraft' });
      renderModal();
      await screen.findByRole('dialog');

      await user.click(discardButton());

      expect(await screen.findByText(texts.notDraft)).toBeVisible();
      expect(onDiscarded).not.toHaveBeenCalled();
    });

    it('shows an alert with Try again when the request fails, and tries again', async () => {
      const user = userEvent.setup();
      discard.mockResolvedValueOnce({ status: 'unavailable' });
      renderModal();
      await screen.findByRole('dialog');

      await user.click(discardButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.failed);
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(discard).toHaveBeenCalledTimes(2);
      await waitFor(() => {
        expect(onDiscarded).toHaveBeenCalledTimes(1);
      });
    });

    it('treats a forbidden answer as a failure, without discarding', async () => {
      const user = userEvent.setup();
      discard.mockResolvedValue({ status: 'forbidden' });
      renderModal();
      await screen.findByRole('dialog');

      await user.click(discardButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.failed);
      expect(onDiscarded).not.toHaveBeenCalled();
    });

    it('forgets the error when it is opened again', async () => {
      const user = userEvent.setup();
      discard.mockResolvedValue({ status: 'notDraft' });
      const view = renderModal();
      await screen.findByRole('dialog');
      await user.click(discardButton());
      await screen.findByText(texts.notDraft);

      view.rerender(modalTree(false));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      view.rerender(modalTree(true));
      await screen.findByRole('dialog');

      expect(screen.queryByText(texts.notDraft)).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has no WCAG violations, also in English and when it reports an error', async () => {
      const first = renderModal();
      await expect(wcagViolations(await screen.findByRole('dialog'))).resolves.toEqual([]);
      first.unmount();

      await i18n.changeLanguage('en');
      const second = renderModal();
      await expect(wcagViolations(await screen.findByRole('dialog'))).resolves.toEqual([]);
      second.unmount();

      await i18n.changeLanguage('es');
      const user = userEvent.setup();
      discard.mockResolvedValue({ status: 'notFound' });
      renderModal();
      await screen.findByRole('dialog');
      await user.click(discardButton());
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByText(texts.gone);
      await expect(wcagViolations(dialog)).resolves.toEqual([]);
    });
  });
});
