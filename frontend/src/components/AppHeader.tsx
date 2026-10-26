import { useRef, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router';
import { useSession } from '../session/SessionProvider';

/**
 * Cabecera de las páginas autenticadas: el nombre de la aplicación (enlace a la página de inicio), la
 * navegación («Cursos» para todos los roles y «Usuarios» solo para los administradores), el usuario,
 * su colegio y el botón para cerrar la sesión. La monta `AuthenticatedLayout`, que garantiza la
 * sesión. El cierre no pide confirmación: cerrarlo por error solo cuesta volver a entrar.
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
        <NavLink to="/onboarding" className="me-auto fw-bold text-body text-decoration-none">
          {t('app.name')}
        </NavLink>
        <nav
          aria-label={t('header.navigation')}
          className="d-flex flex-wrap column-gap-3 row-gap-1"
        >
          <NavLink to="/cursos">{t('header.courses')}</NavLink>
          <NavLink to="/profesores">{t('header.professors')}</NavLink>
          <NavLink to="/alumnos">{t('header.students')}</NavLink>
          <NavLink to="/calendarios">{t('header.calendars')}</NavLink>
          <NavLink to="/asignaturas">{t('header.subjects')}</NavLink>
          {user.role === 'ADMIN' && <NavLink to="/usuarios">{t('header.users')}</NavLink>}
        </nav>
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
