import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import { useTranslation } from 'react-i18next';
import { downloadFile } from '../utils/download';
import type { DraftIndex } from '../utils/scheduleDraftViews';
import { exportSchedule, type ExportFormat, type ExportKind } from '../utils/scheduleExport';

const TITLE_ID = 'schedule-export-title';
const NO_PROFESSORS_ID = 'schedule-export-no-professors';

/** Lo que el diálogo deja elegir: el formato, por clase o por profesor, y cuál (`all` o un id). */
interface ExportChoice {
  format: ExportFormat;
  kind: ExportKind;
  target: string;
}

interface ScheduleExportModalProps {
  show: boolean;
  onHide: () => void;
  index: DraftIndex;
  /** Con lo que arranca: lo que se está viendo en la página (en la vista del colegio, todas las clases). */
  initial: { kind: ExportKind; target: string };
  /** La clase y el profesor elegidos en la página: adonde va «Cuál» al cambiar entre clase y profesor. */
  selected: { classId: string | null; professorId: string | null };
}

/**
 * El diálogo «Exportar horario» (US-ALGO-VIEW_b): formato (Markdown o HTML), por clase o por profesor y cuál, uno o todos.
 * Siempre está montado y se controla con `show`, para que el foco vuelva al botón que lo abrió. Arranca con lo que se
 * está viendo y, al cerrarse del todo, olvida lo que se tocó: no toca la dirección ni guarda nada en el navegador.
 * «Descargar» genera el documento en el navegador (sin peticiones), lo descarga y cierra.
 */
export function ScheduleExportModal({
  show,
  onHide,
  index,
  initial,
  selected,
}: ScheduleExportModalProps) {
  const { t, i18n } = useTranslation();
  // Solo lo que la persona ha tocado; lo demás sale de `initial`, así que no hay que sincronizar nada al abrir.
  const [edits, setEdits] = useState<Partial<ExportChoice>>({});
  const choice: ExportChoice = { format: 'markdown', ...initial, ...edits };
  const hasProfessors = index.draft.professors.length > 0;

  function chooseKind(kind: ExportKind) {
    const page = kind === 'class' ? selected.classId : selected.professorId;
    setEdits((current) => ({ ...current, kind, target: page ?? 'all' }));
  }

  function download() {
    downloadFile(
      exportSchedule({
        index,
        format: choice.format,
        kind: choice.kind,
        target: choice.target,
        t,
        locale: i18n.language,
      }),
    );
    onHide();
  }

  return (
    <Modal
      show={show}
      onHide={onHide}
      onExited={() => {
        setEdits({});
      }}
      centered
      aria-labelledby={TITLE_ID}
    >
      <Modal.Header>
        <Modal.Title as="h2" id={TITLE_ID} className="h5">
          {t('schedule.export.title')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <fieldset className="mb-3">
          <legend className="fs-6 fw-semibold">{t('schedule.export.format.label')}</legend>
          {(['markdown', 'html'] as const).map((format) => (
            <Form.Check
              key={format}
              type="radio"
              name="schedule-export-format"
              id={`schedule-export-format-${format}`}
              label={t(`schedule.export.format.${format}`)}
              checked={choice.format === format}
              onChange={() => {
                setEdits((current) => ({ ...current, format }));
              }}
            />
          ))}
        </fieldset>

        <fieldset className="mb-3">
          <legend className="fs-6 fw-semibold">{t('schedule.export.kind.label')}</legend>
          <Form.Check
            type="radio"
            name="schedule-export-kind"
            id="schedule-export-kind-class"
            label={t('schedule.export.kind.class')}
            checked={choice.kind === 'class'}
            onChange={() => {
              chooseKind('class');
            }}
          />
          <Form.Check
            type="radio"
            name="schedule-export-kind"
            id="schedule-export-kind-professor"
            label={t('schedule.export.kind.professor')}
            checked={choice.kind === 'professor'}
            disabled={!hasProfessors}
            aria-describedby={hasProfessors ? undefined : NO_PROFESSORS_ID}
            onChange={() => {
              chooseKind('professor');
            }}
          />
          {!hasProfessors && (
            <p id={NO_PROFESSORS_ID} className="small text-body-secondary mb-0">
              {t('schedule.export.kind.noProfessors')}
            </p>
          )}
        </fieldset>

        <Form.Group controlId="schedule-export-target">
          <Form.Label className="fw-semibold">{t('schedule.export.target.label')}</Form.Label>
          <Form.Select
            value={choice.target}
            onChange={(event) => {
              setEdits((current) => ({ ...current, target: event.target.value }));
            }}
          >
            {choice.kind === 'class' ? (
              <>
                <option value="all">{t('schedule.export.target.allClasses')}</option>
                {index.draft.courses.map((course) => (
                  <optgroup key={course.id} label={course.name}>
                    {course.classes.map((schoolClass) => (
                      <option key={schoolClass.id} value={schoolClass.id}>
                        {course.name} {schoolClass.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </>
            ) : (
              <>
                <option value="all">{t('schedule.export.target.allProfessors')}</option>
                {index.draft.professors.map((professor) => (
                  <option key={professor.id} value={professor.id}>
                    {professor.lastName}, {professor.firstName}
                  </option>
                ))}
              </>
            )}
          </Form.Select>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>
          {t('schedule.export.cancel')}
        </Button>
        <Button variant="primary" onClick={download}>
          {t('schedule.export.download')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
