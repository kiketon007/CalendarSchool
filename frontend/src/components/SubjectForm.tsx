import { useEffect, useRef, useState, type FormEvent } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { lostItemsText } from '../utils/lostItemsText';
import { SUBJECT_COLORS, SUBJECT_STATUSES, SUBJECT_TYPES } from '../utils/subjectOptions';
import {
  DEFAULT_SESSIONS_PER_WEEK,
  MAX_SESSIONS_PER_WEEK,
  MAX_SUBJECT_CODE,
  MAX_SUBJECT_COURSES,
  MAX_SUBJECT_DESCRIPTION,
  MIN_SESSIONS_PER_WEEK,
  groupSubjectErrors,
  hasSubjectChanges,
  validateSubject,
  type SubjectCourseRowErrors,
  type SubjectDraft,
  type SubjectErrors,
} from '../validation/subjectValidation';
import { MAX_COURSE_NAME, type FieldErrorCode } from '../validation/courseValidation';
import type { CoursesState } from './ProfessorForm';
import { SubjectColorSwatch } from './SubjectColorSwatch';

export type { CoursesState };

/** Lo que la página responde al formulario tras intentar guardar. */
export type SubjectSubmitResult =
  /** Guardado: la página ya navegó a otro sitio. */
  | { status: 'done' }
  /** El servidor rechaza campos concretos (`400`); los de cada curso van por la posición enviada. */
  | { status: 'validationError'; errors: SubjectErrors }
  /** El nombre ya lo usa otra asignatura del colegio (`409`): se marca el nombre. */
  | { status: 'nameTaken' }
  /** El código ya lo usa otra asignatura del colegio (`409`): se marca el código. */
  | { status: 'codeTaken' }
  /** Cualquier otro fallo: aviso general, conservando lo escrito. */
  | { status: 'failed' };

interface SubjectFormProps {
  /** Valores con los que empieza el formulario; solo se leen al montarse. */
  initialValues: SubjectDraft;
  /** Cursos del colegio entre los que se elige dónde se imparte la asignatura. */
  courses: CoursesState;
  /** Vuelve a pedir los cursos cuando no se han podido cargar. */
  onRetryCourses: () => void;
  /** Texto del aviso general si no se puede guardar; por defecto, el de la creación. */
  failureMessage?: string;
  /**
   * Edición (US-SUBJECT_b): «Guardar» queda deshabilitado mientras lo que se enviaría no difiera de
   * `initialValues`, y una asignatura sin cursos lo avisa. El alta no lo usa.
   */
  requireChanges?: boolean;
  /**
   * Edición (US19_b): reglas de reparto de la asignatura en cada curso que ya tenía, por `id` de curso. Al
   * desmarcar uno con reglas, el formulario avisa de que se borrarán al guardar. El alta no lo usa.
   */
  ruleCounts?: Readonly<Record<string, number>>;
  /**
   * Edición (US-PROF-ASSIGN_b): lo mismo para las asignaciones de profesores de la asignatura en cada curso; el
   * aviso las suma a las reglas en una sola frase.
   */
  assignmentCounts?: Readonly<Record<string, number>>;
  /** Guarda la asignatura (ya validada). La guarda contra el doble envío es del formulario. */
  onSubmit: (draft: SubjectDraft) => Promise<SubjectSubmitResult>;
}

/** Los campos de texto o de lista del formulario, en el orden en que se pintan y se recorre el foco. */
const TOP_FIELDS = ['name', 'code', 'type', 'status', 'description'] as const;
type TopField = (typeof TOP_FIELDS)[number];
type ErrorField = TopField | 'color' | 'courses';
type TopErrors = Omit<SubjectErrors, 'rows'>;

/** Máximo que se dice en el mensaje de cada campo con límite de longitud. */
const MAX_BY_FIELD: Partial<Record<ErrorField, number>> = {
  name: MAX_COURSE_NAME,
  code: MAX_SUBJECT_CODE,
  description: MAX_SUBJECT_DESCRIPTION,
  courses: MAX_SUBJECT_COURSES,
};

const fieldId = (field: ErrorField) => `subject-${field}`;
const errorId = (field: ErrorField) => `${fieldId(field)}-error`;
const hintId = (field: ErrorField) => `${fieldId(field)}-hint`;
const emptyNoticeId = 'subject-courses-empty';
const colorId = (color: string) => `subject-color-${color}`;
const courseBoxId = (index: number) => `subject-course-${String(index)}`;
const sessionsId = (index: number) => `${courseBoxId(index)}-sessions`;

/**
 * Formulario de una asignatura (US-SUBJECT), que reutiliza también la edición (US-SUBJECT_b). Valida con las reglas del backend
 * antes de enviar, protege el envío con una guarda síncrona contra la doble pulsación y muestra el error de
 * cada campo bajo él, con el foco en el primero inválido. Los cursos son los del colegio: cada uno es una
 * casilla y, marcado, lleva sus sesiones semanales (2 al marcarlo). Los cursos que se envían se **derivan al
 * pintar** de la lista cargada, en su orden: uno marcado que desaparece al recargar la lista no se envía. El
 * color se elige entre los 12 de la paleta y nunca va solo, siempre con su nombre. La página decide qué
 * llamar y qué hacer con cada resultado (`SubjectSubmitResult`). En la edición (`requireChanges`) un curso que
 * la asignatura ya tenía recupera sus sesiones originales si se desmarca y se vuelve a marcar (uno nuevo empieza
 * en 2), de modo que deshacer un cambio deja «Guardar» deshabilitado otra vez.
 */
export function SubjectForm({
  initialValues,
  courses,
  onRetryCourses,
  failureMessage,
  requireChanges = false,
  ruleCounts,
  assignmentCounts,
  onSubmit,
}: SubjectFormProps) {
  const { t, i18n } = useTranslation();
  const [values, setValues] = useState<SubjectDraft>(initialValues);
  // Lo que había al montar: con `requireChanges` es lo que se compara; no sigue a la prop.
  const [loaded] = useState<SubjectDraft>(initialValues);
  /** Sesiones que la asignatura tenía en cada curso al abrirse (vacío en el alta), por id. */
  const [original] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialValues.courses.map((row) => [row.courseId, row.sessionsPerWeek])),
  );
  /** Sesiones de cada curso marcado, por id: los marcados que ya no están en la lista se ignoran. */
  const [selected, setSelected] = useState<Record<string, number>>(() => ({ ...original }));
  const [errors, setErrors] = useState<TopErrors>({});
  const [rowErrors, setRowErrors] = useState<Record<string, SubjectCourseRowErrors>>({});
  const [nameTaken, setNameTaken] = useState(false);
  const [codeTaken, setCodeTaken] = useState(false);
  const [generalError, setGeneralError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  // Guarda síncrona: dos pulsaciones seguidas pueden llegar antes de que React repinte el botón.
  const isSubmittingRef = useRef(false);
  // Para no actualizar nada tras desmontar (la página navega al guardar).
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const listed = courses.status === 'loaded' ? courses.courses : [];

  function setValue<K extends keyof SubjectDraft>(field: K, value: SubjectDraft[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    if (field !== 'courses') {
      setErrors((current) => ({ ...current, [field]: undefined }));
    }
    if (field === 'name') {
      setNameTaken(false);
    }
    if (field === 'code') {
      setCodeTaken(false);
    }
  }

  function toggleCourse(courseId: string, checked: boolean) {
    setSelected((current) => {
      const next = { ...current };
      if (checked) {
        next[courseId] = original[courseId] ?? DEFAULT_SESSIONS_PER_WEEK;
      } else {
        delete next[courseId];
      }
      return next;
    });
    setErrors((current) => ({ ...current, courses: undefined }));
    setRowErrors((current) => ({ ...current, [courseId]: {} }));
  }

  function setSessions(courseId: string, sessionsPerWeek: number) {
    setSelected((current) => ({ ...current, [courseId]: sessionsPerWeek }));
    setRowErrors((current) => ({ ...current, [courseId]: {} }));
  }

  /** Texto del error de un campo; un código que la interfaz no conoce usa el texto genérico del campo. */
  function errorText(field: ErrorField, code: FieldErrorCode): string {
    const key = `subjects.form.errors.${field}.${code}`;
    return i18n.exists(key)
      ? t(key, { max: MAX_BY_FIELD[field] })
      : t(`subjects.form.errors.${field}.fallback`);
  }

  function messageOf(field: ErrorField): string | undefined {
    if (field === 'name' && nameTaken) {
      return t('subjects.form.errors.alreadyExists');
    }
    if (field === 'code' && codeTaken) {
      return t('subjects.form.errors.codeAlreadyExists');
    }
    const code = errors[field];
    return code ? errorText(field, code) : undefined;
  }

  function rowMessage(courseId: string, part: 'courseId' | 'sessionsPerWeek'): string | undefined {
    const row = rowErrors[courseId];
    const code = part === 'sessionsPerWeek' ? row?.sessionsPerWeek : (row?.courseId ?? row?.whole);
    if (!code) {
      return undefined;
    }
    const group = part === 'sessionsPerWeek' ? 'sessions' : 'course';
    const key = `subjects.form.errors.${group}.${code}`;
    return i18n.exists(key) ? t(key) : t(`subjects.form.errors.${group}.fallback`);
  }

  /** Pone los errores en pantalla y el foco en el primer campo inválido, en el orden de la pantalla. */
  function showErrors(found: SubjectErrors, sentIds: readonly string[]) {
    const { rows, ...top } = found;
    setErrors(top);
    const byCourse: Record<string, SubjectCourseRowErrors> = {};
    for (const [position, rowError] of Object.entries(rows)) {
      const courseId = sentIds[Number(position)];
      if (courseId !== undefined) {
        byCourse[courseId] = rowError;
      }
    }
    setRowErrors(byCourse);

    const firstField = TOP_FIELDS.find((field) => top[field] !== undefined);
    let target: string | undefined;
    if (firstField) {
      target = fieldId(firstField);
    } else if (top.color) {
      target = colorId(SUBJECT_COLORS[0]);
    } else if (top.courses) {
      target = courseBoxId(0);
    } else {
      const position = Object.keys(rows)
        .map(Number)
        .sort((a, b) => a - b)
        .find((index) => sentIds[index] !== undefined);
      const courseId = position === undefined ? undefined : sentIds[position];
      const index = listed.findIndex(({ id }) => id === courseId);
      const rowError = position === undefined ? undefined : rows[position];
      if (index >= 0) {
        target =
          rowError?.sessionsPerWeek && !rowError.courseId && !rowError.whole
            ? sessionsId(index)
            : courseBoxId(index);
      }
    }
    if (target) {
      document.getElementById(target)?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setGeneralError(false);
    setNameTaken(false);
    setCodeTaken(false);

    // Los cursos marcados que siguen en la lista, en su orden.
    const sentIds = listed.filter(({ id }) => selected[id] !== undefined).map(({ id }) => id);
    const draft: SubjectDraft = {
      ...values,
      courses: sentIds.map((courseId) => ({
        courseId,
        sessionsPerWeek: selected[courseId] ?? DEFAULT_SESSIONS_PER_WEEK,
      })),
    };

    const details = validateSubject(draft);
    if (details.length > 0) {
      isSubmittingRef.current = false;
      showErrors(groupSubjectErrors(details), sentIds);
      return;
    }
    setErrors({});
    setRowErrors({});

    setIsPending(true);
    const result = await onSubmit(draft);
    isSubmittingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setIsPending(false);
    switch (result.status) {
      case 'done':
        break;
      case 'validationError':
        showErrors(result.errors, sentIds);
        break;
      case 'nameTaken':
        setNameTaken(true);
        document.getElementById(fieldId('name'))?.focus();
        break;
      case 'codeTaken':
        setCodeTaken(true);
        document.getElementById(fieldId('code'))?.focus();
        break;
      case 'failed':
        setGeneralError(true);
        break;
    }
  }

  /** Un error bajo su campo, ligado por `aria-describedby`. */
  function feedback(field: ErrorField, message: string | undefined) {
    return (
      message && (
        <Form.Control.Feedback type="invalid" id={errorId(field)} className="d-block">
          {message}
        </Form.Control.Feedback>
      )
    );
  }

  const describedBy = (field: ErrorField, hint: boolean, message: string | undefined) =>
    [hint ? hintId(field) : null, message ? errorId(field) : null].filter(Boolean).join(' ') ||
    undefined;

  const nameMessage = messageOf('name');
  const codeMessage = messageOf('code');
  const typeMessage = messageOf('type');
  const statusMessage = messageOf('status');
  const descriptionMessage = messageOf('description');
  const colorMessage = messageOf('color');
  const coursesMessage = messageOf('courses');
  const canSave = courses.status === 'loaded' && courses.courses.length > 0;
  // Lo que se enviaría ahora, derivado como en `handleSubmit`: los cursos marcados que siguen en la lista.
  const wouldSend: SubjectDraft = {
    ...values,
    courses: listed
      .filter(({ id }) => selected[id] !== undefined)
      .map(({ id }) => ({
        courseId: id,
        sessionsPerWeek: selected[id] ?? DEFAULT_SESSIONS_PER_WEEK,
      })),
  };
  const unchanged = requireChanges && !hasSubjectChanges(loaded, wouldSend);
  // Una asignatura que se quedó sin cursos lo avisa hasta que se marca alguno.
  const showEmptyNotice =
    requireChanges && loaded.courses.length === 0 && Object.keys(selected).length === 0;
  const coursesDescribedBy =
    [describedBy('courses', true, coursesMessage), showEmptyNotice ? emptyNoticeId : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <>
      {generalError && (
        <Alert variant="danger" role="alert">
          {failureMessage ?? t('subjects.form.errors.unavailable')}
        </Alert>
      )}

      <Form noValidate onSubmit={(event) => void handleSubmit(event)}>
        <Form.Group className="mb-3" controlId={fieldId('name')}>
          <Form.Label>{t('subjects.form.name')}</Form.Label>
          <Form.Control
            type="text"
            autoComplete="off"
            value={values.name}
            isInvalid={Boolean(nameMessage)}
            aria-invalid={Boolean(nameMessage)}
            aria-required="true"
            aria-describedby={describedBy('name', true, nameMessage)}
            onChange={(event) => {
              setValue('name', event.target.value);
            }}
          />
          <Form.Text id={hintId('name')} muted>
            {t('subjects.form.nameHint')}
          </Form.Text>
          {feedback('name', nameMessage)}
        </Form.Group>

        <Form.Group className="mb-3" controlId={fieldId('code')}>
          <Form.Label>{t('subjects.form.code')}</Form.Label>
          <Form.Control
            type="text"
            autoComplete="off"
            value={values.code}
            isInvalid={Boolean(codeMessage)}
            aria-invalid={Boolean(codeMessage)}
            aria-describedby={describedBy('code', true, codeMessage)}
            onChange={(event) => {
              setValue('code', event.target.value);
            }}
          />
          <Form.Text id={hintId('code')} muted>
            {t('subjects.form.codeHint')}
          </Form.Text>
          {feedback('code', codeMessage)}
        </Form.Group>

        <Form.Group className="mb-3" controlId={fieldId('type')}>
          <Form.Label>{t('subjects.form.type')}</Form.Label>
          <Form.Select
            value={values.type}
            isInvalid={Boolean(typeMessage)}
            aria-invalid={Boolean(typeMessage)}
            aria-required="true"
            aria-describedby={describedBy('type', false, typeMessage)}
            onChange={(event) => {
              setValue('type', event.target.value as SubjectDraft['type']);
            }}
          >
            <option value="">{t('subjects.form.typeChoose')}</option>
            {SUBJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`subjects.types.${type}`)}
              </option>
            ))}
          </Form.Select>
          {feedback('type', typeMessage)}
        </Form.Group>

        <Form.Group className="mb-3" controlId={fieldId('status')}>
          <Form.Label>{t('subjects.form.status')}</Form.Label>
          <Form.Select
            value={values.status}
            isInvalid={Boolean(statusMessage)}
            aria-invalid={Boolean(statusMessage)}
            aria-required="true"
            aria-describedby={describedBy('status', false, statusMessage)}
            onChange={(event) => {
              setValue('status', event.target.value as SubjectDraft['status']);
            }}
          >
            {SUBJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`subjects.statuses.${status}`)}
              </option>
            ))}
          </Form.Select>
          {feedback('status', statusMessage)}
        </Form.Group>

        <Form.Group className="mb-3" controlId={fieldId('description')}>
          <Form.Label>{t('subjects.form.description')}</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={values.description}
            isInvalid={Boolean(descriptionMessage)}
            aria-invalid={Boolean(descriptionMessage)}
            aria-describedby={describedBy('description', true, descriptionMessage)}
            onChange={(event) => {
              setValue('description', event.target.value);
            }}
          />
          <Form.Text id={hintId('description')} muted>
            {t('subjects.form.descriptionHint')}
          </Form.Text>
          {feedback('description', descriptionMessage)}
        </Form.Group>

        <fieldset className="mb-3" aria-describedby={describedBy('color', true, colorMessage)}>
          <legend className="fs-6">{t('subjects.form.color')}</legend>
          <div className="d-flex flex-wrap gap-3">
            {SUBJECT_COLORS.map((color) => (
              <Form.Check
                key={color}
                type="radio"
                name="subject-color"
                id={colorId(color)}
                checked={values.color === color}
                onChange={() => {
                  setValue('color', color);
                }}
                label={
                  <span className="d-inline-flex align-items-center gap-2">
                    <SubjectColorSwatch color={color} decorative />
                    {t(`subjects.colors.${color}`)}
                  </span>
                }
              />
            ))}
          </div>
          <Form.Text id={hintId('color')} muted>
            {t('subjects.form.colorHint')}
          </Form.Text>
          {feedback('color', colorMessage)}
        </fieldset>

        <fieldset className="mb-4" aria-describedby={coursesDescribedBy}>
          <legend className="fs-6">{t('subjects.form.courses.legend')}</legend>
          <Form.Text id={hintId('courses')} muted className="d-block mb-2">
            {t('subjects.form.courses.hint')}
          </Form.Text>
          {showEmptyNotice && (
            <Form.Text id={emptyNoticeId} className="d-block mb-2 text-body">
              {t('subjects.form.courses.emptySubject')}
            </Form.Text>
          )}

          {courses.status === 'loading' && (
            <p role="status" className="text-body-secondary">
              {t('subjects.form.courses.loading')}
            </p>
          )}
          {courses.status === 'error' && (
            <Alert variant="warning" role="alert">
              <p className="mb-2">{t('subjects.form.courses.loadError')}</p>
              <Button variant="outline-secondary" size="sm" onClick={onRetryCourses}>
                {t('subjects.form.courses.retry')}
              </Button>
            </Alert>
          )}
          {courses.status === 'loaded' && courses.courses.length === 0 && (
            <p>
              {t('subjects.form.courses.none')}{' '}
              <Link to="/cursos">{t('subjects.form.courses.goToCourses')}</Link>
            </p>
          )}

          {listed.map((course, index) => {
            const isChecked = selected[course.id] !== undefined;
            const courseMessage = rowMessage(course.id, 'courseId');
            const sessionsMessage = rowMessage(course.id, 'sessionsPerWeek');
            // Lo que se borraría al guardar: las reglas y las asignaciones del curso que la asignatura ya tenía y se
            // desmarcó.
            const lost = lostItemsText(t, i18n.language, {
              rules: ruleCounts?.[course.id] ?? 0,
              assignments: assignmentCounts?.[course.id] ?? 0,
            });
            return (
              <div key={course.id} className="mb-2">
                <div className="d-flex flex-wrap align-items-center gap-3">
                  <Form.Check
                    type="checkbox"
                    id={courseBoxId(index)}
                    label={course.name}
                    checked={isChecked}
                    aria-invalid={Boolean(courseMessage)}
                    aria-describedby={
                      courseMessage
                        ? `${courseBoxId(index)}-error`
                        : lost !== null && !isChecked
                          ? `${courseBoxId(index)}-lost`
                          : undefined
                    }
                    onChange={(event) => {
                      toggleCourse(course.id, event.target.checked);
                    }}
                  />
                  {isChecked && (
                    <Form.Select
                      size="sm"
                      className="w-auto"
                      id={sessionsId(index)}
                      aria-label={t('subjects.form.courses.sessions', { course: course.name })}
                      value={selected[course.id]}
                      isInvalid={Boolean(sessionsMessage)}
                      aria-invalid={Boolean(sessionsMessage)}
                      aria-describedby={sessionsMessage ? `${sessionsId(index)}-error` : undefined}
                      onChange={(event) => {
                        setSessions(course.id, Number(event.target.value));
                      }}
                    >
                      {Array.from(
                        { length: MAX_SESSIONS_PER_WEEK - MIN_SESSIONS_PER_WEEK + 1 },
                        (_value, offset) => MIN_SESSIONS_PER_WEEK + offset,
                      ).map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </Form.Select>
                  )}
                </div>
                {lost !== null && !isChecked && (
                  <small id={`${courseBoxId(index)}-lost`} className="d-block text-danger-emphasis">
                    {t('subjects.form.courses.lose', {
                      count: lost.total,
                      items: lost.items,
                      course: course.name,
                    })}
                  </small>
                )}
                {courseMessage && (
                  <Form.Control.Feedback
                    type="invalid"
                    id={`${courseBoxId(index)}-error`}
                    className="d-block"
                  >
                    {courseMessage}
                  </Form.Control.Feedback>
                )}
                {sessionsMessage && (
                  <Form.Control.Feedback
                    type="invalid"
                    id={`${sessionsId(index)}-error`}
                    className="d-block"
                  >
                    {sessionsMessage}
                  </Form.Control.Feedback>
                )}
              </div>
            );
          })}
          {feedback('courses', coursesMessage)}
        </fieldset>

        <div className="d-flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={isPending || !canSave || unchanged}>
            {isPending ? t('subjects.form.saving') : t('subjects.form.save')}
          </Button>
          <Link to="/asignaturas" className="btn btn-outline-secondary">
            {t('subjects.form.cancel')}
          </Link>
        </div>
      </Form>
    </>
  );
}
