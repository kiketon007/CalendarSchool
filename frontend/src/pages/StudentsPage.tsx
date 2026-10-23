import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';
import { DeleteStudentModal, type StudentToDelete } from '../components/DeleteStudentModal';
import { Pagination } from '../components/Pagination';
import { StudentFilters } from '../components/StudentFilters';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { studentsService, type StudentSummary } from '../services/studentsService';
import { useSession } from '../session/SessionProvider';
import { pageCountOf, paginate } from '../utils/pagination';
import { matchesPersonSearch } from '../utils/personSearch';
import {
  classOptions,
  courseOptions,
  filtersFromParams,
  hasActiveFilters,
  matchesStudentFilters,
  pageFromParams,
  paramsFromFilters,
  type StudentFilters as Filters,
} from '../utils/studentFilters';

/**
 * `students` es la lista actual (sin los alumnos borrados desde que se cargó) y `catalog`, la lista tal como
 * llegó del servidor: la URL y los desplegables de curso y clase se validan contra el catálogo, para que un
 * filtro por un curso o una clase que un borrado deja sin alumnos siga aplicado hasta volver a cargar.
 */
type ListState =
  | { status: 'loading' }
  | { status: 'loaded'; students: StudentSummary[]; catalog: StudentSummary[] }
  | { status: 'error' };

/** Punto de corte `md` de Bootstrap: desde aquí el listado es una tabla y por debajo, tarjetas. */
const WIDE_SCREEN = '(min-width: 768px)';
const TITLE_ID = 'students-title';
/** Alumnos por página. */
const PAGE_SIZE = 20;

/** Aviso de llegada: un alumno recién creado o editado, con su nombre. */
interface Notice {
  kind: 'created' | 'updated';
  name: string;
}

/** Aviso de la propia página tras un borrado: el alumno eliminado, o que ya no existía. */
type PageNotice = { kind: 'deleted'; name: string } | { kind: 'gone' };

const isName = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * Aviso que llega en el estado de la navegación: `{ studentCreated: <nombre> }` de `CreateStudentPage` o
 * `{ studentUpdated: <nombre> }` de `EditStudentPage`. Solo viaja en el estado de la navegación (nunca en
 * almacenamiento propio); acepta únicamente un texto no vacío y descarta cualquier otra forma.
 */
function noticeFrom(state: unknown): Notice | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const { studentCreated, studentUpdated } = state as Record<string, unknown>;
  if (isName(studentCreated)) {
    return { kind: 'created', name: studentCreated };
  }
  if (isName(studentUpdated)) {
    return { kind: 'updated', name: studentUpdated };
  }
  return undefined;
}

/** Datos de un alumno ya preparados para pintar, iguales en la tabla y en las tarjetas. */
interface StudentRow {
  id: string;
  /** «Apellidos, Nombre»: el de la cabecera de la fila. */
  name: string;
  /** «Nombre Apellidos»: el del diálogo de borrado y del aviso. */
  fullName: string;
  courseClass: string;
  cafeteria: string;
  /** Sin curso: se pinta con el color secundario del tema. */
  hasNoCourse: boolean;
}

/**
 * Alumnos del colegio (US14): cuelga de `AuthenticatedLayout` y la ven los dos roles. Pide la lista una
 * sola vez aunque `StrictMode` ejecute el efecto dos veces; si falla ofrece reintentarla, y si la sesión se
 * perdió no hace nada, porque el layout ya redirige. Muestra una tabla desde 768 px o una tarjeta por
 * alumno por debajo (solo una de las dos), con su curso y su clase y si come en el comedor, en el orden del
 * servicio. No muestra el tipo de comida ni las observaciones (datos sensibles que el listado ni recibe).
 * Muestra el total y pagina de 20 en 20 en el navegador (US15), la misma página en la tabla y en las
 * tarjetas. Cada alumno lleva un enlace «Editar» (US17) que lleva en el estado de la navegación la
 * búsqueda actual (filtros y página) para volver al listado tal como estaba, y un botón «Borrar» (US18)
 * que abre `DeleteStudentModal`: tras borrar, el alumno sale de la lista cargada sin volver a pedirla, la
 * URL y la búsqueda no se tocan, el aviso propio de la página sustituye al de llegada y el foco pasa al
 * título. Si se llega de crear o editar un alumno, muestra un aviso con su nombre como texto plano.
 */
export function StudentsPage() {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const notice = noticeFrom(location.state);
  const isWide = useMediaQuery(WIDE_SCREEN);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // El texto de búsqueda solo vive aquí: son nombres de menores y no deben quedar en la URL ni en el historial.
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [studentToDelete, setStudentToDelete] = useState<StudentToDelete | null>(null);
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
    void studentsService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', students: outcome.students, catalog: outcome.students });
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

  const loadedStudents = list.status === 'loaded' ? list.students : undefined;
  const catalog = list.status === 'loaded' ? list.catalog : undefined;
  // Los filtros y la página se derivan de la URL (validados contra la lista tal como se cargó), no se copian a un estado.
  const filters = useMemo(
    () => filtersFromParams(searchParams, catalog ?? []),
    [searchParams, catalog],
  );
  const requestedPage = pageFromParams(searchParams);
  const hasFilters = hasActiveFilters(filters) || query.trim() !== '';
  const courses = useMemo(() => courseOptions(catalog ?? []), [catalog]);
  const classes = useMemo(
    () => classOptions(catalog ?? [], filters.course),
    [catalog, filters.course],
  );
  const rows = useMemo<StudentRow[]>(
    () =>
      (loadedStudents ?? [])
        .filter(
          (student) =>
            matchesStudentFilters(student, filters) && matchesPersonSearch(student, query),
        )
        .map((student) => ({
          id: student.id,
          name: `${student.lastName}, ${student.firstName}`,
          fullName: `${student.firstName} ${student.lastName}`,
          courseClass: student.course
            ? student.class
              ? t('students.courseAndClass', {
                  course: student.course.name,
                  className: student.class.name,
                })
              : t('students.courseWithoutClass', { course: student.course.name })
            : t('students.noCourse'),
          cafeteria: student.cafeteria
            ? student.scholarship
              ? t('students.cafeteria.yesScholarship')
              : t('students.cafeteria.yes')
            : t('students.cafeteria.no'),
          hasNoCourse: student.course === null,
        })),
    [loadedStudents, filters, query, t],
  );

  const pageCount = pageCountOf(rows.length, PAGE_SIZE);
  const currentPage = Math.min(requestedPage, pageCount);
  const pageRows = useMemo(() => paginate(rows, currentPage, PAGE_SIZE), [rows, currentPage]);
  // Principio del listado: al cambiar de página se lleva allí la vista (no el foco, que se queda en la paginación).
  const listTop = useRef<HTMLParagraphElement>(null);

  /** Escribe los filtros y la página en la URL sustituyendo la entrada (no llena el historial) y conservando el aviso de llegada. */
  function writeUrl(next: Filters, nextPage: number) {
    // El estado de la navegación es de tipo desconocido: se pasa tal cual, solo para que no se pierda el aviso.
    const arrivalState: unknown = location.state;
    setSearchParams(paramsFromFilters(next, nextPage), { replace: true, state: arrivalState });
  }

  function changeQuery(text: string) {
    setQuery(text);
    if (requestedPage > 1) {
      writeUrl(filters, 1);
    }
  }

  function changeFilters(next: Filters) {
    writeUrl(next, 1);
  }

  function clearFilters() {
    setQuery('');
    writeUrl({ course: '', classId: '', cafeteria: 'all', scholarship: 'all' }, 1);
    searchRef.current?.focus();
  }

  function changePage(next: number) {
    writeUrl(filters, next);
    listTop.current?.scrollIntoView({ block: 'start' });
  }

  /** Enlace «Editar» de un alumno: lleva la búsqueda del listado para volver a él con los mismos filtros. */
  function editLink(row: StudentRow) {
    return (
      <Link
        to={`/alumnos/${encodeURIComponent(row.id)}/editar`}
        state={{ listSearch: location.search }}
        className="btn btn-outline-primary btn-sm"
        aria-label={t('students.editLabel', { name: row.name })}
      >
        {t('students.editLink')}
      </Link>
    );
  }

  /** El botón «Borrar» de un alumno; su nombre accesible incluye el nombre del alumno. */
  function deleteButton(row: StudentRow) {
    return (
      <Button
        variant="outline-danger"
        size="sm"
        aria-label={t('students.deleteLabel', { name: row.name })}
        onClick={() => {
          setStudentToDelete({ id: row.id, name: row.fullName });
        }}
      >
        {t('students.deleteButton')}
      </Button>
    );
  }

  /** «Editar» y «Borrar» de un alumno, juntos. */
  function actions(row: StudentRow) {
    return (
      <div className="d-flex flex-wrap gap-2">
        {editLink(row)}
        {deleteButton(row)}
      </div>
    );
  }

  function retry() {
    setList({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function handleDeleted(deleted: StudentToDelete) {
    setStudentToDelete(null);
    // Solo cambia la lista actual: el catálogo (la URL y los desplegables) sigue siendo el que se cargó.
    setList((current) =>
      current.status === 'loaded'
        ? {
            ...current,
            students: current.students.filter(({ id }) => id !== deleted.id),
          }
        : current,
    );
    setPageNotice({ kind: 'deleted', name: deleted.name });
    focusTitleOnExit.current = true;
  }

  function handleGone() {
    setStudentToDelete(null);
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

  return (
    <Container as="main" className="py-5" data-testid="students-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <h1 id={TITLE_ID} ref={titleRef} tabIndex={-1} className="mb-0">
          {t('students.title')}
        </h1>
        <Link to="/alumnos/nuevo" className="btn btn-primary">
          {t('students.create')}
        </Link>
      </div>

      {pageNotice?.kind === 'deleted' && (
        <Alert variant="success" role="status">
          {t('students.delete.deleted', { name: pageNotice.name })}
        </Alert>
      )}

      {pageNotice?.kind === 'gone' && (
        <Alert variant="info" role="status">
          {t('students.delete.gone')}
        </Alert>
      )}

      {pageNotice === undefined && notice !== undefined && (
        // Un `Alert` lleva `role="alert"` por defecto: es un aviso informativo, no un error.
        <Alert variant="success" role="status">
          {notice.kind === 'created'
            ? t('students.created', { name: notice.name })
            : t('students.updated', { name: notice.name })}
        </Alert>
      )}

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('students.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('students.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('students.retry')}
          </Button>
        </Alert>
      )}

      {loadedStudents?.length === 0 && (
        <div>
          <p className="fs-5 mb-1">{t('students.empty')}</p>
          <p className="text-body-secondary">{t('students.emptyHint')}</p>
        </div>
      )}

      {loadedStudents !== undefined && loadedStudents.length > 0 && (
        <>
          <StudentFilters
            query={query}
            onQueryChange={changeQuery}
            searchRef={searchRef}
            filters={filters}
            onFiltersChange={changeFilters}
            courses={courses}
            classes={classes}
          />

          {/* Una sola línea de recuento: el total sin filtros y, con ellos, el resultado anunciado. */}
          <p
            ref={listTop}
            data-testid="students-count"
            className="text-body-secondary"
            role={hasFilters ? 'status' : undefined}
          >
            {!hasFilters
              ? t('students.count', { count: rows.length })
              : rows.length > 0
                ? t('students.filters.results', {
                    shown: rows.length,
                    total: loadedStudents.length,
                  })
                : t('students.filters.noResults')}
          </p>
          {rows.length === 0 && (
            <Button variant="outline-secondary" onClick={clearFilters}>
              {t('students.filters.clear')}
            </Button>
          )}
        </>
      )}

      {rows.length > 0 && isWide && (
        <Table hover aria-labelledby={TITLE_ID}>
          <thead>
            <tr>
              <th scope="col">{t('students.fields.name')}</th>
              <th scope="col">{t('students.fields.courseClass')}</th>
              <th scope="col">{t('students.fields.cafeteria')}</th>
              <th scope="col">{t('students.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="text-break">
                  {row.name}
                </th>
                <td className={row.hasNoCourse ? 'text-body-secondary' : undefined}>
                  {row.courseClass}
                </td>
                <td>{row.cafeteria}</td>
                <td>{actions(row)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {rows.length > 0 && !isWide && (
        <ul aria-labelledby={TITLE_ID} className="list-unstyled d-grid gap-3 mb-0">
          {pageRows.map((row) => (
            <li key={row.id}>
              <Card>
                <Card.Body>
                  <h2 className="h5 text-break">{row.name}</h2>
                  <dl className="mb-0">
                    <dt>{t('students.fields.courseClass')}</dt>
                    <dd className={row.hasNoCourse ? 'text-body-secondary' : undefined}>
                      {row.courseClass}
                    </dd>
                    <dt>{t('students.fields.cafeteria')}</dt>
                    <dd className="mb-0">{row.cafeteria}</dd>
                  </dl>
                </Card.Body>
                <Card.Footer>{actions(row)}</Card.Footer>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <Pagination
          page={currentPage}
          pageCount={pageCount}
          onPageChange={changePage}
          label={t('students.pagination')}
        />
      )}

      <DeleteStudentModal
        student={studentToDelete}
        onDeleted={handleDeleted}
        onGone={handleGone}
        onCancel={() => {
          setStudentToDelete(null);
        }}
        onExited={handleExited}
      />
    </Container>
  );
}
