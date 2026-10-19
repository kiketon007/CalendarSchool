import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { useMediaQuery } from './useMediaQuery';

const WIDE = '(min-width: 768px)';

describe('useMediaQuery', () => {
  let media: MatchMediaControl | undefined;

  afterEach(() => {
    media?.restore();
    media = undefined;
  });

  it('returns true in the first render when the query already matches', () => {
    media = installMatchMedia(1280);

    const { result } = renderHook(() => useMediaQuery(WIDE));

    expect(result.current).toBe(true);
  });

  it('returns false in the first render when the query does not match', () => {
    media = installMatchMedia(360);

    const { result } = renderHook(() => useMediaQuery(WIDE));

    expect(result.current).toBe(false);
  });

  it('follows the width of the window while it is mounted', () => {
    media = installMatchMedia(360);
    const { result } = renderHook(() => useMediaQuery(WIDE));

    act(() => {
      media?.setWidth(1024);
    });
    expect(result.current).toBe(true);

    act(() => {
      media?.setWidth(500);
    });
    expect(result.current).toBe(false);
  });

  it('evaluates again when the query changes', () => {
    media = installMatchMedia(600);
    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: WIDE },
    });
    expect(result.current).toBe(false);

    rerender({ query: '(min-width: 500px)' });

    expect(result.current).toBe(true);
  });

  it('stops listening when it unmounts', () => {
    media = installMatchMedia(1280);
    const { unmount } = renderHook(() => useMediaQuery(WIDE));
    expect(media.listenerCount()).toBeGreaterThan(0);

    unmount();

    expect(media.listenerCount()).toBe(0);
  });

  it('returns false and does not fail when the browser has no matchMedia', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Reflect.deleteProperty(window, 'matchMedia');
    try {
      const { result } = renderHook(() => useMediaQuery(WIDE));

      expect(result.current).toBe(false);
    } finally {
      if (original) {
        Object.defineProperty(window, 'matchMedia', original);
      }
    }
  });
});
