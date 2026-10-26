import { useEffect, useRef, useState } from 'react';
import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  SubjectForm,
  type CoursesState,
  type SubjectSubmitResult,
} from '../components/SubjectForm';
import { coursesService } from '../services/coursesService';
import { subjectsService } from '../services/subjectsService';
import { useSession } from '../session/SessionProvider';
import { defaultSubjectColor } from '../utils/subjectColors';
import {
  emptySubjectDraft,
  groupSubjectErrors,
  toCreateSubjectInput,
  type SubjectDraft,
} from '../validation/subjectValidation';

type ColorState = { status: 'loading' } | { status: 'ready'; draft: SubjectDraft };

/**
 * Página para crear una asignatura (US-SUBJECT): cuelga de `AuthenticatedLayout` y de `RequireRole` con el
 * rol `ADMIN` (la guarda de la interfaz es una comodidad: decide el backend, que responde `403` a un
 * `MEMBER`). Pide una vez los cursos del colegio y las asignaturas que ya existen, estas para proponer el
 * primer color de la paleta que ninguna usa: el formulario no se monta hasta saberlo (solo lee sus valores
 * iniciales al montarse), y si las asignaturas no se pueden leer sirve igual con el primer color. Deja el
 * formulario (validación, foco, guarda contra el doble envío) a `SubjectForm`. Con el `201` vuelve al listado
 * con el nombre que guardó el servidor para el aviso. Un `400` marca los campos que rechaza el servidor y, si
 * un curso ya no existe (otra persona lo borró), vuelve a pedir los cursos sin vaciar el formulario; un `409`
 * marca el nombre o el código; cualquier otro fallo muestra un aviso general conservando lo escrito.
 */
export function CreateSubjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();
  const [coursesState, setCoursesState] = useState<CoursesState>({ status: 'loading' });
  const [initial, setInitial] = useState<ColorState>({ status: 'loading' });
  const [failure, setFailure] = useState<'unavailable' | 'forbidden'>('unavailable');
  // Intento de carga de los cursos: subirlo vuelve a pedirlos (reintento o curso borrado por otra persona).
  const [attempt, setAttempt] = useState(0);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto los efectos se ejecutan dos veces, pero los datos se piden una vez por intento.
  const requestedAttempt = useRef<number | undefined>(undefined);
  const requestedSubjects = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (requestedSubjects.current) {
      return;
    }
    requestedSubjects.current = true;
    void subjectsService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      // Sin las asignaturas el formulario sirve igual, con el primer color de la paleta.
      const used = outcome.status === 'loaded' ? outcome.subjects.map(({ color }) => color) : [];
      setInitial({ status: 'ready', draft: emptySubjectDraft(defaultSubjectColor(used)) });
    });
  }, [authorizedFetch]);

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

  function reloadCourses() {
    setCoursesState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  async function create(draft: SubjectDraft): Promise<SubjectSubmitResult> {
    setFailure('unavailable');
    const outcome = await subjectsService.create(authorizedFetch, toCreateSubjectInput(draft));
    switch (outcome.status) {
      case 'created':
        void navigate('/asignaturas', {
          replace: true,
          state: { subjectCreated: outcome.subject.name },
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
      case 'forbidden':
        setFailure('forbidden');
        return { status: 'failed' };
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        return { status: 'done' };
      case 'unavailable':
        return { status: 'failed' };
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="create-subject-page">
      <h1>{t('subjects.form.title')}</h1>
      {initial.status === 'loading' ? (
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('subjects.loading')}</span>
        </div>
      ) : (
        <SubjectForm
          initialValues={initial.draft}
          courses={coursesState}
          onRetryCourses={reloadCourses}
          onSubmit={create}
          failureMessage={t(`subjects.form.errors.${failure}`)}
        />
      )}
    </Container>
  );
}
