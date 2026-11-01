import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import { subjectsService } from '../services/subjectsService';
import { useSession } from '../session/SessionProvider';

const TITLE_ID = 'delete-subject-title';

/** La asignatura que se va a borrar: lo que ya tiene la tarjeta, sin pedir nada al servidor. */
export interface SubjectToDelete {
  id: string;
  name: string;
  /** Cursos en los que se imparte hoy; sus filas caen con la asignatura, los cursos no se tocan. */
  courses: { id: string; name: string; constraintCount: number; assignmentCount: number }[];
}

interface DeleteSubjectModalProps {
  /** La asignatura a borrar; con `null` el diálogo está cerrado. */
  subject: SubjectToDelete | null;
  /** Borrada: la página la quita de la lista cargada. */
  onDeleted: (subject: SubjectToDelete) => void;
  /** La asignatura ya no existe (otra persona la borró) al confirmar. */
  onGone: () => void;
  /** Cancelar, Escape o clic fuera: ninguna envía nada. */
  onCancel: () => void;
  /** El diálogo ya se ha cerrado del todo (acabó la animación). */
  onExited?: () => void;
}

/**
 * Confirmación del borrado de una asignatura (US-SUBJECT_c), a imagen de `DeleteCalendarModal`: **no consulta
 * nada al abrirse**, usa el nombre y los cursos que ya tiene la tarjeta, lista los cursos en los que se
 * imparte y recuerda con un **texto** (sin botón: el diálogo no hace ningún `PUT`) que, si solo ha dejado de
 * impartirse, puede inactivarse desde «Editar». Una sola confirmación: dice que no se puede deshacer. Al
 * confirmar envía un único `DELETE` (guarda síncrona contra la doble pulsación); un `404` lo resuelve la
 * página con `onGone` y cualquier otro fallo (también un `403`) se muestra dentro, sin cerrar el diálogo.
 * Siempre está montado y se controla con `subject`, para que el foco vuelva al botón que lo abrió al
 * cancelar; el foco empieza en «Cancelar», la opción segura. Mientras borra, ni Escape ni el clic fuera lo
 * cierran.
 */
export function DeleteSubjectModal({
  subject,
  onDeleted,
  onGone,
  onCancel,
  onExited,
}: DeleteSubjectModalProps) {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  // Mientras el diálogo se cierra (animación) se sigue pintando la última asignatura.
  const [lastSubject, setLastSubject] = useState(subject);
  if (subject && (subject.id !== lastSubject?.id || subject.name !== lastSubject.name)) {
    setLastSubject(subject);
  }
  const shown = subject ?? lastSubject;

  const [deleting, setDeleting] = useState(false);
  const [failedFor, setFailedFor] = useState<string | undefined>(undefined);
  // Guarda síncrona: dos pulsaciones seguidas pueden llegar antes de que React repinte el botón.
  const deletingRef = useRef(false);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function cancel() {
    setFailedFor(undefined);
    onCancel();
  }

  async function confirm() {
    if (!subject || deletingRef.current) {
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    setFailedFor(undefined);
    const outcome = await subjectsService.delete(authorizedFetch, subject.id);
    deletingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setDeleting(false);
    switch (outcome.status) {
      case 'deleted':
        onDeleted(subject);
        break;
      case 'notFound':
        onGone();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'forbidden':
      case 'unavailable':
        setFailedFor(subject.id);
        break;
    }
  }

  const courseNames = shown?.courses.map(({ name }) => name).join(', ') ?? '';
  // Las reglas de reparto de la asignatura en esos cursos caen con ella (cascada): se avisa con lo que ya tiene
  // la tarjeta, sin pedir nada.
  const ruleCount =
    shown?.courses.reduce((total, { constraintCount }) => total + constraintCount, 0) ?? 0;
  // Y sus asignaciones de profesores en esos cursos (US-PROF-ASSIGN_b), con lo que ya tiene la tarjeta.
  const assignmentCount =
    shown?.courses.reduce((total, { assignmentCount: count }) => total + count, 0) ?? 0;

  return (
    <Modal
      show={subject !== null}
      onHide={deleting ? undefined : cancel}
      onExited={onExited}
      centered
      aria-labelledby={TITLE_ID}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={TITLE_ID} className="h5">
          {t('subjects.delete.title', { name: shown?.name ?? '' })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          {courseNames === ''
            ? t('subjects.delete.noCourses')
            : t('subjects.delete.courses', { courses: courseNames })}
        </p>
        {ruleCount > 0 && <p>{t('subjects.delete.rules', { count: ruleCount })}</p>}
        {assignmentCount > 0 && (
          <p>{t('subjects.delete.assignments', { count: assignmentCount })}</p>
        )}
        <p className="text-body-secondary">{t('subjects.delete.inactivateHint')}</p>
        <p className="mb-0 fw-bold">{t('subjects.delete.warning')}</p>

        {failedFor !== undefined && failedFor === subject?.id && (
          <Alert variant="danger" role="alert" className="mt-3 mb-0">
            {t('subjects.delete.error')}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={cancel} disabled={deleting} autoFocus>
          {t('subjects.delete.cancel')}
        </Button>
        <Button variant="danger" onClick={() => void confirm()} disabled={deleting}>
          {deleting ? t('subjects.delete.deleting') : t('subjects.delete.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
