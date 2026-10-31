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
import { DeleteCourseModal, type CourseToDelete } from '../components/DeleteCourseModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { coursesService, type Course, type CourseImpact } from '../services/coursesService';
import { useSession } from '../session/SessionProvider';
import { matchesCourseSearch } from '../utils/courseSearch';

type ListState =
  { status: 'loading' } | { status: 'loaded'; courses: Course[] } | { status: 'error' };

/** Punto de corte `md` de Bootstrap: desde aquí el listado es una tabla y por debajo, tarjetas. */
const WIDE_SCREEN = '(min-width: 768px)';
const TITLE_ID = 'courses-title';

/** Aviso de que se acaba de crear o de editar un curso, con su nombre. */
interface CourseNotice {
  kind: 'created' | 'updated';
  name: string;
}

/**
 * Aviso que trae la navegación si llega de `CreateCoursePage` (`{ courseCreated: <nombre> }`) o de
 * `EditCoursePage` (`{ courseUpdated: <nombre> }`). Solo viaja en el estado de la navegación, es decir, en
 * el `history.state` del navegador (nunca en almacenamiento propio), que se conserva al recargar la
 * página: el aviso puede volver a verse hasta que se navega a otra entrada. Acepta únicamente un texto no
 * vacío en una de esas dos propiedades y descarta cualquier otra forma.
 */
function noticeFrom(state: unknown): CourseNotice | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  for (const [property, kind] of [
    ['courseCreated', 'created'],
    ['courseUpdated', 'updated'],
  ] as const) {
    const name = property in state ? (state as Record<string, unknown>)[property] : undefined;
    if (typeof name === 'string' && name.length > 0) {
      return { kind, name };
    }
  }
  return undefined;
}

/** Aviso propio de la página tras borrar un curso, o porque el curso que se iba a borrar ya no existía. */
type PageNotice = { kind: 'deleted'; name: string; students: number } | { kind: 'gone' };

/** Datos de un curso ya preparados para pintar, iguales en la tabla y en las tarjetas. */
interface CourseRow {
  id: string;
  name: string;
  classes: string;
  tutors: string;
  students: string;
  created: string;
}

/**
 * Cursos del colegio (US05, US06, US07 y US08): cuelga de `AuthenticatedLayout` y la ven los dos roles. Pide la
 * lista una sola vez aunque `StrictMode` ejecute el efecto dos veces; si falla ofrece reintentarla, y
 * si la sesión se perdió no hace nada, porque el layout ya redirige. Con cursos muestra una tabla
 * desde 768 px y una tarjeta por curso por debajo (solo una de las dos, para que los lectores de
 * pantalla no lean el contenido dos veces) y un campo para buscar por nombre. La búsqueda filtra en el
 * navegador sin volver a pedir nada y vive solo en el estado de la página. La columna «Tutores»
 * lista las clases con tutor y su nombre («A: Ana García») o «Sin tutor» si ninguna lo tiene. Cada curso lleva un enlace «Carga horaria» a `/cursos/:id/carga` (US19, para los dos roles) y un enlace «Editar» a `/cursos/:id/editar`
 * (en su fila o en su tarjeta) y un botón «Borrar» que abre `DeleteCourseModal`: tras borrar, el curso sale
 * de la lista sin volver a pedirla, un aviso lo dice y el foco pasa al título (la fila ya no existe); si el
 * curso ya no existía, se vuelve a pedir la lista. El botón «Crear curso» siempre está disponible y, si se
 * llega de crear o de editar un curso, un aviso con su nombre.
 */
export function CoursesPage() {
  const { t, i18n } = useTranslation();
  const { authorizedFetch } = useSession();
  const notice = noticeFrom(useLocation().state);
  const isWide = useMediaQuery(WIDE_SCREEN);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [courseToDelete, setCourseToDelete] = useState<CourseToDelete | null>(null);
  const [pageNotice, setPageNotice] = useState<PageNotice | undefined>(undefined);
  // Tras un borrado la fila del botón ya no existe: al cerrarse el diálogo el foco pasa al título.
  const focusTitleOnExit = useRef(false);
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
    /** «A: Ana García, C: Luis Pérez»: solo las clases con tutor, en su orden; «Sin tutor» si ninguna. */
    const tutorsLabel = (course: Course) => {
      const entries = course.classes
        .filter((schoolClass) => schoolClass.tutor !== null)
        .map((schoolClass) =>
          t('courses.tutorsOf', {
            className: schoolClass.name,
            name: `${schoolClass.tutor?.firstName ?? ''} ${schoolClass.tutor?.lastName ?? ''}`,
          }),
        );
      return entries.length > 0 ? entries.join(', ') : t('courses.noTutor');
    };
    /** «25» o «25 (3 sin clase)»: los que no tienen clase son el total menos la suma de las clases. */
    const studentsLabel = (course: Course) => {
      const unassigned =
        course.studentCount -
        course.classes.reduce((sum, schoolClass) => sum + schoolClass.studentCount, 0);
      return unassigned > 0
        ? t('courses.studentsWithUnassigned', { total: course.studentCount, count: unassigned })
        : String(course.studentCount);
    };
    return (loadedCourses ?? [])
      .filter((course) => matchesCourseSearch(course.name, query))
      .map((course) => ({
        id: course.id,
        name: course.name,
        classes: t('courses.classCount', {
          count: course.classes.length,
          names: course.classes
            .map((schoolClass) =>
              t('courses.classWithStudents', {
                name: schoolClass.name,
                count: schoolClass.studentCount,
              }),
            )
            .join(', '),
        }),
        tutors: tutorsLabel(course),
        students: studentsLabel(course),
        created: dateFormat.format(new Date(course.createdAt)),
      }));
  }, [loadedCourses, query, i18n.language, t]);

  /** Enlace a la carga horaria del curso (US19), para los dos roles; su nombre accesible dice a qué curso lleva. */
  function workloadLink(row: CourseRow) {
    return (
      <Link
        to={`/cursos/${row.id}/carga`}
        className="btn btn-sm btn-outline-secondary"
        aria-label={t('courses.actions.workloadCourse', { name: row.name })}
      >
        {t('courses.actions.workload')}
      </Link>
    );
  }

  /** Enlace a los profesores del curso (US-PROF-ASSIGN), para los dos roles; su nombre accesible dice a qué curso lleva. */
  function professorsLink(row: CourseRow) {
    return (
      <Link
        to={`/cursos/${row.id}/profesores`}
        className="btn btn-sm btn-outline-secondary"
        aria-label={t('courses.actions.professorsCourse', { name: row.name })}
      >
        {t('courses.actions.professors')}
      </Link>
    );
  }

  /** Enlace a la edición del curso; su nombre accesible dice a qué curso lleva. */
  function editLink(row: CourseRow) {
    return (
      <Link
        to={`/cursos/${row.id}/editar`}
        className="btn btn-sm btn-outline-primary"
        aria-label={t('courses.actions.editCourse', { name: row.name })}
      >
        {t('courses.actions.edit')}
      </Link>
    );
  }

  /** Botón que abre el diálogo de borrado; su nombre accesible dice de qué curso se trata. */
  function deleteButton(row: CourseRow) {
    return (
      <Button
        variant="outline-danger"
        size="sm"
        aria-label={t('courses.actions.deleteCourse', { name: row.name })}
        onClick={() => {
          setPageNotice(undefined);
          setCourseToDelete({ id: row.id, name: row.name });
        }}
      >
        {t('courses.actions.delete')}
      </Button>
    );
  }

  function retry() {
    setList({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function handleDeleted(course: CourseToDelete, deleted: CourseImpact) {
    setCourseToDelete(null);
    setList((current) =>
      current.status === 'loaded'
        ? { status: 'loaded', courses: current.courses.filter(({ id }) => id !== course.id) }
        : current,
    );
    setPageNotice({ kind: 'deleted', name: course.name, students: deleted.studentCount });
    focusTitleOnExit.current = true;
  }

  function handleGone() {
    setCourseToDelete(null);
    setPageNotice({ kind: 'gone' });
    focusTitleOnExit.current = true;
    retry();
  }

  function handleExited() {
    if (!focusTitleOnExit.current) {
      return;
    }
    focusTitleOnExit.current = false;
    // react-bootstrap suelta la captura de foco del diálogo justo después de `onExited`: si se enfoca
    // aquí mismo, su comprobación pendiente devuelve el foco al diálogo, que acaba de desaparecer. Se
    // espera un turno (en jsdom no hace falta, en el navegador sí).
    window.setTimeout(() => {
      titleRef.current?.focus();
    }, 0);
  }

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
  }

  return (
    <Container as="main" className="py-5" data-testid="courses-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <h1 id={TITLE_ID} ref={titleRef} tabIndex={-1} className="mb-0">
          {t('courses.title')}
        </h1>
        <Link to="/cursos/nuevo" className="btn btn-primary">
          {t('courses.create')}
        </Link>
      </div>

      {pageNotice === undefined && notice !== undefined && (
        // Un `Alert` lleva `role="alert"` por defecto: es un aviso informativo, no un error.
        <Alert variant="success" role="status">
          {t(notice.kind === 'created' ? 'courses.created' : 'courses.updated', {
            name: notice.name,
          })}
        </Alert>
      )}

      {pageNotice?.kind === 'deleted' && (
        <Alert variant="success" role="status">
          {pageNotice.students > 0
            ? t('courses.delete.deletedWithStudents', {
                name: pageNotice.name,
                count: pageNotice.students,
              })
            : t('courses.delete.deleted', { name: pageNotice.name })}
        </Alert>
      )}

      {pageNotice?.kind === 'gone' && (
        <Alert variant="info" role="status">
          {t('courses.delete.gone')}
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
                  <th scope="col">{t('courses.fields.students')}</th>
                  <th scope="col">{t('courses.fields.created')}</th>
                  <th scope="col">{t('courses.fields.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.name}</th>
                    <td>{row.classes}</td>
                    <td>{row.tutors}</td>
                    <td>{row.students}</td>
                    <td>{row.created}</td>
                    <td>
                      <div className="d-flex gap-2">
                        {workloadLink(row)}
                        {professorsLink(row)}
                        {editLink(row)}
                        {deleteButton(row)}
                      </div>
                    </td>
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
                        <dt>{t('courses.fields.students')}</dt>
                        <dd>{row.students}</dd>
                        <dt>{t('courses.fields.created')}</dt>
                        <dd className="mb-0">{row.created}</dd>
                      </dl>
                      <div className="mt-3 d-flex gap-2">
                        {workloadLink(row)}
                        {professorsLink(row)}
                        {editLink(row)}
                        {deleteButton(row)}
                      </div>
                    </Card.Body>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <DeleteCourseModal
        course={courseToDelete}
        onDeleted={handleDeleted}
        onGone={handleGone}
        onCancel={() => {
          setCourseToDelete(null);
        }}
        onExited={handleExited}
      />
    </Container>
  );
}
