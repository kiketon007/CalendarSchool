import { useRef, useState, type FormEvent } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { CaptchaUnavailableError, LOGIN_ACTION } from '../captcha/captchaClient';
import { useCaptchaClient } from '../captcha/useCaptchaClient';
import {
  CaptchaChallengeWidget,
  type CaptchaChallengeHandle,
} from '../components/CaptchaChallengeWidget';
import { RecaptchaNotice } from '../components/RecaptchaNotice';
import { loginService, type LoginRequest } from '../services/loginService';
import { useSession } from '../session/SessionProvider';
import { retryAfterMinutes } from '../utils/retryAfterMinutes';
import {
  LOGIN_FIELDS,
  validateLogin,
  type LoginField,
  type LoginFormValues,
} from '../validation/loginValidation';

const EMPTY_VALUES: LoginFormValues = { email: '', password: '' };

const inputId = (field: LoginField) => `login-${field}`;
const errorId = (field: LoginField) => `login-${field}-error`;

/**
 * Aviso que se muestra sobre el formulario tras la respuesta del servidor. Nunca lleva detalles
 * técnicos: cada tipo tiene su texto de i18n.
 */
type Notice =
  | { kind: 'invalidCredentials' }
  | { kind: 'accountSuspended' }
  | { kind: 'tooManyRequests'; retryAfterSeconds: number | undefined }
  | { kind: 'unavailable' }
  | { kind: 'captchaFailed' }
  | { kind: 'captchaUnavailable' }
  | { kind: 'cookiesDisabled' }
  | { kind: 'sessionUnavailable' };

/** Los avisos que impiden entrar por algo que el usuario escribió son errores; el resto, advertencias. */
const DANGER_NOTICES: readonly Notice['kind'][] = ['invalidCredentials', 'accountSuspended'];

/**
 * Datos con los que llega a `/login` quien acaba de aceptar una invitación (US02_b4): la navegación
 * lleva `{ accountCreated: true, email }` en su estado. Cualquier otra forma se ignora, y un email que
 * no es texto se descarta. Solo viaja en el estado de la navegación: al recargar la página se pierde.
 */
function accountCreatedFrom(state: unknown): { email: string } | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  if (!('accountCreated' in state) || state.accountCreated !== true) {
    return undefined;
  }
  return { email: 'email' in state && typeof state.email === 'string' ? state.email : '' };
}

/**
 * Página de inicio de sesión (US02): email y contraseña con la verificación de reCAPTCHA. Al
 * enviar, pide un token v3 nuevo y se lo manda al servidor junto con las credenciales. Con el login
 * correcto obtiene la sesión con `refresh` (que comprueba a la vez que el navegador aceptó la
 * cookie) y navega a Onboarding.
 */
export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const arrival = accountCreatedFrom(useLocation().state);
  const { state, refresh } = useSession();
  const captcha = useCaptchaClient();
  const formRef = useRef<HTMLFormElement>(null);
  const challengeRef = useRef<CaptchaChallengeHandle>(null);

  const [values, setValues] = useState<LoginFormValues>({
    ...EMPTY_VALUES,
    email: arrival?.email ?? '',
  });
  // El aviso de cuenta creada se muestra hasta el primer envío.
  const [showAccountCreated, setShowAccountCreated] = useState(arrival !== undefined);
  const [touched, setTouched] = useState<Partial<Record<LoginField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [isPending, setIsPending] = useState(false);
  // Guarda síncrona contra envíos repetidos: `isPending` solo cambia al volver a renderizar.
  const isSubmittingRef = useRef(false);
  // Captcha: el reto v2 aparece cuando el servidor lo pide (score v3 bajo) y se resuelve con un token.
  const [isChallengeVisible, setIsChallengeVisible] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string>();

  const clientErrors = validateLogin(values);

  /** Texto del error de un campo; solo se muestra tras tocarlo o intentar enviar el formulario. */
  function errorText(field: LoginField): string | undefined {
    const code = (touched[field] || submitted) && clientErrors[field];
    return code ? t(`login.errors.${field}.${code}`) : undefined;
  }

  function setValue(field: LoginField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function touch(field: LoginField) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  /** Tras un fallo se conserva el email, pero la contraseña no debe quedar en pantalla. */
  function clearPasswordAfterFailure() {
    setValue('password', '');
    // La contraseña vacía no debe mostrar un error hasta que el usuario vuelva a enviarla.
    setSubmitted(false);
    setTouched((current) => ({ ...current, password: false }));
  }

  function noticeText(current: Notice): string {
    switch (current.kind) {
      case 'invalidCredentials':
        return t('login.server.invalidCredentials');
      case 'accountSuspended':
        return t('login.server.accountSuspended');
      case 'tooManyRequests':
        return current.retryAfterSeconds === undefined
          ? t('login.server.tooManyRequestsLater')
          : t('login.server.tooManyRequests', {
              count: retryAfterMinutes(current.retryAfterSeconds),
            });
      case 'unavailable':
        return t('login.server.unavailable');
      case 'captchaFailed':
        return t('captcha.failed');
      case 'captchaUnavailable':
        return t('captcha.unavailable');
      case 'cookiesDisabled':
        return t('login.session.cookiesDisabled');
      case 'sessionUnavailable':
        return t('login.session.unavailable');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setShowAccountCreated(false);
    try {
      await submitForm();
    } finally {
      isSubmittingRef.current = false;
    }
  }

  /**
   * Token de captcha del envío: con el reto visible, el v2 que lo resuelve; si no, un v3 nuevo en
   * cada envío, porque cada token sirve una sola vez y caduca a los 2 minutos. Devuelve `undefined`
   * si no se puede continuar, con el aviso ya mostrado.
   */
  async function captchaToken(): Promise<LoginRequest['captcha'] | undefined> {
    if (isChallengeVisible) {
      return challengeToken === undefined ? undefined : { version: 'v2', token: challengeToken };
    }
    try {
      return { version: 'v3', token: await captcha.executeV3(LOGIN_ACTION) };
    } catch (error) {
      // El script de Google no carga o no responde (o falla de otro modo): sin llamar al backend
      // ni gastar un intento, y sin dejar el formulario inutilizable.
      setNotice({
        kind: error instanceof CaptchaUnavailableError ? 'captchaUnavailable' : 'unavailable',
      });
      clearPasswordAfterFailure();
      return undefined;
    }
  }

  async function submitForm() {
    setSubmitted(true);
    setNotice(undefined);

    // Con el formulario inválido no se pide el token de captcha ni se llama al servidor.
    const firstInvalid = LOGIN_FIELDS.find((field) => clientErrors[field]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#${inputId(firstInvalid)}`)?.focus();
      return;
    }

    setIsPending(true);
    try {
      const token = await captchaToken();
      if (token === undefined) {
        return;
      }
      const outcome = await loginService.login({ ...values, captcha: token });
      // Con el login hecho, el botón sigue deshabilitado hasta tener la sesión.
      const sessionOutcome = outcome.status === 'loggedIn' ? await refresh() : undefined;
      handleOutcome(outcome, sessionOutcome?.status);
    } finally {
      setIsPending(false);
    }
  }

  function handleOutcome(
    outcome: Awaited<ReturnType<typeof loginService.login>>,
    sessionStatus: 'authenticated' | 'invalidSession' | 'unexpected' | undefined,
  ) {
    switch (outcome.status) {
      case 'loggedIn':
        if (sessionStatus === 'authenticated') {
          void navigate('/onboarding', { replace: true });
        } else {
          setNotice({
            kind: sessionStatus === 'invalidSession' ? 'cookiesDisabled' : 'sessionUnavailable',
          });
          clearPasswordAfterFailure();
        }
        break;
      case 'invalidCredentials':
        setNotice({ kind: 'invalidCredentials' });
        clearPasswordAfterFailure();
        break;
      case 'accountSuspended':
        setNotice({ kind: 'accountSuspended' });
        clearPasswordAfterFailure();
        break;
      case 'tooManyRequests':
        setNotice({ kind: 'tooManyRequests', retryAfterSeconds: outcome.retryAfterSeconds });
        clearPasswordAfterFailure();
        break;
      case 'captchaChallengeRequired':
        // No es un error de lo escrito: se conservan los datos, la contraseña incluida.
        setChallengeToken(undefined);
        setIsChallengeVisible(true);
        break;
      case 'captchaFailed':
        setNotice({ kind: 'captchaFailed' });
        challengeRef.current?.reset();
        setChallengeToken(undefined);
        clearPasswordAfterFailure();
        break;
      case 'unavailable':
        setNotice({ kind: 'unavailable' });
        clearPasswordAfterFailure();
        break;
    }
  }

  function field(name: LoginField, props: { type: string; autoComplete: string }) {
    const error = errorText(name);
    return (
      <Form.Group className="mb-3" controlId={inputId(name)}>
        <Form.Label>{t(`login.fields.${name}.label`)}</Form.Label>
        <Form.Control
          type={props.type}
          autoComplete={props.autoComplete}
          value={values[name]}
          isInvalid={Boolean(error)}
          aria-invalid={Boolean(error)}
          aria-required="true"
          aria-describedby={error ? errorId(name) : undefined}
          onChange={(event) => {
            setValue(name, event.target.value);
          }}
          onBlur={() => {
            touch(name);
          }}
        />
        {error && (
          <Form.Control.Feedback type="invalid" id={errorId(name)} role="alert" className="d-block">
            {error}
          </Form.Control.Feedback>
        )}
      </Form.Group>
    );
  }

  // Mientras se resuelve la sesión no se muestra el formulario ni se redirige: quien ya tiene una
  // sesión vigente no debe ver el formulario un instante.
  if (state.status === 'loading') {
    return (
      <Container as="main" className="py-5" data-testid="login-loading">
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('login.loading')}</span>
        </div>
      </Container>
    );
  }
  if (state.status === 'authenticated') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Container as="main" className="py-5" data-testid="login-page">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <h1>{t('login.title')}</h1>
          <p className="lead">{t('login.description')}</p>

          {showAccountCreated && !notice && (
            <Alert variant="success" role="status">
              {t('login.accountCreated')}
            </Alert>
          )}

          {notice && (
            <Alert
              variant={DANGER_NOTICES.includes(notice.kind) ? 'danger' : 'warning'}
              role="alert"
            >
              {noticeText(notice)}
            </Alert>
          )}

          <Form ref={formRef} noValidate onSubmit={(event) => void handleSubmit(event)}>
            {field('email', { type: 'email', autoComplete: 'username' })}
            {field('password', { type: 'password', autoComplete: 'current-password' })}

            {isChallengeVisible && (
              <CaptchaChallengeWidget
                ref={challengeRef}
                text={t('captcha.challenge')}
                onToken={setChallengeToken}
                onUnavailable={() => {
                  // Sin reto no se puede continuar: se avisa de que la verificación no está disponible.
                  setIsChallengeVisible(false);
                  setNotice({ kind: 'captchaUnavailable' });
                }}
              />
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={isPending || (isChallengeVisible && challengeToken === undefined)}
            >
              {isPending ? t('login.submitting') : t('login.submit')}
            </Button>

            <RecaptchaNotice />
          </Form>

          <p className="mt-4 mb-0">
            {t('login.register.prompt')} <Link to="/registro">{t('login.register.link')}</Link>
          </p>
        </Col>
      </Row>
    </Container>
  );
}
