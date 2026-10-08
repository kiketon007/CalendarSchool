import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { registrationService, type Municipality } from '../services/registrationService';
import { useMunicipalities } from './useMunicipalities';

const municipalities: Municipality[] = [
  { code: '46250', name: 'València', province: 'Valencia/València' },
];

describe('useMunicipalities', () => {
  let listMunicipalities: MockInstance<typeof registrationService.listMunicipalities>;

  beforeEach(() => {
    listMunicipalities = vi.spyOn(registrationService, 'listMunicipalities');
  });

  afterEach(() => {
    listMunicipalities.mockRestore();
  });

  it('starts loading and then exposes the municipalities', async () => {
    listMunicipalities.mockResolvedValue(municipalities);

    const { result } = renderHook(() => useMunicipalities());

    expect(result.current.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.municipalities).toEqual(municipalities);
  });

  it('reports an error when the list cannot be loaded', async () => {
    listMunicipalities.mockRejectedValue(new Error('sin conexión'));

    const { result } = renderHook(() => useMunicipalities());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.municipalities).toEqual([]);
  });

  it('retries the load and recovers', async () => {
    listMunicipalities.mockRejectedValueOnce(new Error('sin conexión'));
    listMunicipalities.mockResolvedValueOnce(municipalities);
    const { result } = renderHook(() => useMunicipalities());
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    act(() => {
      result.current.retry();
    });

    expect(result.current.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(listMunicipalities).toHaveBeenCalledTimes(2);
  });

  it('ignores a response that arrives after the component is gone', async () => {
    let resolveList: (value: Municipality[]) => void = () => undefined;
    listMunicipalities.mockReturnValue(
      new Promise<Municipality[]>((resolve) => {
        resolveList = resolve;
      }),
    );
    const { unmount } = renderHook(() => useMunicipalities());

    unmount();

    await expect(
      act(async () => {
        resolveList(municipalities);
        await Promise.resolve();
      }),
    ).resolves.toBeUndefined();
  });
});
