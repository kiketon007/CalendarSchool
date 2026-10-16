import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';
import { useSession } from '../session/SessionProvider';

/**
 * Pantalla de bienvenida provisional: US04 (Onboarding) la sustituirá. Cuelga de
 * `AuthenticatedLayout`, que es quien resuelve la sesión y redirige a `/login` si no la hay.
 */
export function OnboardingPage() {
  const { t } = useTranslation();
  const { state } = useSession();

  if (state.status !== 'authenticated') {
    return null;
  }

  const { user, school } = state.data;
  return (
    <Container as="main" className="py-5" data-testid="onboarding-page">
      <h1>{t('onboarding.title', { name: user.firstName })}</h1>
      <p className="lead">{t('onboarding.message', { school: school.name })}</p>
    </Container>
  );
}
