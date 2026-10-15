import { useTranslation } from 'react-i18next';

/** Enlaces que Google exige mostrar mientras se usa reCAPTCHA. */
const GOOGLE_PRIVACY_URL = 'https://policies.google.com/privacy';
const GOOGLE_TERMS_URL = 'https://policies.google.com/terms';

/**
 * Aviso de privacidad y condiciones de Google, que la propia Google exige junto a cualquier
 * formulario protegido con reCAPTCHA. Lo comparten el registro y el inicio de sesión.
 */
export function RecaptchaNotice() {
  const { t } = useTranslation();

  return (
    <p className="form-text mt-3 mb-0">
      {t('captcha.privacy.prefix')}
      <a href={GOOGLE_PRIVACY_URL} target="_blank" rel="noopener noreferrer">
        {t('captcha.privacy.privacyLink')}
      </a>
      {t('captcha.privacy.middle')}
      <a href={GOOGLE_TERMS_URL} target="_blank" rel="noopener noreferrer">
        {t('captcha.privacy.termsLink')}
      </a>
      {t('captcha.privacy.suffix')}
    </p>
  );
}
