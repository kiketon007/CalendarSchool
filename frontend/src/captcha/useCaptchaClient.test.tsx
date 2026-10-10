import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CaptchaClient } from './captchaClient';
import { CaptchaClientContext } from './captchaClientContext';
import { createCaptchaClient } from './createCaptchaClient';
import { FAKE_V3_TOKEN } from './fakeCaptchaClient';
import { useCaptchaClient } from './useCaptchaClient';

describe('createCaptchaClient', () => {
  it('creates the fake client without site keys', async () => {
    const client = createCaptchaClient({ mode: 'fake' });

    await expect(client.executeV3('register')).resolves.toBe(FAKE_V3_TOKEN);
  });

  it('creates the reCAPTCHA client with site keys, which loads nothing until a token is needed', () => {
    createCaptchaClient({ mode: 'recaptcha', siteKeyV3: 'v3', siteKeyV2: 'v2' });

    expect(document.querySelector('script[src*="recaptcha"]')).toBeNull();
  });
});

describe('useCaptchaClient', () => {
  it('returns the client provided by the context, so tests can control the captcha', () => {
    const provided: CaptchaClient = {
      executeV3: vi.fn(() => Promise.resolve('token')),
      renderV2: vi.fn(),
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CaptchaClientContext.Provider value={provided}>{children}</CaptchaClientContext.Provider>
    );

    const { result } = renderHook(() => useCaptchaClient(), { wrapper });

    expect(result.current).toBe(provided);
  });

  it('falls back to the client of the build configuration, the fake one in tests', async () => {
    const { result } = renderHook(() => useCaptchaClient());

    await expect(result.current.executeV3('register')).resolves.toBe(FAKE_V3_TOKEN);
  });

  it('returns the same client on every render', () => {
    const { result, rerender } = renderHook(() => useCaptchaClient());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
