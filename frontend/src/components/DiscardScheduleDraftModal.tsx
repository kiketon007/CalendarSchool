import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { scheduleService } from '../services/scheduleService';
import { useSession } from '../session/SessionProvider';

const TITLE_ID = 'discard-schedule-title';

/** Por qué no se pudo descartar: el borrador ya no existe, ya no es un borrador o falló la petición. */
type DiscardError = 'gone' | 'notDraft' | 'failed';

interface DiscardScheduleDraftModalProps {
  show: boolean;
  /** El borrador que se descarta. */
  scheduleId: string;
  /** Descartado: el borrador ya no existe. */
  onDiscarded: () => void;
  onHide: () => void;
}

/**
 * El diálogo «Descartar el borrador» (US-ALGO-CONFIRM): dice que se elimina sin poder recuperarlo y que el oficial no
 * cambia. Siempre está montado y se controla con `show`, para que el foco vuelva al botón que lo abrió. Una guarda
 * síncrona evita la doble pulsación y, mientras descarta, ni Escape ni el clic fuera lo cierran. Un `404` (otra
 * generación sustituyó al borrador) o un `409` (ya no es un borrador) se explican dentro; un fallo de red ofrece
 * «Reintentar».
 */
export function DiscardScheduleDraftModal({
  show,
  scheduleId,
  onDiscarded,
  onHide,
}: DiscardScheduleDraftModalProps) {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<DiscardError | null>(null);
  const discardingRef = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function discardNow() {
    if (discardingRef.current) {
      return;
    }
    discardingRef.current = true;
    setDiscarding(true);
    setError(null);
    const outcome = await scheduleService.discard(authorizedFetch, scheduleId);
    discardingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setDiscarding(false);
    switch (outcome.status) {
      case 'discarded':
        onDiscarded();
        break;
      case 'notFound':
        setError('gone');
        break;
      case 'notDraft':
        setError('notDraft');
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'forbidden':
      case 'unavailable':
        setError('failed');
        break;
    }
  }

  return (
    <Modal
      show={show}
      onHide={discarding ? undefined : onHide}
      onExited={() => {
        setError(null);
      }}
      centered
      aria-labelledby={TITLE_ID}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={TITLE_ID} className="h5">
          {t('schedule.discard.title')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{t('schedule.discard.body')}</p>
        {(error === 'gone' || error === 'notDraft') && (
          <Alert variant="warning" className="mb-0">
            <p className="mb-1">
              {t(error === 'gone' ? 'schedule.discard.gone' : 'schedule.discard.notDraft')}
            </p>
            <Link to="/horarios">{t('schedule.discard.goneLink')}</Link>
          </Alert>
        )}
        {error === 'failed' && (
          <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3 mb-0">
            <span>{t('schedule.discard.failed')}</span>
            <Button variant="outline-danger" size="sm" onClick={() => void discardNow()}>
              {t('schedule.discard.retry')}
            </Button>
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={discarding}>
          {t('schedule.discard.cancel')}
        </Button>
        {error === null && (
          <Button variant="danger" onClick={() => void discardNow()} disabled={discarding}>
            {t(discarding ? 'schedule.discard.discarding' : 'schedule.discard.confirm')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
