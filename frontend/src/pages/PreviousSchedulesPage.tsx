import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import ListGroup from 'react-bootstrap/ListGroup';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { scheduleService, type ScheduleSummary } from '../services/scheduleService';
import { useSession } from '../session/SessionProvider';

type ListState =
  { status: 'loading' } | { status: 'loaded'; schedules: ScheduleSummary[] } | { status: 'error' };

/**
 * Los horarios oficiales anteriores (`/horarios/anteriores`, US-ALGO-CONFIRM_b), para `ADMIN` y `MEMBER`: los que se
 * sustituyeron, el sustituido más recientemente primero. Pide la lista una vez (aunque `StrictMode` ejecute el efecto
 * dos veces) y, si falla, ofrece «Reintentar». Cada fila enlaza a `/horarios/anteriores/:id`.
 */
export function PreviousSchedulesPage() {
  const { t, i18n } = useTranslation();
  const { authorizedFetch } = useSession();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // Intento ya pedido: en modo estricto el efecto se ejecuta dos veces, pero la lista se pide una.
  const requestedAttempt = useRef<number | undefined>(undefined);

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
    void scheduleService.previous(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', schedules: outcome.schedules });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setList({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch]);

  function retry() {
    setList({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  const format = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <Container as="main" className="py-5" data-testid="previous-schedules-page">
      <h1 className="mb-2">{t('schedule.previous.title')}</h1>
      <p className="text-body-secondary mb-4">{t('schedule.previous.intro')}</p>

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('schedule.previous.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('schedule.previous.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('schedule.previous.retry')}
          </Button>
        </Alert>
      )}

      {list.status === 'loaded' && list.schedules.length === 0 && (
        <p>{t('schedule.previous.empty')}</p>
      )}

      {list.status === 'loaded' && list.schedules.length > 0 && (
        <ListGroup as="ul" className="mb-4">
          {list.schedules.map((schedule) => {
            const confirmedAt =
              schedule.confirmedAt === null ? '' : format.format(new Date(schedule.confirmedAt));
            const replacedAt =
              schedule.replacedAt === null ? '' : format.format(new Date(schedule.replacedAt));
            const name =
              `${schedule.confirmedBy?.firstName ?? ''} ${schedule.confirmedBy?.lastName ?? ''}`.trim();
            return (
              <ListGroup.Item
                as="li"
                key={schedule.id}
                className="d-flex flex-wrap justify-content-between align-items-center gap-3"
              >
                <div>
                  <p className="mb-0 fw-semibold">
                    {t('schedule.previous.row.confirmed', { date: confirmedAt, name })}
                  </p>
                  <p className="mb-0 text-body-secondary">
                    {t('schedule.previous.row.replaced', { date: replacedAt })}
                    {' · '}
                    {t('schedule.previous.row.sessions', { count: schedule.placedSessions })}
                  </p>
                </div>
                <Link
                  to={`/horarios/anteriores/${schedule.id}`}
                  aria-label={t('schedule.previous.row.viewLabel', { date: confirmedAt })}
                >
                  {t('schedule.previous.row.view')}
                </Link>
              </ListGroup.Item>
            );
          })}
        </ListGroup>
      )}

      <Link to="/horarios">{t('schedule.previous.back')}</Link>
    </Container>
  );
}
