import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { RecaptchaNotice } from './RecaptchaNotice';

const privacy = es.captcha.privacy;

describe('RecaptchaNotice', () => {
  it('shows the sentence that Google requires while reCAPTCHA is used', () => {
    const { container } = render(<RecaptchaNotice />);

    expect(container).toHaveTextContent(
      `${privacy.prefix}${privacy.privacyLink}${privacy.middle}${privacy.termsLink}${privacy.suffix}`,
    );
  });

  it('links to the privacy policy and the terms of Google, in a new tab and safely', () => {
    render(<RecaptchaNotice />);

    const policy = screen.getByRole('link', { name: privacy.privacyLink });
    const terms = screen.getByRole('link', { name: privacy.termsLink });
    expect(policy).toHaveAttribute('href', 'https://policies.google.com/privacy');
    expect(terms).toHaveAttribute('href', 'https://policies.google.com/terms');
    for (const link of [policy, terms]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});
