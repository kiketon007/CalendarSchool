import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import {
  scheduleGenerationService,
  type CancelGenerationOutcome,
  type CurrentGenerationOutcome,
  type Generation,
  type LoadGenerationOutcome,
  type StartGenerationOutcome,
} from '../services/scheduleGenerationService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { ScheduleGenerationPanel } from './ScheduleGenerationPanel';

const texts = es.schedule.generation;
const POLL_MS = 2000;

const session: SessionData = {
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

const GENERATION_ID = '0192f5a0-0000-7000-8000-0000000000f1';
const CREATED_AT = '2026-11-04T08:00:00.000Z';

const queued: Generation = {
  id: GENERATION_ID,
  status: 'QUEUED',
  progress: 0,
  placed: 0,
  total: 0,
  errorCode: null,
  errorMessage: null,
  errorDetails: null,
  scheduleId: null,
  createdAt: CREATED_AT,
  startedAt: null,
  finishedAt: null,
};
const running = (placed: number, total = 50): Generation => ({
  ...queued,
  status: 'RUNNING',
  progress: Math.round((100 * placed) / total),
  placed,
  total,
  startedAt: CREATED_AT,
});
const completed: Generation = {
  ...running(50),
  status: 'COMPLETED',
  progress: 100,
  scheduleId: '0192f5a0-0000-7000-8000-0000000000a2',
  finishedAt: CREATED_AT,
};
const cancelled: Generation = { ...running(20), status: 'CANCELLED', finishedAt: CREATED_AT };

/** Una promesa que el test resuelve cuando quiere. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ScheduleGenerationPanel', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let current: MockInstance<typeof scheduleGenerationService.current>;
  let get: MockInstance<typeof scheduleGenerationService.get>;
  let start: MockInstance<typeof scheduleGenerationService.start>;
  let cancel: MockInstance<typeof scheduleGenerationService.cancel>;
  const onNotReady = vi.fn<() => void>();

  beforeEach(() => {
    vi.useFakeTimers();
    refresh = vi.spyOn(sessionService, 'refresh');
    refresh.mockResolvedValue({ status: 'authenticated', data: session });
    current = vi.spyOn(scheduleGenerationService, 'current');
    get = vi.spyOn(scheduleGenerationService, 'get');
    start = vi.spyOn(scheduleGenerationService, 'start');
    cancel = vi.spyOn(scheduleGenerationService, 'cancel');
    onNotReady.mockReset();
  });

  afterEach(async () => {
    refresh.mockRestore();
    current.mockRestore();
    get.mockRestore();
    start.mockRestore();
    cancel.mockRestore();
    vi.useRealTimers();
    await i18n.changeLanguage('es');
  });

  /** Deja pasar el tiempo simulado y las promesas pendientes. */
  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  function currentIs(generation: Generation | null) {
    const outcome: CurrentGenerationOutcome = { status: 'loaded', generation };
    current.mockResolvedValue(outcome);
  }

  function renderPanel(props: { isAdmin?: boolean; blocked?: boolean } = {}, strict = false) {
    const tree = (
      <MemoryRouter>
        <SessionProvider>
          <ScheduleGenerationPanel
            isAdmin={props.isAdmin ?? true}
            blocked={props.blocked ?? false}
            onNotReady={onNotReady}
          />
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  describe('polling', () => {
    it('asks for the current generation once, also in strict mode', async () => {
      currentIs(null);
      renderPanel({}, true);
      await advance(0);

      expect(current).toHaveBeenCalledTimes(1);
    });

    it.each<[string, Generation | null]>([
      ['there is no generation', null],
      ['it already completed', completed],
      ['it was cancelled', cancelled],
    ])('does not poll when %s', async (_name, generation) => {
      currentIs(generation);
      renderPanel();
      await advance(0);

      await advance(10 * POLL_MS);

      expect(get).not.toHaveBeenCalled();
    });

    it('resumes a running generation after a reload and polls it every 2 seconds', async () => {
      currentIs(running(5));
      const outcome: LoadGenerationOutcome = { status: 'loaded', generation: running(20) };
      get.mockResolvedValue(outcome);
      renderPanel();
      await advance(0);

      expect(screen.getByText('5 de 50 sesiones')).toBeInTheDocument();
      await advance(POLL_MS - 1);
      expect(get).not.toHaveBeenCalled();
      await advance(1);

      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0]?.[1]).toBe(GENERATION_ID);
      expect(screen.getByText('20 de 50 sesiones')).toBeInTheDocument();
    });

    it('chains the timer: it does not ask again until the previous answer arrived', async () => {
      currentIs(running(5));
      const pending = deferred<LoadGenerationOutcome>();
      get.mockReturnValue(pending.promise);
      renderPanel();
      await advance(0);

      await advance(POLL_MS);
      expect(get).toHaveBeenCalledTimes(1);
      await advance(3 * POLL_MS);
      expect(get).toHaveBeenCalledTimes(1);

      get.mockResolvedValue({ status: 'loaded', generation: running(30) });
      await act(async () => {
        pending.resolve({ status: 'loaded', generation: running(10) });
        await vi.advanceTimersByTimeAsync(POLL_MS - 1);
      });
      expect(get).toHaveBeenCalledTimes(1);
      await advance(1);

      expect(get).toHaveBeenCalledTimes(2);
    });

    it('stops polling when the generation finishes', async () => {
      currentIs(running(5));
      get.mockResolvedValue({ status: 'loaded', generation: completed });
      renderPanel();
      await advance(0);

      await advance(POLL_MS);
      await advance(10 * POLL_MS);

      expect(get).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Horario borrador generado/)).toBeInTheDocument();
    });

    it('stops polling when it is unmounted and ignores a late answer', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      currentIs(running(5));
      const pending = deferred<LoadGenerationOutcome>();
      get.mockReturnValue(pending.promise);
      const view = renderPanel();
      await advance(0);
      await advance(POLL_MS);
      expect(get).toHaveBeenCalledTimes(1);

      view.unmount();
      await act(async () => {
        pending.resolve({ status: 'loaded', generation: running(40) });
        await vi.advanceTimersByTimeAsync(10 * POLL_MS);
      });

      expect(get).toHaveBeenCalledTimes(1);
      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });

    it('does not start polling if it is unmounted before the first answer', async () => {
      const pending = deferred<CurrentGenerationOutcome>();
      current.mockReturnValue(pending.promise);
      const view = renderPanel();
      await advance(0);

      view.unmount();
      await act(async () => {
        pending.resolve({ status: 'loaded', generation: running(5) });
        await vi.advanceTimersByTimeAsync(10 * POLL_MS);
      });

      expect(get).not.toHaveBeenCalled();
    });

    it('discards a poll answer that arrives after the administrator cancelled', async () => {
      currentIs(running(5));
      const pending = deferred<LoadGenerationOutcome>();
      get.mockReturnValue(pending.promise);
      const cancelOutcome: CancelGenerationOutcome = { status: 'loaded', generation: cancelled };
      cancel.mockResolvedValue(cancelOutcome);
      renderPanel();
      await advance(0);
      await advance(POLL_MS);

      fireEvent.click(screen.getByRole('button', { name: texts.cancel }));
      await advance(0);
      await act(async () => {
        pending.resolve({ status: 'loaded', generation: running(40) });
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(screen.getByText(texts.cancelled)).toBeInTheDocument();
      expect(screen.queryByText('40 de 50 sesiones')).not.toBeInTheDocument();
    });

    it('keeps polling after a failure, warns, and the warning goes away with the next answer', async () => {
      currentIs(running(5));
      get.mockResolvedValueOnce({ status: 'unavailable' });
      get.mockResolvedValue({ status: 'loaded', generation: running(25) });
      renderPanel();
      await advance(0);

      await advance(POLL_MS);
      expect(screen.getByText(texts.progressStale)).toBeInTheDocument();
      await advance(POLL_MS);

      expect(get).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(texts.progressStale)).not.toBeInTheDocument();
      expect(screen.getByText('25 de 50 sesiones')).toBeInTheDocument();
    });

    it('does not use the start endpoint just by opening', async () => {
      currentIs(running(5));
      get.mockResolvedValue({ status: 'loaded', generation: running(6) });
      renderPanel();
      await advance(POLL_MS);

      expect(start).not.toHaveBeenCalled();
    });
  });

  const lesson = {
    course: { id: 'c1', name: '1º Primaria' },
    class: { id: 'k1', name: 'A' },
    subject: { id: 's1', name: 'Inglés' },
    professor: { id: 'p1', name: 'Eva García' },
  };
  const failed = (
    errorCode: NonNullable<Generation['errorCode']>,
    errorDetails: Generation['errorDetails'] = null,
  ): Generation => ({
    ...running(20),
    status: 'FAILED',
    errorCode,
    errorMessage: 'Error: secret stack trace at db.ts:42',
    errorDetails,
    finishedAt: CREATED_AT,
  });

  describe('states', () => {
    it('shows the title and a status while it asks for the current generation', async () => {
      current.mockReturnValue(new Promise(() => undefined));
      renderPanel();
      await advance(0);

      expect(screen.getByRole('heading', { level: 2, name: texts.title })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
    });

    it('shows an alert with a button to retry when it cannot be loaded, and asks again', async () => {
      current.mockResolvedValueOnce({ status: 'unavailable' });
      currentIs(null);
      renderPanel();
      await advance(0);

      expect(screen.getByRole('alert')).toHaveTextContent(texts.loadError);
      fireEvent.click(screen.getByRole('button', { name: texts.retry }));
      await advance(0);

      expect(current).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: texts.generate })).toBeEnabled();
    });

    it('offers to generate when the school never did', async () => {
      currentIs(null);
      renderPanel();
      await advance(0);

      expect(screen.getByRole('button', { name: texts.generate })).toBeEnabled();
      expect(screen.queryByRole('button', { name: texts.cancel })).not.toBeInTheDocument();
    });

    it('shows the progress bar with its name, range, value and text, and a cancel button, while generating', async () => {
      currentIs(running(20));
      get.mockReturnValue(new Promise(() => undefined));
      renderPanel();
      await advance(0);

      expect(screen.getByRole('status')).toHaveTextContent(texts.running);
      const bar = screen.getByRole('progressbar', { name: texts.progress.label });
      expect(bar).toHaveAttribute('aria-valuemin', '0');
      expect(bar).toHaveAttribute('aria-valuemax', '100');
      expect(bar).toHaveAttribute('aria-valuenow', '40');
      expect(bar).toHaveAttribute('aria-valuetext', '20 de 50 sesiones');
      expect(screen.getByText('20 de 50 sesiones')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: texts.cancel })).toBeEnabled();
      expect(screen.getByRole('button', { name: texts.generate })).toBeDisabled();
    });

    it('says it is queued, and that it is preparing, before the worker counts the sessions', async () => {
      currentIs(queued);
      get.mockReturnValue(new Promise(() => undefined));
      renderPanel();
      await advance(0);

      expect(screen.getByRole('status')).toHaveTextContent(texts.queued);
      expect(screen.getByText(texts.progress.preparing)).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });

    it.each<[number, string]>([
      [50, 'Horario borrador generado: 50 sesiones colocadas'],
      [1, 'Horario borrador generado: 1 sesión colocada'],
    ])('shows the summary of a completed generation with %i sessions', async (placed, summary) => {
      currentIs({ ...completed, placed });
      renderPanel();
      await advance(0);

      expect(screen.getByRole('status')).toHaveTextContent(summary);
      expect(screen.getByText(texts.completedNote)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: texts.generateAgain })).toBeEnabled();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('shows a cancelled generation and offers to generate again', async () => {
      currentIs(cancelled);
      renderPanel();
      await advance(0);

      expect(screen.getByRole('status')).toHaveTextContent(texts.cancelled);
      expect(screen.getByRole('button', { name: texts.generateAgain })).toBeEnabled();
    });

    describe('failures', () => {
      it('shows a timeout with what to relax, as an alert', async () => {
        currentIs(failed('TIMEOUT'));
        renderPanel();
        await advance(0);

        expect(screen.getByRole('alert')).toHaveTextContent(texts.failed.TIMEOUT);
        expect(screen.getByRole('button', { name: texts.generateAgain })).toBeEnabled();
      });

      it('shows the id of an internal error and never its trace', async () => {
        currentIs(failed('INTERNAL'));
        renderPanel();
        await advance(0);

        expect(screen.getByRole('alert')).toHaveTextContent(
          `Error interno durante la generación. Inténtalo de nuevo o contacta con soporte (ID: ${GENERATION_ID}).`,
        );
        expect(screen.queryByText(/secret stack trace/)).not.toBeInTheDocument();
      });

      it('explains a school that is no longer ready', async () => {
        currentIs(failed('NOT_READY'));
        renderPanel();
        await advance(0);

        expect(screen.getByRole('alert')).toHaveTextContent(texts.failed.NOT_READY);
      });

      it.each<[string, string, string, string]>([
        ['CLASS_BUSY', 'Revisar la carga de 1º Primaria', '/cursos/c1/carga', 'reasonNote'],
        ['DAILY_RULE', 'Revisar la carga de 1º Primaria', '/cursos/c1/carga', 'reasonNote'],
        ['NO_FREE_CELLS', 'Revisar la carga de 1º Primaria', '/cursos/c1/carga', ''],
        [
          'PROFESSOR_BUSY',
          'Revisar la disponibilidad de Eva García',
          '/profesores/p1/disponibilidad',
          'reasonNote',
        ],
        [
          'MAX_HOURS',
          'Revisar los profesores de 1º Primaria',
          '/cursos/c1/profesores',
          'reasonNote',
        ],
      ])(
        'explains an infeasible generation because of %s and links to where it is fixed',
        async (reason, linkName, href, note) => {
          currentIs(
            failed('INFEASIBLE', {
              reason: reason as NonNullable<Generation['errorDetails']>['reason'],
              lesson,
            }),
          );
          renderPanel();
          await advance(0);

          const alert = screen.getByRole('alert');
          expect(alert).toHaveTextContent(texts.failed.INFEASIBLE);
          expect(alert).toHaveTextContent(
            texts.failed.reasons[reason as keyof typeof texts.failed.reasons],
          );
          expect(alert).toHaveTextContent(
            'Sesión afectada: Inglés en 1º Primaria A, con Eva García.',
          );
          if (note === '') {
            expect(alert).not.toHaveTextContent(texts.failed.reasonNote);
          } else {
            expect(alert).toHaveTextContent(texts.failed.reasonNote);
          }
          expect(screen.getByRole('link', { name: linkName })).toHaveAttribute('href', href);
        },
      );

      it('explains an infeasible generation that points at no lesson, without links', async () => {
        currentIs(failed('INFEASIBLE', { reason: 'NO_FREE_CELLS', lesson: null }));
        renderPanel();
        await advance(0);

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(texts.failed.reasons.NO_FREE_CELLS);
        expect(alert).not.toHaveTextContent('Sesión afectada');
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
      });

      it('shows the names of the lesson as text, never as markup', async () => {
        currentIs(
          failed('INFEASIBLE', {
            reason: 'CLASS_BUSY',
            lesson: { ...lesson, subject: { id: 's1', name: '<b>Inglés</b>' } },
          }),
        );
        renderPanel();
        await advance(0);

        expect(screen.getByRole('alert')).toHaveTextContent('<b>Inglés</b>');
        expect(screen.getByRole('alert').querySelector('b')).toBeNull();
      });

      it('asks to repeat the readiness check when a generation fails because the school is not ready', async () => {
        currentIs(running(5));
        get.mockResolvedValue({ status: 'loaded', generation: failed('NOT_READY') });
        renderPanel();
        await advance(0);
        expect(onNotReady).not.toHaveBeenCalled();

        await advance(POLL_MS);

        expect(onNotReady).toHaveBeenCalledTimes(1);
      });
    });

    describe('starting', () => {
      it('starts once even if the button is pressed twice, and shows the generation', async () => {
        currentIs(null);
        const pending = deferred<StartGenerationOutcome>();
        start.mockReturnValue(pending.promise);
        get.mockReturnValue(new Promise(() => undefined));
        renderPanel();
        await advance(0);

        const button = screen.getByRole('button', { name: texts.generate });
        fireEvent.click(button);
        fireEvent.click(button);
        await advance(0);
        expect(button).toBeDisabled();
        await act(async () => {
          pending.resolve({ status: 'started', generation: queued });
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(start).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('status')).toHaveTextContent(texts.queued);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });

      it('moves the focus to the state when it starts, so the disabled button does not lose it', async () => {
        currentIs(null);
        start.mockResolvedValue({ status: 'started', generation: queued });
        get.mockReturnValue(new Promise(() => undefined));
        renderPanel();
        await advance(0);

        fireEvent.click(screen.getByRole('button', { name: texts.generate }));
        await advance(0);

        expect(screen.getByRole('status')).toHaveFocus();
      });

      it('tells the readiness page to check again when the server says it is not ready', async () => {
        currentIs(null);
        start.mockResolvedValue({ status: 'notReady' });
        renderPanel();
        await advance(0);

        fireEvent.click(screen.getByRole('button', { name: texts.generate }));
        await advance(0);

        expect(screen.getByRole('alert')).toHaveTextContent(texts.errors.notReady);
        expect(onNotReady).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: texts.generate })).toBeEnabled();
      });

      it('shows the generation that is already in progress when someone else started it', async () => {
        currentIs(null);
        start.mockResolvedValue({ status: 'inProgress' });
        get.mockReturnValue(new Promise(() => undefined));
        renderPanel();
        await advance(0);
        currentIs(running(10));

        fireEvent.click(screen.getByRole('button', { name: texts.generate }));
        await advance(0);

        expect(current).toHaveBeenCalledTimes(2);
        expect(screen.getByText('10 de 50 sesiones')).toBeInTheDocument();
      });

      it.each<[string, StartGenerationOutcome, string]>([
        ['forbidden', { status: 'forbidden' }, texts.errors.forbidden],
        ['unavailable', { status: 'unavailable' }, texts.errors.start],
      ])('shows an alert and lets it try again on %s', async (_name, outcome, message) => {
        currentIs(null);
        start.mockResolvedValue(outcome);
        renderPanel();
        await advance(0);

        fireEvent.click(screen.getByRole('button', { name: texts.generate }));
        await advance(0);

        expect(screen.getByRole('alert')).toHaveTextContent(message);
        expect(screen.getByRole('button', { name: texts.generate })).toBeEnabled();
      });

      it('clears the previous alert when it tries again', async () => {
        currentIs(null);
        start.mockResolvedValueOnce({ status: 'unavailable' });
        start.mockReturnValue(new Promise(() => undefined));
        renderPanel();
        await advance(0);
        fireEvent.click(screen.getByRole('button', { name: texts.generate }));
        await advance(0);
        expect(screen.getByRole('alert')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: texts.generate }));
        await advance(0);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });

    describe('cancelling', () => {
      it('cancels the generation and shows it cancelled, with the focus on the state', async () => {
        currentIs(running(20));
        get.mockReturnValue(new Promise(() => undefined));
        cancel.mockResolvedValue({ status: 'loaded', generation: cancelled });
        renderPanel();
        await advance(0);

        fireEvent.click(screen.getByRole('button', { name: texts.cancel }));
        await advance(0);

        expect(cancel.mock.calls[0]?.[1]).toBe(GENERATION_ID);
        expect(screen.getByRole('status')).toHaveTextContent(texts.cancelled);
        expect(screen.getByRole('status')).toHaveFocus();
        expect(screen.queryByRole('button', { name: texts.cancel })).not.toBeInTheDocument();
      });

      it('asks only once when the button is pressed twice', async () => {
        currentIs(running(20));
        get.mockReturnValue(new Promise(() => undefined));
        cancel.mockReturnValue(new Promise(() => undefined));
        renderPanel();
        await advance(0);

        const button = screen.getByRole('button', { name: texts.cancel });
        fireEvent.click(button);
        fireEvent.click(button);
        await advance(0);

        expect(cancel).toHaveBeenCalledTimes(1);
        expect(button).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent(texts.cancelling);
      });

      it('keeps following a generation whose cancellation was requested until it ends', async () => {
        currentIs(running(20));
        get.mockResolvedValueOnce({ status: 'loaded', generation: running(25) });
        get.mockResolvedValue({ status: 'loaded', generation: cancelled });
        cancel.mockResolvedValue({ status: 'loaded', generation: running(20) });
        renderPanel();
        await advance(0);

        fireEvent.click(screen.getByRole('button', { name: texts.cancel }));
        await advance(0);
        expect(screen.getByRole('status')).toHaveTextContent(texts.cancelling);
        await advance(POLL_MS);
        expect(screen.getByRole('status')).toHaveTextContent(texts.cancelling);
        await advance(POLL_MS);

        expect(screen.getByRole('status')).toHaveTextContent(texts.cancelled);
        expect(get).toHaveBeenCalledTimes(2);
      });

      it('shows how it ended when it had already finished', async () => {
        currentIs(running(20));
        get.mockReturnValue(new Promise(() => undefined));
        cancel.mockResolvedValue({ status: 'notCancellable' });
        renderPanel();
        await advance(0);
        currentIs(completed);

        fireEvent.click(screen.getByRole('button', { name: texts.cancel }));
        await advance(0);

        expect(current).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('status')).toHaveTextContent('Horario borrador generado');
      });

      it('shows an alert and lets it try again when it cannot cancel', async () => {
        currentIs(running(20));
        get.mockReturnValue(new Promise(() => undefined));
        cancel.mockResolvedValue({ status: 'unavailable' });
        renderPanel();
        await advance(0);

        fireEvent.click(screen.getByRole('button', { name: texts.cancel }));
        await advance(0);

        expect(screen.getByRole('alert')).toHaveTextContent(texts.errors.cancel);
        expect(screen.getByRole('button', { name: texts.cancel })).toBeEnabled();
      });
    });

    describe('who can do what', () => {
      it('shows a member the state without any button, and says only administrators generate', async () => {
        currentIs(null);
        renderPanel({ isAdmin: false });
        await advance(0);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getByText(texts.adminsOnly)).toBeInTheDocument();
      });

      it('shows a member a generation in progress, without a cancel button', async () => {
        currentIs(running(20));
        get.mockReturnValue(new Promise(() => undefined));
        renderPanel({ isAdmin: false });
        await advance(0);

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.queryByText(texts.adminsOnly)).not.toBeInTheDocument();
      });

      it('shows a member the last result without a button to generate again', async () => {
        currentIs(completed);
        renderPanel({ isAdmin: false });
        await advance(0);

        expect(screen.getByRole('status')).toHaveTextContent('Horario borrador generado');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
      });

      it('has no generate button when there are blocking problems, and says why', async () => {
        currentIs(completed);
        renderPanel({ blocked: true });
        await advance(0);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getByText(texts.blocked)).toBeInTheDocument();
      });

      it('lets an administrator cancel a generation in progress even if problems appeared', async () => {
        currentIs(running(20));
        get.mockReturnValue(new Promise(() => undefined));
        renderPanel({ blocked: true });
        await advance(0);

        expect(screen.getByRole('button', { name: texts.cancel })).toBeEnabled();
        expect(screen.queryByRole('button', { name: texts.generate })).not.toBeInTheDocument();
      });
    });

    it('stores nothing in the browser', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      currentIs(running(5));
      get.mockResolvedValue({ status: 'loaded', generation: completed });
      renderPanel();
      await advance(0);
      await advance(POLL_MS);

      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
    });
  });
});

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('ScheduleGenerationPanel accessibility', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let current: MockInstance<typeof scheduleGenerationService.current>;
  let get: MockInstance<typeof scheduleGenerationService.get>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    refresh.mockResolvedValue({ status: 'authenticated', data: session });
    current = vi.spyOn(scheduleGenerationService, 'current');
    // El seguimiento nunca contesta: estos tests miran lo que se ve en cada estado.
    get = vi.spyOn(scheduleGenerationService, 'get');
    get.mockReturnValue(new Promise(() => undefined));
  });

  afterEach(async () => {
    refresh.mockRestore();
    current.mockRestore();
    get.mockRestore();
    await i18n.changeLanguage('es');
  });

  function renderPanel(isAdmin = true, blocked = false) {
    return render(
      <MemoryRouter>
        <SessionProvider>
          <ScheduleGenerationPanel
            isAdmin={isAdmin}
            blocked={blocked}
            onNotReady={() => undefined}
          />
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  const lessonFailure: Generation = {
    ...running(20),
    status: 'FAILED',
    errorCode: 'INFEASIBLE',
    errorMessage: 'x',
    errorDetails: {
      reason: 'PROFESSOR_BUSY',
      lesson: {
        course: { id: 'c1', name: '1º Primaria' },
        class: { id: 'k1', name: 'A' },
        subject: { id: 's1', name: 'Inglés' },
        professor: { id: 'p1', name: 'Eva García' },
      },
    },
    finishedAt: CREATED_AT,
  };

  it.each<[string, Generation | null]>([
    ['without a generation', null],
    ['queued', queued],
    ['running', running(20)],
    ['completed', completed],
    ['cancelled', cancelled],
    ['infeasible with a lesson', lessonFailure],
    ['timed out', { ...lessonFailure, errorCode: 'TIMEOUT', errorDetails: null }],
    [
      'failed by an internal error',
      { ...lessonFailure, errorCode: 'INTERNAL', errorDetails: null },
    ],
  ])('has no WCAG violations %s', async (_name, generation) => {
    current.mockResolvedValue({ status: 'loaded', generation });
    const { container } = renderPanel();
    await screen.findByRole('heading', { level: 2, name: texts.title });
    await waitFor(() => {
      expect(screen.queryByText(texts.loading)).not.toBeInTheDocument();
    });

    expect(await wcagViolations(container)).toEqual([]);
  });

  it.each<[string, boolean, boolean]>([
    ['a member', false, false],
    ['an administrator with blocking problems', true, true],
  ])('has no WCAG violations for %s', async (_name, isAdmin, blocked) => {
    current.mockResolvedValue({ status: 'loaded', generation: completed });
    const { container } = renderPanel(isAdmin, blocked);
    await screen.findByText(/Horario borrador generado/);

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no WCAG violations while loading, when it fails and with an alert after a failed action', async () => {
    current.mockReturnValue(new Promise(() => undefined));
    const loading = renderPanel();
    expect(await wcagViolations(loading.container)).toEqual([]);
    loading.unmount();

    current.mockResolvedValue({ status: 'unavailable' });
    const failed = renderPanel();
    await screen.findByRole('alert');
    expect(await wcagViolations(failed.container)).toEqual([]);
    failed.unmount();

    current.mockResolvedValue({ status: 'loaded', generation: null });
    vi.spyOn(scheduleGenerationService, 'start').mockResolvedValue({ status: 'unavailable' });
    const notice = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: texts.generate }));
    await screen.findByRole('alert');
    expect(await wcagViolations(notice.container)).toEqual([]);
  });

  it('has no WCAG violations in English', async () => {
    await i18n.changeLanguage('en');
    current.mockResolvedValue({ status: 'loaded', generation: running(20) });
    const { container } = renderPanel();
    await screen.findByText('20 of 50 sessions');

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('gives the progress bar a name, a range and a value, and does not rely on color', async () => {
    current.mockResolvedValue({ status: 'loaded', generation: running(20) });
    renderPanel();
    await screen.findByText('20 de 50 sesiones');

    const bar = screen.getByRole('progressbar', { name: texts.progress.label });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('20 de 50 sesiones')).toBeVisible();
  });
});
