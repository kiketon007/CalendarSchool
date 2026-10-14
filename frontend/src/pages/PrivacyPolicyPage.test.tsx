import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptchaClientContext } from '../captcha/captchaClientContext';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { PrivacyPolicyPage } from './PrivacyPolicyPage';

const policy = es.privacyPolicy;

/**
 * Secciones que exige la spec y lo que cada una debe decir como mínimo. La página va sin
 * `SessionProvider` a propósito: es pública y no usa la sesión.
 */
const SECTIONS = [
  ['controller', [/kiketon@gmail\.com/, /03015 Alicante/]],
  ['data', [/nombre del colegio/i, /municipio/i, /apellidos/i, /email/i, /hash/i]],
  ['ip', [/\bIP\b/, /48 horas/]],
  ['cookie', [/refresh_token/, /24 horas/]],
  ['recaptcha', [/reCAPTCHA/, /Google/, /cuando envías el formulario/i]],
  ['providers', [/Supabase/, /AWS/, /Google/, /Unión Europea/]],
  ['retention', [/30 días/, /copias de seguridad/i, /logs/i]],
  ['legalBasis', [/6\.1\.b/, /6\.1\.f/]],
  ['rights', [/acceso/i, /supresión/i, /Agencia Española de Protección de Datos/]],
] as const;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/privacidad']}>
      <PrivacyPolicyPage />
    </MemoryRouter>,
  );
}

describe('PrivacyPolicyPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.head.querySelectorAll('script').forEach((script) => {
      script.remove();
    });
  });

  it('renders the title and the date of the last update, without a session', () => {
    renderPage();

    expect(screen.getByTestId('privacy-policy-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(policy.title);
    expect(screen.getByText(new RegExp(policy.lastUpdated))).toBeInTheDocument();
  });

  it.each(SECTIONS)('has the %s section with its minimum content', (id, expectedTexts) => {
    renderPage();

    const section = screen.getByRole('region', { name: policy.sections[id].heading });
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(
      policy.sections[id].heading,
    );
    for (const expected of expectedTexts) {
      expect(section).toHaveTextContent(expected);
    }
  });

  it('does not use the captcha: no client call and no Google script', () => {
    const client = { executeV3: vi.fn(), renderV2: vi.fn() };

    render(
      <MemoryRouter>
        <CaptchaClientContext.Provider value={client}>
          <PrivacyPolicyPage />
        </CaptchaClientContext.Provider>
      </MemoryRouter>,
    );

    expect(client.executeV3).not.toHaveBeenCalled();
    expect(client.renderV2).not.toHaveBeenCalled();
    expect(document.querySelector('script[src*="google"]')).toBeNull();
  });

  it('has no WCAG 2.1 AA violations', async () => {
    const { container } = renderPage();

    const results = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(results.violations.map(({ id }) => id)).toEqual([]);
  });
});
