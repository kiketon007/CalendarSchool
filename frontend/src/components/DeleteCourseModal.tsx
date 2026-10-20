import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { coursesService, type CourseImpact } from '../services/coursesService';
import { useSession } from '../session/SessionProvider';

const TITLE_ID = 'delete-course-title';

/** El curso que se va a borrar: lo mínimo que necesita el diálogo. */
export interface CourseToDelete {
  id: string;
  name: string;
}

interface DeleteCourseModalProps {
  /** El curso a borrar; con `null` el diálogo está cerrado. */
  course: CourseToDelete | null;
  /** Borrado: el curso y lo que se borró de verdad (que puede diferir del impacto que se vio). */
  onDeleted: (course: CourseToDelete, deleted: CourseImpact) => void;
  /** El curso ya no existe (otra persona lo borró), al pedir el impacto o al confirmar. */
  onGone: () => void;
  /** Cancelar, Escape o clic fuera: ninguna envía nada. */
  onCancel: () => void;
  /** El diálogo ya se ha cerrado del todo (acabó la animación). */
  onExited?: () => void;
}

type ImpactResult = { status: 'loaded'; impact: CourseImpact } | { status: 'error' };

const LOADING = { status: 'loading' } as const;

/**
 * Confirmación del borrado de un curso (US08). Al abrirse pide el impacto (`GET …/impact`) y muestra las
 * clases que se borrarán y, solo si los hay, los alumnos asignados; «Borrar curso» no se habilita hasta
 * tenerlo (no se confirma a ciegas). Una sola confirmación: el diálogo ya informa. Al confirmar envía un
 * único `DELETE` (guarda síncrona contra la doble pulsación) y avisa de lo que se borró de verdad; un
 * `404` (el curso ya no existe) lo resuelve la página con `onGone`, y cualquier otro fallo se muestra
 * dentro, sin cerrar el diálogo. Siempre está montado y se controla con `course`, para que el foco vuelva
 * al botón que lo abrió al cancelar; el foco empieza en «Cancelar», la opción segura. Mientras borra, ni
 * Escape ni el clic fuera lo cierran.
 */
export function DeleteCourseModal({
  course,
  onDeleted,
  onGone,
  onCancel,
  onExited,
}: DeleteCourseModalProps) {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  // Mientras el diálogo se cierra (animación) se sigue pintando el último curso.
  const [lastCourse, setLastCourse] = useState(course);
  if (course && (course.id !== lastCourse?.id || course.name !== lastCourse.name)) {
    setLastCourse(course);
  }
  const shown = course ?? lastCourse;

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; value: ImpactResult } | null>(null);
  const key = course ? `${course.id}:${String(attempt)}` : undefined;
  const impact =
    course === null
      ? (result?.value ?? LOADING)
      : result !== null && result.key === key
        ? result.value
        : LOADING;

  const [deleting, setDeleting] = useState(false);
  const [failedFor, setFailedFor] = useState<string | undefined>(undefined);
  // Guarda síncrona: dos pulsaciones seguidas pueden llegar antes de que React repinte el botón.
  const deletingRef = useRef(false);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // Petición de impacto ya hecha: en modo estricto el efecto se ejecuta dos veces, pero se pide una.
  const requestedKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!course || !key) {
      requestedKey.current = undefined;
      return;
    }
    if (requestedKey.current === key) {
      return;
    }
    requestedKey.current = key;
    void coursesService.getImpact(authorizedFetch, course.id).then((outcome) => {
      // Una respuesta de un curso anterior (el diálogo se reabrió con otro) ya no interesa.
      if (!mounted.current || requestedKey.current !== key) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setResult({ key, value: { status: 'loaded', impact: outcome.impact } });
          break;
        case 'notFound':
          onGone();
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setResult({ key, value: { status: 'error' } });
          break;
      }
    });
    // `course` y `onGone` cambian de identidad sin cambiar el curso pedido: la clave lo resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, authorizedFetch]);

  function cancel() {
    setFailedFor(undefined);
    onCancel();
  }

  async function confirm() {
    if (!course || deletingRef.current || impact === LOADING || impact.status !== 'loaded') {
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    setFailedFor(undefined);
    const outcome = await coursesService.delete(authorizedFetch, course.id);
    deletingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setDeleting(false);
    switch (outcome.status) {
      case 'deleted':
        onDeleted(course, outcome.deleted);
        break;
      case 'notFound':
        onGone();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'unavailable':
        setFailedFor(course.id);
        break;
    }
  }

  const loadedImpact = impact !== LOADING && impact.status === 'loaded' ? impact.impact : undefined;

  return (
    <Modal
      show={course !== null}
      onHide={deleting ? undefined : cancel}
      onExited={onExited}
      centered
      aria-labelledby={TITLE_ID}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={TITLE_ID} className="h5">
          {t('courses.delete.title', { name: shown?.name ?? '' })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {impact === LOADING && (
          <div role="status" className="d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" aria-hidden="true" />
            <span>{t('courses.delete.loading')}</span>
          </div>
        )}

        {impact !== LOADING && impact.status === 'error' && (
          <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3 mb-0">
            <span>{t('courses.delete.loadError')}</span>
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => {
                setAttempt((current) => current + 1);
              }}
            >
              {t('courses.retry')}
            </Button>
          </Alert>
        )}

        {loadedImpact && (
          <>
            <p>{t('courses.delete.classes', { count: loadedImpact.classCount })}</p>
            {loadedImpact.studentCount > 0 && (
              <p>{t('courses.delete.students', { count: loadedImpact.studentCount })}</p>
            )}
            <p className="mb-0 fw-bold">{t('courses.delete.warning')}</p>
          </>
        )}

        {failedFor !== undefined && failedFor === course?.id && (
          <Alert variant="danger" role="alert" className="mt-3 mb-0">
            {t('courses.delete.error')}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={cancel} disabled={deleting} autoFocus>
          {t('courses.delete.cancel')}
        </Button>
        <Button
          variant="danger"
          onClick={() => void confirm()}
          disabled={deleting || loadedImpact === undefined}
        >
          {deleting ? t('courses.delete.deleting') : t('courses.delete.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
