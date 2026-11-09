import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import type { ScheduleOverview } from '../services/scheduleService';
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
  improve: true,
  phase: 'SEARCHING',
  score: null,
  improvementCancelled: false,
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

  function renderPanel(
    props: {
      isAdmin?: boolean;
      blocked?: boolean;
      overview?: ScheduleOverview | null;
      onFinished?: () => void;
    } = {},
    strict = false,
  ) {
    const tree = (
      <MemoryRouter>
        <SessionProvider>
          <ScheduleGenerationPanel
            isAdmin={props.isAdmin ?? true}
            blocked={props.blocked ?? false}
            onNotReady={onNotReady}
            overview={props.overview ?? null}
            onFinished={props.onFinished ?? (() => undefined)}
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

      expect(screen.getByRole('status')).toHaveTextContent(texts.searching);
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

    describe('viewing the timetable', () => {
      it.each([
        ['an administrator', true],
        ['a member', false],
      ])(
        'offers a link to the draft to %s when the generation completed',
        async (_name, isAdmin) => {
          currentIs(completed);
          renderPanel({ isAdmin });
          await advance(0);

          expect(screen.getByRole('link', { name: texts.viewDraft })).toHaveAttribute(
            'href',
            '/horarios/borrador',
          );
        },
      );

      it('offers it even when problems appeared after generating', async () => {
        currentIs(completed);
        renderPanel({ blocked: true });
        await advance(0);

        expect(screen.getByRole('link', { name: texts.viewDraft })).toBeInTheDocument();
      });

      it.each<[string, Generation | null]>([
        ['there is no generation', null],
        ['it is queued', queued],
        ['it is running', running(20)],
        ['it was cancelled', cancelled],
        ['it failed', failed('TIMEOUT')],
      ])('does not offer it when %s', async (_name, generation) => {
        currentIs(generation);
        get.mockReturnValue(new Promise(() => undefined));
        renderPanel();
        await advance(0);

        expect(screen.queryByRole('link', { name: texts.viewDraft })).not.toBeInTheDocument();
      });

      it('shows it when a generation in progress completes', async () => {
        currentIs(running(5));
        get.mockResolvedValue({ status: 'loaded', generation: completed });
        renderPanel();
        await advance(0);
        expect(screen.queryByRole('link', { name: texts.viewDraft })).not.toBeInTheDocument();

        await advance(POLL_MS);

        expect(screen.getByRole('link', { name: texts.viewDraft })).toBeInTheDocument();
      });
    });

    describe('what the completed generation is today (US-ALGO-CONFIRM)', () => {
      const summary = (id: string, status: 'DRAFT' | 'OFFICIAL') => ({
        id,
        status,
        generatedAt: CREATED_AT,
        placedSessions: 50,
        confirmedAt: status === 'OFFICIAL' ? CREATED_AT : null,
        confirmedBy: status === 'OFFICIAL' ? { firstName: 'Ana', lastName: 'García' } : null,
        replacedAt: null,
        score: null,
      });
      const draftIsTheirs: ScheduleOverview = {
        draft: summary(completed.scheduleId ?? '', 'DRAFT'),
        official: null,
        previousCount: 0,
      };
      const officialIsTheirs: ScheduleOverview = {
        draft: null,
        official: summary(completed.scheduleId ?? '', 'OFFICIAL'),
        previousCount: 0,
      };
      const gone: ScheduleOverview = {
        draft: summary('another-schedule', 'DRAFT'),
        official: null,
        previousCount: 0,
      };

      it('offers an administrator to see it and to confirm it as the official one while it is the draft', async () => {
        currentIs(completed);
        renderPanel({ overview: draftIsTheirs });
        await advance(0);

        expect(screen.getByRole('link', { name: texts.viewDraft })).toHaveAttribute(
          'href',
          '/horarios/borrador',
        );
        expect(screen.getByRole('button', { name: es.schedule.confirm.button })).toBeEnabled();
        expect(screen.getByText(texts.completedNote)).toBeInTheDocument();
      });

      it('offers a member to see it, but not to confirm it', async () => {
        currentIs(completed);
        renderPanel({ isAdmin: false, overview: draftIsTheirs });
        await advance(0);

        expect(screen.getByRole('link', { name: texts.viewDraft })).toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: es.schedule.confirm.button }),
        ).not.toBeInTheDocument();
      });

      it('says it is the official one once it was confirmed, with a link to see it', async () => {
        currentIs(completed);
        renderPanel({ overview: officialIsTheirs });
        await advance(0);

        expect(screen.getByText(texts.isOfficial)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: texts.viewOfficial })).toHaveAttribute(
          'href',
          '/horarios/oficial',
        );
        expect(screen.queryByRole('link', { name: texts.viewDraft })).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: es.schedule.confirm.button }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(texts.completedNote)).not.toBeInTheDocument();
      });

      it('says the draft no longer exists when it was discarded or replaced, with no link nor button', async () => {
        currentIs(completed);
        renderPanel({ overview: gone });
        await advance(0);

        expect(screen.getByText(texts.draftGone)).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: es.schedule.confirm.button }),
        ).not.toBeInTheDocument();
      });

      it('keeps offering only to see it while the overview is not known', async () => {
        currentIs(completed);
        renderPanel({ overview: null });
        await advance(0);

        expect(screen.getByRole('link', { name: texts.viewDraft })).toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: es.schedule.confirm.button }),
        ).not.toBeInTheDocument();
      });

      it('tells the page when a generation in progress finishes, and only then', async () => {
        const onFinished = vi.fn<() => void>();
        currentIs(running(5));
        get.mockResolvedValue({ status: 'loaded', generation: completed });
        renderPanel({ onFinished });
        await advance(0);
        expect(onFinished).not.toHaveBeenCalled();

        await advance(POLL_MS);

        expect(onFinished).toHaveBeenCalledTimes(1);
      });

      it('does not tell the page when it only shows a generation that was already complete', async () => {
        const onFinished = vi.fn<() => void>();
        currentIs(completed);
        renderPanel({ onFinished });
        await advance(0);

        expect(onFinished).not.toHaveBeenCalled();
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
  describe('the card of the theme (US-UI-REST_a)', () => {
    const score = {
      total: 305,
      preferredMisses: 8,
      preferredTotal: 50,
      professorGaps: 51,
      consecutiveDays: 152,
      initialTotal: 458,
    };
    const scored: Generation = { ...completed, phase: 'IMPROVING', score };
    const failed: Generation = {
      ...running(20),
      status: 'FAILED',
      errorCode: 'TIMEOUT',
      finishedAt: CREATED_AT,
    };
    const improvingNow: Generation = { ...running(50), phase: 'IMPROVING', score };
    const summary = (id: string, status: 'DRAFT' | 'OFFICIAL') => ({
      id,
      status,
      generatedAt: CREATED_AT,
      placedSessions: 50,
      confirmedAt: status === 'OFFICIAL' ? CREATED_AT : null,
      confirmedBy: status === 'OFFICIAL' ? { firstName: 'Ana', lastName: 'García' } : null,
      replacedAt: null,
      score: null,
    });
    const scheduleId = completed.scheduleId ?? '';
    const draftIsTheirs: ScheduleOverview = {
      draft: summary(scheduleId, 'DRAFT'),
      official: null,
      previousCount: 0,
    };
    const officialIsTheirs: ScheduleOverview = {
      draft: null,
      official: summary(scheduleId, 'OFFICIAL'),
      previousCount: 0,
    };
    const gone: ScheduleOverview = {
      draft: summary('another-schedule', 'DRAFT'),
      official: null,
      previousCount: 0,
    };

    const panel = () => screen.getByTestId('schedule-generation-panel');
    const badge = () => panel().querySelector('.cs-status-badge');
    const eyebrow = () => panel().querySelector('.cs-eyebrow');

    it('is a theme card with a stripe that keeps the test id, the name and the title', async () => {
      currentIs(null);
      renderPanel();
      await advance(0);

      expect(panel()).toHaveClass('cs-card', 'cs-generation-card');
      expect(panel()).not.toHaveClass('card');
      expect(screen.getByRole('region', { name: texts.title })).toBe(panel());
    });

    it('has neither eyebrow nor badge when the school never generated', async () => {
      currentIs(null);
      renderPanel();
      await advance(0);

      expect(screen.getByRole('heading', { level: 2, name: texts.title })).toBeInTheDocument();
      expect(eyebrow()).toBeNull();
      expect(badge()).toBeNull();
    });

    it.each<[string, Generation, ScheduleOverview | null, string, string, string]>([
      ['searching', running(20), null, texts.eyebrow.running, texts.badge.running, 'lavender'],
      ['queued', queued, null, texts.eyebrow.running, texts.badge.running, 'lavender'],
      ['improving', improvingNow, null, texts.eyebrow.running, texts.badge.improving, 'lavender'],
      ['the current draft', scored, draftIsTheirs, texts.eyebrow.last, texts.badge.draft, 'mint'],
      ['unknown schedules', scored, null, texts.eyebrow.last, texts.badge.draft, 'mint'],
      [
        'the official one',
        scored,
        officialIsTheirs,
        texts.eyebrow.last,
        texts.badge.official,
        'mint',
      ],
      ['a discarded draft', scored, gone, texts.eyebrow.last, texts.badge.gone, 'yellow'],
      ['a failure', failed, null, texts.eyebrow.last, texts.badge.failed, ''],
      ['a cancellation', cancelled, null, texts.eyebrow.last, texts.badge.cancelled, 'yellow'],
    ])(
      'shows the eyebrow and the badge of %s',
      async (_name, generation, overview, kicker, label, tone) => {
        currentIs(generation);
        get.mockReturnValue(new Promise(() => undefined));
        renderPanel({ overview });
        await advance(0);

        expect(eyebrow()).toHaveTextContent(kicker);
        expect(badge()).toHaveTextContent(label);
        if (tone === '') {
          expect(badge()).toHaveClass('bg-danger-subtle', 'text-danger-emphasis');
        } else {
          expect(badge()).toHaveClass(`cs-tone-${tone}`);
        }
      },
    );

    it('puts the eyebrow and the title on one side of the header and the badge on the other', async () => {
      currentIs(scored);
      renderPanel({ overview: draftIsTheirs });
      await advance(0);

      const header = panel().querySelector('.cs-generation-header');
      expect(header).not.toBeNull();
      expect(header?.querySelector('h2')).toHaveTextContent(texts.title);
      expect(header?.querySelector('.cs-eyebrow')).not.toBeNull();
      expect(header?.querySelector('.cs-status-badge')).not.toBeNull();
    });

    it('highlights the number of sessions placed and keeps the whole sentence', async () => {
      currentIs(scored);
      renderPanel({ overview: draftIsTheirs });
      await advance(0);

      expect(screen.getByRole('status')).toHaveTextContent(
        'Horario borrador generado: 50 sesiones colocadas',
      );
      expect(panel().querySelector('.cs-highlight')).toHaveTextContent(/^50 sesiones colocadas$/);
    });

    it('says one session in the singular', async () => {
      currentIs({ ...scored, placed: 1 });
      renderPanel({ overview: draftIsTheirs });
      await advance(0);

      expect(panel().querySelector('.cs-highlight')).toHaveTextContent(/^1 sesión colocada$/);
    });

    it('gathers the note and the actions of an administrator in a callout', async () => {
      currentIs(scored);
      renderPanel({ overview: draftIsTheirs });
      await advance(0);

      const callout = panel().querySelector<HTMLElement>('.cs-callout');
      expect(callout).not.toBeNull();
      const inside = within(callout as HTMLElement);
      expect(inside.getByText(texts.completedNote)).toBeInTheDocument();
      expect(inside.getByRole('link', { name: texts.viewDraft })).toBeInTheDocument();
      expect(inside.getByRole('button', { name: es.schedule.confirm.button })).toBeInTheDocument();
    });

    it('does not offer a member to confirm it, but keeps the callout with the link', async () => {
      currentIs(scored);
      renderPanel({ isAdmin: false, overview: draftIsTheirs });
      await advance(0);

      const callout = within(panel().querySelector('.cs-callout') as HTMLElement);
      expect(callout.getByRole('link', { name: texts.viewDraft })).toBeInTheDocument();
      expect(
        callout.queryByRole('button', { name: es.schedule.confirm.button }),
      ).not.toBeInTheDocument();
    });

    it.each<[string, ScheduleOverview, string]>([
      ['the official one', officialIsTheirs, texts.isOfficial],
      ['a discarded draft', gone, texts.draftGone],
    ])('also puts the text of %s in the callout', async (_name, overview, text) => {
      currentIs(scored);
      renderPanel({ overview });
      await advance(0);

      expect(
        within(panel().querySelector('.cs-callout') as HTMLElement).getByText(text),
      ).toBeInTheDocument();
    });

    it.each<[string, Generation | null, string]>([
      ['the first time', null, texts.generate],
      ['after a generation', scored, texts.generateAgain],
    ])('draws a calendar icon and a shadow on the button %s', async (_name, generation, name) => {
      currentIs(generation);
      renderPanel({ overview: draftIsTheirs });
      await advance(0);

      const button = screen.getByRole('button', { name });
      expect(button).toHaveClass('cs-generate-button');
      expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(button).toHaveTextContent(name);
    });

    describe('the figure cards', () => {
      const cards = () => document.querySelectorAll('.cs-stat-card');

      it('are three, after the card and outside it, for a completed generation with a score', async () => {
        currentIs(scored);
        renderPanel({ overview: draftIsTheirs });
        await advance(0);

        expect(cards()).toHaveLength(3);
        expect(panel().querySelector('.cs-stat-card')).toBeNull();
        expect(within(cards()[0] as HTMLElement).getByText('51')).toBeInTheDocument();
        expect(within(cards()[1] as HTMLElement).getByText('152')).toBeInTheDocument();
        expect(within(cards()[2] as HTMLElement).getByText('305')).toBeInTheDocument();
      });

      it('are hidden from the screen readers, so the breakdown is read once', async () => {
        currentIs(scored);
        renderPanel({ overview: draftIsTheirs });
        await advance(0);

        const row = cards()[0]?.closest('[aria-hidden="true"]');
        expect(row).not.toBeNull();
        expect(
          within(screen.getByRole('region', { name: es.schedule.score.title })).getByText('51'),
        ).toBeInTheDocument();
      });

      it.each<[string, Generation | null]>([
        ['there is no generation', null],
        ['a completed generation has no score', completed],
        ['it is improving', improvingNow],
        ['it is searching', running(20)],
        ['it failed', { ...failed, score }],
        ['it was cancelled', { ...cancelled, score }],
      ])('are not shown when %s', async (_name, generation) => {
        currentIs(generation);
        get.mockReturnValue(new Promise(() => undefined));
        renderPanel({ overview: draftIsTheirs });
        await advance(0);

        expect(cards()).toHaveLength(0);
      });

      it('appear when a generation in progress completes with a score', async () => {
        currentIs(running(20));
        get.mockResolvedValue({ status: 'loaded', generation: scored });
        renderPanel({ overview: draftIsTheirs });
        await advance(0);
        expect(cards()).toHaveLength(0);

        await advance(POLL_MS);

        expect(cards()).toHaveLength(3);
      });
    });
  });

  describe('the improvement checkbox (US-ALGO-RUN_b)', () => {
    const checkbox = () => screen.getByRole('checkbox', { name: texts.improve.label });

    it('is checked by default, with its help text linked, for an administrator without blockers', async () => {
      currentIs(null);
      renderPanel();
      await advance(0);

      expect(checkbox()).toBeChecked();
      expect(checkbox()).toBeEnabled();
      const help = screen.getByText(texts.improve.help);
      expect(checkbox()).toHaveAccessibleDescription(texts.improve.help);
      expect(checkbox().getAttribute('aria-describedby')).toBe(help.id);
    });

    it.each<[string, boolean, boolean]>([
      ['a member', false, false],
      ['an administrator with blocking problems', true, true],
    ])('does not show the checkbox to %s', async (_name, isAdmin, blocked) => {
      currentIs(null);
      renderPanel({ isAdmin, blocked });
      await advance(0);

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.queryByText(texts.improve.help)).not.toBeInTheDocument();
    });

    it('is disabled while a generation is in progress and enabled again when it ends', async () => {
      currentIs(running(20));
      get.mockResolvedValue({ status: 'loaded', generation: completed });
      renderPanel();
      await advance(0);

      expect(checkbox()).toBeDisabled();
      await advance(POLL_MS);

      expect(checkbox()).toBeEnabled();
    });

    it('is next to the button to generate again once a generation completed', async () => {
      currentIs(completed);
      renderPanel();
      await advance(0);

      expect(checkbox()).toBeEnabled();
      expect(screen.getByRole('button', { name: texts.generateAgain })).toBeEnabled();
    });

    it('sends improve true by default', async () => {
      currentIs(null);
      start.mockResolvedValue({ status: 'started', generation: queued });
      get.mockReturnValue(new Promise(() => undefined));
      renderPanel();
      await advance(0);

      fireEvent.click(screen.getByRole('button', { name: texts.generate }));
      await advance(0);

      expect(start).toHaveBeenCalledTimes(1);
      expect(start.mock.calls[0]?.[1]).toEqual({ improve: true });
    });

    it('sends improve false when it is unchecked, also when generating again', async () => {
      currentIs(completed);
      start.mockResolvedValue({ status: 'started', generation: { ...queued, improve: false } });
      get.mockReturnValue(new Promise(() => undefined));
      renderPanel();
      await advance(0);

      fireEvent.click(checkbox());
      expect(checkbox()).not.toBeChecked();
      fireEvent.click(screen.getByRole('button', { name: texts.generateAgain }));
      await advance(0);

      expect(start.mock.calls[0]?.[1]).toEqual({ improve: false });
    });

    it('keeps what was chosen while the generation runs and after it ends', async () => {
      currentIs(null);
      start.mockResolvedValue({ status: 'started', generation: { ...queued, improve: false } });
      get.mockResolvedValue({ status: 'loaded', generation: { ...completed, improve: false } });
      renderPanel();
      await advance(0);

      fireEvent.click(checkbox());
      fireEvent.click(screen.getByRole('button', { name: texts.generate }));
      await advance(0);
      expect(checkbox()).not.toBeChecked();
      await advance(POLL_MS);

      expect(checkbox()).not.toBeChecked();
    });

    it('does not remember the choice between visits and writes nothing to the browser storage', async () => {
      currentIs(null);
      const first = renderPanel();
      await advance(0);
      fireEvent.click(checkbox());
      expect(checkbox()).not.toBeChecked();
      first.unmount();

      renderPanel();
      await advance(0);

      expect(checkbox()).toBeChecked();
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });
  });

  describe('the phases of a generation (US-ALGO-RUN_b)', () => {
    const score = {
      total: 14,
      preferredMisses: 1,
      preferredTotal: 6,
      professorGaps: 1,
      consecutiveDays: 1,
      initialTotal: 21,
    };
    const improving = (overrides: Partial<Generation> = {}): Generation => ({
      ...running(50),
      phase: 'IMPROVING',
      score,
      ...overrides,
    });

    it('says it is searching, with the bar valued, and offers to cancel, while it looks for a schedule', async () => {
      currentIs(running(20));
      get.mockReturnValue(new Promise(() => undefined));
      renderPanel();
      await advance(0);

      expect(screen.getByRole('status')).toHaveTextContent(texts.searching);
      expect(screen.getByRole('progressbar', { name: texts.progress.label })).toHaveAttribute(
        'aria-valuenow',
        '40',
      );
      expect(screen.getByRole('button', { name: texts.cancel })).toBeEnabled();
      expect(screen.queryByRole('button', { name: texts.improving.stop })).not.toBeInTheDocument();
    });

    it('says it is improving, with a bar without value, the penalty and the stop button', async () => {
      currentIs(improving());
      get.mockReturnValue(new Promise(() => undefined));
      renderPanel();
      await advance(0);

      expect(screen.getByRole('status')).toHaveTextContent(texts.improving.status);
      const bar = screen.getByRole('progressbar', { name: texts.improving.label });
      expect(bar).not.toHaveAttribute('aria-valuenow');
      expect(screen.getByText('Penalización: 14')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: texts.improving.stop })).toBeEnabled();
      expect(screen.queryByRole('button', { name: texts.cancel })).not.toBeInTheDocument();
      expect(screen.queryByText(/de 50 sesiones/)).not.toBeInTheDocument();
    });

    it('does not show the penalty while there is no score yet', async () => {
      currentIs(improving({ score: null }));
      get.mockReturnValue(new Promise(() => undefined));
      renderPanel();
      await advance(0);

      expect(screen.getByRole('status')).toHaveTextContent(texts.improving.status);
      expect(screen.queryByText(/Penalización/)).not.toBeInTheDocument();
    });

    it('moves from searching to improving by itself when the polling brings the new phase', async () => {
      currentIs(running(20));
      get.mockResolvedValue({ status: 'loaded', generation: improving() });
      renderPanel();
      await advance(0);
      expect(screen.getByRole('status')).toHaveTextContent(texts.searching);

      await advance(POLL_MS);

      expect(screen.getByRole('status')).toHaveTextContent(texts.improving.status);
      expect(screen.getByText('Penalización: 14')).toBeInTheDocument();
    });

    it('shows the lowest penalty as the polling brings it', async () => {
      currentIs(improving());
      get.mockResolvedValue({
        status: 'loaded',
        generation: improving({ score: { ...score, total: 9 } }),
      });
      renderPanel();
      await advance(0);

      await advance(POLL_MS);

      expect(screen.getByText('Penalización: 9')).toBeInTheDocument();
    });

    it('lets a member see the phase without any button to stop', async () => {
      currentIs(improving());
      get.mockReturnValue(new Promise(() => undefined));
      renderPanel({ isAdmin: false });
      await advance(0);

      expect(screen.getByRole('status')).toHaveTextContent(texts.improving.status);
      expect(screen.queryByRole('button', { name: texts.improving.stop })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    describe('the summary of a completed generation', () => {
      // Las tarjetas de cifras repiten el desglose (ocultas a los lectores de pantalla): se lee de su región.
      const breakdown = () => screen.getByRole('region', { name: es.schedule.score.title });
      const breakdownValue = (term: string) =>
        within(breakdown()).getByText(term, { selector: 'dt' }).nextElementSibling;
      const scored: Generation = {
        ...completed,
        phase: 'IMPROVING',
        score: { ...score, total: 14 },
      };

      it('shows the breakdown of the score', async () => {
        currentIs(scored);
        renderPanel();
        await advance(0);

        expect(screen.getByRole('region', { name: es.schedule.score.title })).toBeInTheDocument();
        expect(screen.getByText('Penalización', { selector: 'dt' })).toBeInTheDocument();
        expect(breakdownValue('Penalización')).toHaveTextContent(
          /^14 \(antes de mejorar: 21; cuanto menos, mejor\)$/,
        );
        expect(within(breakdown()).getByText('5 de 6')).toBeInTheDocument();
      });

      it('shows no breakdown when the score is null', async () => {
        currentIs(completed);
        renderPanel();
        await advance(0);

        expect(
          screen.queryByRole('region', { name: es.schedule.score.title }),
        ).not.toBeInTheDocument();
        expect(screen.getByText(/Horario borrador generado/)).toBeInTheDocument();
      });

      it('says the preferences were not applied when it did not improve', async () => {
        currentIs({ ...scored, improve: false, score: { ...score, total: 21 } });
        renderPanel();
        await advance(0);

        expect(screen.getByText(texts.notImproved)).toBeInTheDocument();
        expect(screen.queryByText(texts.improvementStopped)).not.toBeInTheDocument();
      });

      it('says the improvement was stopped and the valid schedule saved', async () => {
        currentIs({ ...scored, improvementCancelled: true });
        renderPanel();
        await advance(0);

        expect(screen.getByText(texts.improvementStopped)).toBeInTheDocument();
        expect(screen.queryByText(texts.notImproved)).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: texts.viewDraft })).toBeInTheDocument();
      });

      it('says neither when it improved normally', async () => {
        currentIs(scored);
        renderPanel();
        await advance(0);

        expect(screen.queryByText(texts.notImproved)).not.toBeInTheDocument();
        expect(screen.queryByText(texts.improvementStopped)).not.toBeInTheDocument();
      });

      it('shows the same to a member', async () => {
        currentIs({ ...scored, improvementCancelled: true });
        renderPanel({ isAdmin: false });
        await advance(0);

        expect(screen.getByText(texts.improvementStopped)).toBeInTheDocument();
        expect(breakdownValue('Penalización')).toHaveTextContent(
          /^14 \(antes de mejorar: 21; cuanto menos, mejor\)$/,
        );
      });
    });

    describe('stopping the improvement', () => {
      const stopButton = () => screen.getByRole('button', { name: texts.improving.stop });
      const dialog = () => screen.getByRole('dialog', { name: texts.improving.stopDialog.title });

      async function renderImproving() {
        currentIs(improving());
        get.mockReturnValue(new Promise(() => undefined));
        renderPanel();
        await advance(0);
      }

      it('asks first, with the focus on the safe option, and does nothing until it is confirmed', async () => {
        await renderImproving();

        fireEvent.click(stopButton());
        await advance(0);

        expect(dialog()).toBeInTheDocument();
        expect(screen.getByRole('button', { name: texts.improving.stopDialog.keep })).toHaveFocus();
        expect(cancel).not.toHaveBeenCalled();
      });

      it('keeps improving when the person keeps improving', async () => {
        await renderImproving();
        fireEvent.click(stopButton());
        await advance(0);

        fireEvent.click(screen.getByRole('button', { name: texts.improving.stopDialog.keep }));
        await advance(500);

        expect(cancel).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(stopButton()).toBeEnabled();
      });

      it('cancels the generation once confirmed, and says it is stopping', async () => {
        await renderImproving();
        cancel.mockResolvedValue({ status: 'loaded', generation: improving() });
        fireEvent.click(stopButton());
        await advance(0);

        fireEvent.click(screen.getByRole('button', { name: texts.improving.stopDialog.confirm }));
        await advance(0);

        expect(cancel).toHaveBeenCalledTimes(1);
        expect(cancel.mock.calls[0]?.[1]).toBe(GENERATION_ID);
        expect(screen.getByRole('status')).toHaveTextContent(texts.improving.stopping);
        expect(stopButton()).toBeDisabled();
      });

      it('ends in the completed state when the polling brings the generation with the schedule saved', async () => {
        await renderImproving();
        cancel.mockResolvedValue({ status: 'loaded', generation: improving() });
        get.mockResolvedValue({
          status: 'loaded',
          generation: { ...completed, phase: 'IMPROVING', score, improvementCancelled: true },
        });
        fireEvent.click(stopButton());
        await advance(0);
        fireEvent.click(screen.getByRole('button', { name: texts.improving.stopDialog.confirm }));
        await advance(0);

        await advance(POLL_MS);

        expect(screen.getByText(/Horario borrador generado/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: texts.viewDraft })).toBeInTheDocument();
      });

      it('tells when the generation could not be stopped, and lets try again', async () => {
        await renderImproving();
        cancel.mockResolvedValueOnce({ status: 'unavailable' });
        fireEvent.click(stopButton());
        await advance(0);

        fireEvent.click(screen.getByRole('button', { name: texts.improving.stopDialog.confirm }));
        await advance(0);

        expect(screen.getByRole('alert')).toHaveTextContent(texts.errors.cancel);
        expect(stopButton()).toBeEnabled();
      });

      it('asks only once when the confirmation is pressed twice', async () => {
        await renderImproving();
        cancel.mockReturnValue(new Promise(() => undefined));
        fireEvent.click(stopButton());
        await advance(0);

        const confirm = screen.getByRole('button', { name: texts.improving.stopDialog.confirm });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        await advance(0);

        expect(cancel).toHaveBeenCalledTimes(1);
      });
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
    [
      'completed with a score and the figure cards',
      {
        ...completed,
        phase: 'IMPROVING',
        score: {
          total: 305,
          preferredMisses: 8,
          preferredTotal: 50,
          professorGaps: 51,
          consecutiveDays: 152,
          initialTotal: 458,
        },
      },
    ],
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
  it('has no WCAG violations while improving, with the checkbox, and with the stop dialog open (US-ALGO-RUN_b)', async () => {
    const improving: Generation = {
      ...running(50),
      phase: 'IMPROVING',
      score: {
        total: 14,
        preferredMisses: 1,
        preferredTotal: 6,
        professorGaps: 1,
        consecutiveDays: 1,
        initialTotal: 21,
      },
    };
    current.mockResolvedValue({ status: 'loaded', generation: improving });
    const { container } = renderPanel();
    await screen.findByText('Penalización: 14');
    expect(await wcagViolations(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: texts.improving.stop }));
    await screen.findByRole('dialog');
    expect(await wcagViolations(document.body)).toEqual([]);
  });

  it.each([
    ['an administrator', true],
    ['a member', false],
  ])('has no WCAG violations in every phase for %s (US-ALGO-RUN_b)', async (_name, isAdmin) => {
    const score = {
      total: 14,
      preferredMisses: 1,
      preferredTotal: 6,
      professorGaps: 1,
      consecutiveDays: 1,
      initialTotal: 21,
    };
    const states: Generation[] = [
      queued,
      running(20),
      { ...running(50), phase: 'IMPROVING', score },
      { ...completed, phase: 'IMPROVING', score },
      { ...completed, improve: false, score: { ...score, total: 21 } },
      { ...completed, phase: 'IMPROVING', score, improvementCancelled: true },
    ];
    for (const generation of states) {
      current.mockResolvedValue({ status: 'loaded', generation });
      const { container, unmount } = renderPanel(isAdmin);
      await screen.findByRole('heading', { level: 2, name: texts.title });
      await waitFor(() => {
        expect(screen.queryByText(texts.loading)).not.toBeInTheDocument();
      });

      expect(await wcagViolations(container)).toEqual([]);
      unmount();
    }
  });

  it('has no WCAG violations with the improvement checkbox, checked and unchecked', async () => {
    current.mockResolvedValue({ status: 'loaded', generation: null });
    const { container } = renderPanel();
    const checkbox = await screen.findByRole('checkbox', { name: texts.improve.label });
    expect(await wcagViolations(container)).toEqual([]);

    fireEvent.click(checkbox);
    expect(await wcagViolations(container)).toEqual([]);
  });
});
