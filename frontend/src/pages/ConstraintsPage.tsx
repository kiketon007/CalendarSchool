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
import { SubjectColorSwatch } from '../components/SubjectColorSwatch';
import { SubjectWarnings } from '../components/SubjectWarnings';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  CONSTRAINT_TYPES,
  constraintsService,
  type SchedulingConstraint,
} from '../services/constraintsService';
import { useSession } from '../session/SessionProvider';
import {
  courseOptions,
  hasActiveFilters,
  matchesConstraintFilters,
  type ConstraintFilters,
} from '../utils/constraintFilters';

type ListState =
  | { status: 'loading' }
  | { status: 'loaded'; constraints: SchedulingConstraint[] }
  | { status: 'error' };

const NO_FILTERS: ConstraintFilters = {
  type: '',
  courseId: '',
  query: '',
  onlyWithWarnings: false,
};

const TITLE_ID = 'constraints-title';

/** Dónde se define cada regla: la carga del curso (máximo y bloques) o su cuadrícula de franjas. */
function ruleLink({ type, course, subject }: SchedulingConstraint): string {
  const workload = `/cursos/${course.id}/carga`;
  switch (type) {
    case 'MAX_PER_DAY':
    case 'BLOCK':
      return workload;
    case 'FORBIDDEN_SLOTS':
      return `${workload}/${subject.id}/prohibidas`;
    case 'PREFERRED_SLOTS':
      return `${workload}/${subject.id}/preferidas`;
  }
}

/**
 * Listado de las reglas de reparto del colegio (`/reglas`, US20), para `ADMIN` y `MEMBER`: es de solo lectura, las
 * reglas se editan en la carga de cada curso y en sus cuadrículas, y cada una enlaza allí («Editar» para el
 * administrador y «Ver» para el miembro). Pide la lista una vez (aunque `StrictMode` ejecute el efecto dos veces)
 * y filtra en el navegador, sin pedirla de nuevo: tipo, curso, búsqueda por nombre o código de la asignatura y
 * «Solo con avisos», combinables y guardados en el estado de la página, no en la URL. Pinta **una sola**
 * presentación según el ancho: una tabla desde 768 px y tarjetas por debajo. Cada regla lleva los avisos de su
 * regla, en rojo y con su texto: el color nunca es la única pista.
 */
export function ConstraintsPage() {
  const { t } = useTranslation();
  const { authorizedFetch, state } = useSession();
  const isWide = useMediaQuery('(min-width: 768px)');
  const isAdmin = state.status === 'authenticated' && state.data.user.role === 'ADMIN';
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<ConstraintFilters>(NO_FILTERS);
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
    void constraintsService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setList({ status: 'loaded', constraints: outcome.constraints });
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

  const constraints = list.status === 'loaded' ? list.constraints : undefined;
  const courses = useMemo(() => courseOptions(constraints ?? []), [constraints]);
  const visible = useMemo(
    () => (constraints ?? []).filter((rule) => matchesConstraintFilters(rule, filters)),
    [constraints, filters],
  );

  /** Los datos de una regla ya con su texto, iguales en la tabla y en las tarjetas. */
  function describe(rule: SchedulingConstraint) {
    const ruleName = t(`constraints.types.${rule.type}`);
    const detail =
      rule.type === 'MAX_PER_DAY'
        ? t('constraints.detail.maxPerDay', { count: rule.maxPerDay ?? 0 })
        : rule.type === 'BLOCK'
          ? t('constraints.detail.blockSize', { count: rule.blockSize ?? 0 })
          : t('constraints.detail.slots', { count: rule.slotCount ?? 0 });
    const names = { rule: ruleName, subject: rule.subject.name, course: rule.course.name };
    return {
      ruleName,
      detail,
      link: state.status === 'authenticated' && (
        <Link
          to={ruleLink(rule)}
          className="btn btn-sm btn-outline-primary"
          aria-label={t(isAdmin ? 'constraints.editAria' : 'constraints.viewAria', names)}
        >
          {t(isAdmin ? 'constraints.edit' : 'constraints.view')}
        </Link>
      ),
      warnings: (
        <SubjectWarnings subject={t('constraints.warningsOf', names)} warnings={rule.warnings} />
      ),
    };
  }

  const subjectCell = (rule: SchedulingConstraint) => (
    <span className="d-inline-flex flex-wrap align-items-center gap-2">
      <SubjectColorSwatch color={rule.subject.color} />
      <span>{rule.subject.name}</span>
      {rule.subject.code !== null && (
        <span className="text-body-secondary">
          {t('constraints.code', { code: rule.subject.code })}
        </span>
      )}
      {rule.subject.status === 'INACTIVE' && (
        <Badge bg="secondary">{t('constraints.inactive')}</Badge>
      )}
    </span>
  );

  return (
    <Container as="main" className="py-5" data-testid="constraints-page">
      <h1 id={TITLE_ID} className="mb-2">
        {t('constraints.title')}
      </h1>
      <p className="text-body-secondary mb-4">{t('constraints.intro')}</p>

      {list.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('constraints.loading')}</span>
        </div>
      )}

      {list.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('constraints.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('constraints.retry')}
          </Button>
        </Alert>
      )}

      {list.status === 'loaded' && list.constraints.length === 0 && (
        <div>
          <p className="fs-5">{t('constraints.empty')}</p>
          <Link to="/cursos" className="btn btn-primary">
            {t('constraints.goToCourses')}
          </Link>
        </div>
      )}

      {list.status === 'loaded' && list.constraints.length > 0 && (
        <>
          <Form
            role="search"
            aria-label={t('constraints.filters.legend')}
            className="row g-3 mb-4"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <Form.Group className="col-12 col-md-6" controlId="constraints-search">
              <Form.Label>{t('constraints.filters.search')}</Form.Label>
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
            <Form.Group className="col-6 col-md-3" controlId="constraints-filter-type">
              <Form.Label>{t('constraints.filters.type')}</Form.Label>
              <Form.Select
                value={filters.type}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    type: event.target.value as ConstraintFilters['type'],
                  }));
                }}
              >
                <option value="">{t('constraints.filters.all')}</option>
                {CONSTRAINT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`constraints.types.${type}`)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="col-6 col-md-3" controlId="constraints-filter-course">
              <Form.Label>{t('constraints.filters.course')}</Form.Label>
              <Form.Select
                value={filters.courseId}
                onChange={(event) => {
                  setFilters((current) => ({ ...current, courseId: event.target.value }));
                }}
              >
                <option value="">{t('constraints.filters.all')}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="col-12" controlId="constraints-filter-warnings">
              <Form.Check
                type="checkbox"
                label={t('constraints.filters.onlyWithWarnings')}
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

          <p role="status" className="fw-semibold" data-testid="constraints-count">
            {t('constraints.count', { count: visible.length })}
          </p>

          {visible.length === 0 && (
            <div>
              <p className="fs-5">{t('constraints.noMatches')}</p>
              {hasActiveFilters(filters) && (
                <Button variant="outline-secondary" onClick={clearFilters}>
                  {t('constraints.filters.clear')}
                </Button>
              )}
            </div>
          )}

          {visible.length > 0 && isWide && (
            <Table hover aria-labelledby={TITLE_ID}>
              <thead>
                <tr>
                  <th scope="col">{t('constraints.fields.course')}</th>
                  <th scope="col">{t('constraints.fields.subject')}</th>
                  <th scope="col">{t('constraints.fields.rule')}</th>
                  <th scope="col">{t('constraints.fields.detail')}</th>
                  <th scope="col">{t('constraints.fields.warnings')}</th>
                  <th scope="col">{t('constraints.fields.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((rule) => {
                  const { ruleName, detail, link, warnings } = describe(rule);
                  return (
                    <tr key={rule.id}>
                      <th scope="row">{rule.course.name}</th>
                      <td>{subjectCell(rule)}</td>
                      <td>{ruleName}</td>
                      <td>{detail}</td>
                      <td>{warnings}</td>
                      <td>{link}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}

          {visible.length > 0 && !isWide && (
            <ul aria-label={t('constraints.list')} className="list-unstyled d-grid gap-3 mb-0">
              {visible.map((rule) => {
                const { ruleName, detail, link, warnings } = describe(rule);
                return (
                  <li key={rule.id}>
                    <Card>
                      <Card.Body>
                        <h2 className="h5">{rule.subject.name}</h2>
                        <dl className="mb-2">
                          <dt>{t('constraints.fields.course')}</dt>
                          <dd>{rule.course.name}</dd>
                          <dt>{t('constraints.fields.subject')}</dt>
                          <dd>{subjectCell(rule)}</dd>
                          <dt>{t('constraints.fields.rule')}</dt>
                          <dd>{ruleName}</dd>
                          <dt>{t('constraints.fields.detail')}</dt>
                          <dd>{detail}</dd>
                        </dl>
                        {warnings}
                        <div className="mt-2">{link}</div>
                      </Card.Body>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Container>
  );
}
