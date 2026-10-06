import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders with its stable test id', () => {
    render(<HomePage />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  it('shows the translated title and description in Spanish by default', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(es.home.title);
    expect(screen.getByText(es.home.description)).toBeInTheDocument();
  });
});
