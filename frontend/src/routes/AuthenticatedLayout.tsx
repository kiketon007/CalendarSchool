import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';
import { AppShell } from '../components/AppShell';
import { useSession } from '../session/SessionProvider';

/**
 * Layout de las páginas que exigen sesión y única guarda de sesión de la aplicación: mientras se
 * resuelve muestra un indicador, sin sesión lleva a `/login` y con sesión pinta el marco de la
 * aplicación (barra lateral, cabecera y menú de usuario) con la página hija dentro. Las páginas públicas quedan fuera de él.
 */
export function AuthenticatedLayout() {
  const { t } = useTranslation();
  const { state } = useSession();

  if (state.status === 'loading') {
    return (
      <Container as="main" className="py-5" data-testid="session-loading">
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('session.loading')}</span>
        </div>
      </Container>
    );
  }

  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
