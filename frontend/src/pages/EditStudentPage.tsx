import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import type { CoursesState } from '../components/ProfessorForm';
import { StudentForm, type StudentSubmitResult } from '../components/StudentForm';
import { coursesService } from '../services/coursesService';
import { studentsService, type Student } from '../services/studentsService';
import { useSession } from '../session/SessionProvider';
import { returnSearchFrom } from '../utils/studentFilters';
import { studentErrorsFromServer, type StudentFormValues } from '../validation/studentValidation';

type StudentState =
  | { status: 'loading' }
  | { status: 'loaded'; student: Student }
  | { status: 'notFound' }
  | { status: 'error' };

function valuesOf(student: Student): StudentFormValues {
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    courseId: student.course?.id ?? '',
    classId: student.class?.id ?? '',
    cafeteria: student.cafeteria ? 'yes' : 'no',
    scholarship: student.scholarship === true,
    foodType: student.foodType ?? '',
    observations: student.observations ?? '',
  };
}

/**
 * Edición de un alumno (US17): cuelga de `AuthenticatedLayout` y la usan los dos roles. Pide el alumno
 * (con sus datos sensibles) y los cursos una sola vez cada uno aunque `StrictMode` ejecute los efectos dos
 * veces, y deja el formulario (el mismo del alta, con «Guardar» solo con cambios) a `StudentForm`. Un
 * `404` al cargar o al guardar (otro colegio, inexistente o borrado mientras se editaba) muestra «no
 * existe o ya no está disponible» con un enlace al listado; un fallo al cargar ofrece «Reintentar». Un
 * alumno sin curso (el suyo se borró) lo avisa y pide uno para guardar. Si el servidor dice que el curso o
 * la clase ya no existen, vuelve a pedir los cursos sin vaciar el formulario. Con el `200` vuelve al
 * listado, reemplazando la entrada del historial, con la misma búsqueda (filtros y página) con la que
 * se salió de él, que llega en el estado de la navegación, y con el nombre del alumno para el aviso.
 * Sin ese estado (se entró por un enlace directo; recargar la página lo conserva) vuelve al listado sin filtros. La
 * vuelta usa siempre la ruta `/alumnos` y una búsqueda validada: no puede llevar a otro sitio.
 */
export function EditStudentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { authorizedFetch } = useSession();
  const { id = '' } = useParams();
  const [state, setState] = useState<StudentState>({ status: 'loading' });
  const [coursesState, setCoursesState] = useState<CoursesState>({ status: 'loading' });
  // Intentos de carga: subirlos vuelve a pedir el alumno (reintento) o los cursos (curso o clase borrados).
  const [attempt, setAttempt] = useState(0);
  const [coursesAttempt, setCoursesAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto los efectos se ejecutan dos veces, pero cada intento se pide una vez.
  const requestedAttempt = useRef<number | undefined>(undefined);
  const requestedCoursesAttempt = useRef<number | undefined>(undefined);

  const returnTo = { pathname: '/alumnos', search: returnSearchFrom(location.state) };

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
    void studentsService.get(authorizedFetch, id).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setState({ status: 'loaded', student: outcome.student });
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
          break;
        case 'unauthenticated':
          break;
        case 'unavailable':
          setCoursesState({ status: 'error' });
          break;
      }
    });
  }, [coursesAttempt, authorizedFetch]);

  function retry() {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  function retryCourses() {
    setCoursesState({ status: 'loading' });
    setCoursesAttempt((current) => current + 1);
  }

  async function save(values: StudentFormValues): Promise<StudentSubmitResult> {
    // El formulario guarda la respuesta del comedor como `'yes'` o `'no'`; el servicio envía un booleano.
    const outcome = await studentsService.update(authorizedFetch, id, {
      ...values,
      cafeteria: values.cafeteria === 'yes',
    });
    switch (outcome.status) {
      case 'updated':
        void navigate(returnTo, {
          replace: true,
          state: { studentUpdated: `${outcome.student.firstName} ${outcome.student.lastName}` },
        });
        return { status: 'done' };
      case 'validationError':
        if (
          outcome.details.some(
            ({ field, code }) =>
              (field === 'courseId' || field === 'classId') && code === 'NOT_FOUND',
          )
        ) {
          // Se conserva la lista que se ve hasta que llegue la nueva: el formulario no se vacía.
          setCoursesAttempt((current) => current + 1);
        }
        return { status: 'validationError', errors: studentErrorsFromServer(outcome.details) };
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
    <Container as="main" className="py-5" data-testid="edit-student-page">
      <h1>{t('students.edit.title')}</h1>

      {state.status === 'loading' && (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('students.edit.loading')}</span>
        </div>
      )}

      {state.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('students.edit.loadError')}</span>
          <Button variant="outline-danger" size="sm" onClick={retry}>
            {t('students.retry')}
          </Button>
        </Alert>
      )}

      {state.status === 'notFound' && (
        <div>
          <p>{t('students.edit.notFound')}</p>
          <Link to="/alumnos">{t('students.title')}</Link>
        </div>
      )}

      {state.status === 'loaded' && (
        <StudentForm
          // Una carga nueva monta el formulario de nuevo con los valores del servidor.
          key={attempt}
          initialValues={valuesOf(state.student)}
          courses={coursesState}
          onRetryCourses={retryCourses}
          requireChanges
          courseMissingNotice={state.student.course === null}
          cancelTo={returnTo}
          failureMessage={t('students.edit.saveError')}
          onSubmit={save}
        />
      )}
    </Container>
  );
}
