import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import { studentsService } from '../services/studentsService';
import { useSession } from '../session/SessionProvider';

const TITLE_ID = 'delete-student-title';

/** El alumno que se va a borrar: lo mínimo que necesita el diálogo, sin ningún dato sensible. */
export interface StudentToDelete {
  id: string;
  /** Nombre y apellidos, como se muestran en el título y en el aviso. */
  name: string;
}

interface DeleteStudentModalProps {
  /** El alumno a borrar; con `null` el diálogo está cerrado. */
  student: StudentToDelete | null;
  /** Borrado: el alumno que se acaba de borrar. */
  onDeleted: (student: StudentToDelete) => void;
  /** El alumno ya no existe (otra persona lo borró) al confirmar. */
  onGone: () => void;
  /** Cancelar, Escape o clic fuera: ninguna envía nada. */
  onCancel: () => void;
  /** El diálogo ya se ha cerrado del todo (acabó la animación). */
  onExited?: () => void;
}

/**
 * Confirmación del borrado de un alumno (US18), a imagen de `DeleteProfessorModal` pero **sin consultar
 * nada al abrirse**: un alumno no tiene nada dependiente que avisar, así que basta el nombre que ya tiene
 * la fila y el tipo de comida y las observaciones (datos sensibles) no viajan al navegador para borrar.
 * Una sola confirmación: el diálogo dice que no se puede deshacer. Al confirmar envía un único `DELETE`
 * (guarda síncrona contra la doble pulsación); un `404` (el alumno ya no existe) lo resuelve la página con
 * `onGone`, y cualquier otro fallo se muestra dentro, sin cerrar el diálogo. Siempre está montado y se
 * controla con `student`, para que el foco vuelva al botón que lo abrió al cancelar; el foco empieza en
 * «Cancelar», la opción segura. Mientras borra, ni Escape ni el clic fuera lo cierran.
 */
export function DeleteStudentModal({
  student,
  onDeleted,
  onGone,
  onCancel,
  onExited,
}: DeleteStudentModalProps) {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  // Mientras el diálogo se cierra (animación) se sigue pintando el último alumno.
  const [lastStudent, setLastStudent] = useState(student);
  if (student && (student.id !== lastStudent?.id || student.name !== lastStudent.name)) {
    setLastStudent(student);
  }
  const shown = student ?? lastStudent;

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
    if (!student || deletingRef.current) {
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    setFailedFor(undefined);
    const outcome = await studentsService.delete(authorizedFetch, student.id);
    deletingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setDeleting(false);
    switch (outcome.status) {
      case 'deleted':
        onDeleted(student);
        break;
      case 'notFound':
        onGone();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'unavailable':
        setFailedFor(student.id);
        break;
    }
  }

  return (
    <Modal
      show={student !== null}
      onHide={deleting ? undefined : cancel}
      onExited={onExited}
      centered
      aria-labelledby={TITLE_ID}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={TITLE_ID} className="h5">
          {t('students.delete.title', { name: shown?.name ?? '' })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-0 fw-bold">{t('students.delete.warning')}</p>

        {failedFor !== undefined && failedFor === student?.id && (
          <Alert variant="danger" role="alert" className="mt-3 mb-0">
            {t('students.delete.error')}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={cancel} disabled={deleting} autoFocus>
          {t('students.delete.cancel')}
        </Button>
        <Button variant="danger" onClick={() => void confirm()} disabled={deleting}>
          {deleting ? t('students.delete.deleting') : t('students.delete.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
