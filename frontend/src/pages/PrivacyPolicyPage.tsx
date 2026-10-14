import Container from 'react-bootstrap/Container';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/** Secciones de la política, en el orden en que se muestran (claves de `privacyPolicy.sections`). */
const SECTIONS = [
  'controller',
  'data',
  'ip',
  'cookie',
  'recaptcha',
  'providers',
  'retention',
  'legalBasis',
  'rights',
] as const;

/**
 * Política de privacidad (`/privacidad`): página pública y estática. No usa la sesión ni el
 * captcha, así que no carga ningún script de Google. El texto está en i18n; su fecha de última
 * actualización debe coincidir con `PRIVACY_POLICY_VERSION` del backend (lo comprueba un test).
 */
export function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <Container as="main" className="py-5" data-testid="privacy-policy-page">
      <h1>{t('privacyPolicy.title')}</h1>
      <p className="text-muted">
        {t('privacyPolicy.lastUpdatedLabel')}{' '}
        <time dateTime={t('privacyPolicy.lastUpdated')}>{t('privacyPolicy.lastUpdated')}</time>
      </p>

      {SECTIONS.map((id) => {
        const headingId = `privacy-policy-${id}`;
        const paragraphs = t(`privacyPolicy.sections.${id}.paragraphs`, {
          returnObjects: true,
        }) as unknown as string[];
        return (
          <section key={id} aria-labelledby={headingId} className="mb-4">
            <h2 id={headingId} className="h4">
              {t(`privacyPolicy.sections.${id}.heading`)}
            </h2>
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        );
      })}

      <p>
        <Link to="/registro">{t('privacyPolicy.backToRegister')}</Link>
      </p>
    </Container>
  );
}
