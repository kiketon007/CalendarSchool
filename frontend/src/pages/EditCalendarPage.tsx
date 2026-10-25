import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  CalendarForm,
  type CalendarCoursesState,
  type CalendarFormValues,
  type CalendarSubmitResult,
} from '../components/CalendarForm';
import {
  calendarsService,
  type Calendar,
  type CreateCalendarInput,
} from '../services/calendarsService';
import { coursesService } from '../services/coursesService';
import { useSession } from '../session/SessionProvider';

type CalendarState =
  | { status: 'loading' }
  | { status: 'loaded'; calendar: Calendar }
  | { status: 'notFound' }
  | { status: 'error' };

function valuesOf(calendar: Calendar): CalendarFormValues {
  return {
    name: calendar.name,
    periods: calendar.periods.map(({ type, startTime, endTime }) => ({ type, startTime, endTime })),
    courseIds: calendar.courses.map(({ id }) => id),
  };
}

/**
 * Edición de un calendario base (US-BASE_b): cuelga de `AuthenticatedLayout` y de `RequireRole` con el rol
 * `ADMIN` (la guarda de la interfaz es una comodidad: decide el backend, que responde `403` a un `MEMBER`).
 * Pide el calendario, los cursos y los calendarios una sola vez cada uno aunque `StrictMode` ejecute los
 * efectos dos veces, y deja el formulario (el mismo del alta, con «Guardar» solo con cambios) a `CalendarForm`.
 * Los cursos que siguen este calendario no avisan de que se moverán, solo los de otro; sin los calendarios el
 * formulario sirve igual, sin ese aviso. Un `404` al cargar o al guardar (otro colegio, inexistente o borrado
 * mientras se editaba) muestra «no existe o ya no está disponible» con un enlace al listado; un fallo al
 * cargar ofrece «Reintentar». Con el `200` vuelve al listado, reemplazando la entrada del historial, con el
 * nombre que guardó el servidor para el aviso. Un `400` marca los campos que rechaza el servidor y, si un curso
 * ya no existe, vuelve a pedir los cursos sin vaciar el formulario; un `409` marca el nombre; cualquier otro
 * fallo muestra un aviso general conservando lo escrito.
 */
export function EditCalendarPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();
  const { id = '' } = useParams();
  const [state, setState] = useState<CalendarState>({ status: 'loading' });
  const [coursesState, setCoursesState] = useState<CalendarCoursesState>({ status: 'loading' });
  const [followedBy, setFollowedBy] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<'unavailable' | 'forbiddenEdit'>('unavailable');
  // Intentos de carga: subirlos vuelve a pedir el calendario (reintento) o los cursos (curso borrado).
  const [attempt, setAttempt] = useState(0);
  const [coursesAttempt, setCoursesAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto los efectos se ejecutan dos veces, pero cada intento se pide una vez.
  const requestedAttempt = useRef<number | undefined>(undefined);
  const requestedCoursesAttempt = useRef<number | undefined>(undefined);

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
    void calendarsService.get(authorizedFetch, id).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setState({ status: 'loaded', calendar: outcome.calendar });
          break;
        case 'notFound':
          setState({ status: 'notFound' });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setState({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch, id]);

  useEffect(() => {
    if (requestedCoursesAttempt.current === coursesAttempt) {
      return;
    }
    requestedCoursesAttempt.current = coursesAttempt;
    void Promise.all([
      coursesService.list(authorizedFetch),
      calendarsService.list(authorizedFetch),
    ]).then(([courses, calendars]) => {
      if (!mounted.current) {
        return;
      }
      switch (courses.status) {
        case 'loaded':
          setCoursesState({
            status: 'loaded',
            courses: courses.courses.map(({ id: courseId, name }) => ({ id: courseId, name })),
          });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setCoursesState({ status: 'error' });
          break;
      }
      // Sin los calendarios el formulario sirve igual: solo falta el aviso de los cursos que se moverán. Los
      // cursos de este mismo calendario no se mueven, así que no se avisan.
      setFollowedBy(
        calendars.status === 'loaded'
          ? Object.fromEntries(
              calendars.calendars
                .filter((calendar) => calendar.id.toLowerCase() !== id.toLowerCase())
                .flatMap((calendar) =>
                  calendar.courses.map((course) => [course.id, calendar.name] as const),
                ),
            )
          : {},
      );
    });
  }, [coursesAttempt, authorizedFetch, id]);

  function retry() {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function reloadCourses() {
    setCoursesState({ status: 'loading' });
    setCoursesAttempt((current) => current + 1);
  }

  async function save(values: CreateCalendarInput): Promise<CalendarSubmitResult> {
    setFailure('unavailable');
    const outcome = await calendarsService.update(authorizedFetch, id, values);
    switch (outcome.status) {
      case 'updated':
        void navigate('/calendarios', {
          replace: true,
          state: { calendarUpdated: outcome.calendar.name },
        });
        return { status: 'done' };
      case 'validationError':
        if (outcome.details.some(({ field }) => field.startsWith('courseIds'))) {
          // Un curso elegido ya no existe: se vuelve a pedir la lista sin tocar lo escrito.
          reloadCourses();
        }
        return { status: 'validationError', details: outcome.details };
      case 'alreadyExists':
        return { status: 'nameTaken' };
      case 'notFound':
        if (mounted.current) {
          setState({ status: 'notFound' });
        }
        return { status: 'done' };
      case 'forbidden':
        setFailure('forbiddenEdit');
        return { status: 'failed' };
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        return { status: 'done' };
      case 'unavailable':
        return { status: 'failed' };
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="edit-calendar-page">
      <h1>{t('calendars.form.editTitle')}</h1>

      {state.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('calendars.form.loadingOne')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('calendars.form.loadErrorOne')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('calendars.retry')}
          </Button>
        </Alert>
      )}

      {state.status === 'notFound' && (
        <div>
          <p>{t('calendars.form.notFound')}</p>
          <Link to="/calendarios">{t('calendars.form.backToList')}</Link>
        </div>
      )}

      {state.status === 'loaded' && (
        <CalendarForm
          // Una carga nueva monta el formulario de nuevo con los valores del servidor.
          key={attempt}
          initialValues={valuesOf(state.calendar)}
          requireChanges
          courses={coursesState}
          followedBy={followedBy}
          onRetryCourses={reloadCourses}
          onSubmit={save}
          failureMessage={t(`calendars.form.errors.${failure}`)}
        />
      )}
    </Container>
  );
}
