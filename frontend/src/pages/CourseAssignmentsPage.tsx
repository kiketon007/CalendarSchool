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
import { Link, useParams } from 'react-router';
import { SubjectColorSwatch } from '../components/SubjectColorSwatch';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  courseAssignmentsService,
  type CourseAssignments,
} from '../services/courseAssignmentsService';
import { professorsService, type Professor } from '../services/professorsService';
import { useSession } from '../session/SessionProvider';
import {
  assignTutor,
  cellKey,
  draftFrom,
  hasChanges,
  sessionsByProfessor,
  toBody,
  unassignedCount,
  type AssignmentsDraft,
} from '../utils/courseAssignmentsDraft';

type LoadState =
  { status: 'loading' } | { status: 'loaded' } | { status: 'notFound' } | { status: 'error' };

type Notice = 'saved' | 'saveError' | 'changed';
type Subject = CourseAssignments['subjects'][number];
type SchoolClass = CourseAssignments['classes'][number];

const professorLabel = ({ firstName, lastName }: Pick<Professor, 'firstName' | 'lastName'>) =>
  `${lastName}, ${firstName}`;

/**
 * Los profesores de cada asignatura en cada clase de un curso (`/cursos/:id/profesores`, US-PROF-ASSIGN), para
 * `ADMIN` y `MEMBER`. Es una matriz: una fila por asignatura que se imparte en el curso (con sus sesiones, que
 * son las de la carga horaria) y una columna por clase, con un desplegable de profesores en cada celda; el tutor de
 * la clase va marcado y «Asignar al tutor» rellena las celdas vacías de su clase. Por debajo de 768 px, una
 * tarjeta por clase. Debajo se cuentan las celdas sin profesor y las sesiones de cada profesor en el curso,
 * recalculadas mientras se edita. El borrador es la matriz entera y «Guardar» la envía como estado final (gana el
 * último guardado). Pide la matriz y los profesores una vez (aunque `StrictMode` ejecute el efecto dos veces).
 */
export function CourseAssignmentsPage() {
  const { t } = useTranslation();
  const { authorizedFetch, state } = useSession();
  const { id = '' } = useParams();
  const isWide = useMediaQuery('(min-width: 768px)');
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [matrix, setMatrix] = useState<CourseAssignments | undefined>(undefined);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [draft, setDraft] = useState<AssignmentsDraft>({});
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | undefined>(undefined);
  // Guarda síncrona: el estado `saving` tarda un render en reflejarse y una doble pulsación llegaría antes.
  const submitting = useRef(false);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto los efectos se ejecutan dos veces, pero cada intento se pide una vez.
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
      courseAssignmentsService.get(authorizedFetch, id),
      professorsService.list(authorizedFetch),
    ]).then(([course, professorList]) => {
      if (!mounted.current) {
        return;
      }
      if (course.status === 'notFound') {
        setLoad({ status: 'notFound' });
      } else if (
        course.status === 'unauthenticated' ||
        professorList.status === 'unauthenticated'
      ) {
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
      } else if (course.status === 'loaded' && professorList.status === 'loaded') {
        setMatrix(course.assignments);
        setProfessors(professorList.professors);
        setDraft(draftFrom(course.assignments));
        setLoad({ status: 'loaded' });
      } else {
        setLoad({ status: 'error' });
      }
    });
  }, [attempt, authorizedFetch, id]);

  function reload() {
    setLoad({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function retry() {
    setNotice(undefined);
    reload();
  }

  const subjects = useMemo(() => matrix?.subjects ?? [], [matrix]);
  const classes = useMemo(() => matrix?.classes ?? [], [matrix]);
  const missing = unassignedCount(draft);
  const total = Object.keys(draft).length;
  const changed = matrix !== undefined && hasChanges(draft, matrix);
  const professorsById = useMemo(
    () => new Map(professors.map((professor) => [professor.id, professor])),
    [professors],
  );
  const perProfessor = useMemo(
    () =>
      [...sessionsByProfessor(draft, subjects)]
        .map(([professorId, sessions]) => {
          const professor = professorsById.get(professorId);
          return { name: professor ? professorLabel(professor) : professorId, sessions };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    [draft, subjects, professorsById],
  );

  function choose(subjectId: string, classId: string, professorId: string) {
    setNotice(undefined);
    setDraft((current) => ({
      ...current,
      [cellKey(subjectId, classId)]: professorId === '' ? null : professorId,
    }));
  }

  function fillWithTutor(schoolClass: SchoolClass) {
    if (schoolClass.tutor === null) {
      return;
    }
    const tutorId = schoolClass.tutor.id;
    setNotice(undefined);
    setDraft((current) => assignTutor(current, schoolClass.id, tutorId, subjects));
  }

  async function save() {
    if (submitting.current || matrix === undefined || !changed) {
      return;
    }
    submitting.current = true;
    setSaving(true);
    setNotice(undefined);
    try {
      const outcome = await courseAssignmentsService.update(
        authorizedFetch,
        id,
        toBody(draft, matrix),
      );
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'updated':
          setMatrix(outcome.assignments);
          setDraft(draftFrom(outcome.assignments));
          setNotice('saved');
          break;
        case 'validationError':
          // Algo cambió mientras se editaba (una asignatura, una clase o un profesor): se vuelve a pedir todo.
          setNotice('changed');
          reload();
          break;
        case 'notFound':
          setLoad({ status: 'notFound' });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setNotice('saveError');
          break;
      }
    } finally {
      submitting.current = false;
      if (mounted.current) {
        setSaving(false);
      }
    }
  }

  /** El desplegable de una celda: «Sin asignar» y los profesores, con el tutor de la clase marcado. */
  function cellSelect(subject: Subject, schoolClass: SchoolClass) {
    const value = draft[cellKey(subject.id, schoolClass.id)] ?? '';
    return (
      <Form.Select
        size="sm"
        aria-label={t('assignments.select', { subject: subject.name, class: schoolClass.name })}
        value={value}
        onChange={(event) => {
          choose(subject.id, schoolClass.id, event.target.value);
        }}
      >
        <option value="">{t('assignments.unassigned')}</option>
        {professors.map((professor) => (
          <option key={professor.id} value={professor.id}>
            {professor.id === schoolClass.tutor?.id
              ? t('assignments.tutorMark', {
                  name: professorLabel(professor),
                  class: schoolClass.name,
                })
              : professorLabel(professor)}
          </option>
        ))}
      </Form.Select>
    );
  }

  /** El botón «Asignar al tutor» de una clase; sin tutor está deshabilitado y lo explica. */
  function tutorButton(schoolClass: SchoolClass) {
    const hintId = `no-tutor-${schoolClass.id}`;
    const hasTutor = schoolClass.tutor !== null;
    return (
      <div className="mt-1">
        <Button
          variant="outline-secondary"
          size="sm"
          disabled={!hasTutor}
          aria-label={t('assignments.assignTutorLabel', { class: schoolClass.name })}
          aria-describedby={hasTutor ? undefined : hintId}
          onClick={() => {
            fillWithTutor(schoolClass);
          }}
        >
          {t('assignments.assignTutor')}
        </Button>
        {!hasTutor && (
          <small id={hintId} className="d-block text-body-secondary">
            {t('assignments.noTutor', { class: schoolClass.name })}
          </small>
        )}
      </div>
    );
  }

  const subjectCell = (subject: Subject) => (
    <span className="d-inline-flex flex-wrap align-items-center gap-2">
      <SubjectColorSwatch color={subject.color} />
      <span>{subject.name}</span>
      {subject.code !== null && (
        <span className="text-body-secondary">{t('assignments.code', { code: subject.code })}</span>
      )}
      {subject.status === 'INACTIVE' && <Badge bg="secondary">{t('assignments.inactive')}</Badge>}
      <small className="text-body-secondary">
        {t('assignments.sessions', { count: subject.sessionsPerWeek })}
      </small>
    </span>
  );

  const backToCourses = <Link to="/cursos">{t('assignments.backToCourses')}</Link>;
  const ready =
    load.status === 'loaded' && state.status === 'authenticated' && matrix !== undefined;
  const title = matrix?.course.name ?? '';

  return (
    <Container as="main" className="py-5" data-testid="course-assignments-page">
      {load.status === 'notFound' ? (
        <>
          <h1 tabIndex={-1}>{t('assignments.notFound')}</h1>
          {backToCourses}
        </>
      ) : (
        <>
          <div className="mb-3">{backToCourses}</div>
          {ready && (
            <h1 tabIndex={-1} className="mb-3">
              {t('assignments.title', { course: title })}
            </h1>
          )}

          {(load.status === 'loading' || state.status !== 'authenticated') &&
            load.status !== 'error' && (
              <div role="status" className="d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" aria-hidden="true" />
                <span>{t('assignments.loading')}</span>
              </div>
            )}

          {load.status === 'error' && (
            <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
              <span>{t('assignments.loadError')}</span>
              <Button variant="outline-danger" size="sm" onClick={retry}>
                {t('assignments.retry')}
              </Button>
            </Alert>
          )}

          {notice === 'saved' && (
            <Alert variant="success" role="status">
              {t('assignments.saved', { course: title })}
            </Alert>
          )}
          {notice === 'saveError' && (
            <Alert variant="danger" role="alert">
              {t('assignments.saveError')}
            </Alert>
          )}
          {notice === 'changed' && (
            <Alert variant="danger" role="alert">
              {t('assignments.changed')}
            </Alert>
          )}

          {ready && subjects.length === 0 && (
            <div>
              <p className="fs-5 mb-1">{t('assignments.noSubjects')}</p>
              <p className="text-body-secondary">{t('assignments.noSubjectsHint')}</p>
              <Link to={`/cursos/${encodeURIComponent(id)}/carga`}>
                {t('assignments.workloadLink')}
              </Link>
            </div>
          )}

          {ready && subjects.length > 0 && (
            <>
              <p className="text-body-secondary">{t('assignments.intro')}</p>

              {isWide ? (
                <Table bordered aria-label={t('assignments.caption', { course: title })}>
                  <thead>
                    <tr>
                      <th scope="col">{t('assignments.subject')}</th>
                      {classes.map((schoolClass) => (
                        <th scope="col" key={schoolClass.id}>
                          <span>{t('assignments.class', { name: schoolClass.name })}</span>
                          {tutorButton(schoolClass)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((subject) => (
                      <tr key={subject.id}>
                        <th scope="row" className="fw-normal">
                          {subjectCell(subject)}
                        </th>
                        {classes.map((schoolClass) => (
                          <td key={schoolClass.id}>{cellSelect(subject, schoolClass)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <ul
                  aria-label={t('assignments.caption', { course: title })}
                  className="list-unstyled d-grid gap-3"
                >
                  {classes.map((schoolClass) => (
                    <li key={schoolClass.id}>
                      <Card>
                        <Card.Body>
                          <h2 className="h5">
                            {t('assignments.class', { name: schoolClass.name })}
                          </h2>
                          {tutorButton(schoolClass)}
                          <div className="d-grid gap-3 mt-3">
                            {subjects.map((subject) => (
                              <div key={subject.id}>
                                <div className="mb-1">{subjectCell(subject)}</div>
                                {cellSelect(subject, schoolClass)}
                              </div>
                            ))}
                          </div>
                        </Card.Body>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}

              <p role="status" className={`fw-semibold mb-1${missing > 0 ? ' text-danger' : ''}`}>
                {t('assignments.missing', { missing, total })}
              </p>
              {perProfessor.length > 0 && (
                <p className="text-body-secondary">
                  {t('assignments.perProfessor', {
                    list: perProfessor
                      .map(({ name, sessions }) =>
                        t('assignments.professorSessions', { name, count: sessions }),
                      )
                      .join(' · '),
                  })}
                </p>
              )}

              <Button
                variant="primary"
                className="mt-2"
                disabled={!changed || saving}
                onClick={() => {
                  void save();
                }}
              >
                {saving ? t('assignments.saving') : t('assignments.save')}
              </Button>
            </>
          )}
        </>
      )}
    </Container>
  );
}
