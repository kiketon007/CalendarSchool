import { useEffect, useRef, useState } from 'react';
import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  ProfessorForm,
  type CoursesState,
  type ProfessorSubmitResult,
} from '../components/ProfessorForm';
import { coursesService } from '../services/coursesService';
import { professorsService } from '../services/professorsService';
import { useSession } from '../session/SessionProvider';
import {
  professorErrorsFromServer,
  type ProfessorFormValues,
} from '../validation/professorValidation';

const EMPTY_VALUES: ProfessorFormValues = {
  firstName: '',
  lastName: '',
  position: '',
  classId: '',
};

/**
 * Página para crear un profesor (US09): cuelga de `AuthenticatedLayout` y la usan los dos roles. Pide la
 * lista de cursos una sola vez para ofrecer, agrupadas por curso, las clases que todavía no tienen
 * tutor, y deja el formulario (validación, foco, guarda contra el doble envío) a `ProfessorForm`. Con el
 * `201` vuelve al listado con el nombre del profesor para el aviso; un `409` marca la clase (otra persona
 * le puso tutor antes) y cualquier otro fallo muestra un aviso general conservando lo escrito.
 */
export function CreateProfessorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();
  const [coursesState, setCoursesState] = useState<CoursesState>({ status: 'loading' });
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto el efecto se ejecuta dos veces, pero los cursos se piden una.
  const requestedCourses = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setCoursesState({ status: 'error' });
          break;
      }
    });
  }, [authorizedFetch]);

  async function save(values: ProfessorFormValues): Promise<ProfessorSubmitResult> {
    const outcome = await professorsService.create(authorizedFetch, values);
    switch (outcome.status) {
      case 'created':
        void navigate('/profesores', {
          replace: true,
          state: {
            professorCreated: `${outcome.professor.firstName} ${outcome.professor.lastName}`,
          },
        });
        return { status: 'done' };
      case 'validationError':
        return { status: 'validationError', errors: professorErrorsFromServer(outcome.details) };
      case 'classHasTutor':
        return { status: 'classTaken' };
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        return { status: 'done' };
      case 'unavailable':
        return { status: 'failed' };
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="create-professor-page">
      <h1>{t('professors.form.title')}</h1>
      <ProfessorForm initialValues={EMPTY_VALUES} courses={coursesState} onSubmit={save} />
    </Container>
  );
}
