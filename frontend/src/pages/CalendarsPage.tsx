import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { calendarsService, type Calendar } from '../services/calendarsService';
import { useSession } from '../session/SessionProvider';
import { sessionNumbers, summaryOf } from '../utils/calendarPeriods';

type ListState =
  { status: 'loading' } | { status: 'loaded'; calendars: Calendar[] } | { status: 'error' };

const TITLE_ID = 'calendars-title';

/** El aviso con el que se llega: el calendario recién creado o editado y su nombre. */
interface Notice {
  kind: 'created' | 'updated';
  name: string;
}

/**
 * Aviso que llega en el estado de la navegación: `{ calendarCreated: <nombre> }` de `CreateCalendarPage` o
 * `{ calendarUpdated: <nombre> }` de `EditCalendarPage`. Solo viaja en el estado de la navegación (nunca en
 * almacenamiento propio); acepta únicamente un texto no vacío y descarta cualquier otra forma.
 */
function noticeFrom(state: unknown): Notice | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const { calendarCreated, calendarUpdated } = state as Record<string, unknown>;
  if (typeof calendarCreated === 'string' && calendarCreated.length > 0) {
    return { kind: 'created', name: calendarCreated };
  }
  if (typeof calendarUpdated === 'string' && calendarUpdated.length > 0) {
    return { kind: 'updated', name: calendarUpdated };
  }
  return undefined;
}

/**
 * Calendarios base del colegio (US-BASE): cuelga de `AuthenticatedLayout` y la ven los dos roles. Pide la lista
 * una sola vez aunque `StrictMode` ejecute el efecto dos veces; si falla ofrece reintentarla, y si la sesión se
 * perdió no hace nada, porque el layout ya redirige. Pinta una tarjeta por calendario con sus periodos en el
 * orden del día (las sesiones con su número, los recreos aparte), el resumen de la jornada y los cursos que lo
 * siguen. Es de **lectura para los dos roles y alta y edición solo para `ADMIN`**: el botón «Crear calendario»
 * y el enlace «Editar» de cada tarjeta solo se pintan al administrador (es una comodidad de la interfaz leída
 * de la sesión; el backend decide) y el `MEMBER` ve en su lugar por qué no puede. Si se llega de crear o de
 * editar un calendario, muestra un aviso con su nombre como texto plano.
 */
export function CalendarsPage() {
  const { t } = useTranslation();
  const { authorizedFetch, state } = useSession();
  const notice = noticeFrom(useLocation().state);
  const isAdmin = state.status === 'authenticated' && state.data.user.role === 'ADMIN';
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
    void calendarsService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', calendars: outcome.calendars });
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

  const createLink = (
    <Link to="/calendarios/nuevo" className="btn btn-primary">
      {t('calendars.create')}
    </Link>
  );

  return (
    <Container as="main" className="py-5" data-testid="calendars-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <h1 id={TITLE_ID} className="mb-0">
          {t('calendars.title')}
        </h1>
        {isAdmin && createLink}
      </div>

      {!isAdmin && state.status === 'authenticated' && (
        <p className="text-body-secondary">{t('calendars.readOnly')}</p>
      )}

      {notice !== undefined && (
        // Un `Alert` lleva `role="alert"` por defecto: es un aviso informativo, no un error.
        <Alert variant="success" role="status">
          {t(notice.kind === 'created' ? 'calendars.created' : 'calendars.updated', {
            name: notice.name,
          })}
        </Alert>
      )}

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('calendars.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('calendars.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('calendars.retry')}
          </Button>
        </Alert>
      )}

      {list.status === 'loaded' && list.calendars.length === 0 && (
        <div>
          <p className="fs-5 mb-1">{t('calendars.empty')}</p>
          <p className="text-body-secondary">{t('calendars.emptyHint')}</p>
        </div>
      )}

      {list.status === 'loaded' && list.calendars.length > 0 && (
        <div className="d-grid gap-3">
          {list.calendars.map((calendar) => (
            <CalendarCard key={calendar.id} calendar={calendar} canEdit={isAdmin} />
          ))}
        </div>
      )}
    </Container>
  );
}

/**
 * Una tarjeta: el nombre, los periodos en orden, el resumen de la jornada, los cursos que lo siguen y, para
 * el administrador, el enlace a su edición.
 */
function CalendarCard({ calendar, canEdit }: { calendar: Calendar; canEdit: boolean }) {
  const { t } = useTranslation();
  const titleId = `calendar-${calendar.id}-title`;
  const numbers = sessionNumbers(calendar.periods);
  const summary = summaryOf(calendar.periods);

  return (
    <Card as="article" aria-labelledby={titleId}>
      <Card.Body>
        <h2 id={titleId} className="h5 text-break">
          {calendar.name}
        </h2>
        <ul
          aria-label={t('calendars.periodsOf', { name: calendar.name })}
          className="list-unstyled mb-3"
        >
          {calendar.periods.map((period, index) => {
            const number = numbers[index];
            const label =
              period.type === 'BREAK' ? t('calendars.break') : t('calendars.session', { number });
            return (
              <li
                key={`${String(index)}-${period.startTime}`}
                className={period.type === 'BREAK' ? 'text-body-secondary' : undefined}
              >
                {`${label} · ${t('calendars.range', { start: period.startTime, end: period.endTime })}`}
              </li>
            );
          })}
        </ul>
        <p className="mb-1">
          {`${t('calendars.summary.sessions', { count: summary.sessionsPerDay })} · ${t('calendars.summary.week', { count: summary.sessionsPerWeek })} · ${t('calendars.summary.minutes', { count: summary.lectiveMinutes })}`}
        </p>
        <p className="mb-0 text-break">
          {calendar.courses.length > 0
            ? t('calendars.courses', {
                courses: calendar.courses.map(({ name }) => name).join(', '),
              })
            : t('calendars.noCourses')}
        </p>
        {canEdit && (
          <Link
            to={`/calendarios/${calendar.id}/editar`}
            aria-label={t('calendars.editAria', { name: calendar.name })}
            className="btn btn-outline-secondary btn-sm mt-3"
          >
            {t('calendars.edit')}
          </Link>
        )}
      </Card.Body>
    </Card>
  );
}
