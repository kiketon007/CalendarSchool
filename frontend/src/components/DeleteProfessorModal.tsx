import { useEffect, useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { professorsService, type FreedClass, type Professor } from '../services/professorsService';
import { useSession } from '../session/SessionProvider';
import { subjectsTextOf } from '../utils/professorSubjects';

const TITLE_ID = 'delete-professor-title';

/** El profesor que se va a borrar: lo mínimo que necesita el diálogo. */
export interface ProfessorToDelete {
  id: string;
  /** Nombre y apellidos, como se muestran en el título. */
  name: string;
}

interface DeleteProfessorModalProps {
  /** El profesor a borrar; con `null` el diálogo está cerrado. */
  professor: ProfessorToDelete | null;
  /** Borrado: el profesor y la clase que se liberó de verdad (que puede diferir de la que se vio). */
  onDeleted: (professor: ProfessorToDelete, freedClass: FreedClass) => void;
  /** El profesor ya no existe (otra persona lo borró), al consultarlo o al confirmar. */
  onGone: () => void;
  /** Cancelar, Escape o clic fuera: ninguna envía nada. */
  onCancel: () => void;
  /** El diálogo ya se ha cerrado del todo (acabó la animación). */
  onExited?: () => void;
}

type LoadResult = { status: 'loaded'; professor: Professor } | { status: 'error' };

const LOADING = { status: 'loading' } as const;

/**
 * Confirmación del borrado de un profesor (US13), a imagen de `DeleteCourseModal`. Al abrirse pide el
 * profesor (`GET /api/professors/{id}`) y muestra, si tutoriza una clase, que quedará sin tutor, y, si tiene
 * asignaturas, las asignaciones de profesores que se quitarán con él (US-PROF-ASSIGN_b);
 * «Borrar profesor» no se habilita hasta tenerlo (no se confirma a ciegas). Una sola confirmación: el
 * diálogo ya informa. Al confirmar envía un único `DELETE` (guarda síncrona contra la doble pulsación) y
 * avisa de la clase que se liberó de verdad; un `404` (el profesor ya no existe) lo resuelve la página con
 * `onGone`, y cualquier otro fallo se muestra dentro, sin cerrar el diálogo. Siempre está montado y se
 * controla con `professor`, para que el foco vuelva al botón que lo abrió al cancelar; el foco empieza
 * en «Cancelar», la opción segura. Mientras borra, ni Escape ni el clic fuera lo cierran.
 */
export function DeleteProfessorModal({
  professor,
  onDeleted,
  onGone,
  onCancel,
  onExited,
}: DeleteProfessorModalProps) {
  const { t } = useTranslation();
  const { authorizedFetch } = useSession();
  // Mientras el diálogo se cierra (animación) se sigue pintando el último profesor.
  const [lastProfessor, setLastProfessor] = useState(professor);
  if (professor && (professor.id !== lastProfessor?.id || professor.name !== lastProfessor.name)) {
    setLastProfessor(professor);
  }
  const shown = professor ?? lastProfessor;

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; value: LoadResult } | null>(null);
  const key = professor ? `${professor.id}:${String(attempt)}` : undefined;
  const loaded =
    professor === null
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
  // Consulta ya hecha: en modo estricto el efecto se ejecuta dos veces, pero se pide una.
  const requestedKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!professor || !key) {
      requestedKey.current = undefined;
      return;
    }
    if (requestedKey.current === key) {
      return;
    }
    requestedKey.current = key;
    void professorsService.get(authorizedFetch, professor.id).then((outcome) => {
      // Una respuesta de un profesor anterior (el diálogo se reabrió con otro) ya no interesa.
      if (!mounted.current || requestedKey.current !== key) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setResult({ key, value: { status: 'loaded', professor: outcome.professor } });
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
    // `professor` y `onGone` cambian de identidad sin cambiar el profesor pedido: la clave lo resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, authorizedFetch]);

  function cancel() {
    setFailedFor(undefined);
    onCancel();
  }

  async function confirm() {
    if (!professor || deletingRef.current || loaded === LOADING || loaded.status !== 'loaded') {
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    setFailedFor(undefined);
    const outcome = await professorsService.delete(authorizedFetch, professor.id);
    deletingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setDeleting(false);
    switch (outcome.status) {
      case 'deleted':
        onDeleted(professor, outcome.freedClass);
        break;
      case 'notFound':
        onGone();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'unavailable':
        setFailedFor(professor.id);
        break;
    }
  }

  const loadedProfessor =
    loaded !== LOADING && loaded.status === 'loaded' ? loaded.professor : undefined;
  const tutoredClass = loadedProfessor?.tutoredClass ?? null;

  return (
    <Modal
      show={professor !== null}
      onHide={deleting ? undefined : cancel}
      onExited={onExited}
      centered
      aria-labelledby={TITLE_ID}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={TITLE_ID} className="h5">
          {t('professors.delete.title', { name: shown?.name ?? '' })}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loaded === LOADING && (
          <div role="status" className="d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" aria-hidden="true" />
            <span>{t('professors.delete.loading')}</span>
          </div>
        )}

        {loaded !== LOADING && loaded.status === 'error' && (
          <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3 mb-0">
            <span>{t('professors.delete.loadError')}</span>
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => {
                setAttempt((current) => current + 1);
              }}
            >
              {t('professors.retry')}
            </Button>
          </Alert>
        )}

        {loadedProfessor && (
          <>
            {tutoredClass && (
              <p>
                {t('professors.delete.tutors', {
                  course: tutoredClass.courseName,
                  className: tutoredClass.name,
                })}
              </p>
            )}
            {loadedProfessor.subjects.length > 0 && (
              <p>
                {t('professors.delete.assignments', {
                  count: loadedProfessor.subjects.length,
                  list: subjectsTextOf(loadedProfessor.subjects, t),
                })}
              </p>
            )}
            <p className="mb-0 fw-bold">{t('professors.delete.warning')}</p>
          </>
        )}

        {failedFor !== undefined && failedFor === professor?.id && (
          <Alert variant="danger" role="alert" className="mt-3 mb-0">
            {t('professors.delete.error')}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={cancel} disabled={deleting} autoFocus>
          {t('professors.delete.cancel')}
        </Button>
        <Button
          variant="danger"
          onClick={() => void confirm()}
          disabled={deleting || loadedProfessor === undefined}
        >
          {deleting ? t('professors.delete.deleting') : t('professors.delete.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
