import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { SlotGrid, type SlotGridCell } from '../components/SlotGrid';
import { calendarsService, type Calendar } from '../services/calendarsService';
import { professorAvailabilityService } from '../services/professorAvailabilityService';
import { professorsService } from '../services/professorsService';
import { useSession } from '../session/SessionProvider';
import { toClock } from '../utils/calendarPeriods';
import {
  cellStates,
  countAvailable,
  defaultCalendar,
  fromApi,
  normalizeUnavailability,
  outsideView,
  sessionsOf,
  toApi,
  toggleCell,
  toggleLine,
  type Interval,
} from '../utils/professorAvailability';

type LoadState =
  { status: 'loading' } | { status: 'loaded' } | { status: 'notFound' } | { status: 'error' };

type Notice = 'saved' | 'saveError' | 'validationError';

const sameIntervals = (a: readonly Interval[], b: readonly Interval[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Disponibilidad horaria de un profesor (`/profesores/:id/disponibilidad`, US-PROF-AVAIL), para `ADMIN` y
 * `MEMBER`. Se guardan **horas**, no números de sesión, porque un profesor da clase en cursos que pueden seguir
 * calendarios distintos: la cuadrícula es una vista sobre las sesiones del calendario elegido (el que siguen más
 * cursos al abrir, con un selector si hay más de uno) y lo marcado desde otro calendario se conserva. El estado de
 * la página son los tramos no disponibles (`Interval`, normalizados); cada celda se deriva de ellos como disponible,
 * no disponible (cubierta entera) o parcial (la solapa algún tramo), siempre con icono y texto. Pulsar una celda o
 * una cabecera suma o resta tramos (`utils/professorAvailability.ts`) y «Guardar» envía el estado final. Pide el
 * profesor, su disponibilidad y los calendarios una vez (aunque `StrictMode` ejecute el efecto dos veces).
 */
export function ProfessorAvailabilityPage() {
  const { t } = useTranslation();
  const { authorizedFetch, state } = useSession();
  const { id = '' } = useParams();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [saved, setSaved] = useState<Interval[]>([]);
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | undefined>(undefined);
  // Guarda síncrona: el estado `saving` tarda un render en reflejarse y una doble pulsación llegaría antes.
  const submitting = useRef(false);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto los efectos se ejecutan dos veces, pero cada intento se pide una vez.
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
    void Promise.all([
      professorsService.get(authorizedFetch, id),
      professorAvailabilityService.get(authorizedFetch, id),
      calendarsService.list(authorizedFetch),
    ]).then(([professor, availability, calendarList]) => {
      if (!mounted.current) {
        return;
      }
      if (professor.status === 'notFound' || availability.status === 'notFound') {
        setLoad({ status: 'notFound' });
      } else if (
        professor.status === 'unauthenticated' ||
        availability.status === 'unauthenticated' ||
        calendarList.status === 'unauthenticated'
      ) {
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
      } else if (
        professor.status === 'loaded' &&
        availability.status === 'loaded' &&
        calendarList.status === 'loaded'
      ) {
        const loadedIntervals = normalizeUnavailability(
          fromApi(availability.availability.unavailable),
        );
        setName(`${professor.professor.firstName} ${professor.professor.lastName}`);
        setCalendars(calendarList.calendars);
        setSaved(loadedIntervals);
        setIntervals(loadedIntervals);
        setLoad({ status: 'loaded' });
      } else {
        setLoad({ status: 'error' });
      }
    });
  }, [attempt, authorizedFetch, id]);

  function retry() {
    setNotice(undefined);
    setLoad({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  const calendar =
    calendars.find(({ id: candidate }) => candidate === calendarId) ?? defaultCalendar(calendars);
  const sessions = useMemo(() => sessionsOf(calendar?.periods ?? []), [calendar]);
  const states = useMemo(() => cellStates(intervals, sessions), [intervals, sessions]);
  const outside = useMemo(() => outsideView(intervals, sessions), [intervals, sessions]);
  const changed = !sameIntervals(normalizeUnavailability(intervals), saved);

  const unavailableCells: SlotGridCell[] = [];
  const partialCells: { cell: SlotGridCell; label: string }[] = [];
  for (const [key, info] of states) {
    const [day = 0, session = 0] = key.split('-').map(Number);
    const cell = { dayOfWeek: day, sessionNumber: session };
    if (info.state === 'unavailable') {
      unavailableCells.push(cell);
    } else if (info.state === 'partial') {
      partialCells.push({
        cell,
        label: info.intervals
          .map(({ startMinute, endMinute }) => `${toClock(startMinute)}–${toClock(endMinute)}`)
          .join(', '),
      });
    }
  }

  const rangeText = (list: readonly Interval[]) =>
    list
      .map(({ dayOfWeek, startMinute, endMinute }) =>
        t('availability.range', {
          day: t(`slots.grid.days.${String(dayOfWeek)}`),
          start: toClock(startMinute),
          end: toClock(endMinute),
        }),
      )
      .join(', ');

  function changeIntervals(next: Interval[]) {
    setNotice(undefined);
    setConfirmingAll(false);
    setIntervals(next);
  }

  function availableAll() {
    if (outside.length > 0) {
      setConfirmingAll(true);
      return;
    }
    changeIntervals([]);
  }

  async function save() {
    if (submitting.current || !changed) {
      return;
    }
    submitting.current = true;
    setSaving(true);
    setNotice(undefined);
    try {
      const outcome = await professorAvailabilityService.update(
        authorizedFetch,
        id,
        toApi(normalizeUnavailability(intervals)),
      );
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'updated': {
          const stored = normalizeUnavailability(fromApi(outcome.availability.unavailable));
          setSaved(stored);
          setIntervals(stored);
          setNotice('saved');
          break;
        }
        case 'validationError':
          setNotice('validationError');
          break;
        case 'notFound':
          setLoad({ status: 'notFound' });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setNotice('saveError');
          break;
      }
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  const backToProfessors = <Link to="/profesores">{t('availability.backToProfessors')}</Link>;
  const ready = load.status === 'loaded' && state.status === 'authenticated';

  return (
    <Container as="main" className="py-5" data-testid="professor-availability-page">
      {load.status === 'notFound' ? (
        <>
          <h1 tabIndex={-1}>{t('availability.notFound')}</h1>
          {backToProfessors}
        </>
      ) : (
        <>
          <div className="mb-3">{backToProfessors}</div>
          {ready && (
            <h1 tabIndex={-1} className="mb-3">
              {t('availability.title', { name })}
            </h1>
          )}

          {(load.status === 'loading' || state.status !== 'authenticated') &&
            load.status !== 'error' && (
              <div role="status" className="d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span>{t('availability.loading')}</span>
              </div>
            )}

          {load.status === 'error' && (
            <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
              <span>{t('availability.loadError')}</span>
              <Button variant="outline-danger" size="sm" onClick={retry}>
                {t('availability.retry')}
              </Button>
            </Alert>
          )}

          {notice === 'saved' && (
            <Alert variant="success" role="status">
              {t('availability.saved', { name })}
            </Alert>
          )}
          {notice === 'saveError' && (
            <Alert variant="danger" role="alert">
              {t('availability.saveError')}
            </Alert>
          )}
          {notice === 'validationError' && (
            <Alert variant="danger" role="alert">
              {t('availability.validationError')}
            </Alert>
          )}

          {ready && calendar === undefined && (
            <div>
              <p className="fs-5 mb-1">{t('availability.noCalendars')}</p>
              <Link to="/calendarios">{t('availability.calendarsLink')}</Link>
            </div>
          )}

          {ready && calendar !== undefined && (
            <>
              <p className="text-body-secondary">{t('availability.intro', { name })}</p>

              {calendars.length > 1 && (
                <Form.Group className="mb-3" controlId="availability-calendar">
                  <Form.Label>{t('availability.calendar')}</Form.Label>
                  <Form.Select
                    value={calendar.id}
                    aria-describedby="availability-calendar-hint"
                    onChange={(event) => {
                      setCalendarId(event.target.value);
                    }}
                  >
                    {calendars.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </Form.Select>
                  <Form.Text id="availability-calendar-hint" muted>
                    {t('availability.calendarHint')}
                  </Form.Text>
                </Form.Group>
              )}

              <SlotGrid
                caption={t('availability.caption', { name, calendar: calendar.name })}
                periods={calendar.periods}
                cells={unavailableCells}
                partialCells={partialCells}
                editable
                mode="unavailable"
                onToggleCell={(cell) => {
                  changeIntervals(toggleCell(intervals, cell, sessions));
                }}
                onToggleLine={(line) => {
                  changeIntervals(toggleLine(intervals, line, sessions));
                }}
              />

              <p role="status" className="fw-semibold mb-1">
                {t('availability.summary', {
                  available: countAvailable(states),
                  total: states.size,
                  calendar: calendar.name,
                })}
              </p>
              {outside.length > 0 && (
                <p className="text-body-secondary">
                  {t('availability.outside', { ranges: rangeText(outside) })}
                </p>
              )}

              {confirmingAll && (
                <Alert variant="warning" role="alert">
                  <p className="mb-2">
                    {t('availability.confirmAll', { ranges: rangeText(outside) })}
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        changeIntervals([]);
                      }}
                    >
                      {t('availability.confirmAllYes')}
                    </Button>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => {
                        setConfirmingAll(false);
                      }}
                    >
                      {t('availability.cancel')}
                    </Button>
                  </div>
                </Alert>
              )}

              <div className="d-flex flex-wrap gap-2 mt-3">
                <Button
                  variant="outline-secondary"
                  disabled={intervals.length === 0}
                  onClick={availableAll}
                >
                  {t('availability.availableAll')}
                </Button>
                <Button
                  variant="primary"
                  disabled={!changed || saving}
                  onClick={() => {
                    void save();
                  }}
                >
                  {saving ? t('availability.saving') : t('availability.save')}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </Container>
  );
}
