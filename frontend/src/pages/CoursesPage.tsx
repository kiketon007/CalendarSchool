import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { coursesService, type Course } from '../services/coursesService';
import { useSession } from '../session/SessionProvider';

type ListState =
  { status: 'loading' } | { status: 'loaded'; courses: Course[] } | { status: 'error' };

/**
 * Nombre del curso recién creado, si la navegación llega de `CreateCoursePage`. Solo viaja en el
 * estado de la navegación (nunca en almacenamiento): al recargar la página el aviso se pierde. Acepta
 * únicamente `{ courseCreated: <texto no vacío> }` y descarta cualquier otra forma.
 */
function courseCreatedFrom(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null || !('courseCreated' in state)) {
    return undefined;
  }
  const { courseCreated } = state;
  return typeof courseCreated === 'string' && courseCreated.length > 0 ? courseCreated : undefined;
}

/**
 * Cursos del colegio (US05): cuelga de `AuthenticatedLayout` y la ven los dos roles. Muestra cada curso
 * con sus clases y el tutor, que de momento siempre falta («Sin tutor»), en el orden que da el
 * servidor. Pide la lista una sola vez aunque `StrictMode` ejecute el efecto dos veces; si falla ofrece
 * reintentarla, y si la sesión se perdió no hace nada, porque el layout ya redirige. El botón «Crear
 * curso» siempre está disponible.
 */
export function CoursesPage() {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  const createdCourse = courseCreatedFrom(useLocation().state);
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
    void coursesService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', courses: outcome.courses });
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

  return (
    <Container as="main" className="py-5" data-testid="courses-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <h1 className="mb-0">{t('courses.title')}</h1>
        <Link to="/cursos/nuevo" className="btn btn-primary">
          {t('courses.create')}
        </Link>
      </div>

      {createdCourse !== undefined && (
        // Un `Alert` lleva `role="alert"` por defecto: es un aviso informativo, no un error.
        <Alert variant="success" role="status">
          {t('courses.created', { name: createdCourse })}
        </Alert>
      )}

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('courses.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('courses.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('courses.retry')}
          </Button>
        </Alert>
      )}

      {list.status === 'loaded' && list.courses.length === 0 && (
        <div>
          <p className="fs-5 mb-1">{t('courses.empty')}</p>
          <p className="text-body-secondary">{t('courses.emptyHint')}</p>
        </div>
      )}

      {list.status === 'loaded' &&
        list.courses.map((course) => (
          <section key={course.id} aria-labelledby={`course-${course.id}`} className="mb-4">
            <h2 id={`course-${course.id}`} className="h4">
              {course.name}
            </h2>
            <ul aria-label={t('courses.classesOf', { course: course.name })} className="mb-0">
              {course.classes.map((schoolClass) => (
                <li key={schoolClass.id}>{`${schoolClass.name} — ${t('courses.noTutor')}`}</li>
              ))}
            </ul>
          </section>
        ))}
    </Container>
  );
}
