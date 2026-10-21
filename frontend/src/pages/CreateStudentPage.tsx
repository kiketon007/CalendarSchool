import { useEffect, useRef, useState } from 'react';
import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { CoursesState } from '../components/ProfessorForm';
import { StudentForm, type StudentSubmitResult } from '../components/StudentForm';
import { coursesService } from '../services/coursesService';
import { studentsService } from '../services/studentsService';
import { useSession } from '../session/SessionProvider';
import { studentErrorsFromServer, type StudentFormValues } from '../validation/studentValidation';

const EMPTY_VALUES: StudentFormValues = {
  firstName: '',
  lastName: '',
  courseId: '',
  classId: '',
  cafeteria: '',
  scholarship: false,
  foodType: '',
  observations: '',
};

/**
 * Página para crear un alumno (US14): cuelga de `AuthenticatedLayout` y la usan los dos roles. Pide la
 * lista de cursos una sola vez para ofrecer los cursos y sus clases, y deja el formulario (validación,
 * foco, guarda contra el doble envío) a `StudentForm`. Con el `201` vuelve al listado con el nombre del
 * alumno para el aviso. Si el servidor dice que el curso o la clase ya no existen (otra persona los
 * borró), vuelve a pedir los cursos sin vaciar el formulario y deja que éste marque el campo; cualquier
 * otro fallo muestra un aviso general conservando lo escrito.
 */
export function CreateStudentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();
  const [coursesState, setCoursesState] = useState<CoursesState>({ status: 'loading' });
  // Intento de carga de los cursos: subirlo vuelve a pedirlos (reintento o curso borrado por otra persona).
  const [attempt, setAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto el efecto se ejecuta dos veces, pero los cursos se piden una vez por intento.
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
    void coursesService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setCoursesState({ status: 'loaded', courses: outcome.courses });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setCoursesState({ status: 'error' });
          break;
      }
    });
  }, [attempt, authorizedFetch]);

  function retryCourses() {
    setCoursesState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  async function save(values: StudentFormValues): Promise<StudentSubmitResult> {
    // El formulario guarda la respuesta del comedor como `'yes'` o `'no'`; el servicio envía un booleano.
    const outcome = await studentsService.create(authorizedFetch, {
      ...values,
      cafeteria: values.cafeteria === 'yes',
    });
    switch (outcome.status) {
      case 'created':
        void navigate('/alumnos', {
          replace: true,
          state: { studentCreated: `${outcome.student.firstName} ${outcome.student.lastName}` },
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
          setAttempt((current) => current + 1);
        }
        return { status: 'validationError', errors: studentErrorsFromServer(outcome.details) };
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        return { status: 'done' };
      case 'unavailable':
        return { status: 'failed' };
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="create-student-page">
      <h1>{t('students.form.title')}</h1>
      <StudentForm
        initialValues={EMPTY_VALUES}
        courses={coursesState}
        onRetryCourses={retryCourses}
        onSubmit={save}
      />
    </Container>
  );
}
