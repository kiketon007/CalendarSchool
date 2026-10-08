import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import './i18n/i18n';
import { registrationService } from './services/registrationService';

describe('App', () => {
  it('renders the home page at the root path', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  describe('registration route', () => {
    beforeEach(() => {
      vi.spyOn(registrationService, 'listMunicipalities').mockResolvedValue([]);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('renders the registration page at /registro', async () => {
      render(
        <MemoryRouter initialEntries={['/registro']}>
          <App />
        </MemoryRouter>,
      );

      expect(await screen.findByTestId('register-page')).toBeInTheDocument();
      expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    });
  });
});
