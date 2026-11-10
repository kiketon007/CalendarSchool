import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { scheduleGenerationService, type Generation } from '../services/scheduleGenerationService';
import type { ScheduleOverview } from '../services/scheduleService';
import { useSession } from '../session/SessionProvider';
import {
  completedKind,
  generationBadge,
  generationEyebrow,
  type BadgeTone,
} from '../utils/generationStatus';
import { ConfirmScheduleModal } from './ConfirmScheduleModal';
import { CalendarDaysIcon } from './icons/CalendarDaysIcon';
import { ScheduleScoreStats } from './ScheduleScoreStats';
import { ScheduleScoreSummary } from './ScheduleScoreSummary';
import { StopImprovementModal } from './StopImprovementModal';

const TITLE_ID = 'schedule-generation-title';
const IMPROVE_ID = 'schedule-improve';
const IMPROVE_HELP_ID = 'schedule-improve-help';

/** Cada cuánto se pregunta por el progreso: un temporizador encadenado, no un `setInterval`. */
export const POLL_INTERVAL_MS = 2000;

export interface ScheduleGenerationPanelProps {
  /** Solo un administrador puede lanzar y cancelar; el resto ve el estado. */
  isAdmin: boolean;
  /** El colegio tiene problemas que impiden generar: no hay botón «Generar». */
  blocked: boolean;
  /** La generación falló por `NOT_READY` o el servidor rechazó lanzarla: hay que repetir la comprobación. */
  onNotReady: () => void;
  /**
   * Los horarios que tiene el colegio hoy (borrador y oficial), para saber qué es el horario de la generación
   * completada; `null` mientras no se conocen (cargando o fallo): entonces solo se ofrece verlo como borrador.
   */
  overview?: ScheduleOverview | null;
  /** Una generación que se estaba siguiendo ha terminado: lo que haya cambiado en los horarios hay que volver a leerlo. */
  onFinished?: () => void;
}

type PanelState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; generation: Generation | null };

/** Un fallo de una acción del administrador, que se muestra sobre el panel. */
type Notice = 'start' | 'forbidden' | 'notReady' | 'cancel';

/** Las clases del tono de la insignia: los del tema y, para «Sin horario», el peligro suave de Bootstrap. */
const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  lavender: 'cs-tone-lavender',
  mint: 'cs-tone-mint',
  yellow: 'cs-tone-yellow',
  danger: 'bg-danger-subtle text-danger-emphasis',
};

function isInProgress(generation: Generation | null): generation is Generation {
  return generation !== null && (generation.status === 'QUEUED' || generation.status === 'RUNNING');
}

/**
 * Panel de la generación del horario en `/horarios` (US-ALGO-RUN): lanza la generación, sigue su progreso y muestra
 * el resultado. Al montarse pide la generación actual para retomarla tras recargar. El seguimiento es un temporizador
 * encadenado de 2 s que se detiene al terminar o al desmontar, y cada acción del administrador invalida las
 * respuestas que estaban en vuelo (un contador), de modo que una respuesta tardía no pisa lo que ya se ve. En el
 * estado completado, lo que ofrece depende de qué es hoy el horario de la generación (US-ALGO-CONFIRM): el borrador
 * vigente (verlo y, un administrador, confirmarlo), el oficial (verlo) o ninguno (se descartó o lo sustituyó otra
 * generación). No guarda nada en el almacenamiento del navegador.
 */
export function ScheduleGenerationPanel({
  isAdmin,
  blocked,
  onNotReady,
  overview = null,
  onFinished,
}: ScheduleGenerationPanelProps) {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  // La casilla «Mejorar con las preferencias»: marcada al montar y no se recuerda entre visitas.
  const [improve, setImprove] = useState(true);
  const [stopping, setStopping] = useState(false);
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
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    fetchRef.current = authorizedFetch;
    onNotReadyRef.current = onNotReady;
    onFinishedRef.current = onFinished;
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
          onFinishedRef.current?.();
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
    void scheduleGenerationService.start(fetchRef.current, { improve }).then((outcome) => {
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
  // En la mejora ya hay un horario válido: se puede parar y quedarse con él.
  const improving = inProgress && generation.phase === 'IMPROVING';
  // CP-SAT (OR-Tools) no coloca las sesiones de una en una: mientras busca no hay un avance que enseñar. Si falla y
  // pasa al motor actual, la respuesta siguiente trae `BACKTRACKING` y vuelve la barra con valor.
  const searchingWithoutProgress =
    inProgress && generation.phase === 'SEARCHING' && generation.engine === 'ORTOOLS';

  function statusText(current: Generation, isCancelling: boolean): string {
    if (isCancelling) {
      return t(
        current.phase === 'IMPROVING'
          ? 'schedule.generation.improving.stopping'
          : 'schedule.generation.cancelling',
      );
    }
    if (current.status === 'QUEUED') {
      return t('schedule.generation.queued');
    }
    return t(
      current.phase === 'IMPROVING'
        ? 'schedule.generation.improving.status'
        : 'schedule.generation.searching',
    );
  }

  const eyebrow = generationEyebrow(generation);
  const badge = generationBadge(generation, overview);

  return (
    <>
      <section
        ref={panelRef}
        aria-labelledby={TITLE_ID}
        className="cs-card cs-generation-card mb-4"
        data-testid="schedule-generation-panel"
      >
        <div className="cs-generation-header">
          <div>
            {eyebrow !== null && (
              <p className="cs-eyebrow mb-1">{t(`schedule.generation.eyebrow.${eyebrow}`)}</p>
            )}
            <h2 id={TITLE_ID} className="h5 mb-0">
              {t('schedule.generation.title')}
            </h2>
          </div>
          {badge !== null && (
            <span className={`cs-status-badge ${BADGE_TONE_CLASS[badge.tone]}`}>
              {badge.tone === 'mint' && <span aria-hidden="true">✓</span>}
              {t(`schedule.generation.badge.${badge.key}`)}
            </span>
          )}
        </div>

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
                  {statusText(generation, cancelling)}
                </div>
                {improving ? (
                  <>
                    {/* No se sabe cuándo converge la mejora: una barra sin valor y la penalización que baja. */}
                    <div className="progress mb-2" style={{ height: '0.75rem' }}>
                      <div
                        className="progress-bar progress-bar-striped progress-bar-animated w-100"
                        role="progressbar"
                        aria-label={t('schedule.generation.improving.label')}
                      />
                    </div>
                    {generation.score !== null && (
                      <p className="mb-2">
                        {t('schedule.generation.improving.penalty', {
                          total: generation.score.total,
                        })}
                      </p>
                    )}
                  </>
                ) : searchingWithoutProgress ? (
                  /* CP-SAT no informa de cuántas sesiones lleva colocadas: una barra sin valor, sin «N de M». */
                  <div className="progress mb-2" style={{ height: '0.75rem' }}>
                    <div
                      className="progress-bar progress-bar-striped progress-bar-animated w-100"
                      role="progressbar"
                      aria-label={t('schedule.generation.searchingIndeterminate.label')}
                    />
                  </div>
                ) : (
                  <>
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
                  </>
                )}
                {stale && (
                  <p className="text-warning-emphasis">{t('schedule.generation.progressStale')}</p>
                )}
              </>
            )}

            {generation?.status === 'COMPLETED' && (
              <div ref={statusRef} role="status" tabIndex={-1} className="mb-2">
                <p className="fw-semibold mb-3">
                  <Trans
                    i18nKey="schedule.generation.completed"
                    count={generation.placed}
                    components={{ count: <span className="cs-highlight" /> }}
                  />
                </p>
                {generation.score !== null && (
                  <ScheduleScoreSummary score={generation.score} className="mb-3" />
                )}
                {!generation.improve && (
                  <p className="mb-2">{t('schedule.generation.notImproved')}</p>
                )}
                {generation.improvementCancelled && (
                  <p className="mb-2">{t('schedule.generation.improvementStopped')}</p>
                )}
                <CompletedOffer
                  generation={generation}
                  overview={overview}
                  isAdmin={isAdmin}
                  onConfirm={() => {
                    setConfirming(true);
                  }}
                />
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

            {generation?.status === 'COMPLETED' && generation.scheduleId !== null && (
              <ConfirmScheduleModal
                show={confirming}
                scheduleId={generation.scheduleId}
                officialConfirmedAt={overview?.official?.confirmedAt ?? null}
                index={null}
                onConfirmed={() => {
                  void navigate('/horarios/oficial', { state: { notice: 'confirmed' } });
                }}
                onHide={() => {
                  setConfirming(false);
                }}
              />
            )}

            {canGenerate && (
              <div className="mb-3">
                <Form.Check
                  id={IMPROVE_ID}
                  type="checkbox"
                  label={t('schedule.generation.improve.label')}
                  checked={improve}
                  disabled={inProgress || starting}
                  aria-describedby={IMPROVE_HELP_ID}
                  onChange={(event) => {
                    setImprove(event.target.checked);
                  }}
                />
                <Form.Text id={IMPROVE_HELP_ID} muted>
                  {t('schedule.generation.improve.help')}
                </Form.Text>
              </div>
            )}

            <div className="d-flex flex-wrap gap-2">
              {canGenerate && (
                <Button
                  className="cs-generate-button d-inline-flex align-items-center gap-2"
                  onClick={generate}
                  disabled={inProgress || starting}
                >
                  <CalendarDaysIcon width={16} height={16} />
                  {generation === null
                    ? t('schedule.generation.generate')
                    : inProgress
                      ? t('schedule.generation.generate')
                      : t('schedule.generation.generateAgain')}
                </Button>
              )}
              {isAdmin && inProgress && !improving && (
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
              {isAdmin && improving && (
                <Button
                  variant="outline-primary"
                  onClick={() => {
                    setStopping(true);
                  }}
                  disabled={cancelling}
                >
                  {t('schedule.generation.improving.stop')}
                </Button>
              )}
            </div>

            {isAdmin && (
              <StopImprovementModal
                show={stopping && improving}
                onConfirm={() => {
                  setStopping(false);
                  if (improving) {
                    cancel(generation);
                  }
                }}
                onCancel={() => {
                  setStopping(false);
                }}
              />
            )}

            {!inProgress && !isAdmin && (
              <p className="text-body-secondary mt-2 mb-0">{t('schedule.generation.adminsOnly')}</p>
            )}
            {!inProgress && isAdmin && blocked && (
              <p className="text-body-secondary mt-2 mb-0">{t('schedule.generation.blocked')}</p>
            )}
          </>
        )}
      </section>
      {generation?.status === 'COMPLETED' && generation.score !== null && (
        <ScheduleScoreStats score={generation.score} />
      )}
    </>
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
/**
 * Lo que se ofrece de una generación completada según qué es hoy su horario (`scheduleId`): el borrador vigente (verlo
 * y, un administrador, confirmarlo), el oficial (verlo) o ninguno (se descartó o lo sustituyó otra generación). Sin
 * saber qué horarios hay (`overview` nulo) solo se ofrece verlo como borrador.
 */
function CompletedOffer({
  generation,
  overview,
  isAdmin,
  onConfirm,
}: {
  generation: Generation;
  overview: ScheduleOverview | null;
  isAdmin: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const kind = completedKind(generation, overview);

  if (kind === 'official') {
    return (
      <div className="cs-callout">
        <p className="mb-1">{t('schedule.generation.isOfficial')}</p>
        <Link to="/horarios/oficial">{t('schedule.generation.viewOfficial')}</Link>
      </div>
    );
  }
  if (kind === 'gone') {
    return (
      <div className="cs-callout">
        <p className="text-body-secondary mb-0">{t('schedule.generation.draftGone')}</p>
      </div>
    );
  }
  return (
    <div className="cs-callout">
      <p className="text-body-secondary mb-2">{t('schedule.generation.completedNote')}</p>
      <div className="d-flex flex-wrap align-items-center gap-3">
        <Link to="/horarios/borrador">{t('schedule.generation.viewDraft')}</Link>
        {isAdmin && overview !== null && (
          <Button variant="success" size="sm" onClick={onConfirm}>
            {t('schedule.confirm.button')}
          </Button>
        )}
      </div>
    </div>
  );
}

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
