import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { MunicipalitySearch } from '../components/MunicipalitySearch';
import { useMunicipalities } from '../hooks/useMunicipalities';
import { registrationService, type FieldError } from '../services/registrationService';
import {
  REGISTRATION_FIELDS,
  validateRegistration,
  type RegistrationField,
  type RegistrationFormValues,
} from '../validation/registrationValidation';

/**
 * Token de captcha provisional: US01_e lo sustituye por el widget de reCAPTCHA. El backend
 * actual acepta cualquier token.
 */
const PROVISIONAL_CAPTCHA = { version: 'v3', token: 'provisional-captcha-token' } as const;

const EMPTY_VALUES: RegistrationFormValues = {
  schoolName: '',
  municipalityCode: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
};

/** Error de un campo que viene del servidor: un código de campo o un duplicado (`409`). */
type ServerFieldError =
  { kind: 'code'; code: string } | { kind: 'emailTaken' } | { kind: 'schoolTaken' };
type ServerFieldErrors = Partial<Record<RegistrationField, ServerFieldError>>;

const inputId = (field: RegistrationField) => `registration-${field}`;
const errorId = (field: RegistrationField) => `registration-${field}-error`;
const isRegistrationField = (name: string): name is RegistrationField =>
  (REGISTRATION_FIELDS as readonly string[]).includes(name);

/** Página de registro: crea el colegio y su usuario administrador (US01_b). */
export function RegisterPage() {
  const { t } = useTranslation();
  const municipalities = useMunicipalities();
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<RegistrationFormValues>(EMPTY_VALUES);
  const [touched, setTouched] = useState<Partial<Record<RegistrationField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ServerFieldErrors>({});
  const [hasUnexpectedError, setHasUnexpectedError] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isCreated, setIsCreated] = useState(false);

  const clientErrors = validateRegistration(values);

  /** Qué mostrar bajo un campo: primero el error del servidor y después el de validación. */
  function errorContent(field: RegistrationField): ReactNode {
    const server = serverErrors[field];
    if (server?.kind === 'emailTaken') {
      return (
        <>
          {t('registration.server.emailAlreadyRegistered')}{' '}
          <Link to="/login">{t('registration.server.goToLogin')}</Link>
        </>
      );
    }
    if (server?.kind === 'schoolTaken') {
      return t('registration.server.schoolAlreadyRegistered');
    }
    const code =
      server?.kind === 'code' ? server.code : (touched[field] || submitted) && clientErrors[field];
    if (!code) {
      return undefined;
    }
    return t(`registration.errors.${field}.${code}`, {
      defaultValue: t('registration.errors.invalidField'),
    });
  }

  function describedBy(field: RegistrationField, hasError: boolean): string | undefined {
    const ids = [
      field === 'password' ? 'registration-password-hint' : undefined,
      hasError ? errorId(field) : undefined,
    ].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
  }

  function setValue(field: RegistrationField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // Editar un campo descarta el error que el servidor le había asignado.
    setServerErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
  }

  function touch(field: RegistrationField) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) {
      return;
    }
    setSubmitted(true);
    setHasUnexpectedError(false);

    const firstInvalid = REGISTRATION_FIELDS.find((field) => clientErrors[field]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#${inputId(firstInvalid)}`)?.focus();
      return;
    }

    setServerErrors({});
    setIsPending(true);
    const outcome = await registrationService.register({ ...values, captcha: PROVISIONAL_CAPTCHA });
    setIsPending(false);

    switch (outcome.status) {
      case 'created':
        setIsCreated(true);
        break;
      case 'validation':
        setServerErrors(serverErrorsFrom(outcome.details));
        break;
      case 'emailAlreadyRegistered':
        setServerErrors({ email: { kind: 'emailTaken' } });
        break;
      case 'schoolAlreadyRegistered':
        setServerErrors({ schoolName: { kind: 'schoolTaken' } });
        break;
      case 'unexpected':
        // Se conservan los datos, salvo la contraseña, que no debe quedar en pantalla.
        setHasUnexpectedError(true);
        setValue('password', '');
        // La contraseña vacía no debe mostrar un error hasta que el usuario vuelva a enviarla.
        setSubmitted(false);
        setTouched((current) => ({ ...current, password: false }));
        break;
    }
  }

  if (isCreated) {
    return (
      <Container as="main" className="py-5" data-testid="register-page">
        <Alert variant="success" role="status" data-testid="registration-success">
          <Alert.Heading as="h1">{t('registration.success.title')}</Alert.Heading>
          <p className="mb-0">{t('registration.success.message')}</p>
        </Alert>
      </Container>
    );
  }

  function textField(
    field: Exclude<RegistrationField, 'municipalityCode'>,
    props: {
      type?: string;
      autoComplete: string;
    },
  ) {
    const error = errorContent(field);
    return (
      <Form.Group className="mb-3" controlId={inputId(field)}>
        <Form.Label>{t(`registration.fields.${field}.label`)}</Form.Label>
        <Form.Control
          type={props.type ?? 'text'}
          autoComplete={props.autoComplete}
          value={values[field]}
          isInvalid={Boolean(error)}
          aria-invalid={Boolean(error)}
          aria-required="true"
          aria-describedby={describedBy(field, Boolean(error))}
          onChange={(event) => {
            setValue(field, event.target.value);
          }}
          onBlur={() => {
            touch(field);
          }}
        />
        {field === 'password' && (
          <Form.Text id="registration-password-hint" muted>
            {t('registration.fields.password.hint')}
          </Form.Text>
        )}
        {error && (
          <Form.Control.Feedback
            type="invalid"
            id={errorId(field)}
            role="alert"
            className="d-block"
          >
            {error}
          </Form.Control.Feedback>
        )}
      </Form.Group>
    );
  }

  const municipalityError = errorContent('municipalityCode');

  return (
    <Container as="main" className="py-5" data-testid="register-page">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <h1>{t('registration.title')}</h1>
          <p className="lead">{t('registration.description')}</p>

          {hasUnexpectedError && (
            <Alert variant="danger" role="alert">
              {t('registration.server.unexpected')}
            </Alert>
          )}

          <Form ref={formRef} noValidate onSubmit={(event) => void handleSubmit(event)}>
            {textField('schoolName', { autoComplete: 'organization' })}

            <Form.Group className="mb-3">
              <Form.Label htmlFor={inputId('municipalityCode')}>
                {t('registration.fields.municipalityCode.label')}
              </Form.Label>
              {municipalities.status === 'ready' && (
                <MunicipalitySearch
                  id={inputId('municipalityCode')}
                  municipalities={municipalities.municipalities}
                  value={values.municipalityCode}
                  onChange={(code) => {
                    setValue('municipalityCode', code);
                  }}
                  onBlur={() => {
                    touch('municipalityCode');
                  }}
                  isInvalid={Boolean(municipalityError)}
                  aria-describedby={describedBy('municipalityCode', Boolean(municipalityError))}
                />
              )}
              {municipalities.status === 'loading' && (
                <div role="status" className="form-text">
                  {t('registration.municipalities.loading')}
                </div>
              )}
              {municipalities.status === 'error' && (
                <div>
                  <Alert variant="warning" className="mb-2">
                    {t('registration.municipalities.loadError')}
                  </Alert>
                  <Button variant="outline-secondary" size="sm" onClick={municipalities.retry}>
                    {t('registration.municipalities.retry')}
                  </Button>
                </div>
              )}
              {municipalityError && (
                <Form.Control.Feedback
                  type="invalid"
                  id={errorId('municipalityCode')}
                  role="alert"
                  className="d-block"
                >
                  {municipalityError}
                </Form.Control.Feedback>
              )}
            </Form.Group>

            {textField('firstName', { autoComplete: 'given-name' })}
            {textField('lastName', { autoComplete: 'family-name' })}
            {textField('email', { type: 'email', autoComplete: 'email' })}
            {textField('password', { type: 'password', autoComplete: 'new-password' })}

            <Button
              type="submit"
              variant="primary"
              disabled={isPending || municipalities.status !== 'ready'}
            >
              {isPending ? t('registration.submitting') : t('registration.submit')}
            </Button>
          </Form>
        </Col>
      </Row>
    </Container>
  );
}

/** Errores del servidor por campo; los campos que el formulario no tiene se ignoran. */
function serverErrorsFrom(details: FieldError[]): ServerFieldErrors {
  const errors: ServerFieldErrors = {};
  for (const { field, code } of details) {
    if (isRegistrationField(field)) {
      errors[field] = { kind: 'code', code };
    }
  }
  return errors;
}
