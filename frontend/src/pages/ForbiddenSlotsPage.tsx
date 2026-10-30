import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { SlotGrid, type SlotGridCell } from '../components/SlotGrid';
import { SubjectWarnings } from '../components/SubjectWarnings';
import { slotsService, type SubjectSlotRule } from '../services/slotsService';
import { useSession } from '../session/SessionProvider';
import { subjectWarnings } from '../utils/courseWorkloadDraft';
import { sessionGroupsOf } from '../utils/sessionGroups';

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; slotRule: SubjectSlotRule }
  | { status: 'notFound' }
  | { status: 'error' };

type Notice = 'saved' | 'calendarChanged' | 'noCalendar' | 'forbidden' | 'saveError';

const keyOf = ({ dayOfWeek, sessionNumber }: SlotGridCell) =>
  `${String(dayOfWeek)}-${String(sessionNumber)}`;

/**
 * Franjas prohibidas de una asignatura en un curso (US19_c): cuelga de `AuthenticatedLayout` y la ven los dos
 * roles, en `/cursos/:courseId/carga/:subjectId/prohibidas`. Pide la regla una sola vez aunque `StrictMode`
 * ejecute los efectos dos veces, con «Reintentar» si falla y la vista «ya no se imparte» ante un `404`. Un curso
 * sin calendario no tiene jornada que marcar: lo explica con un enlace a los calendarios. Con calendario muestra
 * la cuadrícula (`SlotGrid`): el **administrador** marca celdas, columnas y filas, ve los avisos de la
 * asignatura recalculados al marcar (la misma regla que el servidor) y «Guardar», que solo se habilita con
 * diferencias —quitar celdas que ya no existen en el calendario cuenta— y lleva una guarda síncrona contra el
 * doble envío; el **miembro** ve la cuadrícula como texto. Con el `200` sigue en la página con lo que contesta el
 * servidor; un `404` muestra la vista de no disponible; un `409` avisa de que el curso ya no tiene calendario y
 * vuelve a pedirla; un `400` por una sesión que ya no existe vuelve a pedirla y avisa de que el calendario ha
 * cambiado; un `403` y cualquier otro fallo, un aviso conservando lo marcado. La decisión de permisos es del
 * backend: la interfaz solo oculta lo que no se podría guardar.
 */
export function ForbiddenSlotsPage() {
  const { t } = useTranslation();
  const { authorizedFetch, state } = useSession();
  const { courseId = '', subjectId = '' } = useParams();
  const isAdmin = state.status === 'authenticated' && state.data.user.role === 'ADMIN';
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [cells, setCells] = useState<SlotGridCell[]>([]);
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
    void slotsService.get(authorizedFetch, courseId, subjectId).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setLoad({ status: 'loaded', slotRule: outcome.slotRule });
          setCells([...outcome.slotRule.slots]);
          break;
        case 'notFound':
          setLoad({ status: 'notFound' });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setLoad({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch, courseId, subjectId]);

  function reload() {
    setLoad({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function retry() {
    setNotice(undefined);
    reload();
  }

  const loaded = load.status === 'loaded' ? load.slotRule : undefined;

  const changed = useMemo(() => {
    if (!loaded) {
      return false;
    }
    const saved = new Set(loaded.slots.map(keyOf));
    // Quitar las celdas que ya no existen en el calendario también es un cambio: se hace al guardar.
    return (
      loaded.outsideCalendarCount > 0 ||
      saved.size !== cells.length ||
      cells.some((slot) => !saved.has(keyOf(slot)))
    );
  }, [loaded, cells]);

  // Los avisos de la asignatura con lo marcado, con la misma regla que el servidor.
  const warnings = useMemo(
    () =>
      loaded?.calendar
        ? subjectWarnings(
            {
              sessionsPerWeek: loaded.subject.sessionsPerWeek,
              maxPerDay: loaded.subject.maxPerDay,
              blockSize: loaded.subject.blockSize,
            },
            { sessionGroups: sessionGroupsOf(loaded.calendar.periods) },
            { cells, outsideCount: loaded.outsideCalendarCount },
          )
        : (loaded?.warnings ?? []),
    [loaded, cells],
  );

  async function save() {
    if (submitting.current || !loaded || !changed) {
      return;
    }
    submitting.current = true;
    setSaving(true);
    setNotice(undefined);
    try {
      const outcome = await slotsService.update(authorizedFetch, courseId, subjectId, cells);
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'updated':
          setLoad({ status: 'loaded', slotRule: outcome.slotRule });
          setCells([...outcome.slotRule.slots]);
          setNotice('saved');
          break;
        case 'validationError':
          if (
            outcome.details.some(
              ({ field, code }) => field.endsWith('.sessionNumber') && code === 'OUT_OF_RANGE',
            )
          ) {
            // El calendario cambió mientras se marcaba: se vuelve a pedir la regla y se avisa.
            setNotice('calendarChanged');
            reload();
          } else {
            setNotice('saveError');
          }
          break;
        case 'notFound':
          setLoad({ status: 'notFound' });
          break;
        case 'noCalendar':
          setNotice('noCalendar');
          reload();
          break;
        case 'forbidden':
          setNotice('forbidden');
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

  const backToWorkload = (
    <Link to={`/cursos/${encodeURIComponent(courseId)}/carga`}>{t('slots.backToWorkload')}</Link>
  );

  return (
    <Container as="main" className="py-5" data-testid="forbidden-slots-page">
      {load.status === 'notFound' ? (
        <>
          <h1 tabIndex={-1}>{t('slots.notFound')}</h1>
          {backToWorkload}
        </>
      ) : (
        <>
          <div className="mb-3">{backToWorkload}</div>
          {loaded && (
            <h1 tabIndex={-1} className="mb-3">
              {t('slots.title', { subject: loaded.subject.name, course: loaded.course.name })}
            </h1>
          )}

          {(load.status === 'loading' || state.status !== 'authenticated') &&
            load.status !== 'error' && (
              <div role="status" className="d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span>{t('slots.loading')}</span>
              </div>
            )}

          {load.status === 'error' && (
            <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
              <span>{t('slots.loadError')}</span>
              <Button variant="outline-danger" size="sm" onClick={retry}>
                {t('slots.retry')}
              </Button>
            </Alert>
          )}

          {notice === 'saved' && (
            <Alert variant="success" role="status">
              {t('slots.saved')}
            </Alert>
          )}
          {notice === 'calendarChanged' && (
            <Alert variant="danger" role="alert">
              {t('slots.calendarChanged')}
            </Alert>
          )}
          {notice === 'noCalendar' && (
            <Alert variant="danger" role="alert">
              {t('slots.noCalendarSaved')}
            </Alert>
          )}
          {notice === 'forbidden' && (
            <Alert variant="danger" role="alert">
              {t('slots.forbidden')}
            </Alert>
          )}
          {notice === 'saveError' && (
            <Alert variant="danger" role="alert">
              {t('slots.saveError')}
            </Alert>
          )}

          {loaded && state.status === 'authenticated' && loaded.calendar === null && (
            <div>
              <p className="fs-5 mb-1">{t('slots.noCalendar')}</p>
              <p className="text-body-secondary">{t('slots.noCalendarHint')}</p>
              <Link to="/calendarios">{t('slots.calendarsLink')}</Link>
            </div>
          )}

          {loaded && state.status === 'authenticated' && loaded.calendar !== null && (
            <>
              <p className="text-body-secondary">{t('slots.intro')}</p>
              {loaded.outsideCalendarCount > 0 && (
                <Alert variant="danger" className="py-2">
                  {t('slots.outside', { count: loaded.outsideCalendarCount })}
                </Alert>
              )}
              <SubjectWarnings
                subject={loaded.subject.name}
                warnings={warnings}
                omit={['SLOTS_OUTSIDE_CALENDAR']}
              />
              <div className="mt-3">
                <SlotGrid
                  caption={t('slots.caption', {
                    subject: loaded.subject.name,
                    course: loaded.course.name,
                  })}
                  periods={loaded.calendar.periods}
                  cells={cells}
                  editable={isAdmin}
                  onChange={setCells}
                />
              </div>
              {isAdmin ? (
                <Button
                  variant="primary"
                  disabled={!changed || saving}
                  onClick={() => {
                    void save();
                  }}
                >
                  {saving ? t('slots.saving') : t('slots.save')}
                </Button>
              ) : (
                <p className="text-body-secondary">{t('slots.forbidden')}</p>
              )}
            </>
          )}
        </>
      )}
    </Container>
  );
}
