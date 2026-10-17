import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';

interface ConfirmSuspendModalProps {
  show: boolean;
  /** Nombre completo del usuario al que se dará de baja. */
  userName: string;
  onConfirm: () => void;
  /** Cancelar, Escape o clic fuera: ninguna envía nada. */
  onCancel: () => void;
}

/**
 * Confirmación de la baja de un usuario. Es el único paso que la pide: cambiar el rol y reactivar
 * se deshacen con un clic, pero la baja cierra las sesiones del usuario. Siempre está montado y se
 * controla con `show`, para que el foco vuelva al botón que lo abrió al cerrarse. El foco empieza
 * en «Cancelar», la opción segura.
 */
export function ConfirmSuspendModal({
  show,
  userName,
  onConfirm,
  onCancel,
}: ConfirmSuspendModalProps) {
  const { t } = useTranslation();

  return (
    <Modal show={show} onHide={onCancel} centered aria-labelledby="confirm-suspend-title">
      <Modal.Header>
        <Modal.Title as="h2" id="confirm-suspend-title" className="h5">
          {t('users.confirmSuspend.title')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{t('users.confirmSuspend.message', { name: userName })}</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel} autoFocus>
          {t('users.confirmSuspend.cancel')}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {t('users.confirmSuspend.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
