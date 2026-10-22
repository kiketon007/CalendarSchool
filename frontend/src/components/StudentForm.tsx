import { useEffect, useRef, useState, type FormEvent } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';
import { Link, type To } from 'react-router';
import {
  FOOD_TYPE_MAX_LENGTH,
  hasStudentChanges,
  OBSERVATIONS_MAX_LENGTH,
  STUDENT_FIELDS,
  validateStudent,
  type FieldErrorCode,
  type StudentErrors,
  type StudentField,
  type StudentFormValues,
} from '../validation/studentValidation';
import type { CoursesState } from './ProfessorForm';

/** Máximo de caracteres del nombre y de los apellidos (las reglas del registro). */
const NAME_MAX = 100;

/** Lo que la página responde al formulario tras intentar guardar. */
export type StudentSubmitResult =
  /** Guardado: la página ya navegó a otro sitio. */
  | { status: 'done' }
  /** El servidor rechaza campos concretos (`400`), también un curso o una clase que ya no existen. */
  | { status: 'validationError'; errors: StudentErrors }
  /** Cualquier otro fallo: aviso general, conservando lo escrito. */
  | { status: 'failed' };

interface StudentFormProps {
  /** Valores con los que empieza el formulario; solo se leen al montarse. */
  initialValues: StudentFormValues;
  /** Cursos (con sus clases) entre los que se elige. */
  courses: CoursesState;
  /** Vuelve a pedir los cursos si no se pudieron cargar. */
  onRetryCourses?: () => void;
  /** Texto del aviso general si no se puede guardar; por defecto, el de la creación. */
  failureMessage?: string;
  /** Guarda los valores (ya validados). La guarda contra el doble envío es del formulario. */
  onSubmit: (values: StudentFormValues) => Promise<StudentSubmitResult>;
  /** «Guardar» solo se habilita si lo que se enviaría cambia algo respecto a `initialValues` (la edición). */
  requireChanges?: boolean;
  /** Avisa bajo «Curso», mientras no hay uno elegido, de que el alumno no tiene curso (la edición). */
  courseMissingNotice?: boolean;
  /** A dónde lleva «Cancelar»; por defecto, al listado de alumnos. */
  cancelTo?: To;
}

const fieldId = (field: StudentField) => `student-${field}`;
const errorId = (field: StudentField) => `${fieldId(field)}-error`;
const HELP_ID = 'student-sensitive-help';
const OBSERVATIONS_COUNT_ID = 'student-observations-count';
const CLASS_HINT_ID = 'student-classId-hint';
const COURSE_NOTICE_ID = 'student-courseId-notice';
const COURSE_MISSING_ID = 'student-courseId-missing';

/** Máximo de caracteres que se menciona en el error de un campo de texto. */
const MAX_OF: Partial<Record<StudentField, number>> = {
  firstName: NAME_MAX,
  lastName: NAME_MAX,
  foodType: FOOD_TYPE_MAX_LENGTH,
  observations: OBSERVATIONS_MAX_LENGTH,
};

/**
 * Formulario de un alumno (US14): nombre, apellidos, curso, clase, comedor, beca, tipo de comida y
 * observaciones. La clase depende del curso (desactivada hasta elegirlo y vuelve a «Sin clase» al
 * cambiarlo); el comedor empieza sin respuesta y se exige elegir; la beca y el tipo de comida solo existen
 * con «Sí» y se descartan al pasar a «No». Valida con las reglas del backend al salir de un campo y al
 * enviar, con el error bajo su campo y el foco en el primero inválido, y protege el envío con una guarda
 * síncrona. Si el curso o la clase elegidos dejan de ofrecerse (otra persona los borró) se vacían sin
 * tocar el resto ni los errores. El tipo de comida y las observaciones son datos sensibles: la ayuda
 * pide anotar solo lo necesario. La página decide qué llamar y qué hacer con cada resultado.
 */
export function StudentForm({
  initialValues,
  courses,
  onRetryCourses,
  failureMessage,
  onSubmit,
  requireChanges = false,
  courseMissingNotice = false,
  cancelTo = '/alumnos',
}: StudentFormProps) {
  const { t, i18n } = useTranslation();
  const [values, setValues] = useState<StudentFormValues>(initialValues);
  // Con qué valores se compara para saber si hay cambios: los del montaje, aunque la página repinte.
  const [loadedValues] = useState<StudentFormValues>(initialValues);
  const [errors, setErrors] = useState<StudentErrors>({});
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

  const offeredCourses = courses.status === 'loaded' ? courses.courses : [];
  // Curso y clase que de verdad se ofrecen: si los cursos se recargan sin el que estaba elegido, o sin su
  // clase, se tratan como vacíos (sin tocar lo demás ni los errores que ya se muestran).
  const chosenCourse = offeredCourses.find(({ id }) => id === values.courseId);
  const courseId = chosenCourse ? values.courseId : '';
  const classId = chosenCourse?.classes.some(({ id }) => id === values.classId)
    ? values.classId
    : '';
  const effective: StudentFormValues = { ...values, courseId, classId };
  const coursesReady = courses.status === 'loaded' && courses.courses.length > 0;
  const hasChanges = !requireChanges || hasStudentChanges(loadedValues, effective);

  function setValue<K extends keyof StudentFormValues>(field: K, value: StudentFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function chooseCourse(value: string) {
    setValues((current) => ({ ...current, courseId: value, classId: '' }));
    setErrors((current) => ({ ...current, courseId: undefined, classId: undefined }));
  }

  function chooseCafeteria(value: 'yes' | 'no') {
    // Con «No» la beca y el tipo de comida se descartan; con «Sí» empiezan vacíos.
    setValues((current) => ({
      ...current,
      cafeteria: value,
      scholarship: false,
      foodType: current.cafeteria === 'yes' && value === 'yes' ? current.foodType : '',
    }));
    setErrors((current) => ({
      ...current,
      cafeteria: undefined,
      scholarship: undefined,
      foodType: undefined,
    }));
  }

  /** Valida un campo al salir de él, sin tocar los demás. */
  function validateOnBlur(field: StudentField) {
    const code = validateStudent(effective)?.[field];
    setErrors((current) => ({ ...current, [field]: code }));
  }

  /** Texto del error de un campo; un código que la interfaz no conoce usa el texto genérico del campo. */
  function errorText(field: StudentField, code: FieldErrorCode): string {
    const key = `students.form.errors.${field}.${code}`;
    return i18n.exists(key)
      ? t(key, { max: MAX_OF[field] })
      : t(`students.form.errors.${field}.fallback`);
  }

  function messageOf(field: StudentField): string | undefined {
    const code = errors[field];
    return code ? errorText(field, code) : undefined;
  }

  function focusFirstInvalid(found: StudentErrors) {
    const first = STUDENT_FIELDS.find((field) => found[field] !== undefined);
    if (first) {
      document.getElementById(fieldId(first))?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current || !coursesReady) {
      return;
    }
    isSubmittingRef.current = true;
    setGeneralError(false);

    const found = validateStudent(effective);
    if (found) {
      setErrors(found);
      isSubmittingRef.current = false;
      focusFirstInvalid(found);
      return;
    }
    setErrors({});

    setIsPending(true);
    const result = await onSubmit(effective);
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
      case 'failed':
        setGeneralError(true);
        break;
    }
  }

  const cafeteriaMessage = messageOf('cafeteria');
  const courseMessage = messageOf('courseId');
  const classMessage = messageOf('classId');
  const observationsCount = Array.from(values.observations).length;
  const showCourseMissing = courseMissingNotice && courseId === '';
  const courseNotice =
    courses.status === 'loading'
      ? t('students.form.coursesLoading')
      : courses.status === 'loaded' && courses.courses.length === 0
        ? t('students.form.noCourses')
        : undefined;

  /** Un campo de texto con su etiqueta y su error. */
  function textField(field: 'firstName' | 'lastName') {
    const message = messageOf(field);
    return (
      <Form.Group className="mb-3" controlId={fieldId(field)}>
        <Form.Label>{t(`students.form.${field}`)}</Form.Label>
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
          onBlur={() => {
            validateOnBlur(field);
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

  const foodTypeMessage = messageOf('foodType');
  const observationsMessage = messageOf('observations');
  const sensitiveIds = (field: 'foodType' | 'observations', message: string | undefined) =>
    [
      HELP_ID,
      ...(field === 'observations' ? [OBSERVATIONS_COUNT_ID] : []),
      ...(message ? [errorId(field)] : []),
    ].join(' ');

  return (
    <>
      {generalError && (
        <Alert variant="danger" role="alert">
          {failureMessage ?? t('students.form.errors.unavailable')}
        </Alert>
      )}

      {courses.status === 'error' && (
        <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
          <span>{t('students.form.coursesLoadError')}</span>
          {onRetryCourses && (
            <Button variant="outline-danger" size="sm" onClick={onRetryCourses}>
              {t('students.retry')}
            </Button>
          )}
        </Alert>
      )}

      <Form noValidate onSubmit={(event) => void handleSubmit(event)}>
        {textField('firstName')}
        {textField('lastName')}

        <Form.Group className="mb-3" controlId={fieldId('courseId')}>
          <Form.Label>{t('students.form.course')}</Form.Label>
          <Form.Select
            value={courseId}
            disabled={!coursesReady}
            isInvalid={Boolean(courseMessage)}
            aria-invalid={Boolean(courseMessage)}
            aria-required="true"
            aria-describedby={
              [
                ...(showCourseMissing ? [COURSE_MISSING_ID] : []),
                ...(courseNotice ? [COURSE_NOTICE_ID] : []),
                ...(courseMessage ? [errorId('courseId')] : []),
              ].join(' ') || undefined
            }
            onChange={(event) => {
              chooseCourse(event.target.value);
            }}
          >
            <option value="">{t('students.form.courseChoose')}</option>
            {offeredCourses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Form.Select>
          {showCourseMissing && (
            <Form.Text id={COURSE_MISSING_ID} muted className="d-block">
              {t('students.form.courseMissing')}
            </Form.Text>
          )}
          {courseNotice && (
            <Form.Text id={COURSE_NOTICE_ID} muted>
              {courseNotice}
              {courses.status === 'loaded' && courses.courses.length === 0 && (
                <>
                  {' '}
                  <Link to="/cursos/nuevo">{t('students.form.createCourse')}</Link>
                </>
              )}
            </Form.Text>
          )}
          {courseMessage && (
            <Form.Control.Feedback type="invalid" id={errorId('courseId')} className="d-block">
              {courseMessage}
            </Form.Control.Feedback>
          )}
        </Form.Group>

        <Form.Group className="mb-3" controlId={fieldId('classId')}>
          <Form.Label>{t('students.form.class')}</Form.Label>
          <Form.Select
            value={classId}
            disabled={courseId === ''}
            isInvalid={Boolean(classMessage)}
            aria-invalid={Boolean(classMessage)}
            aria-describedby={
              [
                ...(courseId === '' ? [CLASS_HINT_ID] : []),
                ...(classMessage ? [errorId('classId')] : []),
              ].join(' ') || undefined
            }
            onChange={(event) => {
              setValue('classId', event.target.value);
            }}
          >
            <option value="">{t('students.form.classNone')}</option>
            {(chosenCourse?.classes ?? []).map((schoolClass) => (
              <option key={schoolClass.id} value={schoolClass.id}>
                {schoolClass.name}
              </option>
            ))}
          </Form.Select>
          {courseId === '' && (
            <Form.Text id={CLASS_HINT_ID} muted>
              {t('students.form.classChooseCourse')}
            </Form.Text>
          )}
          {classMessage && (
            <Form.Control.Feedback type="invalid" id={errorId('classId')} className="d-block">
              {classMessage}
            </Form.Control.Feedback>
          )}
        </Form.Group>

        <fieldset className="mb-3">
          <legend className="form-label fs-6">{t('students.form.cafeteria')}</legend>
          <Form.Check
            type="radio"
            inline
            name="student-cafeteria"
            id={fieldId('cafeteria')}
            label={t('students.form.cafeteriaYes')}
            checked={values.cafeteria === 'yes'}
            isInvalid={Boolean(cafeteriaMessage)}
            aria-describedby={cafeteriaMessage ? errorId('cafeteria') : undefined}
            onChange={() => {
              chooseCafeteria('yes');
            }}
          />
          <Form.Check
            type="radio"
            inline
            name="student-cafeteria"
            id={`${fieldId('cafeteria')}-no`}
            label={t('students.form.cafeteriaNo')}
            checked={values.cafeteria === 'no'}
            isInvalid={Boolean(cafeteriaMessage)}
            aria-describedby={cafeteriaMessage ? errorId('cafeteria') : undefined}
            onChange={() => {
              chooseCafeteria('no');
            }}
          />
          {cafeteriaMessage && (
            <Form.Control.Feedback type="invalid" id={errorId('cafeteria')} className="d-block">
              {cafeteriaMessage}
            </Form.Control.Feedback>
          )}
        </fieldset>

        {values.cafeteria === 'yes' && (
          <>
            <Form.Group className="mb-3" controlId={fieldId('scholarship')}>
              <Form.Check
                type="checkbox"
                label={t('students.form.scholarship')}
                checked={values.scholarship}
                onChange={(event) => {
                  setValue('scholarship', event.target.checked);
                }}
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId={fieldId('foodType')}>
              <Form.Label>{t('students.form.foodType')}</Form.Label>
              <Form.Control
                type="text"
                autoComplete="off"
                value={values.foodType}
                isInvalid={Boolean(foodTypeMessage)}
                aria-invalid={Boolean(foodTypeMessage)}
                aria-describedby={sensitiveIds('foodType', foodTypeMessage)}
                onChange={(event) => {
                  setValue('foodType', event.target.value);
                }}
                onBlur={() => {
                  validateOnBlur('foodType');
                }}
              />
              {foodTypeMessage && (
                <Form.Control.Feedback type="invalid" id={errorId('foodType')} className="d-block">
                  {foodTypeMessage}
                </Form.Control.Feedback>
              )}
            </Form.Group>
          </>
        )}

        <Form.Group className="mb-4" controlId={fieldId('observations')}>
          <Form.Label>{t('students.form.observations')}</Form.Label>
          <Form.Control
            as="textarea"
            rows={4}
            value={values.observations}
            isInvalid={Boolean(observationsMessage)}
            aria-invalid={Boolean(observationsMessage)}
            aria-describedby={sensitiveIds('observations', observationsMessage)}
            onChange={(event) => {
              setValue('observations', event.target.value);
            }}
            onBlur={() => {
              validateOnBlur('observations');
            }}
          />
          <Form.Text id={OBSERVATIONS_COUNT_ID} muted className="d-block">
            {t('students.form.observationsCount', {
              count: observationsCount,
              max: OBSERVATIONS_MAX_LENGTH,
            })}
          </Form.Text>
          <Form.Text id={HELP_ID} muted className="d-block">
            {t('students.form.sensitiveHelp')}
          </Form.Text>
          {observationsMessage && (
            <Form.Control.Feedback type="invalid" id={errorId('observations')} className="d-block">
              {observationsMessage}
            </Form.Control.Feedback>
          )}
        </Form.Group>

        <div className="d-flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={isPending || !coursesReady || !hasChanges}
          >
            {isPending ? t('students.form.saving') : t('students.form.save')}
          </Button>
          <Link to={cancelTo} className="btn btn-outline-secondary">
            {t('students.form.cancel')}
          </Link>
        </div>
      </Form>
    </>
  );
}
