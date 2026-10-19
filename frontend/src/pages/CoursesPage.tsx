import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { coursesService, type Course } from '../services/coursesService';
import { useSession } from '../session/SessionProvider';
import { matchesCourseSearch } from '../utils/courseSearch';

type ListState =
  { status: 'loading' } | { status: 'loaded'; courses: Course[] } | { status: 'error' };

/** Punto de corte `md` de Bootstrap: desde aquí el listado es una tabla y por debajo, tarjetas. */
const WIDE_SCREEN = '(min-width: 768px)';
const TITLE_ID = 'courses-title';

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

/** Datos de un curso ya preparados para pintar, iguales en la tabla y en las tarjetas. */
interface CourseRow {
  id: string;
  name: string;
  classes: string;
  tutors: string;
  created: string;
}

/**
 * Cursos del colegio (US05 y US06): cuelga de `AuthenticatedLayout` y la ven los dos roles. Pide la
 * lista una sola vez aunque `StrictMode` ejecute el efecto dos veces; si falla ofrece reintentarla, y
 * si la sesión se perdió no hace nada, porque el layout ya redirige. Con cursos muestra una tabla
 * desde 768 px y una tarjeta por curso por debajo (solo una de las dos, para que los lectores de
 * pantalla no lean el contenido dos veces) y un campo para buscar por nombre. La búsqueda filtra en el
 * navegador sin volver a pedir nada y vive solo en el estado de la página. El tutor es siempre «Sin
 * tutor» hasta que existan los profesores. El botón «Crear curso» siempre está disponible.
 */
export function CoursesPage() {
  const { t, i18n } = useTranslation();
  const { authorizedFetch } = useSession();
  const createdCourse = courseCreatedFrom(useLocation().state);
  const isWide = useMediaQuery(WIDE_SCREEN);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
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

  const loadedCourses = list.status === 'loaded' ? list.courses : undefined;
  const hasQuery = query.trim() !== '';
  const rows = useMemo<CourseRow[]>(() => {
    const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
    return (loadedCourses ?? [])
      .filter((course) => matchesCourseSearch(course.name, query))
      .map((course) => ({
        id: course.id,
        name: course.name,
        classes: t('courses.classCount', {
          count: course.classes.length,
          names: course.classes.map((schoolClass) => schoolClass.name).join(', '),
        }),
        // De momento ninguna clase tiene tutor: US09 y US07 decidirán cómo se listan sus nombres.
        tutors: t('courses.noTutor'),
        created: dateFormat.format(new Date(course.createdAt)),
      }));
  }, [loadedCourses, query, i18n.language, t]);

  function retry() {
    setList({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  return (
    <Container as="main" className="py-5" data-testid="courses-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <h1 id={TITLE_ID} className="mb-0">
          {t('courses.title')}
        </h1>
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

      {loadedCourses?.length === 0 && (
        <div>
          <p className="fs-5 mb-1">{t('courses.empty')}</p>
          <p className="text-body-secondary">{t('courses.emptyHint')}</p>
        </div>
      )}

      {loadedCourses !== undefined && loadedCourses.length > 0 && (
        <>
          <Form.Group className="mb-3" controlId="course-search">
            <Form.Label>{t('courses.search.label')}</Form.Label>
            <Form.Control
              ref={searchRef}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </Form.Group>

          {hasQuery && (
            <p role="status" className="text-body-secondary">
              {rows.length > 0
                ? t('courses.search.results', { shown: rows.length, total: loadedCourses.length })
                : t('courses.search.noResults', { query: query.trim() })}
            </p>
          )}

          {rows.length === 0 && (
            <Button variant="outline-secondary" onClick={clearSearch}>
              {t('courses.search.clear')}
            </Button>
          )}

          {rows.length > 0 && isWide && (
            <Table hover aria-labelledby={TITLE_ID}>
              <thead>
                <tr>
                  <th scope="col">{t('courses.fields.course')}</th>
                  <th scope="col">{t('courses.fields.classes')}</th>
                  <th scope="col">{t('courses.fields.tutors')}</th>
                  <th scope="col">{t('courses.fields.created')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.name}</th>
                    <td>{row.classes}</td>
                    <td>{row.tutors}</td>
                    <td>{row.created}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {rows.length > 0 && !isWide && (
            <ul aria-labelledby={TITLE_ID} className="list-unstyled d-grid gap-3 mb-0">
              {rows.map((row) => (
                <li key={row.id}>
                  <Card>
                    <Card.Body>
                      <h2 className="h5">{row.name}</h2>
                      <dl className="mb-0">
                        <dt>{t('courses.fields.classes')}</dt>
                        <dd>{row.classes}</dd>
                        <dt>{t('courses.fields.tutors')}</dt>
                        <dd>{row.tutors}</dd>
                        <dt>{t('courses.fields.created')}</dt>
                        <dd className="mb-0">{row.created}</dd>
                      </dl>
                    </Card.Body>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Container>
  );
}
