import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { DeleteSubjectModal, type SubjectToDelete } from '../components/DeleteSubjectModal';
import { SubjectColorSwatch } from '../components/SubjectColorSwatch';
import { subjectsService, type Subject } from '../services/subjectsService';
import { useSession } from '../session/SessionProvider';
import { matchesSubjectFilters, type SubjectFilters } from '../utils/subjectFilters';
import { SUBJECT_STATUSES, SUBJECT_TYPES } from '../utils/subjectOptions';

type ListState =
  { status: 'loading' } | { status: 'loaded'; subjects: Subject[] } | { status: 'error' };

const NO_FILTERS: SubjectFilters = { type: '', status: '', query: '' };

/** Aviso propio de la página tras borrar: tiene prioridad sobre el de llegada. */
type PageNotice = { kind: 'deleted'; name: string } | { kind: 'gone' };

/** Aviso de llegada: qué se hizo con la asignatura y su nombre, tal como lo guardó el servidor. */
interface ArrivalNotice {
  kind: 'created' | 'updated';
  name: string;
}

/**
 * Aviso que llega en el estado de la navegación: `{ subjectCreated: <nombre> }` de `CreateSubjectPage` o
 * `{ subjectUpdated: <nombre> }` de `EditSubjectPage`. Solo viaja en el estado de la navegación (nunca en
 * almacenamiento propio); acepta únicamente un texto no vacío y descarta cualquier otra forma.
 */
function noticeFrom(state: unknown): ArrivalNotice | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const { subjectCreated, subjectUpdated } = state as Record<string, unknown>;
  if (typeof subjectCreated === 'string' && subjectCreated.length > 0) {
    return { kind: 'created', name: subjectCreated };
  }
  if (typeof subjectUpdated === 'string' && subjectUpdated.length > 0) {
    return { kind: 'updated', name: subjectUpdated };
  }
  return undefined;
}

/**
 * Asignaturas del colegio (US-SUBJECT): cuelga de `AuthenticatedLayout` y la ven los dos roles. Pide la lista
 * una sola vez aunque `StrictMode` ejecute el efecto dos veces; si falla ofrece reintentarla, y si la sesión
 * se perdió no hace nada, porque el layout ya redirige. Pinta una tarjeta por asignatura con su color (con
 * nombre accesible: nunca solo color), su nombre, su código, su tipo, su estado y un resumen de los cursos
 * que se despliega para ver las sesiones de cada uno. Los filtros por tipo y estado y la búsqueda por nombre o
 * código se aplican **en el navegador** sobre la lista cargada, sin pedir nada al servidor. Es de **lectura
 * para los dos roles y alta y edición solo para `ADMIN`**: el botón «Crear asignatura» y el enlace «Editar» de
 * cada tarjeta solo se pintan al administrador (una comodidad de la interfaz leída de la sesión; el backend
 * decide) y el `MEMBER` ve por qué no puede.
 *
 * **Borrar (US-SUBJECT_c):** el administrador ve también «Borrar», que abre `DeleteSubjectModal` con los datos de
 * la tarjeta. Tras borrar, la asignatura sale de la lista cargada **sin volver a pedirla**, se muestra un aviso
 * propio (`pageNotice`, con prioridad sobre el de llegada), los filtros y la búsqueda se conservan y el foco pasa
 * al título (el botón de la tarjeta ya no existe) un turno después de cerrarse el diálogo. Si la asignatura ya no
 * existía, avisa y vuelve a pedir la lista.
 */
export function SubjectsPage() {
  const { t } = useTranslation();
  const { authorizedFetch, state } = useSession();
  const notice = noticeFrom(useLocation().state);
  const isAdmin = state.status === 'authenticated' && state.data.user.role === 'ADMIN';
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<SubjectFilters>(NO_FILTERS);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [subjectToDelete, setSubjectToDelete] = useState<SubjectToDelete | null>(null);
  const [pageNotice, setPageNotice] = useState<PageNotice | undefined>(undefined);
  // Tras un borrado el botón de la tarjeta ya no existe: al cerrarse el diálogo el foco pasa al título.
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
    void subjectsService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', subjects: outcome.subjects });
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

  function handleDeleted(deleted: SubjectToDelete) {
    setSubjectToDelete(null);
    setList((current) =>
      current.status === 'loaded'
        ? { ...current, subjects: current.subjects.filter(({ id }) => id !== deleted.id) }
        : current,
    );
    setPageNotice({ kind: 'deleted', name: deleted.name });
    focusTitleOnExit.current = true;
  }

  function handleGone() {
    setSubjectToDelete(null);
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

  function toggle(subjectId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(subjectId)) {
        next.add(subjectId);
      }
      return next;
    });
  }

  const visible =
    list.status === 'loaded'
      ? list.subjects.filter((subject) => matchesSubjectFilters(subject, filters))
      : [];

  return (
    <Container as="main" className="py-5" data-testid="subjects-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <h1 ref={titleRef} tabIndex={-1} className="mb-0">
          {t('subjects.title')}
        </h1>
        {isAdmin && (
          <Link to="/asignaturas/nueva" className="btn btn-primary">
            {t('subjects.create')}
          </Link>
        )}
      </div>

      {!isAdmin && state.status === 'authenticated' && (
        <p className="text-body-secondary">{t('subjects.readOnly')}</p>
      )}

      {pageNotice !== undefined && (
        <Alert variant="success" role="status">
          {pageNotice.kind === 'deleted'
            ? t('subjects.delete.deleted', { name: pageNotice.name })
            : t('subjects.delete.gone')}
        </Alert>
      )}

      {pageNotice === undefined && notice !== undefined && (
        // Un `Alert` lleva `role="alert"` por defecto: es un aviso informativo, no un error.
        <Alert variant="success" role="status">
          {t(notice.kind === 'created' ? 'subjects.created' : 'subjects.updated', {
            name: notice.name,
          })}
        </Alert>
      )}

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('subjects.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('subjects.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('subjects.retry')}
          </Button>
        </Alert>
      )}

      {list.status === 'loaded' && list.subjects.length === 0 && (
        <div>
          <p className="fs-5 mb-1">{t('subjects.empty')}</p>
          <p className="text-body-secondary">{t('subjects.emptyHint')}</p>
        </div>
      )}

      {list.status === 'loaded' && list.subjects.length > 0 && (
        <>
          <Form
            role="search"
            aria-label={t('subjects.filters.legend')}
            className="row g-3 mb-4"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <Form.Group className="col-12 col-md-6" controlId="subjects-search">
              <Form.Label>{t('subjects.filters.search')}</Form.Label>
              <Form.Control
                type="search"
                autoComplete="off"
                value={filters.query}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, query: event.target.value }));
                }}
              />
            </Form.Group>
            <Form.Group className="col-6 col-md-3" controlId="subjects-filter-type">
              <Form.Label>{t('subjects.filters.type')}</Form.Label>
              <Form.Select
                value={filters.type}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    type: event.target.value as SubjectFilters['type'],
                  }));
                }}
              >
                <option value="">{t('subjects.filters.all')}</option>
                {SUBJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`subjects.types.${type}`)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="col-6 col-md-3" controlId="subjects-filter-status">
              <Form.Label>{t('subjects.filters.status')}</Form.Label>
              <Form.Select
                value={filters.status}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as SubjectFilters['status'],
                  }));
                }}
              >
                <option value="">{t('subjects.filters.all')}</option>
                {SUBJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`subjects.statuses.${status}`)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Form>

          {visible.length === 0 ? (
            <p role="status" className="fs-5">
              {t('subjects.noMatches')}
            </p>
          ) : (
            <div className="d-grid gap-3">
              {visible.map((subject) => (
                <SubjectCard
                  key={subject.id}
                  subject={subject}
                  canEdit={isAdmin}
                  onDelete={setSubjectToDelete}
                  isExpanded={expanded.has(subject.id)}
                  onToggle={toggle}
                />
              ))}
            </div>
          )}
        </>
      )}

      <DeleteSubjectModal
        subject={subjectToDelete}
        onDeleted={handleDeleted}
        onGone={handleGone}
        onCancel={() => {
          setSubjectToDelete(null);
        }}
        onExited={handleExited}
      />
    </Container>
  );
}

/**
 * Una tarjeta: el color con su nombre, el nombre, el código, el tipo y el estado (siempre con texto, nunca solo
 * con color), la descripción como texto plano y el resumen de los cursos, que es un botón que despliega cada
 * curso con sus sesiones. Sin cursos no hay nada que desplegar: dice «Sin cursos» con un aviso visible. El
 * administrador ve además «Editar», un enlace cuyo nombre accesible incluye el de la asignatura, y «Borrar»,
 * el botón que abre el diálogo de borrado.
 */
function SubjectCard({
  subject,
  canEdit,
  onDelete,
  isExpanded,
  onToggle,
}: {
  subject: Subject;
  canEdit: boolean;
  onDelete: (subject: SubjectToDelete) => void;
  isExpanded: boolean;
  onToggle: (subjectId: string) => void;
}) {
  const { t } = useTranslation();
  const titleId = `subject-${subject.id}-title`;
  const coursesId = `subject-${subject.id}-courses`;
  const totalSessions = subject.courses.reduce(
    (sum, { sessionsPerWeek }) => sum + sessionsPerWeek,
    0,
  );
  const isActive = subject.status === 'ACTIVE';

  return (
    <Card as="article" aria-labelledby={titleId}>
      <Card.Body>
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <SubjectColorSwatch color={subject.color} />
          <h2 id={titleId} className="h5 mb-0 text-break">
            {subject.name}
          </h2>
          {subject.code !== null && (
            <span className="text-body-secondary text-break">
              {t('subjects.list.code', { code: subject.code })}
            </span>
          )}
        </div>
        <p className="d-flex flex-wrap gap-2 mb-2">
          <span className="badge bg-body-secondary text-body-emphasis">
            {t(`subjects.types.${subject.type}`)}
          </span>
          <span
            className={`badge ${isActive ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'}`}
          >
            {t(`subjects.statuses.${subject.status}`)}
          </span>
        </p>
        {subject.description !== null && <p className="mb-2 text-break">{subject.description}</p>}

        {subject.courses.length === 0 ? (
          <>
            <p className="mb-0">
              <strong>{t('subjects.list.noCourses')}</strong>
            </p>
            <p className="mb-0 text-body-secondary">{t('subjects.list.noCoursesHint')}</p>
          </>
        ) : (
          <>
            <Button
              variant="link"
              className="p-0"
              aria-expanded={isExpanded}
              aria-controls={coursesId}
              onClick={() => {
                onToggle(subject.id);
              }}
            >
              {`${t('subjects.list.summary.courses', { count: subject.courses.length })} · ${t('subjects.list.summary.sessions', { count: totalSessions })}`}
            </Button>
            {isExpanded && (
              <ul
                id={coursesId}
                aria-label={t('subjects.list.coursesOf', { name: subject.name })}
                className="mt-2 mb-0"
              >
                {subject.courses.map((course) => (
                  <li key={course.id} className="text-break">
                    {t('subjects.list.courseSessions', {
                      course: course.name,
                      count: course.sessionsPerWeek,
                    })}
                    {course.constraintCount > 0 &&
                      ` · ${t('subjects.list.rules', { count: course.constraintCount })}`}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {canEdit && (
          <div className="mt-3 d-flex flex-wrap gap-2">
            <Link
              to={`/asignaturas/${subject.id}/editar`}
              className="btn btn-outline-primary btn-sm"
              aria-label={t('subjects.editAria', { name: subject.name })}
            >
              {t('subjects.edit')}
            </Link>
            <Button
              variant="outline-danger"
              size="sm"
              aria-label={t('subjects.deleteLabel', { name: subject.name })}
              onClick={() => {
                onDelete({
                  id: subject.id,
                  name: subject.name,
                  courses: subject.courses.map(
                    ({ id, name, constraintCount, assignmentCount }) => ({
                      id,
                      name,
                      constraintCount,
                      assignmentCount,
                    }),
                  ),
                });
              }}
            >
              {t('subjects.deleteButton')}
            </Button>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
