import { useState } from 'react';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import { Trans, useTranslation } from 'react-i18next';
import { FeatureCard } from '../components/FeatureCard';
import { UserCogIcon } from '../components/icons/UserCogIcon';
import { useSession } from '../session/SessionProvider';
import { longDate } from '../utils/longDate';
import { HOME_SECTIONS } from './homeSections';

const TITLE_ID = 'onboarding-title';

/**
 * Página de inicio de las páginas autenticadas (US04 y US-UI-HOME): un banner con la fecha, el saludo
 * y el colegio, una tarjeta enlace por cada sección de trabajo y, para el administrador, el atajo a la
 * gestión de usuarios. Cuelga de `AuthenticatedLayout`, que es quien resuelve la sesión y redirige a
 * `/login` si no la hay. No guarda ningún estado; la fecha se fija al montar y no cambia a medianoche.
 */
export function OnboardingPage() {
  const { t, i18n } = useTranslation();
  const { state } = useSession();
  const [today] = useState(() => new Date());

  if (state.status !== 'authenticated') {
    return null;
  }

  const { user, school } = state.data;
  const date = longDate(today, i18n.language);
  return (
    <Container
      as="main"
      fluid="xxl"
      className="py-4 py-lg-5 px-3 px-lg-4"
      data-testid="onboarding-page"
    >
      <section className="cs-home-banner" aria-labelledby={TITLE_ID}>
        <p className="cs-home-date">
          <time dateTime={date.iso}>{date.label}</time>
        </p>
        <h1 id={TITLE_ID}>{t('onboarding.title', { name: user.firstName })}</h1>
        <p className="cs-home-message">
          <Trans
            i18nKey="onboarding.message"
            // El colegio va como hijo de un componente: React lo pinta siempre como texto. Con `values`,
            // `Trans` interpretaría como HTML un nombre con `<i>`.
            components={{ school: <strong>{school.name}</strong> }}
          />
        </p>
      </section>

      <p className="cs-eyebrow mt-5 mb-0">{t('onboarding.features.eyebrow')}</p>
      <h2 className="cs-home-section-title mb-3">{t('onboarding.features.title')}</h2>
      <Row xs={1} sm={2} xl={4} className="g-3">
        {HOME_SECTIONS.map(({ key, to, Icon, tone }) => (
          <Col key={key}>
            <FeatureCard
              textKey={`onboarding.features.${key}`}
              icon={<Icon />}
              to={to}
              tone={tone}
            />
          </Col>
        ))}
      </Row>

      {user.role === 'ADMIN' && (
        <>
          <h2 className="cs-home-section-title mt-5 mb-3">{t('onboarding.admin.title')}</h2>
          <Row xs={1} sm={2} xl={4} className="g-3">
            <Col>
              <FeatureCard
                textKey="onboarding.admin.users"
                icon={<UserCogIcon />}
                to="/usuarios"
                tone="yellow"
              />
            </Col>
          </Row>
        </>
      )}
    </Container>
  );
}
