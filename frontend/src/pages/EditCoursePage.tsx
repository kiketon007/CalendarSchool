import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { CourseForm, type CourseSubmitResult, type TutorOption } from '../components/CourseForm';
import { coursesService, type Course } from '../services/coursesService';
import { professorsService, type Professor } from '../services/professorsService';
import { useSession } from '../session/SessionProvider';
import type { CourseDraft } from '../validation/courseValidation';

type CourseState =
  | { status: 'loading' }
  | { status: 'loaded'; course: Course }
  | { status: 'notFound' }
  | { status: 'error' };

type ProfessorsState =
  { status: 'loading' } | { status: 'loaded'; professors: Professor[] } | { status: 'error' };

/**
 * Los profesores que se pueden elegir como tutor en este curso: los que no tutorizan ninguna clase y los
 * que tutorizan una de este mismo curso (con su clase en el texto); nunca los de otro curso.
 */
function tutorOptionsFor(professors: Professor[], courseId: string, t: TFunction): TutorOption[] {
  return professors.flatMap(({ id, firstName, lastName, tutoredClass }) => {
    const name = `${firstName} ${lastName}`;
    if (tutoredClass === null) {
      return [{ id, label: name }];
    }
    return tutoredClass.courseId === courseId
      ? [
          {
            id,
            label: t('courses.form.tutorOptionWithClass', { name, className: tutoredClass.name }),
          },
        ]
      : [];
  });
}

/**
 * Edición de un curso (US07): cuelga de `AuthenticatedLayout` en `/cursos/:id/editar` y la usan los dos
 * roles. Pide el curso una sola vez aunque `StrictMode` ejecute el efecto dos veces; si no existe en el
 * colegio (`404`) lo dice con un enlace al listado, y si falla ofrece reintentarlo. Con el curso cargado
 * muestra el formulario común (`CourseForm`) relleno, con «Guardar» deshabilitado hasta que haya cambios
 * reales, y envía el estado final con `coursesService.update`: las clases que ya existían viajan con su
 * `id`. Con el `200` vuelve al listado con el nombre del curso para el aviso. Un `400` marca los campos;
 * un `409 COURSE_ALREADY_EXISTS`, el nombre; un `409 COURSE_CHANGED` avisa de que otra persona cambió el
 * curso y ofrece recargarlo (se pierde lo escrito); un `404` al guardar sustituye el formulario por el
 * aviso de curso no disponible; cualquier otro fallo muestra un aviso genérico y conserva lo escrito.
 *
 * El tutor de cada clase (US09_b) se elige en un desplegable con los profesores del colegio, que la página
 * pide una sola vez; mientras no están (o si fallan, con un aviso y «Reintentar») el tutor se muestra como
 * texto y no se envía. Un `409 PROFESSOR_ALREADY_TUTOR` avisa, vuelve a pedir los profesores y deja que el
 * formulario marque las filas cuyo profesor ya no se puede elegir.
 */
export function EditCoursePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { authorizedFetch } = useSession();
  const [state, setState] = useState<CourseState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [courseChanged, setCourseChanged] = useState(false);
  const [professorsState, setProfessorsState] = useState<ProfessorsState>({ status: 'loading' });
  const [professorsAttempt, setProfessorsAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // Intento ya pedido: en modo estricto el efecto se ejecuta dos veces, pero el curso se pide una.
  const requestedAttempt = useRef<number | undefined>(undefined);
  const requestedProfessors = useRef<number | undefined>(undefined);

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
    void coursesService.get(authorizedFetch, id).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setState({ status: 'loaded', course: outcome.course });
          break;
        case 'notFound':
          setState({ status: 'notFound' });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setState({ status: 'error' });
          break;
      }
    });
  }, [attempt, id, authorizedFetch]);

  useEffect(() => {
    if (requestedProfessors.current === professorsAttempt) {
      return;
    }
    requestedProfessors.current = professorsAttempt;
    void professorsService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      if (outcome.status === 'loaded') {
        setProfessorsState({ status: 'loaded', professors: outcome.professors });
      } else if (outcome.status === 'unavailable') {
        setProfessorsState({ status: 'error' });
      }
    });
  }, [professorsAttempt, authorizedFetch]);

  /** Vuelve a pedir los profesores tras un fallo: hasta que lleguen, el tutor sigue siendo de solo lectura. */
  function reloadProfessors() {
    setProfessorsState({ status: 'loading' });
    setProfessorsAttempt((current) => current + 1);
  }

  /** Vuelve a pedir el curso y descarta lo escrito (el formulario se monta de nuevo con otra `key`). */
  function reload() {
    setCourseChanged(false);
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  const loadedCourse = state.status === 'loaded' ? state.course : undefined;
  const initialValues = useMemo<CourseDraft | undefined>(
    () =>
      loadedCourse && {
        name: loadedCourse.name,
        classes: loadedCourse.classes.map((schoolClass) => ({
          id: schoolClass.id,
          name: schoolClass.name,
          tutorId: schoolClass.tutor?.id ?? null,
        })),
      },
    [loadedCourse],
  );

  /** Tutor de cada clase del curso cargado, solo para mostrarlo: no forma parte de lo que se edita. */
  const classTutors = useMemo<Record<string, string | null> | undefined>(
    () =>
      loadedCourse &&
      Object.fromEntries(
        loadedCourse.classes.map(({ id: classId, tutor }) => [
          classId,
          tutor ? `${tutor.firstName} ${tutor.lastName}` : null,
        ]),
      ),
    [loadedCourse],
  );

  const tutorOptions = useMemo(
    () =>
      professorsState.status === 'loaded'
        ? tutorOptionsFor(professorsState.professors, id, t)
        : undefined,
    [professorsState, id, t],
  );

  async function save({ name, classes }: CourseDraft): Promise<CourseSubmitResult> {
    const outcome = await coursesService.update(authorizedFetch, id, { name, classes });
    switch (outcome.status) {
      case 'updated':
        void navigate('/cursos', { replace: true, state: { courseUpdated: outcome.course.name } });
        return { status: 'done' };
      case 'validationError':
        return { status: 'validationError', details: outcome.details };
      case 'alreadyExists':
        return { status: 'nameTaken' };
      case 'courseChanged':
        if (mounted.current) {
          setCourseChanged(true);
        }
        return { status: 'done' };
      case 'professorAlreadyTutor': {
        const fresh = await professorsService.list(authorizedFetch);
        if (fresh.status !== 'loaded') {
          return { status: 'tutorTaken' };
        }
        if (mounted.current) {
          setProfessorsState({ status: 'loaded', professors: fresh.professors });
        }
        return { status: 'tutorTaken', tutorOptions: tutorOptionsFor(fresh.professors, id, t) };
      }
      case 'notFound':
        if (mounted.current) {
          setState({ status: 'notFound' });
        }
        return { status: 'done' };
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        return { status: 'done' };
      case 'unavailable':
        return { status: 'failed' };
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="edit-course-page">
      <h1>{t('courses.edit.title')}</h1>

      {state.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('courses.edit.loading')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('courses.edit.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={reload}>
            {t('courses.retry')}
          </Button>
        </Alert>
      )}

      {state.status === 'notFound' && (
        <div>
          <p className="fs-5">{t('courses.edit.notFound')}</p>
          <Link to="/cursos" className="btn btn-outline-secondary">
            {t('courses.edit.backToCourses')}
          </Link>
        </div>
      )}

      {initialValues && (
        <>
          {courseChanged && (
            <Alert variant="warning" role="alert" className="d-flex align-items-center gap-3">
              <span>{t('courses.edit.changed')}</span>
              <Button variant="outline-secondary" size="sm" onClick={reload}>
                {t('courses.edit.reload')}
              </Button>
            </Alert>
          )}
          {professorsState.status === 'error' && (
            <Alert variant="warning" className="d-flex align-items-center gap-3">
              <span>{t('courses.form.professorsUnavailable')}</span>
              <Button variant="outline-secondary" size="sm" onClick={reloadProfessors}>
                {t('courses.form.professorsRetry')}
              </Button>
            </Alert>
          )}
          <CourseForm
            // Una carga nueva monta el formulario de cero: lo escrito se descarta.
            key={attempt}
            initialValues={initialValues}
            classTutors={classTutors}
            tutorOptions={tutorOptions}
            onSubmit={save}
            failureMessage={t('courses.edit.saveError')}
            requireChanges
          />
        </>
      )}
    </Container>
  );
}
