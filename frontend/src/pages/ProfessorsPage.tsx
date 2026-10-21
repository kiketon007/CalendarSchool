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
import { Pagination } from '../components/Pagination';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { professorsService, type Professor } from '../services/professorsService';
import { useSession } from '../session/SessionProvider';
import { paginate, pageCountOf } from '../utils/pagination';
import { matchesProfessorSearch } from '../utils/professorSearch';

type ListState =
  { status: 'loading' } | { status: 'loaded'; professors: Professor[] } | { status: 'error' };

/** Punto de corte `md` de Bootstrap: desde aquí el listado es una tabla y por debajo, tarjetas. */
const WIDE_SCREEN = '(min-width: 768px)';
const TITLE_ID = 'professors-title';
/** Profesores por página: la paginación se hace en el navegador sobre la lista completa del servicio. */
const PAGE_SIZE = 20;
/** Longitud máxima del texto de búsqueda. */
const SEARCH_MAX_LENGTH = 100;

/** Aviso que trae la navegación al llegar de crear o de editar un profesor. */
type Notice =
  { kind: 'created'; name: string } | { kind: 'updated'; name: string; replacedTutor?: string };

const isName = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * Aviso del estado de la navegación: `{ professorCreated: <nombre> }` si llega de `CreateProfessorPage` o
 * `{ professorUpdated: <nombre>, replacedTutor?: <nombre> }` si llega de `EditProfessorPage`. Solo viaja
 * en el estado de la navegación (nunca en almacenamiento propio); acepta únicamente textos no vacíos y
 * descarta cualquier otra forma (también un `replacedTutor` sin `professorUpdated`).
 */
function noticeFrom(state: unknown): Notice | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const { professorCreated, professorUpdated, replacedTutor } = state as Record<string, unknown>;
  if (isName(professorCreated)) {
    return { kind: 'created', name: professorCreated };
  }
  if (isName(professorUpdated)) {
    return {
      kind: 'updated',
      name: professorUpdated,
      ...(isName(replacedTutor) && { replacedTutor }),
    };
  }
  return undefined;
}

/** Datos de un profesor ya preparados para pintar, iguales en la tabla y en las tarjetas. */
interface ProfessorRow {
  id: string;
  name: string;
  position: string;
  tutorship: string;
  /** Sin tutoría: se pinta con el color secundario del tema. */
  hasNoTutorship: boolean;
}

/**
 * Profesores del colegio (US09 y US10): cuelga de `AuthenticatedLayout` y la ven los dos roles. Pide la
 * lista una sola vez aunque `StrictMode` ejecute el efecto dos veces; si falla ofrece reintentarla, y si
 * la sesión se perdió no hace nada, porque el layout ya redirige. Muestra el total y una tabla desde
 * 768 px o una tarjeta por profesor por debajo (solo una de las dos), con la tutoría de cada uno.
 * Respeta el orden del servicio («Apellidos, Nombre») y lo pagina en el navegador, de 20 en 20: la
 * página vive solo en el estado (se acota al pintar, para no dejar nunca una página vacía). La búsqueda
 * (US11) filtra en el navegador por nombre y apellidos antes de paginar: cada cambio del texto vuelve a la
 * primera página y, mientras hay texto, la línea del total pasa a anunciar «Mostrando N de M» (o que no
 * hay coincidencias, con «Limpiar búsqueda»). Cada profesor lleva un enlace «Editar» (US12); no tiene otras acciones (las traen las historias
 * siguientes) y, si se llega de crear un profesor, muestra un aviso con su nombre como texto plano.
 */
export function ProfessorsPage() {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  const notice = noticeFrom(useLocation().state);
  const isWide = useMediaQuery(WIDE_SCREEN);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(1);
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
    void professorsService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', professors: outcome.professors });
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

  const loadedProfessors = list.status === 'loaded' ? list.professors : undefined;
  const rows = useMemo<ProfessorRow[]>(
    () =>
      (loadedProfessors ?? [])
        .filter((professor) => matchesProfessorSearch(professor, query))
        .map((professor) => ({
          id: professor.id,
          name: `${professor.lastName}, ${professor.firstName}`,
          position: t(`professors.positions.${professor.position ?? 'none'}`),
          tutorship: professor.tutoredClass
            ? t('professors.tutorOf', {
                course: professor.tutoredClass.courseName,
                className: professor.tutoredClass.name,
              })
            : t('professors.noTutorship'),
          hasNoTutorship: professor.tutoredClass === null,
        })),
    [loadedProfessors, query, t],
  );
  const hasQuery = query.trim() !== '';

  const pageCount = pageCountOf(rows.length, PAGE_SIZE);
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(() => paginate(rows, currentPage, PAGE_SIZE), [rows, currentPage]);
  // Principio del listado: al cambiar de página se lleva allí la vista (no el foco, que se queda en la paginación).
  const listTop = useRef<HTMLParagraphElement>(null);

  function changePage(next: number) {
    setPage(next);
    listTop.current?.scrollIntoView({ block: 'start' });
  }

  function search(text: string) {
    setQuery(text);
    setPage(1);
  }

  function clearSearch() {
    search('');
    searchRef.current?.focus();
  }

  /** El enlace «Editar» de un profesor; su nombre accesible incluye el nombre del profesor. */
  function editLink(row: ProfessorRow) {
    return (
      <Link
        to={`/profesores/${encodeURIComponent(row.id)}/editar`}
        className="btn btn-outline-primary btn-sm"
        aria-label={t('professors.editLabel', { name: row.name })}
      >
        {t('professors.editLink')}
      </Link>
    );
  }

  function retry() {
    setList({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  return (
    <Container as="main" className="py-5" data-testid="professors-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <h1 id={TITLE_ID} className="mb-0">
          {t('professors.title')}
        </h1>
        <Link to="/profesores/nuevo" className="btn btn-primary">
          {t('professors.create')}
        </Link>
      </div>

      {notice !== undefined && (
        // Un `Alert` lleva `role="alert"` por defecto: es un aviso informativo, no un error.
        <Alert variant="success" role="status">
          {notice.kind === 'created'
            ? t('professors.created', { name: notice.name })
            : notice.replacedTutor === undefined
              ? t('professors.updated', { name: notice.name })
              : t('professors.updatedReplacing', {
                  name: notice.name,
                  tutor: notice.replacedTutor,
                })}
        </Alert>
      )}

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('professors.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('professors.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('professors.retry')}
          </Button>
        </Alert>
      )}

      {loadedProfessors?.length === 0 && (
        <div>
          <p className="fs-5 mb-1">{t('professors.empty')}</p>
          <p className="text-body-secondary">{t('professors.emptyHint')}</p>
        </div>
      )}

      {loadedProfessors !== undefined && loadedProfessors.length > 0 && (
        <>
          <Form.Group className="mb-3" controlId="professor-search">
            <Form.Label>{t('professors.search.label')}</Form.Label>
            <Form.Control
              ref={searchRef}
              type="search"
              autoComplete="off"
              maxLength={SEARCH_MAX_LENGTH}
              value={query}
              onChange={(event) => {
                search(event.target.value);
              }}
            />
          </Form.Group>

          {/* Una sola línea de recuento: el total sin búsqueda y, con ella, el resultado anunciado. */}
          <p
            ref={listTop}
            data-testid="professors-count"
            className="text-body-secondary"
            role={hasQuery ? 'status' : undefined}
          >
            {!hasQuery
              ? t('professors.count', { count: loadedProfessors.length })
              : rows.length > 0
                ? t('professors.search.results', {
                    shown: rows.length,
                    total: loadedProfessors.length,
                  })
                : t('professors.search.noResults', { query: query.trim() })}
          </p>

          {rows.length === 0 && (
            <Button variant="outline-secondary" onClick={clearSearch}>
              {t('professors.search.clear')}
            </Button>
          )}
        </>
      )}

      {rows.length > 0 && isWide && (
        <Table hover aria-labelledby={TITLE_ID}>
          <thead>
            <tr>
              <th scope="col">{t('professors.fields.name')}</th>
              <th scope="col">{t('professors.fields.position')}</th>
              <th scope="col">{t('professors.fields.tutorship')}</th>
              <th scope="col">{t('professors.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="text-break">
                  {row.name}
                </th>
                <td>{row.position}</td>
                <td className={row.hasNoTutorship ? 'text-body-secondary' : undefined}>
                  {row.tutorship}
                </td>
                <td>{editLink(row)}</td>
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
                    <dt>{t('professors.fields.position')}</dt>
                    <dd>{row.position}</dd>
                    <dt>{t('professors.fields.tutorship')}</dt>
                    <dd className={row.hasNoTutorship ? 'mb-0 text-body-secondary' : 'mb-0'}>
                      {row.tutorship}
                    </dd>
                  </dl>
                  {editLink(row)}
                </Card.Body>
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
          label={t('professors.pagination')}
        />
      )}
    </Container>
  );
}
