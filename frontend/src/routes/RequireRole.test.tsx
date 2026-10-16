import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import '../i18n/i18n';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { RequireRole } from './RequireRole';

function sessionWithRole(role: 'ADMIN' | 'MEMBER'): SessionData {
  return {
    session: { accessToken: 'signed.access.token', expiresIn: 900 },
    user: {
      id: '0192f5a0-0000-7000-8000-0000000000a1',
      email: 'jose.garcia@example.com',
      firstName: 'José María',
      lastName: 'García-López',
      role,
    },
    school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
  };
}

function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={['/inicio', path]} initialIndex={1}>
      <SessionProvider>
        <CurrentPath />
        <Routes>
          <Route element={<RequireRole role="ADMIN" />}>
            <Route path="/admin" element={<main data-testid="admin-page">solo admin</main>} />
          </Route>
          <Route path="/onboarding" element={<main data-testid="onboarding-page" />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('RequireRole', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
  });

  afterEach(() => {
    refresh.mockRestore();
  });

  it('shows the page to a user with the required role', async () => {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionWithRole('ADMIN') });

    renderAt('/admin');

    expect(await screen.findByTestId('admin-page')).toBeInTheDocument();
  });

  it('sends a user with another role to /onboarding, silently', async () => {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionWithRole('MEMBER') });

    renderAt('/admin');

    expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/onboarding');
    expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows nothing without an authenticated session: the layout decides what to do then', async () => {
    refresh.mockResolvedValue({ status: 'invalidSession' });

    renderAt('/admin');

    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument();
  });
});
