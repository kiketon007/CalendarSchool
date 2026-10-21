import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { studentsService, type StudentSummary } from '../services/studentsService';
import { useSession } from '../session/SessionProvider';

type ListState =
  { status: 'loading' } | { status: 'loaded'; students: StudentSummary[] } | { status: 'error' };

/** Punto de corte `md` de Bootstrap: desde aquí el listado es una tabla y por debajo, tarjetas. */
const WIDE_SCREEN = '(min-width: 768px)';
const TITLE_ID = 'students-title';

/**
 * Nombre del alumno recién creado, del estado de la navegación: `{ studentCreated: <nombre> }` si llega de
 * `CreateStudentPage`. Solo viaja en el estado de la navegación (nunca en almacenamiento propio); acepta
 * únicamente un texto no vacío y descarta cualquier otra forma.
 */
function createdNameFrom(state: unknown): string | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const { studentCreated } = state as Record<string, unknown>;
  return typeof studentCreated === 'string' && studentCreated.length > 0
    ? studentCreated
    : undefined;
}

/** Datos de un alumno ya preparados para pintar, iguales en la tabla y en las tarjetas. */
interface StudentRow {
  id: string;
  /** «Apellidos, Nombre»: el de la cabecera de la fila. */
  name: string;
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
 * No filtra, no busca ni pagina todavía (US15 y US16) y no tiene acciones por fila (US17 y US18). Si se
 * llega de crear un alumno, muestra un aviso con su nombre como texto plano.
 */
export function StudentsPage() {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  const createdName = createdNameFrom(useLocation().state);
  const isWide = useMediaQuery(WIDE_SCREEN);
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
    void studentsService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', students: outcome.students });
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
  const rows = useMemo<StudentRow[]>(
    () =>
      (loadedStudents ?? []).map((student) => ({
        id: student.id,
        name: `${student.lastName}, ${student.firstName}`,
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
    [loadedStudents, t],
  );

  function retry() {
    setList({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  return (
    <Container as="main" className="py-5" data-testid="students-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <h1 id={TITLE_ID} className="mb-0">
          {t('students.title')}
        </h1>
        <Link to="/alumnos/nuevo" className="btn btn-primary">
          {t('students.create')}
        </Link>
      </div>

      {createdName !== undefined && (
        // Un `Alert` lleva `role="alert"` por defecto: es un aviso informativo, no un error.
        <Alert variant="success" role="status">
          {t('students.created', { name: createdName })}
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

      {rows.length > 0 && isWide && (
        <Table hover aria-labelledby={TITLE_ID}>
          <thead>
            <tr>
              <th scope="col">{t('students.fields.name')}</th>
              <th scope="col">{t('students.fields.courseClass')}</th>
              <th scope="col">{t('students.fields.cafeteria')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="text-break">
                  {row.name}
                </th>
                <td className={row.hasNoCourse ? 'text-body-secondary' : undefined}>
                  {row.courseClass}
                </td>
                <td>{row.cafeteria}</td>
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
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
