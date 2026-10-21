import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Course } from '../services/coursesService';
import {
  PROFESSOR_FIELDS,
  PROFESSOR_POSITIONS,
  hasProfessorChanges,
  validateProfessor,
  type FieldErrorCode,
  type ProfessorErrors,
  type ProfessorField,
  type ProfessorFormValues,
} from '../validation/professorValidation';

/** Máximo de caracteres del nombre y de los apellidos (las reglas del registro). */
const NAME_MAX = 100;

/** Estado de las clases que se pueden elegir: llegan de la lista de cursos. */
export type CoursesState =
  { status: 'loading' } | { status: 'loaded'; courses: Course[] } | { status: 'error' };

/** Lo que la página responde al formulario tras intentar guardar. */
export type ProfessorSubmitResult =
  /** Guardado: la página ya navegó a otro sitio. */
  | { status: 'done' }
  /** El servidor rechaza campos concretos (`400`). */
  | { status: 'validationError'; errors: ProfessorErrors }
  /** La clase elegida ya tiene tutor (`409`): se marca el campo de la clase. */
  | { status: 'classTaken' }
  /** Cualquier otro fallo: aviso general, conservando lo escrito. */
  | { status: 'failed' };

interface ProfessorFormProps {
  /** Valores con los que empieza el formulario; solo se leen al montarse. */
  initialValues: ProfessorFormValues;
  /** Cursos de los que salen las clases que se pueden elegir. */
  courses: CoursesState;
  /**
   * Qué clases se ofrecen: `free` (por defecto, al crear) solo las que no tienen tutor; `any` (al editar)
   * todas, marcando las que tienen otro tutor y avisando de quién la perderá al elegirlas.
   */
  classMode?: 'free' | 'any';
  /** «Guardar» queda deshabilitado mientras no haya cambios reales respecto a `initialValues`. */
  requireChanges?: boolean;
  /** Texto del aviso general si no se puede guardar; por defecto, el de la creación. */
  failureMessage?: string;
  /** Guarda los valores (ya validados). La guarda contra el doble envío es del formulario. */
  onSubmit: (values: ProfessorFormValues) => Promise<ProfessorSubmitResult>;
}

const fieldId = (field: ProfessorField) => `professor-${field}`;
const errorId = (field: ProfessorField) => `${fieldId(field)}-error`;

/**
 * Formulario de un profesor (US09), compartido por la creación y, desde US12, por la edición. Valida con
 * las reglas del backend antes de enviar, protege el envío con una guarda síncrona contra la doble
 * pulsación y muestra el error de cada campo bajo él, con el foco en el primero inválido. Ofrece, agrupadas
 * por curso, las clases que todavía no tienen tutor; si los cursos no se pueden cargar, el campo de la
 * clase se desactiva con un aviso y el formulario sigue sirviendo sin clase. La página decide qué llamar
 * y qué hacer con cada resultado (`ProfessorSubmitResult`).
 */
export function ProfessorForm({
  initialValues,
  courses,
  classMode = 'free',
  requireChanges = false,
  failureMessage,
  onSubmit,
}: ProfessorFormProps) {
  const { t, i18n } = useTranslation();
  const [initial] = useState<ProfessorFormValues>(initialValues);
  const [values, setValues] = useState<ProfessorFormValues>(initialValues);
  const [errors, setErrors] = useState<ProfessorErrors>({});
  const [classTaken, setClassTaken] = useState(false);
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

  /**
   * Los cursos con alguna clase que se pueda elegir: en `free`, solo las clases sin tutor; en `any`,
   * todas. Los cursos que se quedan sin clases no se ofrecen.
   */
  const offeredCourses = useMemo(
    () =>
      courses.status === 'loaded'
        ? courses.courses
            .map((course) => ({
              ...course,
              classes:
                classMode === 'any'
                  ? course.classes
                  : course.classes.filter((schoolClass) => schoolClass.tutor === null),
            }))
            .filter((course) => course.classes.length > 0)
        : [],
    [courses, classMode],
  );

  /** Texto de una clase en el desplegable: en `any`, la que tiene otro tutor lo indica. */
  function classLabel(schoolClass: Course['classes'][number]): string {
    return classMode === 'any' && schoolClass.tutor !== null && schoolClass.id !== initial.classId
      ? t('professors.edit.classOtherTutor', {
          className: schoolClass.name,
          tutor: `${schoolClass.tutor.firstName} ${schoolClass.tutor.lastName}`,
        })
      : schoolClass.name;
  }

  /** La clase elegida si tiene otro tutor, con su curso: quien la perderá al guardar. */
  function findDisplacedTutor() {
    if (classMode !== 'any' || values.classId === '' || values.classId === initial.classId) {
      return undefined;
    }
    for (const course of offeredCourses) {
      const schoolClass = course.classes.find(({ id }) => id === values.classId);
      if (schoolClass?.tutor) {
        return {
          tutor: `${schoolClass.tutor.firstName} ${schoolClass.tutor.lastName}`,
          course: course.name,
          className: schoolClass.name,
        };
      }
    }
    return undefined;
  }
  const displacedTutor = findDisplacedTutor();

  function setValue(field: ProfessorField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === 'classId') {
      setClassTaken(false);
    }
  }

  /** Texto del error de un campo; un código que la interfaz no conoce usa el texto genérico del campo. */
  function errorText(field: ProfessorField, code: FieldErrorCode): string {
    const key = `professors.form.errors.${field}.${code}`;
    return i18n.exists(key)
      ? t(key, { max: NAME_MAX })
      : t(`professors.form.errors.${field}.fallback`);
  }

  function messageOf(field: ProfessorField): string | undefined {
    if (field === 'classId' && classTaken) {
      return t('professors.form.errors.classId.alreadyHasTutor');
    }
    const code = errors[field];
    return code ? errorText(field, code) : undefined;
  }

  function focusFirstInvalid(found: ProfessorErrors) {
    const first = PROFESSOR_FIELDS.find((field) => found[field] !== undefined);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setGeneralError(false);
    setClassTaken(false);

    const found = validateProfessor(values);
    if (found) {
      setErrors(found);
      isSubmittingRef.current = false;
      focusFirstInvalid(found);
      return;
    }
    setErrors({});

    setIsPending(true);
    const result = await onSubmit(values);
    isSubmittingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setIsPending(false);
    switch (result.status) {
      case 'done':
        break;
      case 'validationError':
        setErrors(result.errors);
        focusFirstInvalid(result.errors);
        break;
      case 'classTaken':
        setClassTaken(true);
        document.getElementById(fieldId('classId'))?.focus();
        break;
      case 'failed':
        setGeneralError(true);
        break;
    }
  }

  const classHintId = 'professor-classId-hint';
  const classReplaceId = 'professor-classId-replace';
  const classMessage = messageOf('classId');
  const classUnavailable = courses.status !== 'loaded' || offeredCourses.length === 0;
  const hasAnyClass =
    courses.status === 'loaded' && courses.courses.some((course) => course.classes.length > 0);
  const classNotice =
    courses.status === 'loading'
      ? t('professors.form.classesLoading')
      : courses.status === 'error'
        ? t('professors.form.classesLoadError')
        : classMode === 'any'
          ? hasAnyClass
            ? t('professors.edit.classHint')
            : t('professors.form.noCourses')
          : courses.courses.length === 0
            ? t('professors.form.noCourses')
            : offeredCourses.length === 0
              ? t('professors.form.noFreeClasses')
              : t('professors.form.classHint');
  const classDescribedBy = [
    classHintId,
    ...(displacedTutor ? [classReplaceId] : []),
    ...(classMessage ? [errorId('classId')] : []),
  ].join(' ');

  /** Un campo de texto con su etiqueta y su error. */
  function textField(field: 'firstName' | 'lastName') {
    const message = messageOf(field);
    return (
      <Form.Group className="mb-3" controlId={fieldId(field)}>
        <Form.Label>{t(`professors.form.${field}`)}</Form.Label>
        <Form.Control
          type="text"
          autoComplete="off"
          value={values[field]}
          isInvalid={Boolean(message)}
          aria-invalid={Boolean(message)}
          aria-required="true"
          aria-describedby={message ? errorId(field) : undefined}
          onChange={(event) => {
            setValue(field, event.target.value);
          }}
        />
        {message && (
          <Form.Control.Feedback type="invalid" id={errorId(field)} className="d-block">
            {message}
          </Form.Control.Feedback>
        )}
      </Form.Group>
    );
  }

  const positionMessage = messageOf('position');

  return (
    <>
      {generalError && (
        <Alert variant="danger" role="alert">
          {failureMessage ?? t('professors.form.errors.unavailable')}
        </Alert>
      )}

      <Form noValidate onSubmit={(event) => void handleSubmit(event)}>
        {textField('firstName')}
        {textField('lastName')}

        <Form.Group className="mb-3" controlId={fieldId('position')}>
          <Form.Label>{t('professors.form.position')}</Form.Label>
          <Form.Select
            value={values.position}
            isInvalid={Boolean(positionMessage)}
            aria-invalid={Boolean(positionMessage)}
            aria-describedby={positionMessage ? errorId('position') : undefined}
            onChange={(event) => {
              setValue('position', event.target.value);
            }}
          >
            <option value="">{t('professors.form.positionNone')}</option>
            {PROFESSOR_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {t(`professors.positions.${position}`)}
              </option>
            ))}
          </Form.Select>
          {positionMessage && (
            <Form.Control.Feedback type="invalid" id={errorId('position')} className="d-block">
              {positionMessage}
            </Form.Control.Feedback>
          )}
        </Form.Group>

        <Form.Group className="mb-4" controlId={fieldId('classId')}>
          <Form.Label>{t('professors.form.class')}</Form.Label>
          <Form.Select
            value={values.classId}
            disabled={classUnavailable}
            isInvalid={Boolean(classMessage)}
            aria-invalid={Boolean(classMessage)}
            aria-describedby={classDescribedBy}
            onChange={(event) => {
              setValue('classId', event.target.value);
            }}
          >
            <option value="">{t('professors.form.classNone')}</option>
            {offeredCourses.map((course) => (
              <optgroup key={course.id} label={course.name}>
                {course.classes.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {classLabel(schoolClass)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Form.Select>
          <Form.Text id={classHintId} muted>
            {classNotice}
          </Form.Text>
          {displacedTutor && (
            <Form.Text id={classReplaceId} className="d-block text-warning-emphasis">
              {t('professors.edit.replaceNotice', displacedTutor)}
            </Form.Text>
          )}
          {classMessage && (
            <Form.Control.Feedback type="invalid" id={errorId('classId')} className="d-block">
              {classMessage}
            </Form.Control.Feedback>
          )}
        </Form.Group>

        <div className="d-flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={isPending || (requireChanges && !hasProfessorChanges(initial, values))}
          >
            {isPending ? t('professors.form.saving') : t('professors.form.save')}
          </Button>
          <Link to="/profesores" className="btn btn-outline-secondary">
            {t('professors.form.cancel')}
          </Link>
        </div>
      </Form>
    </>
  );
}
