import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import { calendarsService } from '../services/calendarsService';
import { useSession } from '../session/SessionProvider';

const TITLE_ID = 'delete-calendar-title';

/** El calendario que se va a borrar: lo que ya tiene la tarjeta, sin pedir nada al servidor. */
export interface CalendarToDelete {
  id: string;
  name: string;
  /** Cursos que lo siguen hoy: son los que se quedarán sin calendario. */
  courses: { id: string; name: string }[];
}

interface DeleteCalendarModalProps {
  /** El calendario a borrar; con `null` el diálogo está cerrado. */
  calendar: CalendarToDelete | null;
  /** Borrado: el calendario y los cursos que el servidor dejó sin calendario (su recuento, no el de la tarjeta). */
  onDeleted: (calendar: CalendarToDelete, courseCount: number) => void;
  /** El calendario ya no existe (otra persona lo borró) al confirmar. */
  onGone: () => void;
  /** Cancelar, Escape o clic fuera: ninguna envía nada. */
  onCancel: () => void;
  /** El diálogo ya se ha cerrado del todo (acabó la animación). */
  onExited?: () => void;
}

/**
 * Confirmación del borrado de un calendario (US-BASE_c), a imagen de `DeleteStudentModal`: **no consulta nada
 * al abrirse**, usa el nombre y los cursos que ya tiene la tarjeta, y dice qué cursos se quedarán sin
 * calendario (no se borran). Una sola confirmación: el diálogo dice que no se puede deshacer. Al confirmar
 * envía un único `DELETE` (guarda síncrona contra la doble pulsación); un `404` (el calendario ya no existe)
 * lo resuelve la página con `onGone`, y cualquier otro fallo se muestra dentro, sin cerrar el diálogo. Siempre
 * está montado y se controla con `calendar`, para que el foco vuelva al botón que lo abrió al cancelar; el
 * foco empieza en «Cancelar», la opción segura. Mientras borra, ni Escape ni el clic fuera lo cierran.
 */
export function DeleteCalendarModal({
  calendar,
  onDeleted,
  onGone,
  onCancel,
  onExited,
}: DeleteCalendarModalProps) {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  // Mientras el diálogo se cierra (animación) se sigue pintando el último calendario.
  const [lastCalendar, setLastCalendar] = useState(calendar);
  if (calendar && (calendar.id !== lastCalendar?.id || calendar.name !== lastCalendar.name)) {
    setLastCalendar(calendar);
  }
  const shown = calendar ?? lastCalendar;

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
    if (!calendar || deletingRef.current) {
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    setFailedFor(undefined);
    const outcome = await calendarsService.delete(authorizedFetch, calendar.id);
    deletingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setDeleting(false);
    switch (outcome.status) {
      case 'deleted':
        onDeleted(calendar, outcome.courseCount);
        break;
      case 'notFound':
        onGone();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'forbidden':
      case 'unavailable':
        setFailedFor(calendar.id);
        break;
    }
  }

  const courseNames = shown?.courses.map(({ name }) => name).join(', ') ?? '';

  return (
    <Modal
      show={calendar !== null}
      onHide={deleting ? undefined : cancel}
      onExited={onExited}
      centered
      aria-labelledby={TITLE_ID}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={TITLE_ID} className="h5">
          {t('calendars.delete.title', { name: shown?.name ?? '' })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          {courseNames === ''
            ? t('calendars.delete.noCourses')
            : t('calendars.delete.courses', { courses: courseNames })}
        </p>
        <p className="mb-0 fw-bold">{t('calendars.delete.warning')}</p>

        {failedFor !== undefined && failedFor === calendar?.id && (
          <Alert variant="danger" role="alert" className="mt-3 mb-0">
            {t('calendars.delete.error')}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={cancel} disabled={deleting} autoFocus>
          {t('calendars.delete.cancel')}
        </Button>
        <Button variant="danger" onClick={() => void confirm()} disabled={deleting}>
          {deleting ? t('calendars.delete.deleting') : t('calendars.delete.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
