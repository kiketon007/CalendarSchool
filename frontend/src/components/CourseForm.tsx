import { useEffect, useRef, useState, type FormEvent } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { components } from '../api/generated/schema';
import {
  MAX_CLASSES,
  MAX_CLASS_NAME,
  MAX_COURSE_NAME,
  courseErrorsFromServer,
  hasCourseChanges,
  validateCourse,
  type CourseDraft,
  type CourseErrors,
  type FieldErrorCode,
} from '../validation/courseValidation';
import { ConfirmRemoveClassModal } from './ConfirmRemoveClassModal';

type FieldError = components['schemas']['FieldError'];

const NAME_ID = 'course-name';
const NAME_ERROR_ID = 'course-name-error';
const CLASSES_HINT_ID = 'classes-hint';
const CLASSES_ERROR_ID = 'classes-error';

const tutorSelectId = (key: number) => `class-${String(key)}-tutor-select`;

/**
 * Una fila de clase: la `key` identifica la fila aunque cambie su posición al quitar otras, y `id` es el de
 * la clase si ya existía en el curso (no cambia al renombrarla; las filas nuevas no lo tienen).
 */
interface ClassRow {
  key: number;
  id?: string;
  value: string;
  /** Tutor elegido: `null`, sin tutor; ausente solo si el formulario no los elige. */
  tutorId?: string | null;
}

/** Un profesor que se puede elegir como tutor, con el texto con que se muestra en el desplegable. */
export interface TutorOption {
  id: string;
  label: string;
}

const NO_ERRORS: CourseErrors = { classNames: [] };

/**
 * Qué hizo la página con los valores enviados. El formulario muestra el error que corresponda y deja
 * lo demás (navegar, renovar la sesión) a la página.
 */
export type CourseSubmitResult =
  /** Hecho, o sin nada que mostrar aquí (la página ya navegó o la sesión ya no es válida). */
  | { status: 'done' }
  /** El servidor rechaza campos concretos (`400`). */
  | { status: 'validationError'; details: FieldError[] }
  /** El nombre del curso ya lo usa otro curso del colegio (`409`). */
  | { status: 'nameTaken' }
  /**
   * Un profesor elegido ya es tutor de otra clase (`409`). `tutorOptions` son los profesores que la página
   * acaba de volver a pedir: las filas cuyo profesor ya no está entre ellos se marcan.
   */
  | { status: 'tutorTaken'; tutorOptions?: TutorOption[] }
  /** Fallo del servidor o de la red: aviso general, conservando lo escrito. */
  | { status: 'failed' };

interface CourseFormProps {
  /** Valores con los que empieza el formulario; solo se leen al montarlo. */
  initialValues: CourseDraft;
  /** Envía los valores ya validados en el cliente: las clases que ya existían llevan su `id`. */
  onSubmit: (values: CourseDraft) => Promise<CourseSubmitResult>;
  /** Texto del aviso general cuando `onSubmit` devuelve `failed`. */
  failureMessage: string;
  /** Si es cierto, «Guardar» está deshabilitado mientras no haya cambios reales respecto a `initialValues`. */
  requireChanges?: boolean;
  /**
   * Nombre del tutor de cada clase que ya existe, por su `id` (`null` si no tiene). Solo se muestra, como
   * texto bajo el campo: no es parte del `CourseDraft`, así que ni cuenta como cambio ni se envía.
   */
  classTutors?: Record<string, string | null>;
  /**
   * Profesores que se pueden elegir como tutor (US09_b). Con él, cada fila lleva un desplegable (empieza en
   * el `tutorId` de `initialValues`, o en «Sin tutor») y el envío lleva el `tutorId` de cada clase; sin él,
   * el tutor se muestra como texto con `classTutors` y no se envía. Puede llegar después de montar.
   */
  tutorOptions?: TutorOption[];
  /**
   * Alumnos de cada clase que ya existe, por su `id` (US14_b), tal como los cargó la edición. Solo se
   * muestran, bajo el campo de la clase, y quitar una clase con alumnos pide confirmación. No es parte del
   * `CourseDraft`: ni cuenta como cambio ni se envía. Sin él (la creación), no hay números ni diálogo.
   */
  classStudentCounts?: Record<string, number>;
}

/**
 * Formulario de un curso: el nombre y una lista de filas de clase (US05). Lo comparten la creación y la
 * edición. Valida con las mismas reglas que el backend antes de enviar, protege el envío con una guarda
 * síncrona contra la doble pulsación y muestra el error de cada campo bajo él, con el foco en el primero
 * inválido. Un fallo general conserva lo escrito. Las filas de las clases que ya existen conservan su `id`
 * aunque se renombren, y es lo que se envía para que el servidor no las trate como nuevas. El tutor de cada
 * clase existente (US09) se muestra como texto, o se elige en un desplegable si hay `tutorOptions` (US09_b).
 * Quitar una clase que ya existía y tiene alumnos (US14_b) abre antes una confirmación: nada se envía
 * hasta «Guardar» y sus alumnos quedarán en el curso sin clase.
 */
export function CourseForm({
  initialValues,
  onSubmit,
  failureMessage,
  requireChanges = false,
  classTutors,
  tutorOptions,
  classStudentCounts,
}: CourseFormProps) {
  const { t, i18n } = useTranslation();
  // Los valores con los que se compara para saber si hay cambios: los del primer render.
  const [initial] = useState(initialValues);
  const [name, setName] = useState(initial.name);
  const [rows, setRows] = useState<ClassRow[]>(() =>
    initial.classes.map(({ id, name: value, tutorId }, index) => ({
      key: index + 1,
      value,
      tutorId: tutorId ?? null,
      ...(id === undefined ? {} : { id }),
    })),
  );
  // Filas cuyo profesor ya tutoriza otra clase, según el último `tutorTaken` (por la `key` de la fila).
  const [takenRows, setTakenRows] = useState<ReadonlySet<number>>(new Set());
  const [tutorTakenAlert, setTutorTakenAlert] = useState(false);
  const [errors, setErrors] = useState<CourseErrors>(NO_ERRORS);
  const [nameTaken, setNameTaken] = useState(false);
  const [generalError, setGeneralError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  // `key` de la fila cuya clase se va a quitar y espera la confirmación (US14_b).
  const [removalKey, setRemovalKey] = useState<number | null>(null);
  const nextKey = useRef(initial.classes.length + 1);
  // Guarda síncrona: dos pulsaciones seguidas pueden llegar antes de que React repinte el botón.
  const isSubmittingRef = useRef(false);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  const addClassButton = useRef<HTMLButtonElement>(null);
  // Tras confirmar, la fila (y su botón «Quitar») desaparece: el foco pasa a «Añadir clase» al cerrarse el diálogo.
  const focusAddClassOnExit = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Texto del error de un campo; un código que la interfaz no conoce usa el texto genérico del grupo. */
  function errorText(
    group: 'name' | 'className' | 'classes' | 'tutorId',
    code: FieldErrorCode,
    max: number,
  ) {
    const key = `courses.form.errors.${group}.${code}`;
    return i18n.exists(key) ? t(key, { max }) : t(`courses.form.errors.${group}.fallback`);
  }

  function focusFirstInvalid(found: CourseErrors, taken: boolean) {
    const rowIndex = found.classNames.findIndex((error) => error !== undefined);
    const row = rows[rowIndex];
    const tutorIndex = found.tutorIds?.findIndex((error) => error !== undefined) ?? -1;
    const tutorRow = rows[tutorIndex];
    const id =
      found.name || taken
        ? NAME_ID
        : row
          ? `class-${String(row.key)}`
          : tutorRow
            ? tutorSelectId(tutorRow.key)
            : undefined;
    if (id) {
      document.getElementById(id)?.focus();
    }
  }

  function clearTutorError(index: number, key: number) {
    setTakenRows((current) => {
      if (!current.has(key)) {
        return current;
      }
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    setErrors((current) =>
      current.tutorIds?.[index] === undefined
        ? current
        : {
            ...current,
            tutorIds: current.tutorIds.map((error, position) =>
              position === index ? undefined : error,
            ),
          },
    );
  }

  function clearRowError(index: number) {
    setErrors((current) =>
      current.classNames[index] === undefined
        ? current
        : {
            ...current,
            classNames: current.classNames.map((error, position) =>
              position === index ? undefined : error,
            ),
          },
    );
  }

  function addRow() {
    setRows((current) => [...current, { key: nextKey.current++, value: '' }]);
    setErrors((current) => ({ ...current, classes: undefined }));
  }

  /** Alumnos de la clase de una fila: solo las que ya existían tienen, y las nuevas, 0. */
  function studentsOf(row: ClassRow): number {
    return row.id === undefined ? 0 : (classStudentCounts?.[row.id] ?? 0);
  }

  /** «Quitar»: con alumnos en la clase pide confirmación; si no, quita la fila como siempre. */
  function requestRemoveRow(index: number) {
    const row = rows[index];
    if (row && studentsOf(row) > 0) {
      setRemovalKey(row.key);
      return;
    }
    removeRow(index);
  }

  function confirmRemoval() {
    const index = rows.findIndex((row) => row.key === removalKey);
    setRemovalKey(null);
    if (index !== -1) {
      focusAddClassOnExit.current = true;
      removeRow(index);
    }
  }

  function focusAddClassAfterRemoval() {
    if (!focusAddClassOnExit.current) {
      return;
    }
    focusAddClassOnExit.current = false;
    // react-bootstrap suelta la captura de foco justo después de `onExited`: un `focus()` en ese mismo
    // instante lo deja volver al diálogo que desaparece.
    setTimeout(() => {
      addClassButton.current?.focus();
    }, 0);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, position) => position !== index));
    setErrors((current) => ({
      ...current,
      classes: undefined,
      classNames: current.classNames.filter((_, position) => position !== index),
      ...(current.tutorIds && {
        tutorIds: current.tutorIds.filter((_, position) => position !== index),
      }),
    }));
  }

  /** Lo que hay escrito ahora, con el `id` de las clases que ya existían. */
  const draft: CourseDraft = {
    name,
    classes: rows.map(({ id, value, tutorId }) => ({
      ...(id === undefined ? {} : { id }),
      name: value,
      // El tutor solo forma parte del envío si el formulario lo elige.
      ...(tutorOptions !== undefined && { tutorId: tutorId ?? null }),
    })),
  };
  const hasChanges = hasCourseChanges(initial, draft);
  const removalIndex = rows.findIndex((row) => row.key === removalKey);
  const removalRow = rows[removalIndex];
  const classToRemove = removalRow && {
    name: removalRow.value.trim() || String(removalIndex + 1),
    studentCount: studentsOf(removalRow),
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setGeneralError(false);
    setNameTaken(false);
    setTutorTakenAlert(false);
    setTakenRows(new Set());

    const classNames = rows.map((row) => row.value);
    const found = validateCourse({
      name,
      classNames,
      ...(tutorOptions !== undefined && { tutorIds: rows.map((row) => row.tutorId ?? null) }),
    });
    if (found) {
      setErrors(found);
      isSubmittingRef.current = false;
      focusFirstInvalid(found, false);
      return;
    }
    setErrors(NO_ERRORS);

    setIsPending(true);
    const result = await onSubmit(draft);
    isSubmittingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setIsPending(false);
    switch (result.status) {
      case 'validationError': {
        const fromServer = courseErrorsFromServer(result.details, rows.length);
        setErrors(fromServer);
        focusFirstInvalid(fromServer, false);
        break;
      }
      case 'nameTaken':
        setNameTaken(true);
        document.getElementById(NAME_ID)?.focus();
        break;
      case 'tutorTaken': {
        setTutorTakenAlert(true);
        const available = result.tutorOptions && new Set(result.tutorOptions.map(({ id }) => id));
        const taken = rows.filter(
          ({ tutorId }) => available !== undefined && tutorId != null && !available.has(tutorId),
        );
        setTakenRows(new Set(taken.map(({ key }) => key)));
        const first = taken[0];
        if (first) {
          document.getElementById(tutorSelectId(first.key))?.focus();
        }
        break;
      }
      case 'failed':
        setGeneralError(true);
        break;
      case 'done':
        break;
    }
  }

  /** Texto del error del tutor de una fila: el de la validación, o «ya es tutor de otra clase». */
  function tutorErrorOf(index: number, key: number): string | undefined {
    const code = errors.tutorIds?.[index];
    if (code) {
      return errorText('tutorId', code, 0);
    }
    return takenRows.has(key) ? t('courses.form.errors.tutorId.ALREADY_TUTOR') : undefined;
  }

  const nameError = nameTaken
    ? t('courses.form.errors.alreadyExists')
    : errors.name
      ? errorText('name', errors.name, MAX_COURSE_NAME)
      : undefined;

  return (
    <>
      {generalError && (
        <Alert variant="danger" role="alert">
          {failureMessage}
        </Alert>
      )}

      {tutorTakenAlert && (
        <Alert variant="warning" role="alert">
          {t('courses.form.errors.professorAlreadyTutor')}
        </Alert>
      )}

      <Form noValidate onSubmit={(event) => void handleSubmit(event)}>
        <Form.Group className="mb-4" controlId={NAME_ID}>
          <Form.Label>{t('courses.form.name')}</Form.Label>
          <Form.Control
            type="text"
            autoComplete="off"
            value={name}
            isInvalid={Boolean(nameError)}
            aria-invalid={Boolean(nameError)}
            aria-required="true"
            aria-describedby={nameError ? `${NAME_ID}-hint ${NAME_ERROR_ID}` : `${NAME_ID}-hint`}
            onChange={(event) => {
              setName(event.target.value);
              setNameTaken(false);
              setErrors((current) => ({ ...current, name: undefined }));
            }}
          />
          <Form.Text id={`${NAME_ID}-hint`} muted>
            {t('courses.form.nameHint')}
          </Form.Text>
          {nameError && (
            <Form.Control.Feedback type="invalid" id={NAME_ERROR_ID} className="d-block">
              {nameError}
            </Form.Control.Feedback>
          )}
        </Form.Group>

        <fieldset className="mb-4" aria-describedby={CLASSES_HINT_ID}>
          <legend className="h5">{t('courses.form.classesLegend')}</legend>
          <p id={CLASSES_HINT_ID} className="text-body-secondary">
            {t('courses.form.classesHint', { max: MAX_CLASSES })}
          </p>

          {tutorOptions !== undefined && tutorOptions.length === 0 && (
            <p className="text-body-secondary">
              {t('courses.form.noProfessors')}{' '}
              <Link to="/profesores/nuevo">{t('courses.form.createProfessor')}</Link>
            </p>
          )}

          {rows.map((row, index) => {
            const rowError = errors.classNames[index];
            const fieldId = `class-${String(row.key)}`;
            const errorId = `${fieldId}-error`;
            const tutorId = `${fieldId}-tutor`;
            const studentsId = `${fieldId}-students`;
            const students = studentsOf(row);
            const number = index + 1;
            // Solo las clases que ya existían tienen tutor que mostrar; las nuevas, nada.
            const tutorName =
              tutorOptions === undefined && classTutors !== undefined && row.id !== undefined
                ? (classTutors[row.id] ?? null)
                : undefined;
            const describedBy =
              [
                tutorName === undefined ? '' : tutorId,
                students > 0 ? studentsId : '',
                rowError ? errorId : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined;
            return (
              <Form.Group key={row.key} className="mb-3" controlId={fieldId}>
                <Form.Label>{t('courses.form.className', { number })}</Form.Label>
                <div className="d-flex align-items-start gap-2">
                  <div className="flex-grow-1">
                    <Form.Control
                      type="text"
                      autoComplete="off"
                      value={row.value}
                      isInvalid={Boolean(rowError)}
                      aria-invalid={Boolean(rowError)}
                      aria-required="true"
                      aria-describedby={describedBy}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRows((current) =>
                          current.map((item) => (item.key === row.key ? { ...item, value } : item)),
                        );
                        clearRowError(index);
                      }}
                    />
                    {tutorName !== undefined && (
                      <Form.Text id={tutorId} muted>
                        {tutorName === null
                          ? t('courses.noTutor')
                          : t('courses.tutorOf', { name: tutorName })}
                      </Form.Text>
                    )}
                    {students > 0 && (
                      <Form.Text id={studentsId} muted className="d-block">
                        {t('courses.form.classStudents', { count: students })}
                      </Form.Text>
                    )}
                    {rowError && (
                      <Form.Control.Feedback type="invalid" id={errorId} className="d-block">
                        {errorText('className', rowError, MAX_CLASS_NAME)}
                      </Form.Control.Feedback>
                    )}
                  </div>
                  {rows.length > 1 && (
                    <Button
                      variant="outline-secondary"
                      aria-label={t('courses.form.removeClass', { number })}
                      onClick={() => {
                        requestRemoveRow(index);
                      }}
                    >
                      {t('courses.form.remove')}
                    </Button>
                  )}
                </div>
                {tutorOptions !== undefined && (
                  <TutorSelect
                    rowKey={row.key}
                    number={number}
                    value={row.tutorId ?? ''}
                    options={tutorOptions}
                    error={tutorErrorOf(index, row.key)}
                    onChange={(value) => {
                      setRows((current) =>
                        current.map((item) =>
                          item.key === row.key ? { ...item, tutorId: value || null } : item,
                        ),
                      );
                      clearTutorError(index, row.key);
                    }}
                  />
                )}
              </Form.Group>
            );
          })}

          {errors.classes && (
            <p id={CLASSES_ERROR_ID} className="text-danger">
              {errorText('classes', errors.classes, MAX_CLASSES)}
            </p>
          )}

          <Button
            ref={addClassButton}
            variant="outline-primary"
            disabled={rows.length >= MAX_CLASSES}
            onClick={addRow}
          >
            {t('courses.form.addClass')}
          </Button>
        </fieldset>

        <div className="d-flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={isPending || (requireChanges && !hasChanges)}
          >
            {isPending ? t('courses.form.saving') : t('courses.form.save')}
          </Button>
          <Link to="/cursos" className="btn btn-outline-secondary">
            {t('courses.form.cancel')}
          </Link>
        </div>
      </Form>

      <ConfirmRemoveClassModal
        pending={classToRemove ?? null}
        onConfirm={confirmRemoval}
        onCancel={() => {
          setRemovalKey(null);
        }}
        onExited={focusAddClassAfterRemoval}
      />
    </>
  );
}

interface TutorSelectProps {
  rowKey: number;
  number: number;
  value: string;
  options: TutorOption[];
  error: string | undefined;
  onChange: (value: string) => void;
}

/** El desplegable de tutor de una fila: «Sin tutor» y los profesores. Es un campo aparte, con su etiqueta. */
function TutorSelect({ rowKey, number, value, options, error, onChange }: TutorSelectProps) {
  const { t } = useTranslation();
  const id = tutorSelectId(rowKey);
  const errorId = `${id}-error`;
  return (
    <div className="mt-2">
      <label htmlFor={id} className="form-label small mb-1">
        {t('courses.form.tutor')}
      </label>
      <Form.Select
        id={id}
        size="sm"
        value={value}
        aria-label={t('courses.form.tutorOf', { number })}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        isInvalid={Boolean(error)}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{t('courses.form.noTutorOption')}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </Form.Select>
      {error && (
        <Form.Control.Feedback type="invalid" id={errorId} className="d-block">
          {error}
        </Form.Control.Feedback>
      )}
    </div>
  );
}
