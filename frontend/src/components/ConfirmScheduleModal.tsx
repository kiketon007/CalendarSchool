import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { scheduleDraftService } from '../services/scheduleDraftService';
import { scheduleService, type ScheduleSummary } from '../services/scheduleService';
import { useSession } from '../session/SessionProvider';
import { draftGaps, indexDraft, type DraftIndex } from '../utils/scheduleDraftViews';

const TITLE_ID = 'confirm-schedule-title';

/** Por qué no se pudo confirmar: el borrador ya no existe, ya no es un borrador o falló la petición. */
type ConfirmError = 'gone' | 'notDraft' | 'failed';

interface ConfirmScheduleModalProps {
  show: boolean;
  /** El borrador que se confirma. */
  scheduleId: string;
  /** Cuándo se confirmó el oficial vigente al que sustituiría, o `null` si no hay. */
  officialConfirmedAt: string | null;
  /**
   * El borrador ya cargado, para avisar de lo que ha cambiado desde que se generó; `null` si la página no lo tiene (el
   * panel de `/horarios`): entonces el diálogo lo pide al abrirse.
   */
  index: DraftIndex | null;
  /** Confirmado: el horario ya es el oficial. */
  onConfirmed: (schedule: ScheduleSummary) => void;
  onHide: () => void;
}

/**
 * El diálogo «Confirmar como oficial» (US-ALGO-CONFIRM). Dice qué hace confirmar, si sustituirá a un oficial (que se
 * conserva) y, con cifras, lo que ha cambiado desde que se generó (profesores borrados, sesiones fuera del calendario
 * actual, cursos sin calendario): avisa, pero no impide confirmar. Siempre está montado y se controla con `show`, para
 * que el foco vuelva al botón que lo abrió. Una guarda síncrona evita la doble pulsación y, mientras confirma, ni
 * Escape ni el clic fuera lo cierran. Un `404` (otra generación sustituyó al borrador) o un `409` (ya no es un
 * borrador) se explican dentro; un fallo de red ofrece «Reintentar».
 */
export function ConfirmScheduleModal({
  show,
  scheduleId,
  officialConfirmedAt,
  index,
  onConfirmed,
  onHide,
}: ConfirmScheduleModalProps) {
  const { t, i18n } = useTranslation();
  const { authorizedFetch } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ConfirmError | null>(null);
  const [loaded, setLoaded] = useState<DraftIndex | null>(null);
  const confirmingRef = useRef(false);
  const requestedRef = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Sin el borrador de la página, se pide una vez al abrir (también con StrictMode) solo para contar los desfases.
  useEffect(() => {
    if (!show || index !== null || requestedRef.current) {
      return;
    }
    requestedRef.current = true;
    void scheduleDraftService.getDraft(authorizedFetch).then((outcome) => {
      if (
        mounted.current &&
        outcome.status === 'loaded' &&
        outcome.schedule !== null &&
        outcome.schedule.id === scheduleId
      ) {
        setLoaded(indexDraft(outcome.schedule));
      }
    });
  }, [show, index, authorizedFetch, scheduleId]);

  const gaps = useMemo(() => {
    const source = index ?? loaded;
    return source === null ? null : draftGaps(source);
  }, [index, loaded]);

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );

  async function confirmNow() {
    if (confirmingRef.current) {
      return;
    }
    confirmingRef.current = true;
    setConfirming(true);
    setError(null);
    const outcome = await scheduleService.confirm(authorizedFetch, scheduleId);
    confirmingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setConfirming(false);
    switch (outcome.status) {
      case 'confirmed':
        onConfirmed(outcome.schedule);
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

  const gapLines =
    gaps === null
      ? []
      : (
          [
            ['withoutProfessor', gaps.withoutProfessor],
            ['outsideCalendar', gaps.outsideCalendar],
            ['coursesWithoutCalendar', gaps.coursesWithoutCalendar],
          ] as const
        ).filter(([, count]) => count > 0);

  return (
    <Modal
      show={show}
      onHide={confirming ? undefined : onHide}
      onExited={() => {
        setError(null);
        setLoaded(null);
        requestedRef.current = false;
      }}
      centered
      aria-labelledby={TITLE_ID}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={TITLE_ID} className="h5">
          {t('schedule.confirm.title')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{t('schedule.confirm.body')}</p>
        {officialConfirmedAt !== null && (
          <p>{t('schedule.confirm.replaces', { date: date(officialConfirmedAt) })}</p>
        )}
        {gapLines.length > 0 && (
          <>
            <p className="mb-1">{t('schedule.confirm.gapsTitle')}</p>
            <ul>
              {gapLines.map(([key, count]) => (
                <li key={key}>{t(`schedule.confirm.${key}`, { count })}</li>
              ))}
            </ul>
            <p className="text-body-secondary">{t('schedule.confirm.gapsNote')}</p>
          </>
        )}
        {(error === 'gone' || error === 'notDraft') && (
          <Alert variant="warning" className="mb-0">
            <p className="mb-1">
              {t(error === 'gone' ? 'schedule.confirm.gone' : 'schedule.confirm.notDraft')}
            </p>
            <Link to="/horarios">{t('schedule.confirm.goneLink')}</Link>
          </Alert>
        )}
        {error === 'failed' && (
          <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3 mb-0">
            <span>{t('schedule.confirm.failed')}</span>
            <Button variant="outline-danger" size="sm" onClick={() => void confirmNow()}>
              {t('schedule.confirm.retry')}
            </Button>
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={confirming}>
          {t('schedule.confirm.cancel')}
        </Button>
        {error !== 'gone' && error !== 'notDraft' && error !== 'failed' && (
          <Button variant="primary" onClick={() => void confirmNow()} disabled={confirming}>
            {t(confirming ? 'schedule.confirm.confirming' : 'schedule.confirm.confirm')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
