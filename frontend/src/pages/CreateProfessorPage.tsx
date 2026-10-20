import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { coursesService, type Course } from '../services/coursesService';
import { professorsService } from '../services/professorsService';
import { useSession } from '../session/SessionProvider';
import {
  PROFESSOR_FIELDS,
  PROFESSOR_POSITIONS,
  professorErrorsFromServer,
  validateProfessor,
  type FieldErrorCode,
  type ProfessorErrors,
  type ProfessorField,
  type ProfessorFormValues,
} from '../validation/professorValidation';

/** Máximo de caracteres del nombre y de los apellidos (las reglas del registro). */
const NAME_MAX = 100;

const EMPTY_VALUES: ProfessorFormValues = {
  firstName: '',
  lastName: '',
  position: '',
  classId: '',
};

/** Estado de las clases que se pueden elegir: llegan de la lista de cursos. */
type CoursesState =
  { status: 'loading' } | { status: 'loaded'; courses: Course[] } | { status: 'error' };

const fieldId = (field: ProfessorField) => `professor-${field}`;
const errorId = (field: ProfessorField) => `${fieldId(field)}-error`;

/**
 * Página para crear un profesor (US09): cuelga de `AuthenticatedLayout` y la usan los dos roles. Pide la
 * lista de cursos una sola vez para ofrecer, agrupadas por curso, las clases que todavía no tienen
 * tutor; si no se puede cargar, el campo de la clase se desactiva con un aviso y el formulario sigue
 * sirviendo sin clase. Valida con las reglas del backend antes de enviar, protege el envío con una guarda
 * síncrona contra la doble pulsación y muestra el error de cada campo bajo él, con el foco en el primero
 * inválido. Con el `201` vuelve al listado con el nombre del profesor para el aviso; un `409` marca la
 * clase (otra persona le puso tutor antes) y cualquier otro fallo muestra un aviso general conservando
 * lo escrito.
 */
export function CreateProfessorPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();
  const [values, setValues] = useState<ProfessorFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<ProfessorErrors>({});
  const [classTaken, setClassTaken] = useState(false);
  const [generalError, setGeneralError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [coursesState, setCoursesState] = useState<CoursesState>({ status: 'loading' });
  // Guarda síncrona: dos pulsaciones seguidas pueden llegar antes de que React repinte el botón.
  const isSubmittingRef = useRef(false);
  // Para no actualizar nada tras desmontar (la respuesta puede llegar con la página ya cerrada).
  const mounted = useRef(false);
  // En modo estricto el efecto se ejecuta dos veces, pero los cursos se piden una.
  const requestedCourses = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (requestedCourses.current) {
      return;
    }
    requestedCourses.current = true;
    void coursesService.list(authorizedFetch).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'loaded':
          setCoursesState({ status: 'loaded', courses: outcome.courses });
          break;
        case 'unauthenticated':
          // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
          break;
        case 'unavailable':
          setCoursesState({ status: 'error' });
          break;
      }
    });
  }, [authorizedFetch]);

  /** Los cursos con alguna clase libre, y de cada uno solo las clases sin tutor. */
  const freeCourses = useMemo(
    () =>
      coursesState.status === 'loaded'
        ? coursesState.courses
            .map((course) => ({
              ...course,
              classes: course.classes.filter((schoolClass) => schoolClass.tutor === null),
            }))
            .filter((course) => course.classes.length > 0)
        : [],
    [coursesState],
  );

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

  function focusFirstInvalid(found: ProfessorErrors, taken: boolean) {
    const first = PROFESSOR_FIELDS.find((field) => found[field] !== undefined);
    const target = first ?? (taken ? 'classId' : undefined);
    if (target) {
      document.getElementById(fieldId(target))?.focus();
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
      focusFirstInvalid(found, false);
      return;
    }
    setErrors({});

    setIsPending(true);
    const outcome = await professorsService.create(authorizedFetch, values);
    isSubmittingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setIsPending(false);
    switch (outcome.status) {
      case 'created':
        void navigate('/profesores', {
          replace: true,
          state: {
            professorCreated: `${outcome.professor.firstName} ${outcome.professor.lastName}`,
          },
        });
        break;
      case 'validationError': {
        const fromServer = professorErrorsFromServer(outcome.details);
        setErrors(fromServer);
        focusFirstInvalid(fromServer, false);
        break;
      }
      case 'classHasTutor':
        setClassTaken(true);
        document.getElementById(fieldId('classId'))?.focus();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'unavailable':
        setGeneralError(true);
        break;
    }
  }

  const classHintId = 'professor-classId-hint';
  const classMessage = messageOf('classId');
  const classUnavailable = coursesState.status !== 'loaded' || freeCourses.length === 0;
  const classNotice =
    coursesState.status === 'loading'
      ? t('professors.form.classesLoading')
      : coursesState.status === 'error'
        ? t('professors.form.classesLoadError')
        : coursesState.courses.length === 0
          ? t('professors.form.noCourses')
          : freeCourses.length === 0
            ? t('professors.form.noFreeClasses')
            : t('professors.form.classHint');

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
    <Container as="main" className="py-5" data-testid="create-professor-page">
      <h1>{t('professors.form.title')}</h1>

      {generalError && (
        <Alert variant="danger" role="alert">
          {t('professors.form.errors.unavailable')}
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
            aria-describedby={classMessage ? `${classHintId} ${errorId('classId')}` : classHintId}
            onChange={(event) => {
              setValue('classId', event.target.value);
            }}
          >
            <option value="">{t('professors.form.classNone')}</option>
            {freeCourses.map((course) => (
              <optgroup key={course.id} label={course.name}>
                {course.classes.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Form.Select>
          <Form.Text id={classHintId} muted>
            {classNotice}
          </Form.Text>
          {classMessage && (
            <Form.Control.Feedback type="invalid" id={errorId('classId')} className="d-block">
              {classMessage}
            </Form.Control.Feedback>
          )}
        </Form.Group>

        <div className="d-flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? t('professors.form.saving') : t('professors.form.save')}
          </Button>
          <Link to="/profesores" className="btn btn-outline-secondary">
            {t('professors.form.cancel')}
          </Link>
        </div>
      </Form>
    </Container>
  );
}
