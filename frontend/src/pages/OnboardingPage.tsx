import Container from 'react-bootstrap/Container';
import Spinner from 'react-bootstrap/Spinner';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { useSession } from '../session/SessionProvider';

/**
 * Pantalla de bienvenida provisional: US04 (Onboarding) la sustituirá. Solo es accesible con una
 * sesión iniciada; sin ella redirige al registro, porque el inicio de sesión (US02) aún no existe.
 */
export function OnboardingPage() {
  const { t } = useTranslation();
  const { state } = useSession();

  if (state.status === 'loading') {
    return (
      <Container as="main" className="py-5" data-testid="onboarding-loading">
        <div role="status" className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{t('onboarding.loading')}</span>
        </div>
      </Container>
    );
  }

  if (state.status === 'anonymous') {
    return <Navigate to="/registro" replace />;
  }

  const { user, school } = state.data;
  return (
    <Container as="main" className="py-5" data-testid="onboarding-page">
      <h1>{t('onboarding.title', { name: user.firstName })}</h1>
      <p className="lead">{t('onboarding.message', { school: school.name })}</p>
    </Container>
  );
}
