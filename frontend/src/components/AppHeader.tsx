import { useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSession } from '../session/SessionProvider';

/**
 * Cabecera mínima, provisional hasta el layout de US04: solo con la sesión iniciada muestra la
 * aplicación, el usuario, su colegio y el botón para cerrar la sesión. El cierre no pide
 * confirmación: cerrarlo por error solo cuesta volver a entrar.
 */
export function AppHeader() {
  const { t } = useTranslation();
  const { state, logout } = useSession();
  const navigate = useNavigate();
  const [isClosing, setIsClosing] = useState(false);
  const [failed, setFailed] = useState(false);
  // Guarda síncrona: dos pulsaciones seguidas pueden llegar antes de que React repinte el botón.
  const isClosingRef = useRef(false);

  if (state.status !== 'authenticated') {
    return null;
  }

  const { user, school } = state.data;

  async function handleLogout() {
    if (isClosingRef.current) {
      return;
    }
    isClosingRef.current = true;
    setIsClosing(true);
    setFailed(false);
    const outcome = await logout();
    if (outcome.status === 'loggedOut') {
      void navigate('/login', { replace: true });
      return;
    }
    isClosingRef.current = false;
    setIsClosing(false);
    setFailed(true);
  }

  return (
    <header className="border-bottom bg-light" data-testid="app-header">
      <Container className="d-flex flex-wrap align-items-center gap-3 py-2">
        <strong className="me-auto">{t('app.name')}</strong>
        <span>
          {user.firstName} {user.lastName}
          <span className="text-muted"> · {school.name}</span>
        </span>
        <Button
          variant="outline-secondary"
          size="sm"
          disabled={isClosing}
          onClick={() => void handleLogout()}
        >
          {t('header.logout')}
        </Button>
      </Container>
      {failed && (
        <Container className="pb-2">
          <Alert variant="danger" className="mb-0" role="alert">
            {t('header.logoutError')}
          </Alert>
        </Container>
      )}
    </header>
  );
}
