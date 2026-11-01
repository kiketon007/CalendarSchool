import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import Table from 'react-bootstrap/Table';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ProfessorLoadWarnings } from '../components/ProfessorLoadWarnings';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  PROFESSOR_LOAD_STATUSES,
  professorsSummaryService,
  type ProfessorLoad,
  type ProfessorsSummary,
} from '../services/professorsSummaryService';
import { useSession } from '../session/SessionProvider';
import { subjectsTextOf } from '../utils/professorSubjects';
import {
  hasActiveSummaryFilters,
  matchesSummaryFilters,
  summarySubjectOptions,
  type SummaryFilters,
} from '../utils/professorSummaryFilters';
import { formatTeachingRange } from '../utils/teachingTime';

type SummaryState =
  { status: 'loading' } | { status: 'loaded'; summary: ProfessorsSummary } | { status: 'error' };

const NO_FILTERS: SummaryFilters = {
  status: '',
  subjectId: '',
  query: '',
  onlyWithWarnings: false,
};

const TITLE_ID = 'professors-summary-title';
const UNASSIGNED_ID = 'professors-summary-unassigned';

/** Cómo se pinta cada estado: el color de la etiqueta y un icono decorativo (el texto siempre lo dice). */
const STATUS_STYLE = {
  NO_LOAD: { bg: 'secondary', icon: '–' },
  FITS: { bg: 'success', icon: '✓' },
  MAY_EXCEED: { bg: 'warning', icon: '!' },
  EXCEEDS: { bg: 'danger', icon: '✕' },
} as const satisfies Record<ProfessorLoad['status'], { bg: string; icon: string }>;

/**
 * Resumen de carga de los profesores del colegio (`/profesores/resumen`, US-PROF-SUMMARY), para `ADMIN` y `MEMBER`: es
 * de solo lectura. Pide el resumen una vez (aunque `StrictMode` ejecute el efecto dos veces) y, si falla, ofrece
 * «Reintentar». Pinta **una sola** presentación según el ancho: una tabla desde 768 px y tarjetas por debajo. El
 * estado y los avisos de cada profesor se dicen con texto: el color y el icono nunca son la única pista.
 */
export function ProfessorsSummaryPage() {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  const isWide = useMediaQuery('(min-width: 768px)');
  const [list, setList] = useState<SummaryState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<SummaryFilters>(NO_FILTERS);
  const searchRef = useRef<HTMLInputElement>(null);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // Intento ya pedido: en modo estricto el efecto se ejecuta dos veces, pero el resumen se pide una.
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
    void professorsSummaryService.get(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', summary: outcome.summary });
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

  function clearFilters() {
    setFilters(NO_FILTERS);
    searchRef.current?.focus();
  }

  /** Los datos de un profesor ya con su texto, iguales en la tabla y en las tarjetas. */
  function describe(professor: ProfessorLoad) {
    const name = `${professor.lastName}, ${professor.firstName}`;
    const { bg, icon } = STATUS_STYLE[professor.status];
    return {
      name,
      subjects: subjectsTextOf(professor.subjects, t),
      hours:
        professor.status === 'NO_LOAD'
          ? t('professors.summary.noHours')
          : formatTeachingRange(professor.minMinutes, professor.maxMinutes),
      status: (
        <Badge bg={bg} text={bg === 'warning' ? 'dark' : undefined} className="d-inline-flex gap-1">
          <span aria-hidden="true">{icon}</span>
          <span>{t(`professors.summary.statuses.${professor.status}`)}</span>
        </Badge>
      ),
      warnings: <ProfessorLoadWarnings professor={name} warnings={professor.warnings} />,
      actions: (
        <div className="d-grid gap-1">
          <Link
            to={`/profesores/${professor.id}/disponibilidad`}
            className="btn btn-sm btn-outline-primary"
            aria-label={t('professors.summary.editAvailabilityAria', { professor: name })}
          >
            {t('professors.summary.editAvailability')}
          </Link>
          {professor.courses.map((course) => (
            <Link key={course.id} to={`/cursos/${course.id}/profesores`}>
              {t('professors.summary.courseLink', { course: course.name })}
            </Link>
          ))}
        </div>
      ),
    };
  }

  const allProfessors = list.status === 'loaded' ? list.summary.professors : undefined;
  const unassigned = list.status === 'loaded' ? list.summary.unassigned : [];
  const subjects = useMemo(() => summarySubjectOptions(allProfessors ?? []), [allProfessors]);
  const professors = useMemo(
    () => (allProfessors ?? []).filter((professor) => matchesSummaryFilters(professor, filters)),
    [allProfessors, filters],
  );

  return (
    <Container as="main" className="py-5" data-testid="professors-summary-page">
      <h1 id={TITLE_ID} className="mb-2">
        {t('professors.summary.title')}
      </h1>
      <p className="text-body-secondary mb-4">{t('professors.summary.intro')}</p>

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('professors.summary.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('professors.summary.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('professors.summary.retry')}
          </Button>
        </Alert>
      )}

      {unassigned.length > 0 && (
        <Alert role="region" variant="warning" aria-labelledby={UNASSIGNED_ID}>
          <h2 id={UNASSIGNED_ID} className="h6">
            {t('professors.summary.unassigned.title')}
          </h2>
          <p className="mb-2">{t('professors.summary.unassigned.intro')}</p>
          <ul className="mb-0">
            {unassigned.map(({ courseId, courseName, missingCount }) => (
              <li key={courseId}>
                <Link to={`/cursos/${courseId}/profesores`}>
                  {t('professors.summary.unassigned.item', {
                    course: courseName,
                    count: missingCount,
                  })}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {allProfessors !== undefined && allProfessors.length > 0 && unassigned.length === 0 && (
        <p className="text-success-emphasis">{t('professors.summary.unassigned.allAssigned')}</p>
      )}

      {allProfessors?.length === 0 && (
        <div>
          <p className="fs-5">{t('professors.summary.empty')}</p>
          <Link to="/profesores/nuevo" className="btn btn-primary">
            {t('professors.summary.create')}
          </Link>
        </div>
      )}

      {allProfessors !== undefined && allProfessors.length > 0 && (
        <>
          <Form
            role="search"
            aria-label={t('professors.summary.filters.legend')}
            className="row g-3 mb-4"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <Form.Group className="col-12 col-md-6" controlId="professors-summary-search">
              <Form.Label>{t('professors.summary.filters.search')}</Form.Label>
              <Form.Control
                ref={searchRef}
                type="search"
                autoComplete="off"
                value={filters.query}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, query: event.target.value }));
                }}
              />
            </Form.Group>
            <Form.Group className="col-6 col-md-3" controlId="professors-summary-status">
              <Form.Label>{t('professors.summary.filters.status')}</Form.Label>
              <Form.Select
                value={filters.status}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as SummaryFilters['status'],
                  }));
                }}
              >
                <option value="">{t('professors.summary.filters.all')}</option>
                {PROFESSOR_LOAD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`professors.summary.statuses.${status}`)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="col-6 col-md-3" controlId="professors-summary-subject">
              <Form.Label>{t('professors.summary.filters.subject')}</Form.Label>
              <Form.Select
                value={filters.subjectId}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, subjectId: event.target.value }));
                }}
              >
                <option value="">{t('professors.summary.filters.allSubjects')}</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="col-12" controlId="professors-summary-warnings">
              <Form.Check
                type="checkbox"
                label={t('professors.summary.filters.onlyWithWarnings')}
                checked={filters.onlyWithWarnings}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    onlyWithWarnings: event.target.checked,
                  }));
                }}
              />
            </Form.Group>
          </Form>

          <p role="status" className="fw-semibold" data-testid="professors-summary-count">
            {t('professors.summary.count', { count: professors.length })}
          </p>

          {professors.length === 0 && (
            <div>
              <p className="fs-5">{t('professors.summary.noMatches')}</p>
              {hasActiveSummaryFilters(filters) && (
                <Button variant="outline-secondary" onClick={clearFilters}>
                  {t('professors.summary.filters.clear')}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {professors.length > 0 && isWide && (
        <Table hover aria-labelledby={TITLE_ID}>
          <thead>
            <tr>
              <th scope="col">{t('professors.summary.fields.professor')}</th>
              <th scope="col">{t('professors.summary.fields.subjects')}</th>
              <th scope="col">{t('professors.summary.fields.sessions')}</th>
              <th scope="col">{t('professors.summary.fields.hours')}</th>
              <th scope="col">{t('professors.summary.fields.status')}</th>
              <th scope="col">{t('professors.summary.fields.warnings')}</th>
              <th scope="col">{t('professors.summary.fields.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {professors.map((professor) => {
              const { name, subjects, hours, status, warnings, actions } = describe(professor);
              return (
                <tr key={professor.id}>
                  <th scope="row">{name}</th>
                  <td>{subjects}</td>
                  <td>{professor.sessionsPerWeek}</td>
                  <td>{hours}</td>
                  <td>{status}</td>
                  <td>{warnings}</td>
                  <td>{actions}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {professors.length > 0 && !isWide && (
        <ul aria-label={t('professors.summary.list')} className="list-unstyled d-grid gap-3 mb-0">
          {professors.map((professor) => {
            const { name, subjects, hours, status, warnings, actions } = describe(professor);
            return (
              <li key={professor.id}>
                <Card>
                  <Card.Body>
                    <h2 className="h5">{name}</h2>
                    <dl className="mb-2">
                      <dt>{t('professors.summary.fields.subjects')}</dt>
                      <dd>{subjects}</dd>
                      <dt>{t('professors.summary.fields.sessions')}</dt>
                      <dd>{professor.sessionsPerWeek}</dd>
                      <dt>{t('professors.summary.fields.hours')}</dt>
                      <dd>{hours}</dd>
                      <dt>{t('professors.summary.fields.status')}</dt>
                      <dd>{status}</dd>
                    </dl>
                    {warnings}
                    <div className="mt-2">{actions}</div>
                  </Card.Body>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
