import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { scheduleGenerationService, type Generation } from '../services/scheduleGenerationService';
import { useSession } from '../session/SessionProvider';

const TITLE_ID = 'schedule-generation-title';

/** Cada cuánto se pregunta por el progreso: un temporizador encadenado, no un `setInterval`. */
export const POLL_INTERVAL_MS = 2000;

export interface ScheduleGenerationPanelProps {
  /** Solo un administrador puede lanzar y cancelar; el resto ve el estado. */
  isAdmin: boolean;
  /** El colegio tiene problemas que impiden generar: no hay botón «Generar». */
  blocked: boolean;
  /** La generación falló por `NOT_READY` o el servidor rechazó lanzarla: hay que repetir la comprobación. */
  onNotReady: () => void;
}

type PanelState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; generation: Generation | null };

/** Un fallo de una acción del administrador, que se muestra sobre el panel. */
type Notice = 'start' | 'forbidden' | 'notReady' | 'cancel';

function isInProgress(generation: Generation | null): generation is Generation {
  return generation !== null && (generation.status === 'QUEUED' || generation.status === 'RUNNING');
}

/**
 * Panel de la generación del horario en `/horarios` (US-ALGO-RUN): lanza la generación, sigue su progreso y muestra
 * el resultado. Al montarse pide la generación actual para retomarla tras recargar. El seguimiento es un temporizador
 * encadenado de 2 s que se detiene al terminar o al desmontar, y cada acción del administrador invalida las
 * respuestas que estaban en vuelo (un contador), de modo que una respuesta tardía no pisa lo que ya se ve. No guarda
 * nada en el almacenamiento del navegador.
 */
export function ScheduleGenerationPanel({
  isAdmin,
  blocked,
  onNotReady,
}: ScheduleGenerationPanelProps) {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  const [state, setState] = useState<PanelState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Cambia con cada acción del usuario para reiniciar el seguimiento con el estado nuevo.
  const [epoch, setEpoch] = useState(0);
  const [stale, setStale] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  const mounted = useRef(false);
  const requestedAttempt = useRef<number | undefined>(undefined);
  const epochRef = useRef(0);
  const isStartingRef = useRef(false);
  const isCancellingRef = useRef(false);
  const fetchRef = useRef(authorizedFetch);
  const panelRef = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const onNotReadyRef = useRef(onNotReady);

  useEffect(() => {
    fetchRef.current = authorizedFetch;
    onNotReadyRef.current = onNotReady;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Invalida lo que está en vuelo y reinicia el seguimiento. */
  const invalidatePending = useCallback(() => {
    epochRef.current += 1;
    setEpoch(epochRef.current);
  }, []);

  /** Si el foco estaba en el panel (o se ha perdido porque el botón desapareció), lo lleva al estado. */
  const keepFocus = useCallback(() => {
    const active = document.activeElement;
    if (active === null || active === document.body || panelRef.current?.contains(active)) {
      setFocusRequest((current) => current + 1);
    }
  }, []);

  /** Lo que hay que hacer cuando llega una generación nueva (de una acción o del seguimiento). */
  const receive = useCallback(
    (generation: Generation | null, previous: Generation | null) => {
      setState({ status: 'ready', generation });
      setStale(false);
      if (generation?.errorCode === 'NOT_READY') {
        onNotReadyRef.current();
      }
      if (!isInProgress(generation)) {
        setCancelling(false);
        if (isInProgress(previous)) {
          keepFocus();
        }
      }
    },
    [keepFocus],
  );

  // Retomar: la generación actual al montar (una vez, aunque `StrictMode` ejecute el efecto dos veces).
  useEffect(() => {
    if (requestedAttempt.current === attempt) {
      return;
    }
    requestedAttempt.current = attempt;
    const requestedEpoch = epochRef.current;
    void scheduleGenerationService.current(authorizedFetch).then((outcome) => {
      if (!mounted.current || requestedEpoch !== epochRef.current) {
        return;
      }
      if (outcome.status === 'loaded') {
        setState({ status: 'ready', generation: outcome.generation });
        setStale(false);
      } else if (outcome.status === 'unavailable') {
        setState({ status: 'error' });
      }
      // `unauthenticated`: `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
    });
  }, [attempt, authorizedFetch]);

  const polledId =
    state.status === 'ready' && isInProgress(state.generation) ? state.generation.id : null;
  const polledGeneration = state.status === 'ready' ? state.generation : null;

  // Seguir: un temporizador encadenado que se detiene al terminar, al desmontar o al invalidarse.
  useEffect(() => {
    if (polledId === null) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pollingEpoch = epochRef.current;

    const poll = () => {
      void scheduleGenerationService.get(fetchRef.current, polledId).then((outcome) => {
        if (!active || !mounted.current || pollingEpoch !== epochRef.current) {
          return;
        }
        switch (outcome.status) {
          case 'loaded':
            receive(outcome.generation, polledGeneration);
            if (isInProgress(outcome.generation)) {
              timer = setTimeout(poll, POLL_INTERVAL_MS);
            }
            break;
          case 'unavailable':
            // Un fallo puntual no detiene el seguimiento: se avisa y se vuelve a intentar.
            setStale(true);
            timer = setTimeout(poll, POLL_INTERVAL_MS);
            break;
          case 'notFound':
            setState({ status: 'error' });
            break;
          case 'unauthenticated':
            break;
        }
      });
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // `polledGeneration` solo sirve para saber si se venía de una en curso: no debe reiniciar el temporizador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polledId, epoch, receive]);

  useEffect(() => {
    if (focusRequest > 0) {
      statusRef.current?.focus();
    }
  }, [focusRequest]);

  function reload() {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function generate() {
    if (isStartingRef.current) {
      return;
    }
    isStartingRef.current = true;
    setStarting(true);
    setNotice(null);
    invalidatePending();
    void scheduleGenerationService.start(fetchRef.current).then((outcome) => {
      isStartingRef.current = false;
      if (!mounted.current) {
        return;
      }
      setStarting(false);
      switch (outcome.status) {
        case 'started':
          setCancelling(false);
          receive(outcome.generation, null);
          setFocusRequest((current) => current + 1);
          break;
        case 'notReady':
          setNotice('notReady');
          onNotReadyRef.current();
          break;
        case 'inProgress':
          // Otra persona (u otra pestaña) acaba de lanzarla: se muestra la que está en curso.
          setAttempt((current) => current + 1);
          break;
        case 'forbidden':
          setNotice('forbidden');
          break;
        case 'unavailable':
          setNotice('start');
          break;
        case 'unauthenticated':
          break;
      }
    });
  }

  function cancel(generation: Generation) {
    if (isCancellingRef.current) {
      return;
    }
    isCancellingRef.current = true;
    setCancelling(true);
    setNotice(null);
    invalidatePending();
    void scheduleGenerationService.cancel(fetchRef.current, generation.id).then((outcome) => {
      isCancellingRef.current = false;
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          // Cancelada, o todavía en curso con la cancelación pedida: el seguimiento la lleva al final.
          receive(outcome.generation, generation);
          break;
        case 'notCancellable':
        case 'notFound':
          // Terminó mientras tanto: se vuelve a pedir para mostrar cómo.
          setCancelling(false);
          setAttempt((current) => current + 1);
          break;
        case 'forbidden':
          setCancelling(false);
          setNotice('forbidden');
          break;
        case 'unavailable':
          setCancelling(false);
          setNotice('cancel');
          break;
        case 'unauthenticated':
          break;
      }
    });
  }

  const generation = state.status === 'ready' ? state.generation : null;
  const inProgress = isInProgress(generation);
  const canGenerate = isAdmin && !blocked;

  return (
    <section
      ref={panelRef}
      aria-labelledby={TITLE_ID}
      className="card card-body mb-4"
      data-testid="schedule-generation-panel"
    >
      <h2 id={TITLE_ID} className="h5">
        {t('schedule.generation.title')}
      </h2>

      {state.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('schedule.generation.loading')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3 mb-0">
          <span>{t('schedule.generation.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={reload}>
            {t('schedule.generation.retry')}
          </Button>
        </Alert>
      )}

      {notice !== null && (
        <Alert variant="danger" role="alert">
          {t(`schedule.generation.errors.${notice}`)}
        </Alert>
      )}

      {state.status === 'ready' && (
        <>
          {inProgress && (
            <>
              <div ref={statusRef} role="status" tabIndex={-1} className="mb-2">
                {cancelling
                  ? t('schedule.generation.cancelling')
                  : generation.status === 'QUEUED'
                    ? t('schedule.generation.queued')
                    : t('schedule.generation.running')}
              </div>
              <div className="progress mb-2" style={{ height: '0.75rem' }}>
                <div
                  className="progress-bar"
                  role="progressbar"
                  aria-label={t('schedule.generation.progress.label')}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={generation.progress}
                  aria-valuetext={t('schedule.generation.progress.sessions', {
                    placed: generation.placed,
                    total: generation.total,
                  })}
                  style={{ width: `${String(generation.progress)}%` }}
                />
              </div>
              <p className="mb-2">
                {generation.total === 0
                  ? t('schedule.generation.progress.preparing')
                  : t('schedule.generation.progress.sessions', {
                      placed: generation.placed,
                      total: generation.total,
                    })}
              </p>
              {stale && (
                <p className="text-warning-emphasis">{t('schedule.generation.progressStale')}</p>
              )}
            </>
          )}

          {generation?.status === 'COMPLETED' && (
            <div ref={statusRef} role="status" tabIndex={-1} className="mb-2">
              <p className="fw-semibold mb-1">
                {t('schedule.generation.completed', { count: generation.placed })}
              </p>
              <p className="text-body-secondary mb-1">{t('schedule.generation.completedNote')}</p>
              <Link to="/horarios/borrador">{t('schedule.generation.viewDraft')}</Link>
            </div>
          )}

          {generation?.status === 'CANCELLED' && (
            <div ref={statusRef} role="status" tabIndex={-1} className="mb-2">
              {t('schedule.generation.cancelled')}
            </div>
          )}

          {generation?.status === 'FAILED' && generation.errorCode !== null && (
            <div ref={statusRef} tabIndex={-1}>
              <GenerationFailure generation={generation} errorCode={generation.errorCode} />
            </div>
          )}

          <div className="d-flex flex-wrap gap-2">
            {canGenerate && (
              <Button onClick={generate} disabled={inProgress || starting}>
                {generation === null
                  ? t('schedule.generation.generate')
                  : inProgress
                    ? t('schedule.generation.generate')
                    : t('schedule.generation.generateAgain')}
              </Button>
            )}
            {isAdmin && inProgress && (
              <Button
                variant="outline-danger"
                onClick={() => {
                  cancel(generation);
                }}
                disabled={cancelling}
              >
                {t('schedule.generation.cancel')}
              </Button>
            )}
          </div>

          {!inProgress && !isAdmin && (
            <p className="text-body-secondary mt-2 mb-0">{t('schedule.generation.adminsOnly')}</p>
          )}
          {!inProgress && isAdmin && blocked && (
            <p className="text-body-secondary mt-2 mb-0">{t('schedule.generation.blocked')}</p>
          )}
        </>
      )}
    </section>
  );
}

/** A dónde se corrige cada motivo de una generación imposible: la carga del curso, sus profesores o el profesor. */
function failureLink(
  reason: NonNullable<Generation['errorDetails']>['reason'],
  lesson: NonNullable<NonNullable<Generation['errorDetails']>['lesson']>,
): { to: string; key: 'workload' | 'assignments' | 'availability' } {
  switch (reason) {
    case 'PROFESSOR_BUSY':
      return { to: `/profesores/${lesson.professor.id}/disponibilidad`, key: 'availability' };
    case 'MAX_HOURS':
      return { to: `/cursos/${lesson.course.id}/profesores`, key: 'assignments' };
    case 'NO_FREE_CELLS':
    case 'CLASS_BUSY':
    case 'DAILY_RULE':
      return { to: `/cursos/${lesson.course.id}/carga`, key: 'workload' };
  }
}

/**
 * Por qué falló una generación. El texto sale de `errorCode` y nunca del `errorMessage` del servidor (en un error
 * interno solo se enseña el id). En `INFEASIBLE` el motivo es orientativo salvo `NO_FREE_CELLS`, y la sesión afectada
 * enlaza a donde se corrige.
 */
function GenerationFailure({
  generation,
  errorCode,
}: {
  generation: Generation;
  errorCode: NonNullable<Generation['errorCode']>;
}) {
  const { t } = useTranslation();
  const details = generation.errorDetails;
  const lesson = details?.lesson ?? null;
  const link = details !== null && lesson !== null ? failureLink(details.reason, lesson) : null;

  return (
    <Alert variant="danger" role="alert">
      <p className="mb-1">
        {errorCode === 'INTERNAL'
          ? t('schedule.generation.failed.INTERNAL', { id: generation.id })
          : t(`schedule.generation.failed.${errorCode}`)}
      </p>
      {details !== null && (
        <>
          <p className="mb-1">{t(`schedule.generation.failed.reasons.${details.reason}`)}</p>
          {details.reason !== 'NO_FREE_CELLS' && (
            <p className="mb-1 text-body-secondary">{t('schedule.generation.failed.reasonNote')}</p>
          )}
          {lesson !== null && (
            <p className="mb-1">
              {t('schedule.generation.failed.lesson', {
                subject: lesson.subject.name,
                course: lesson.course.name,
                class: lesson.class.name,
                professor: lesson.professor.name,
                interpolation: { escapeValue: false },
              })}
            </p>
          )}
          {link !== null && lesson !== null && (
            <Link to={link.to}>
              {t(`schedule.generation.failed.links.${link.key}`, {
                course: lesson.course.name,
                professor: lesson.professor.name,
                interpolation: { escapeValue: false },
              })}
            </Link>
          )}
        </>
      )}
    </Alert>
  );
}
