import { useEffect, useRef, useState, type FormEvent } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  passwordResetService,
  type ConfirmPasswordResetOutcome,
} from '../services/passwordResetService';
import { validateField } from '../validation/registrationValidation';

type Notice =
  { kind: 'unavailable' } | { kind: 'tooManyAttempts'; retryAfterMinutes: number | undefined };

type View =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'tooManyAttempts'; retryAfterMinutes: number | undefined }
  | { status: 'unavailable' }
  | { status: 'form'; schoolName: string; email: string };

const PASSWORD_ID = 'password-reset-password';
const PASSWORD_ERROR_ID = 'password-reset-password-error';
const CONFIRM_ID = 'password-reset-confirm';
const CONFIRM_ERROR_ID = 'password-reset-confirm-error';

/**
 * Página pública del enlace de restablecimiento (`/restablecer#<token>`, US02_c). Al montar lee el
 * token del fragmento, lo quita de la barra de direcciones y lo guarda solo en memoria; consulta el
 * colegio y el email enmascarado una sola vez (aunque `StrictMode` ejecute el efecto dos veces) y, si
 * el enlace es válido, muestra el formulario de la contraseña nueva con las reglas del registro y
 * una repetición para evitar erratas. Al confirmar lleva a `/login`, sin iniciar sesión. No usa la
 * sesión ni carga recursos de terceros.
 */
export function PasswordResetPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [view, setView] = useState<View>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isPasswordTouched, setIsPasswordTouched] = useState(false);
  const [isConfirmTouched, setIsConfirmTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Código de campo que el servidor rechazó; se descarta al editar la contraseña.
  const [serverCode, setServerCode] = useState<string>();
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
    void passwordResetService.lookup(token).then((outcome) => {
      if (!mounted.current) {
        return;
      }
      switch (outcome.status) {
        case 'found':
          setView({ status: 'form', schoolName: outcome.schoolName, email: outcome.email });
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

  const clientCode = validateField('password', password);
  const passwordCode = serverCode ?? (isPasswordTouched || submitted ? clientCode : undefined);
  const passwordError = passwordCode
    ? t(`registration.errors.password.${passwordCode}`, {
        defaultValue: t('registration.errors.invalidField'),
      })
    : undefined;
  const mismatch = password !== confirmation;
  const confirmError =
    (isConfirmTouched || submitted) && mismatch ? t('passwordReset.mismatch') : undefined;

  function applyOutcome(outcome: ConfirmPasswordResetOutcome) {
    switch (outcome.status) {
      case 'confirmed':
        // Confirmar no inicia sesión: se lleva a /login con el aviso.
        void navigate('/login', { replace: true, state: { passwordChanged: true } });
        break;
      case 'invalid':
        setView({ status: 'invalid' });
        break;
      case 'validationError':
        setServerCode(outcome.details.find((detail) => detail.field === 'password')?.code);
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
    if (token === undefined || clientCode !== undefined || mismatch) {
      isSubmittingRef.current = false;
      return;
    }

    setIsPending(true);
    const outcome = await passwordResetService.confirm(token, password);
    isSubmittingRef.current = false;
    if (!mounted.current) {
      return;
    }
    setIsPending(false);
    applyOutcome(outcome);
  }

  function tooManyAttemptsText(retryAfterMinutes: number | undefined): string {
    return retryAfterMinutes === undefined
      ? t('passwordReset.tooManyAttemptsLater')
      : t('passwordReset.tooManyAttempts', { count: retryAfterMinutes });
  }

  function content() {
    switch (view.status) {
      case 'loading':
        return (
          <div role="status" className="d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" aria-hidden="true" />
            <span>{t('passwordReset.loading')}</span>
          </div>
        );
      case 'invalid':
        return <p>{t('passwordReset.invalid')}</p>;
      case 'tooManyAttempts':
        return <p>{tooManyAttemptsText(view.retryAfterMinutes)}</p>;
      case 'unavailable':
        return (
          <Alert variant="danger" role="alert" className="d-flex align-items-center gap-3">
            <span className="me-auto">{t('passwordReset.lookupError')}</span>
            <Button variant="outline-danger" size="sm" onClick={retry}>
              {t('passwordReset.retry')}
            </Button>
          </Alert>
        );
      case 'form':
        return (
          <>
            <p>{t('passwordReset.intro', { school: view.schoolName, email: view.email })}</p>
            {notice && (
              <Alert variant="danger" role="alert">
                {notice.kind === 'tooManyAttempts'
                  ? tooManyAttemptsText(notice.retryAfterMinutes)
                  : t('passwordReset.submitError')}
              </Alert>
            )}
            <Form noValidate onSubmit={(event) => void handleSubmit(event)}>
              <Form.Group className="mb-3" controlId={PASSWORD_ID}>
                <Form.Label>{t('registration.fields.password.label')}</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  isInvalid={Boolean(passwordError)}
                  aria-invalid={Boolean(passwordError)}
                  aria-required="true"
                  aria-describedby={
                    passwordError
                      ? `${PASSWORD_ID}-hint ${PASSWORD_ERROR_ID}`
                      : `${PASSWORD_ID}-hint`
                  }
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setServerCode(undefined);
                  }}
                  onBlur={() => {
                    setIsPasswordTouched(true);
                  }}
                />
                <Form.Text id={`${PASSWORD_ID}-hint`} muted>
                  {t('registration.fields.password.hint')}
                </Form.Text>
                {passwordError && (
                  <Form.Control.Feedback
                    type="invalid"
                    id={PASSWORD_ERROR_ID}
                    role="alert"
                    className="d-block"
                  >
                    {passwordError}
                  </Form.Control.Feedback>
                )}
              </Form.Group>

              <Form.Group className="mb-3" controlId={CONFIRM_ID}>
                <Form.Label>{t('passwordReset.confirmLabel')}</Form.Label>
                <Form.Control
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  isInvalid={Boolean(confirmError)}
                  aria-invalid={Boolean(confirmError)}
                  aria-required="true"
                  aria-describedby={confirmError ? CONFIRM_ERROR_ID : undefined}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                  }}
                  onBlur={() => {
                    setIsConfirmTouched(true);
                  }}
                />
                {confirmError && (
                  <Form.Control.Feedback
                    type="invalid"
                    id={CONFIRM_ERROR_ID}
                    role="alert"
                    className="d-block"
                  >
                    {confirmError}
                  </Form.Control.Feedback>
                )}
              </Form.Group>

              <Button type="submit" variant="primary" disabled={isPending}>
                {isPending ? t('passwordReset.submitting') : t('passwordReset.submit')}
              </Button>
            </Form>
          </>
        );
    }
  }

  return (
    <Container as="main" className="py-5" data-testid="password-reset-page">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <h1>{t('passwordReset.title')}</h1>
          {content()}
        </Col>
      </Row>
    </Container>
  );
}
