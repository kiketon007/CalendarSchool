import i18n from '../i18n/i18n';
import type { CaptchaChallenge, CaptchaClient } from './captchaClient';

/** Token que devuelve el cliente falso para v3. El verificador falso del backend lo acepta. */
export const FAKE_V3_TOKEN = 'fake-v3-token';
/** Token que entrega el reto simulado. El verificador falso del backend lo acepta. */
export const FAKE_V2_TOKEN = 'fake-v2-token';

/**
 * Cliente de captcha falso, que se usa sin claves de sitio (desarrollo, tests y E2E): no carga nada
 * de Google, devuelve tokens fijos y pinta un botón que simula el reto v2. Para provocar el reto,
 * el fallo o la indisponibilidad, los tests cambian el token por uno de los reservados del
 * verificador falso del backend (`fake-low-score`, `fake-fail`, `fake-unavailable`).
 */
export function createFakeCaptchaClient(): CaptchaClient {
  return {
    executeV3: () => Promise.resolve(FAKE_V3_TOKEN),

    renderV2(container, onToken): Promise<CaptchaChallenge> {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-outline-secondary';
      button.textContent = i18n.t('captcha.fakeChallengeButton');
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        button.disabled = true;
        button.setAttribute('aria-pressed', 'true');
        onToken(FAKE_V2_TOKEN);
      });
      container.append(button);

      return Promise.resolve({
        reset() {
          button.disabled = false;
          button.setAttribute('aria-pressed', 'false');
          onToken(undefined);
        },
        remove() {
          button.remove();
        },
      });
    },
  };
}
