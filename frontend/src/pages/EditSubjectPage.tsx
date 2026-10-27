import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  SubjectForm,
  type CoursesState,
  type SubjectSubmitResult,
} from '../components/SubjectForm';
import { coursesService } from '../services/coursesService';
import { subjectsService, type Subject } from '../services/subjectsService';
import { useSession } from '../session/SessionProvider';
import {
  groupSubjectErrors,
  subjectDraftFrom,
  toCreateSubjectInput,
  type SubjectDraft,
} from '../validation/subjectValidation';

type SubjectState =
  | { status: 'loading' }
  | { status: 'loaded'; subject: Subject }
  | { status: 'notFound' }
  | { status: 'error' };

/**
 * Edición de una asignatura (US-SUBJECT_b): cuelga de `AuthenticatedLayout` y de `RequireRole` con el rol
 * `ADMIN` (la guarda de la interfaz es una comodidad: decide el backend, que responde `403` a un `MEMBER`).
 * Pide la asignatura y los cursos una sola vez cada uno aunque `StrictMode` ejecute los efectos dos veces, y
 * **no monta el formulario hasta tener las dos respuestas** (solo lee sus valores iniciales al montarse; si los
 * cursos fallan lo monta igual, con su «Reintentar»). Deja el formulario (el mismo del alta, con «Guardar» solo
 * con cambios) a `SubjectForm`. Un `404` al cargar o al guardar (otro colegio, inexistente, un id que no es un
 * UUID o borrada mientras se editaba) muestra «no existe o ya no está disponible» con un enlace al listado; un
 * fallo al cargar ofrece «Reintentar». Con el `200` vuelve al listado, reemplazando la entrada del historial, con
 * el nombre que guardó el servidor para el aviso. Un `400` marca los campos que rechaza el servidor y, si un
 * curso ya no existe, vuelve a pedir los cursos sin vaciar el formulario; un `409` marca el nombre o el código;
 * cualquier otro fallo muestra un aviso general conservando lo escrito.
 */
export function EditSubjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();
  const { id = '' } = useParams();
  const [state, setState] = useState<SubjectState>({ status: 'loading' });
  const [coursesState, setCoursesState] = useState<CoursesState>({ status: 'loading' });
  // Los cursos ya han contestado alguna vez: recargarlos después no desmonta el formulario ni vacía lo escrito.
  const [coursesAnswered, setCoursesAnswered] = useState(false);
  const [failure, setFailure] = useState<'unavailable' | 'forbiddenEdit'>('unavailable');
  // Intentos de carga: subirlos vuelve a pedir la asignatura (reintento) o los cursos (curso borrado).
  const [attempt, setAttempt] = useState(0);
  const [coursesAttempt, setCoursesAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto los efectos se ejecutan dos veces, pero cada intento se pide una vez.
  const requestedAttempt = useRef<number | undefined>(undefined);
  const requestedCoursesAttempt = useRef<number | undefined>(undefined);

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
    void subjectsService.get(authorizedFetch, id).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setState({ status: 'loaded', subject: outcome.subject });
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
  }, [attempt, authorizedFetch, id]);

  useEffect(() => {
    if (requestedCoursesAttempt.current === coursesAttempt) {
      return;
    }
    requestedCoursesAttempt.current = coursesAttempt;
    void coursesService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setCoursesState({ status: 'loaded', courses: outcome.courses });
          setCoursesAnswered(true);
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setCoursesState({ status: 'error' });
          setCoursesAnswered(true);
          break;
      }
    });
  }, [coursesAttempt, authorizedFetch]);

  function retry() {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function reloadCourses() {
    setCoursesState({ status: 'loading' });
    setCoursesAttempt((current) => current + 1);
  }

  async function save(draft: SubjectDraft): Promise<SubjectSubmitResult> {
    setFailure('unavailable');
    const outcome = await subjectsService.update(authorizedFetch, id, toCreateSubjectInput(draft));
    switch (outcome.status) {
      case 'updated':
        void navigate('/asignaturas', {
          replace: true,
          state: { subjectUpdated: outcome.subject.name },
        });
        return { status: 'done' };
      case 'validationError':
        if (
          outcome.details.some(
            ({ field, code }) => field.endsWith('.courseId') && code === 'NOT_FOUND',
          )
        ) {
          // Un curso elegido ya no existe: se vuelve a pedir la lista sin tocar lo escrito.
          reloadCourses();
        }
        return { status: 'validationError', errors: groupSubjectErrors(outcome.details) };
      case 'alreadyExists':
        return { status: 'nameTaken' };
      case 'codeAlreadyExists':
        return { status: 'codeTaken' };
      case 'notFound':
        if (mounted.current) {
          setState({ status: 'notFound' });
        }
        return { status: 'done' };
      case 'forbidden':
        setFailure('forbiddenEdit');
        return { status: 'failed' };
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        return { status: 'done' };
      case 'unavailable':
        return { status: 'failed' };
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="edit-subject-page">
      <h1>{t('subjects.form.editTitle')}</h1>

      {(state.status === 'loading' || (state.status === 'loaded' && !coursesAnswered)) && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('subjects.form.loadingOne')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('subjects.form.loadErrorOne')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('subjects.retry')}
          </Button>
        </Alert>
      )}

      {state.status === 'notFound' && (
        <div>
          <p>{t('subjects.form.notFound')}</p>
          <Link to="/asignaturas">{t('subjects.form.backToList')}</Link>
        </div>
      )}

      {state.status === 'loaded' && coursesAnswered && (
        <SubjectForm
          // Una carga nueva monta el formulario de nuevo con los valores del servidor.
          key={attempt}
          initialValues={subjectDraftFrom(state.subject)}
          requireChanges
          courses={coursesState}
          onRetryCourses={reloadCourses}
          onSubmit={save}
          failureMessage={t(`subjects.form.errors.${failure}`)}
        />
      )}
    </Container>
  );
}
