import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { downloadFile } from './download';

describe('downloadFile', () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();
  let click: MockInstance<() => void>;
  let attachedWhenClicked: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL.mockReset().mockReturnValue('blob:http://localhost/abc');
    revokeObjectURL.mockReset();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    attachedWhenClicked = false;
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      attachedWhenClicked = document.body.contains(this);
    });
  });

  afterEach(() => {
    click.mockRestore();
    vi.useRealTimers();
  });

  const file = {
    fileName: 'horario-1o-primaria-a.md',
    mimeType: 'text/markdown;charset=utf-8',
    content: '# Horario',
  };

  it('offers a Blob with the content and the type of the file', async () => {
    downloadFile(file);

    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe('text/markdown;charset=utf-8');
    await expect(blob?.text()).resolves.toBe('# Horario');
  });

  it('clicks a temporary link named after the file', () => {
    downloadFile(file);

    expect(click).toHaveBeenCalledTimes(1);
    const clicked = click.mock.contexts[0] as HTMLAnchorElement | undefined;
    expect(clicked?.getAttribute('download')).toBe('horario-1o-primaria-a.md');
    expect(clicked?.getAttribute('href')).toBe('blob:http://localhost/abc');
    expect(attachedWhenClicked).toBe(true);
  });

  it('removes the link once used', () => {
    downloadFile(file);

    expect(document.body.querySelector('a[download]')).toBeNull();
  });

  it('releases the address in the next turn, not before the download can start', () => {
    downloadFile(file);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/abc');
  });

  it('does not make any request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    downloadFile(file);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
