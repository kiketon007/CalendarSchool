import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ProfessorForm,
  type CoursesState,
  type ProfessorSubmitResult,
} from '../components/ProfessorForm';
import { coursesService } from '../services/coursesService';
import { professorsService, type Professor } from '../services/professorsService';
import { useSession } from '../session/SessionProvider';
import {
  professorErrorsFromServer,
  type ProfessorFormValues,
} from '../validation/professorValidation';

type ProfessorState =
  | { status: 'loading' }
  | { status: 'loaded'; professor: Professor }
  | { status: 'notFound' }
  | { status: 'error' };

function valuesOf(professor: Professor): ProfessorFormValues {
  return {
    firstName: professor.firstName,
    lastName: professor.lastName,
    position: professor.position ?? '',
    classId: professor.tutoredClass?.id ?? '',
  };
}

/**
 * Edición de un profesor (US12): cuelga de `AuthenticatedLayout` y la usan los dos roles. Pide el
 * profesor y los cursos una sola vez cada uno aunque `StrictMode` ejecute los efectos dos veces, y deja
 * el formulario (el mismo de la creación, en modo `any`: se puede elegir cualquier clase y la que tiene
 * otro tutor se la quita) a `ProfessorForm`. Un `404` al cargar o al guardar (otro colegio, inexistente o
 * borrado mientras se editaba) muestra «no existe o ya no está disponible» con un enlace al listado; un
 * fallo al cargar ofrece «Reintentar». Si los cursos no se pueden cargar, la tutoría no se envía y se
 * conserva la actual. Con el `200` vuelve al listado, reemplazando la entrada del historial, con el
 * nombre del profesor y, si lo hubo, el del que perdió la tutoría, para el aviso.
 */
export function EditProfessorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();
  const { id = '' } = useParams();
  const [state, setState] = useState<ProfessorState>({ status: 'loading' });
  const [coursesState, setCoursesState] = useState<CoursesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // Intento ya pedido: en modo estricto el efecto se ejecuta dos veces, pero se pide una vez.
  const requestedAttempt = useRef<number | undefined>(undefined);
  const requestedCourses = useRef(false);

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
    void professorsService.get(authorizedFetch, id).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setState({ status: 'loaded', professor: outcome.professor });
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
    if (requestedCourses.current) {
      return;
    }
    requestedCourses.current = true;
    void coursesService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setCoursesState({ status: 'loaded', courses: outcome.courses });
          break;
        case 'unauthenticated':
          break;
        case 'unavailable':
          setCoursesState({ status: 'error' });
          break;
      }
    });
  }, [authorizedFetch]);

  function retry() {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  async function save(values: ProfessorFormValues): Promise<ProfessorSubmitResult> {
    // Sin la lista de cursos no se sabe qué clases hay: no se envía la clase y la tutoría no se toca.
    const { classId, ...rest } = values;
    const outcome = await professorsService.update(authorizedFetch, id, {
      ...rest,
      ...(coursesState.status === 'loaded' && { classId }),
    });
    switch (outcome.status) {
      case 'updated':
        void navigate('/profesores', {
          replace: true,
          state: {
            professorUpdated: `${outcome.professor.firstName} ${outcome.professor.lastName}`,
            ...(outcome.replacedTutor && {
              replacedTutor: `${outcome.replacedTutor.firstName} ${outcome.replacedTutor.lastName}`,
            }),
          },
        });
        return { status: 'done' };
      case 'validationError':
        return { status: 'validationError', errors: professorErrorsFromServer(outcome.details) };
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
    <Container as="main" className="py-5" data-testid="edit-professor-page">
      <h1>{t('professors.edit.title')}</h1>

      {state.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('professors.edit.loading')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('professors.edit.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('professors.retry')}
          </Button>
        </Alert>
      )}

      {state.status === 'notFound' && (
        <div>
          <p>{t('professors.edit.notFound')}</p>
          <Link to="/profesores">{t('professors.title')}</Link>
        </div>
      )}

      {state.status === 'loaded' && (
        <ProfessorForm
          // Una carga nueva monta el formulario de nuevo con los valores del servidor.
          key={attempt}
          initialValues={valuesOf(state.professor)}
          courses={coursesState}
          classMode="any"
          requireChanges
          failureMessage={t('professors.edit.saveError')}
          onSubmit={save}
        />
      )}
    </Container>
  );
}
