import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  invitationAcceptanceService,
  type AcceptOutcome,
  type FieldError,
  type InvitationRole,
} from '../services/invitationAcceptanceService';
import {
  validateField,
  validatePrivacyPolicyAccepted,
  type RegistrationField,
} from '../validation/registrationValidation';

/** Campos de la persona invitada: los del registro, sin los del colegio. */
const FIELDS = ['firstName', 'lastName', 'email', 'password'] as const;
type Field = (typeof FIELDS)[number] & RegistrationField;
type Values = Record<Field, string>;
const EMPTY_VALUES: Values = { firstName: '', lastName: '', email: '', password: '' };

/** Campos que puede señalar el servidor: los de texto y la aceptación de la política de privacidad. */
type ServerField = Field | 'privacyPolicyAccepted';
const isServerField = (name: string): name is ServerField =>
  name === 'privacyPolicyAccepted' || (FIELDS as readonly string[]).includes(name);

const inputId = (field: Field) => `invitation-${field}`;
const errorId = (field: Field) => `invitation-${field}-error`;
const PRIVACY_INPUT_ID = 'invitation-privacyPolicyAccepted';
const PRIVACY_ERROR_ID = 'invitation-privacyPolicyAccepted-error';

/** Error de un campo que viene del servidor: un código de campo o un email ya registrado (`409`). */
type ServerFieldError = { kind: 'code'; code: string } | { kind: 'emailTaken' };

type Notice =
  { kind: 'unavailable' } | { kind: 'tooManyAttempts'; retryAfterMinutes: number | undefined };

type View =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'tooManyAttempts'; retryAfterMinutes: number | undefined }
  | { status: 'unavailable' }
  | { status: 'form'; schoolName: string; role: InvitationRole };

/**
 * Página pública del enlace de invitación (`/invitacion#<token>`, US02_b4). Al montar lee el token
 * del fragmento, lo quita de la barra de direcciones y lo guarda solo en memoria; consulta el colegio
 * y el rol una sola vez (aunque `StrictMode` ejecute el efecto dos veces) y, si el enlace es válido,
 * muestra el formulario con las reglas del registro. Al crear la cuenta lleva a `/login`, sin iniciar
 * sesión. No usa la sesión ni carga recursos de terceros.
 */
export function AcceptInvitationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState<Values>(EMPTY_VALUES);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [isPrivacyAccepted, setIsPrivacyAccepted] = useState(false);
  const [isPrivacyTouched, setIsPrivacyTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<ServerField, ServerFieldError>>>(
    {},
  );
  const [notice, setNotice] = useState<Notice>();
  const [isPending, setIsPending] = useState(false);
  // El token solo vive aquí: en memoria, nunca en el estado persistente, la URL ni el almacenamiento.
  const tokenRef = useRef<string | undefined>(undefined);
  const hasReadTokenRef = useRef(false);
  // Intento ya pedido: en modo estricto el efecto se ejecuta dos veces, pero la consulta se hace una.
  const requestedAttempt = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hasReadTokenRef.current) {
      hasReadTokenRef.current = true;
      const token = window.location.hash.slice(1);
      if (token !== '') {
        tokenRef.current = token;
      }
      // Fuera de la barra de direcciones y del historial; se conserva el estado del router.
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
    }
    if (requestedAttempt.current === attempt) {
      return;
    }
    requestedAttempt.current = attempt;
    const token = tokenRef.current;
    if (token === undefined) {
      void Promise.resolve().then(() => {
        if (mounted.current) {
          setView({ status: 'invalid' });
        }
      });
      return;
    }
    void invitationAcceptanceService.lookup(token).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'found':
          setView({ status: 'form', schoolName: outcome.schoolName, role: outcome.role });
          break;
        case 'invalid':
          setView({ status: 'invalid' });
          break;
        case 'tooManyAttempts':
          setView({ status: 'tooManyAttempts', retryAfterMinutes: outcome.retryAfterMinutes });
          break;
        case 'unavailable':
          setView({ status: 'unavailable' });
          break;
      }
    });
  }, [attempt]);

  function retry() {
    setView({ status: 'loading' });
    setAttempt((current) => current + 1);
  }

  const clientErrors = Object.fromEntries(
    FIELDS.map((field) => [field, validateField(field, values[field])]),
  ) as Record<Field, ReturnType<typeof validateField>>;
  const privacyError =
    serverErrors.privacyPolicyAccepted ||
    ((isPrivacyTouched || submitted) && validatePrivacyPolicyAccepted(isPrivacyAccepted))
      ? t('registration.errors.privacyPolicyAccepted.REQUIRED')
      : undefined;

  /** Qué mostrar bajo un campo: primero el error del servidor y después el de validación. */
  function errorContent(field: Field): ReactNode {
    const server = serverErrors[field];
    if (server?.kind === 'emailTaken') {
      return t('registration.server.emailAlreadyRegistered');
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

  function describedBy(field: Field, hasError: boolean): string | undefined {
    const ids = [
      field === 'password' ? 'invitation-password-hint' : undefined,
      hasError ? errorId(field) : undefined,
    ].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
  }

  /** Editar un campo descarta el error que el servidor le había asignado. */
  function clearServerError(field: ServerField) {
    setServerErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
  }

  function setValue(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    clearServerError(field);
  }

  function applyOutcome(outcome: AcceptOutcome, email: string) {
    switch (outcome.status) {
      case 'accepted':
        // Aceptar no inicia sesión: se lleva a /login con el aviso y el email ya escrito.
        void navigate('/login', { replace: true, state: { accountCreated: true, email } });
        break;
      case 'invalid':
        setView({ status: 'invalid' });
        break;
      case 'emailAlreadyRegistered':
        setServerErrors({ email: { kind: 'emailTaken' } });
        break;
      case 'validationError':
        setServerErrors(serverErrorsFrom(outcome.details));
        break;
      case 'tooManyAttempts':
        setNotice({ kind: 'tooManyAttempts', retryAfterMinutes: outcome.retryAfterMinutes });
        break;
      case 'unavailable':
        setNotice({ kind: 'unavailable' });
        break;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setSubmitted(true);
    setNotice(undefined);
    const token = tokenRef.current;
    const hasClientErrors =
      FIELDS.some((field) => clientErrors[field]) ||
      validatePrivacyPolicyAccepted(isPrivacyAccepted);
    if (token === undefined || hasClientErrors) {
      isSubmittingRef.current = false;
      return;
    }

    setIsPending(true);
    const email = values.email.trim();
    const outcome = await invitationAcceptanceService.accept(token, {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email,
      password: values.password,
      privacyPolicyAccepted: true,
    });
    isSubmittingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setIsPending(false);
    applyOutcome(outcome, email);
  }

  function textField(field: Field, props: { type?: string; autoComplete: string }) {
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
            setTouched((current) => ({ ...current, [field]: true }));
          }}
        />
        {field === 'password' && (
          <Form.Text id="invitation-password-hint" muted>
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

  function tooManyAttemptsText(retryAfterMinutes: number | undefined): string {
    return retryAfterMinutes === undefined
      ? t('acceptInvitation.tooManyAttemptsLater')
      : t('acceptInvitation.tooManyAttempts', { count: retryAfterMinutes });
  }

  function content() {
    switch (view.status) {
      case 'loading':
        return (
          <div role="status" className="d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" aria-hidden="true" />
            <span>{t('acceptInvitation.loading')}</span>
          </div>
        );
      case 'invalid':
        return <p>{t('acceptInvitation.invalid')}</p>;
      case 'tooManyAttempts':
        return <p>{tooManyAttemptsText(view.retryAfterMinutes)}</p>;
      case 'unavailable':
        return (
          <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
            <span className="me-auto">{t('acceptInvitation.lookupError')}</span>
            <Button variant="outline-danger" size="sm" onClick={retry}>
              {t('acceptInvitation.retry')}
            </Button>
          </Alert>
        );
      case 'form':
        return (
          <>
            <p>
              {t('acceptInvitation.invited', {
                school: view.schoolName,
                role: t(`users.role.${view.role}`),
              })}
            </p>
            {notice && (
              <Alert variant="danger" role="alert">
                {notice.kind === 'tooManyAttempts'
                  ? tooManyAttemptsText(notice.retryAfterMinutes)
                  : t('acceptInvitation.submitError')}
              </Alert>
            )}
            <Form noValidate onSubmit={(event) => void handleSubmit(event)}>
              {textField('firstName', { autoComplete: 'given-name' })}
              {textField('lastName', { autoComplete: 'family-name' })}
              {textField('email', { type: 'email', autoComplete: 'email' })}
              {textField('password', { type: 'password', autoComplete: 'new-password' })}

              <Form.Group className="mb-3">
                <Form.Check
                  type="checkbox"
                  id={PRIVACY_INPUT_ID}
                  checked={isPrivacyAccepted}
                  isInvalid={Boolean(privacyError)}
                  aria-required="true"
                  aria-invalid={Boolean(privacyError)}
                  aria-describedby={privacyError ? PRIVACY_ERROR_ID : undefined}
                  onChange={(event) => {
                    setIsPrivacyAccepted(event.target.checked);
                    clearServerError('privacyPolicyAccepted');
                  }}
                  onBlur={() => {
                    setIsPrivacyTouched(true);
                  }}
                  label={
                    <Trans
                      i18nKey="registration.privacyPolicy.label"
                      components={{
                        policyLink: (
                          // El contenido lo pone `Trans` con el texto de i18n.
                          <a href="/privacidad" target="_blank" rel="noopener noreferrer" />
                        ),
                      }}
                    />
                  }
                />
                {privacyError && (
                  <Form.Control.Feedback
                    type="invalid"
                    id={PRIVACY_ERROR_ID}
                    role="alert"
                    className="d-block"
                  >
                    {privacyError}
                  </Form.Control.Feedback>
                )}
              </Form.Group>

              <Button type="submit" variant="primary" disabled={isPending}>
                {isPending ? t('acceptInvitation.submitting') : t('acceptInvitation.submit')}
              </Button>
            </Form>
          </>
        );
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="accept-invitation-page">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <h1>{t('acceptInvitation.title')}</h1>
          {content()}
        </Col>
      </Row>
    </Container>
  );
}

/** Errores del servidor por campo; los campos que el formulario no tiene se ignoran. */
function serverErrorsFrom(details: FieldError[]): Partial<Record<ServerField, ServerFieldError>> {
  const errors: Partial<Record<ServerField, ServerFieldError>> = {};
  for (const { field, code } of details) {
    if (isServerField(field)) {
      errors[field] = { kind: 'code', code };
    }
  }
  return errors;
}
