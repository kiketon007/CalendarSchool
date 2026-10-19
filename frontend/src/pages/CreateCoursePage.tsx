import { useEffect, useRef, useState, type FormEvent } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { coursesService } from '../services/coursesService';
import { useSession } from '../session/SessionProvider';
import {
  MAX_CLASSES,
  MAX_CLASS_NAME,
  MAX_COURSE_NAME,
  courseErrorsFromServer,
  validateCourse,
  type CourseErrors,
  type FieldErrorCode,
} from '../validation/courseValidation';

const NAME_ID = 'course-name';
const NAME_ERROR_ID = 'course-name-error';
const CLASSES_HINT_ID = 'classes-hint';
const CLASSES_ERROR_ID = 'classes-error';

/** Una fila de clase: la `key` identifica la fila aunque cambie su posición al quitar otras. */
interface ClassRow {
  key: number;
  value: string;
}

const NO_ERRORS: CourseErrors = { classNames: [] };

/**
 * Formulario para crear un curso con sus clases (US05): cuelga de `AuthenticatedLayout` y lo usan los
 * dos roles. Valida con las mismas reglas que el backend antes de enviar, protege el envío con una
 * guarda síncrona contra la doble pulsación y, con el `201`, vuelve al listado con el nombre del curso
 * para el aviso. Un `400` marca los campos que el servidor rechaza; un `409`, el nombre; cualquier otro
 * fallo muestra un aviso genérico y conserva lo escrito. Todavía no se asigna tutor: no hay profesores.
 */
export function CreateCoursePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { authorizedFetch } = useSession();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<ClassRow[]>([{ key: 1, value: '' }]);
  const [errors, setErrors] = useState<CourseErrors>(NO_ERRORS);
  const [nameTaken, setNameTaken] = useState(false);
  const [generalError, setGeneralError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const nextKey = useRef(2);
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
    const outcome = await coursesService.create(authorizedFetch, { name, classNames });
    isSubmittingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setIsPending(false);
    switch (outcome.status) {
      case 'created':
        void navigate('/cursos', { replace: true, state: { courseCreated: outcome.course.name } });
        break;
      case 'validationError': {
        const fromServer = courseErrorsFromServer(outcome.details, rows.length);
        setErrors(fromServer);
        focusFirstInvalid(fromServer, false);
        break;
      }
      case 'alreadyExists':
        setNameTaken(true);
        document.getElementById(NAME_ID)?.focus();
        break;
      case 'unauthenticated':
        // `AuthenticatedLayout` ya lleva a /login al quedar la sesión sin validez.
        break;
      case 'unavailable':
        setGeneralError(true);
        break;
    }
  }

  const nameError = nameTaken
    ? t('courses.form.errors.alreadyExists')
    : errors.name
      ? errorText('name', errors.name, MAX_COURSE_NAME)
      : undefined;

  return (
    <Container as="main" className="py-5" data-testid="create-course-page">
      <h1>{t('courses.form.title')}</h1>

      {generalError && (
        <Alert variant="danger" role="alert">
          {t('courses.form.errors.unavailable')}
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
            const number = index + 1;
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
                      aria-describedby={rowError ? errorId : undefined}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRows((current) =>
                          current.map((item) => (item.key === row.key ? { ...item, value } : item)),
                        );
                        clearRowError(index);
                      }}
                    />
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
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? t('courses.form.saving') : t('courses.form.save')}
          </Button>
          <Link to="/cursos" className="btn btn-outline-secondary">
            {t('courses.form.cancel')}
          </Link>
        </div>
      </Form>
    </Container>
  );
}
