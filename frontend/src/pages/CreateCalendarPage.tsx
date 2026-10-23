import { useEffect, useRef, useState } from 'react';
import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  CalendarForm,
  type CalendarCoursesState,
  type CalendarSubmitResult,
} from '../components/CalendarForm';
import { calendarsService, type CreateCalendarInput } from '../services/calendarsService';
import { coursesService } from '../services/coursesService';
import { useSession } from '../session/SessionProvider';

/**
 * Página para crear un calendario base (US-BASE): cuelga de `AuthenticatedLayout` y de `RequireRole` con el
 * rol `ADMIN` (la guarda de la interfaz es una comodidad: decide el backend, que responde `403` a un
 * `MEMBER`). Pide una vez los cursos del colegio y los calendarios que ya existen, para ofrecer los cursos y
 * avisar de los que siguen otro calendario y se moverán; si los calendarios no se pueden leer, el formulario
 * sirve igual, sin el aviso. Deja el formulario (validación, foco, guarda contra el doble envío) a
 * `CalendarForm`. Con el `201` vuelve al listado con el nombre que guardó el servidor para el aviso. Un `400`
 * marca los campos que rechaza el servidor y, si un curso ya no existe (otra persona lo borró), vuelve a pedir
 * los cursos sin vaciar el formulario; un `409` marca el nombre; cualquier otro fallo muestra un aviso general
 * conservando lo escrito.
 */
export function CreateCalendarPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();
  const [coursesState, setCoursesState] = useState<CalendarCoursesState>({ status: 'loading' });
  const [followedBy, setFollowedBy] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<'unavailable' | 'forbidden'>('unavailable');
  // Intento de carga: subirlo vuelve a pedir los cursos (reintento o curso borrado por otra persona).
  const [attempt, setAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto el efecto se ejecuta dos veces, pero los datos se piden una vez por intento.
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
            courses: courses.courses.map(({ id, name }) => ({ id, name })),
          });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setCoursesState({ status: 'error' });
          break;
      }
      // Sin los calendarios el formulario sirve igual: solo falta el aviso de los cursos que se moverán.
      setFollowedBy(
        calendars.status === 'loaded'
          ? Object.fromEntries(
              calendars.calendars.flatMap((calendar) =>
                calendar.courses.map((course) => [course.id, calendar.name] as const),
              ),
            )
          : {},
      );
    });
  }, [attempt, authorizedFetch]);

  function reloadCourses() {
    setCoursesState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  async function create(values: CreateCalendarInput): Promise<CalendarSubmitResult> {
    setFailure('unavailable');
    const outcome = await calendarsService.create(authorizedFetch, values);
    switch (outcome.status) {
      case 'created':
        void navigate('/calendarios', {
          replace: true,
          state: { calendarCreated: outcome.calendar.name },
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
      case 'forbidden':
        setFailure('forbidden');
        return { status: 'failed' };
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        return { status: 'done' };
      case 'unavailable':
        return { status: 'failed' };
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="create-calendar-page">
      <h1>{t('calendars.form.title')}</h1>
      <CalendarForm
        courses={coursesState}
        followedBy={followedBy}
        onRetryCourses={reloadCourses}
        onSubmit={create}
        failureMessage={t(`calendars.form.errors.${failure}`)}
      />
    </Container>
  );
}
