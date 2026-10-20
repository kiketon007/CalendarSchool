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

type FieldError = components['schemas']['FieldError'];

const NAME_ID = 'course-name';
const NAME_ERROR_ID = 'course-name-error';
const CLASSES_HINT_ID = 'classes-hint';
const CLASSES_ERROR_ID = 'classes-error';

/**
 * Una fila de clase: la `key` identifica la fila aunque cambie su posición al quitar otras, y `id` es el de
 * la clase si ya existía en el curso (no cambia al renombrarla; las filas nuevas no lo tienen).
 */
interface ClassRow {
  key: number;
  id?: string;
  value: string;
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
}

/**
 * Formulario de un curso: el nombre y una lista de filas de clase (US05). Lo comparten la creación y la
 * edición. Valida con las mismas reglas que el backend antes de enviar, protege el envío con una guarda
 * síncrona contra la doble pulsación y muestra el error de cada campo bajo él, con el foco en el primero
 * inválido. Un fallo general conserva lo escrito. Las filas de las clases que ya existen conservan su `id`
 * aunque se renombren, y es lo que se envía para que el servidor no las trate como nuevas. El tutor de cada
 * clase existente (US09) solo se muestra; elegirlo desde aquí llega con US09_b.
 */
export function CourseForm({
  initialValues,
  onSubmit,
  failureMessage,
  requireChanges = false,
  classTutors,
}: CourseFormProps) {
  const { t, i18n } = useTranslation();
  // Los valores con los que se compara para saber si hay cambios: los del primer render.
  const [initial] = useState(initialValues);
  const [name, setName] = useState(initial.name);
  const [rows, setRows] = useState<ClassRow[]>(() =>
    initial.classes.map(({ id, name: value }, index) => ({
      key: index + 1,
      value,
      ...(id === undefined ? {} : { id }),
    })),
  );
  const [errors, setErrors] = useState<CourseErrors>(NO_ERRORS);
  const [nameTaken, setNameTaken] = useState(false);
  const [generalError, setGeneralError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const nextKey = useRef(initial.classes.length + 1);
  // Guarda síncrona: dos pulsaciones seguidas pueden llegar antes de que React repinte el botón.
  const isSubmittingRef = useRef(false);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Texto del error de un campo; un código que la interfaz no conoce usa el texto genérico del grupo. */
  function errorText(group: 'name' | 'className' | 'classes', code: FieldErrorCode, max: number) {
    const key = `courses.form.errors.${group}.${code}`;
    return i18n.exists(key) ? t(key, { max }) : t(`courses.form.errors.${group}.fallback`);
  }

  function focusFirstInvalid(found: CourseErrors, taken: boolean) {
    const rowIndex = found.classNames.findIndex((error) => error !== undefined);
    const row = rows[rowIndex];
    const id = found.name || taken ? NAME_ID : row ? `class-${String(row.key)}` : undefined;
    if (id) {
      document.getElementById(id)?.focus();
    }
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

  function removeRow(index: number) {
    setRows((current) => current.filter((_, position) => position !== index));
    setErrors((current) => ({
      ...current,
      classes: undefined,
      classNames: current.classNames.filter((_, position) => position !== index),
    }));
  }

  /** Lo que hay escrito ahora, con el `id` de las clases que ya existían. */
  const draft: CourseDraft = {
    name,
    classes: rows.map(({ id, value }) =>
      id === undefined ? { name: value } : { id, name: value },
    ),
  };
  const hasChanges = hasCourseChanges(initial, draft);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setGeneralError(false);
    setNameTaken(false);

    const classNames = rows.map((row) => row.value);
    const found = validateCourse({ name, classNames });
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
      case 'failed':
        setGeneralError(true);
        break;
      case 'done':
        break;
    }
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

          {rows.map((row, index) => {
            const rowError = errors.classNames[index];
            const fieldId = `class-${String(row.key)}`;
            const errorId = `${fieldId}-error`;
            const tutorId = `${fieldId}-tutor`;
            const number = index + 1;
            // Solo las clases que ya existían tienen tutor que mostrar; las nuevas, nada.
            const tutorName =
              classTutors !== undefined && row.id !== undefined
                ? (classTutors[row.id] ?? null)
                : undefined;
            const describedBy =
              [tutorName === undefined ? '' : tutorId, rowError ? errorId : '']
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
                        removeRow(index);
                      }}
                    >
                      {t('courses.form.remove')}
                    </Button>
                  )}
                </div>
              </Form.Group>
            );
          })}

          {errors.classes && (
            <p id={CLASSES_ERROR_ID} className="text-danger">
              {errorText('classes', errors.classes, MAX_CLASSES)}
            </p>
          )}

          <Button variant="outline-primary" disabled={rows.length >= MAX_CLASSES} onClick={addRow}>
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
    </>
  );
}
