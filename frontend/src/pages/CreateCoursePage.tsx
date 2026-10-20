import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CourseForm, type CourseSubmitResult } from '../components/CourseForm';
import { coursesService } from '../services/coursesService';
import { useSession } from '../session/SessionProvider';
import type { CourseDraft } from '../validation/courseValidation';

/** Un curso nuevo empieza con el nombre vacío y una fila de clase. */
const EMPTY_COURSE: CourseDraft = { name: '', classes: [{ name: '' }] };

/**
 * Página para crear un curso con sus clases (US05): cuelga de `AuthenticatedLayout` y la usan los dos
 * roles. El formulario (`CourseForm`) valida, protege el envío y muestra los errores; esta página lo
 * envía con `coursesService.create` y, con el `201`, vuelve al listado con el nombre del curso para el
 * aviso. Un `400` marca los campos que el servidor rechaza; un `409`, el nombre; cualquier otro fallo
 * muestra un aviso genérico y conserva lo escrito.
 */
export function CreateCoursePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();

  async function create({ name, classes }: CourseDraft): Promise<CourseSubmitResult> {
    const outcome = await coursesService.create(authorizedFetch, {
      name,
      classNames: classes.map((schoolClass) => schoolClass.name),
    });
    switch (outcome.status) {
      case 'created':
        void navigate('/cursos', { replace: true, state: { courseCreated: outcome.course.name } });
        return { status: 'done' };
      case 'validationError':
        return { status: 'validationError', details: outcome.details };
      case 'alreadyExists':
        return { status: 'nameTaken' };
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        return { status: 'done' };
      case 'unavailable':
        return { status: 'failed' };
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="create-course-page">
      <h1>{t('courses.form.title')}</h1>
      <CourseForm
        initialValues={EMPTY_COURSE}
        onSubmit={create}
        failureMessage={t('courses.form.errors.unavailable')}
      />
    </Container>
  );
}
