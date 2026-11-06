import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';

interface StopImprovementModalProps {
  show: boolean;
  onConfirm: () => void;
  /** «Seguir mejorando», Escape o clic fuera: ninguno envía nada. */
  onCancel: () => void;
}

/**
 * Confirmación de «Detener y guardar el horario» durante la mejora de una generación (US-ALGO-RUN_b). Parar no pierde
 * nada (el horario válido que ya se encontró se guarda), pero no se puede reanudar, así que se pide confirmación una
 * vez. Siempre está montado y se controla con `show`, para que el foco vuelva al botón que lo abrió al cerrarse. El
 * foco empieza en «Seguir mejorando», la opción que no cambia nada.
 */
export function StopImprovementModal({ show, onConfirm, onCancel }: StopImprovementModalProps) {
  const { t } = useTranslation();

  return (
    <Modal show={show} onHide={onCancel} centered aria-labelledby="stop-improvement-title">
      <Modal.Header>
        <Modal.Title as="h2" id="stop-improvement-title" className="h5">
          {t('schedule.generation.improving.stopDialog.title')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{t('schedule.generation.improving.stopDialog.message')}</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel} autoFocus>
          {t('schedule.generation.improving.stopDialog.keep')}
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          {t('schedule.generation.improving.stopDialog.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
