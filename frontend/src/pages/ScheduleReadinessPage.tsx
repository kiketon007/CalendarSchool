import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { OfficialScheduleSummary } from '../components/OfficialScheduleSummary';
import { ReadinessIssueItem } from '../components/ReadinessIssueItem';
import { ScheduleGenerationPanel } from '../components/ScheduleGenerationPanel';
import {
  scheduleReadinessService,
  type ScheduleReadiness,
} from '../services/scheduleReadinessService';
import { scheduleService, type ScheduleOverview } from '../services/scheduleService';
import { useSession } from '../session/SessionProvider';

const BLOCKING_ID = 'schedule-readiness-blocking';
const WARNINGS_ID = 'schedule-readiness-warnings';

type ReadinessState =
  { status: 'loading' } | { status: 'loaded'; readiness: ScheduleReadiness } | { status: 'error' };

type OverviewState =
  { status: 'loading' } | { status: 'loaded'; overview: ScheduleOverview } | { status: 'error' };

/**
 * «Generar horarios» (`/horarios`, US-ALGO-CHECK, US-ALGO-RUN y US-ALGO-CONFIRM), para `ADMIN` y `MEMBER`: arriba, el
 * resumen del horario oficial (que se pide aparte y, si falla, avisa sin bloquear nada); comprueba si el colegio está
 * listo para generar y, una vez cargada la comprobación, monta el panel de la generación (el botón «Generar» solo es
 * para un `ADMIN` y sin bloqueantes; un `MEMBER` ve el estado). Pide la comprobación y el resumen una vez (aunque
 * `StrictMode` ejecute el efecto dos veces) y, si fallan, ofrece «Reintentar». Si el panel avisa de que el colegio ya
 * no estaba listo, la comprobación se repite sin vaciar lo que se ve. Si se llega tras descartar el borrador, lo dice.
 */
export function ScheduleReadinessPage() {
  const { t } = useTranslation();
  const { authorizedFetch, state: session } = useSession();
  const isAdmin = session.status === 'authenticated' && session.data.user.role === 'ADMIN';
  const [state, setState] = useState<ReadinessState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [overview, setOverview] = useState<OverviewState>({ status: 'loading' });
  const [overviewAttempt, setOverviewAttempt] = useState(0);
  const location = useLocation();
  const discarded = (location.state as { notice?: string } | null)?.notice === 'discarded';
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // Intento ya pedido: en modo estricto el efecto se ejecuta dos veces, pero la comprobación se pide una.
  const requestedAttempt = useRef<number | undefined>(undefined);
  const requestedOverviewAttempt = useRef<number | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (requestedAttempt.current === attempt) {
      return;
    }
    requestedAttempt.current = attempt;
    void scheduleReadinessService.get(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setState({ status: 'loaded', readiness: outcome.readiness });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setState({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch]);

  useEffect(() => {
    if (requestedOverviewAttempt.current === overviewAttempt) {
      return;
    }
    requestedOverviewAttempt.current = overviewAttempt;
    void scheduleService.overview(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setOverview({ status: 'loaded', overview: outcome.overview });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setOverview({ status: 'error' });
          break;
      }
    });
  }, [overviewAttempt, authorizedFetch]);

  /** Vuelve a leer los horarios sin pasar por el estado de carga (una generación acaba de terminar). */
  function refreshOverview() {
    setOverviewAttempt((current) => current + 1);
  }

  function retryOverview() {
    setOverview({ status: 'loading' });
    setOverviewAttempt((current) => current + 1);
  }

  /** Repite la comprobación sin pasar por «Comprobando…»: lo que se ve se actualiza al llegar la respuesta. */
  function recheck() {
    setAttempt((current) => current + 1);
  }

  function retry() {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  return (
    <Container as="main" className="py-5" data-testid="schedule-readiness-page">
      <h1 className="mb-2">{t('schedule.readiness.title')}</h1>
      <p className="text-body-secondary mb-4">{t('schedule.readiness.intro')}</p>

      {discarded && (
        <Alert variant="success" role="status">
          {t('schedule.discard.done')}
        </Alert>
      )}

      <OfficialScheduleSummary
        state={overview.status}
        official={overview.status === 'loaded' ? overview.overview.official : null}
        previousCount={overview.status === 'loaded' ? overview.overview.previousCount : 0}
        onRetry={retryOverview}
      />

      {state.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('schedule.readiness.loading')}</span>
        </div>
      )}

      {state.status === 'loaded' && (
        <>
          <p
            role="status"
            className={`fs-5 fw-semibold d-flex align-items-center gap-2 ${
              state.readiness.ready ? 'text-success-emphasis' : 'text-danger-emphasis'
            }`}
            data-testid="schedule-readiness-verdict"
          >
            <span aria-hidden="true">{state.readiness.ready ? '✓' : '✕'}</span>
            <span>
              {state.readiness.ready
                ? t('schedule.readiness.verdict.ready')
                : t('schedule.readiness.verdict.notReady', {
                    count: state.readiness.blocking.length,
                  })}
            </span>
          </p>
          <p className="text-body-secondary">{t('schedule.readiness.note')}</p>

          <ScheduleGenerationPanel
            isAdmin={isAdmin}
            blocked={!state.readiness.ready}
            onNotReady={recheck}
            overview={overview.status === 'loaded' ? overview.overview : null}
            onFinished={refreshOverview}
          />

          {state.readiness.blocking.length > 0 && (
            <section aria-labelledby={BLOCKING_ID} className="mb-4">
              <h2 id={BLOCKING_ID} className="h5">
                {t('schedule.readiness.groups.blocking', {
                  count: state.readiness.blocking.length,
                })}
              </h2>
              <ul aria-labelledby={BLOCKING_ID} className="list-unstyled">
                {state.readiness.blocking.map((issue, index) => (
                  <ReadinessIssueItem
                    key={`${issue.code}-${String(index)}`}
                    issue={issue}
                    kind="blocking"
                  />
                ))}
              </ul>
            </section>
          )}

          {state.readiness.warnings.length > 0 && (
            <section aria-labelledby={WARNINGS_ID} className="mb-4">
              <h2 id={WARNINGS_ID} className="h5">
                {t('schedule.readiness.groups.warnings', {
                  count: state.readiness.warnings.length,
                })}
              </h2>
              <ul aria-labelledby={WARNINGS_ID} className="list-unstyled">
                {state.readiness.warnings.map((issue, index) => (
                  <ReadinessIssueItem
                    key={`${issue.code}-${String(index)}`}
                    issue={issue}
                    kind="warning"
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {state.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('schedule.readiness.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('schedule.readiness.retry')}
          </Button>
        </Alert>
      )}
    </Container>
  );
}
