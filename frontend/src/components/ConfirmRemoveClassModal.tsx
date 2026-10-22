import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';

const TITLE_ID = 'confirm-remove-class-title';

/** La clase que se va a quitar del formulario: su nombre tal como está escrito y sus alumnos. */
export interface ClassToRemove {
  name: string;
  studentCount: number;
}

interface ConfirmRemoveClassModalProps {
  /** La clase a quitar; con `null` el diálogo está cerrado. */
  pending: ClassToRemove | null;
  onConfirm: () => void;
  /** Cancelar, Escape o clic fuera: ninguna quita la fila. */
  onCancel: () => void;
  /** El diálogo ya se ha cerrado del todo (acabó la animación). */
  onExited?: () => void;
}

/**
 * Confirmación de quitar, en la edición de un curso, una clase que tiene alumnos (US14_b): al guardar
 * quedarán en el curso sin clase. No hace peticiones ni toca el formulario: solo informa y avisa de la
 * decisión. Siempre está montado y se controla con `pending`, para que el foco vuelva al botón que lo
 * abrió al cancelar, y conserva la última clase mientras se cierra. El foco empieza en «Cancelar», la
 * opción segura, y no hay «X» de cabecera, cuyo nombre chocaría con «Cancelar».
 */
export function ConfirmRemoveClassModal({
  pending,
  onConfirm,
  onCancel,
  onExited,
}: ConfirmRemoveClassModalProps) {
  const { t } = useTranslation();
  // Mientras el diálogo se cierra (animación) se sigue pintando la última clase.
  const [last, setLast] = useState(pending);
  if (pending && (pending.name !== last?.name || pending.studentCount !== last.studentCount)) {
    setLast(pending);
  }
  const shown = pending ?? last;

  return (
    <Modal
      show={pending !== null}
      onHide={onCancel}
      onExited={onExited}
      centered
      aria-labelledby={TITLE_ID}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={TITLE_ID} className="h5">
          {t('courses.form.removeDialog.title', { name: shown?.name ?? '' })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {t('courses.form.removeDialog.body', {
          name: shown?.name ?? '',
          count: shown?.studentCount ?? 0,
        })}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel} autoFocus>
          {t('courses.form.removeDialog.cancel')}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {t('courses.form.removeDialog.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
