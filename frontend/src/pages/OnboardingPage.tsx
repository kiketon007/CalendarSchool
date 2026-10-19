import type { ReactNode } from 'react';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import { useTranslation } from 'react-i18next';
import { CalendarIcon } from '../components/icons/CalendarIcon';
import { CutleryIcon } from '../components/icons/CutleryIcon';
import { UsersIcon } from '../components/icons/UsersIcon';
import { FeatureCard } from '../components/FeatureCard';
import { useSession } from '../session/SessionProvider';

interface Feature {
  key: string;
  icon: ReactNode;
  /** Ruta del módulo. Mientras no exista, la tarjeta se muestra como «Próximamente». */
  to?: string;
}

/**
 * Funcionalidades principales del producto (PRD §2). Para activar un módulo basta con añadir
 * su `to`: la tarjeta pasa a ser un enlace y deja de mostrar «Próximamente».
 */
const FEATURES: readonly Feature[] = [
  { key: 'schedules', icon: <CalendarIcon /> },
  { key: 'canteen', icon: <CutleryIcon /> },
];

/**
 * Página de inicio de las páginas autenticadas: saludo, colegio, funcionalidades y, para el
 * administrador, el atajo a la gestión de usuarios. Cuelga de `AuthenticatedLayout`, que es quien
 * resuelve la sesión y redirige a `/login` si no la hay. No guarda ningún estado.
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

      <h2 className="h4 mt-4 mb-3">{t('onboarding.features.title')}</h2>
      <Row xs={1} md={2} className="g-3">
        {FEATURES.map((feature) => (
          <Col key={feature.key}>
            <FeatureCard
              textKey={`onboarding.features.${feature.key}`}
              icon={feature.icon}
              to={feature.to}
            />
          </Col>
        ))}
      </Row>

      {user.role === 'ADMIN' && (
        <>
          <h2 className="h4 mt-5 mb-3">{t('onboarding.admin.title')}</h2>
          <Row xs={1} md={2} className="g-3">
            <Col>
              <FeatureCard textKey="onboarding.admin.users" icon={<UsersIcon />} to="/usuarios" />
            </Col>
          </Row>
        </>
      )}
    </Container>
  );
}
