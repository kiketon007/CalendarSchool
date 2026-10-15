import { act, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CaptchaUnavailableError, type CaptchaClient } from '../captcha/captchaClient';
import { CaptchaClientContext } from '../captcha/captchaClientContext';
import '../i18n/i18n';
import { CaptchaChallengeWidget, type CaptchaChallengeHandle } from './CaptchaChallengeWidget';

/** Cliente de captcha que el test controla: el reto se resuelve a mano y se puede hacer fallar. */
function controllableCaptcha() {
  let deliverToken: (token: string | undefined) => void = () => undefined;
  const challenge = { reset: vi.fn(), remove: vi.fn() };
  const renderV2 = vi.fn<CaptchaClient['renderV2']>((_container, onToken) => {
    deliverToken = onToken;
    return Promise.resolve(challenge);
  });
  const client: CaptchaClient = { executeV3: vi.fn(), renderV2 };
  return {
    client,
    renderV2,
    challenge,
    deliver: (token: string | undefined) => {
      act(() => {
        deliverToken(token);
      });
    },
  };
}

function renderWidget(
  captcha: ReturnType<typeof controllableCaptcha>,
  props: {
    onToken?: (token: string | undefined) => void;
    onUnavailable?: () => void;
    handle?: React.Ref<CaptchaChallengeHandle>;
  } = {},
) {
  const onToken = props.onToken ?? vi.fn();
  const onUnavailable = props.onUnavailable ?? vi.fn();
  const view = render(
    <CaptchaClientContext.Provider value={captcha.client}>
      <CaptchaChallengeWidget
        text="Confirma que no eres un robot."
        onToken={onToken}
        onUnavailable={onUnavailable}
        ref={props.handle}
      />
    </CaptchaClientContext.Provider>,
  );
  return { ...view, onToken, onUnavailable };
}

describe('CaptchaChallengeWidget', () => {
  it('shows the instruction and a container linked to it', async () => {
    renderWidget(controllableCaptcha());

    const container = screen.getByTestId('captcha-challenge');
    const instruction = screen.getByText('Confirma que no eres un robot.');
    expect(container).toHaveAttribute('aria-describedby', instruction.id);
    expect(instruction.id).not.toBe('');
    await screen.findByTestId('captcha-challenge');
  });

  it('draws the v2 challenge in its container, once', async () => {
    const captcha = controllableCaptcha();
    renderWidget(captcha);

    await vi.waitFor(() => {
      expect(captcha.renderV2).toHaveBeenCalledOnce();
    });
    expect(captcha.renderV2.mock.calls[0]?.[0]).toBe(screen.getByTestId('captcha-challenge'));
  });

  it('passes the token to the page when the challenge is solved, and undefined when it expires', async () => {
    const captcha = controllableCaptcha();
    const { onToken } = renderWidget(captcha);
    await vi.waitFor(() => {
      expect(captcha.renderV2).toHaveBeenCalled();
    });

    captcha.deliver('v2-token');
    captcha.deliver(undefined);

    expect(onToken).toHaveBeenNthCalledWith(1, 'v2-token');
    expect(onToken).toHaveBeenNthCalledWith(2, undefined);
  });

  it('resets the challenge when the page asks for it', async () => {
    const captcha = controllableCaptcha();
    const handle = createRef<CaptchaChallengeHandle>();
    renderWidget(captcha, { handle });
    await vi.waitFor(() => {
      expect(captcha.renderV2).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
    });

    handle.current?.reset();

    expect(captcha.challenge.reset).toHaveBeenCalledOnce();
  });

  it('removes the challenge when it is unmounted', async () => {
    const captcha = controllableCaptcha();
    const { unmount } = renderWidget(captcha);
    await vi.waitFor(() => {
      expect(captcha.renderV2).toHaveBeenCalled();
    });
    await act(async () => {
      await Promise.resolve();
    });

    unmount();

    expect(captcha.challenge.remove).toHaveBeenCalledOnce();
  });

  it('removes a challenge that finishes drawing after it was unmounted', async () => {
    const captcha = controllableCaptcha();
    let finish: (challenge: typeof captcha.challenge) => void = () => undefined;
    captcha.renderV2.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = renderWidget(captcha);
    unmount();

    await act(async () => {
      finish(captcha.challenge);
      await Promise.resolve();
    });

    expect(captcha.challenge.remove).toHaveBeenCalledOnce();
  });

  it('tells the page the verification is unavailable when the challenge cannot be drawn', async () => {
    const captcha = controllableCaptcha();
    captcha.renderV2.mockRejectedValueOnce(new CaptchaUnavailableError());

    const { onUnavailable } = renderWidget(captcha);

    await vi.waitFor(() => {
      expect(onUnavailable).toHaveBeenCalledOnce();
    });
  });

  it('does not tell an unmounted page that the verification is unavailable', async () => {
    const captcha = controllableCaptcha();
    let fail: (error: unknown) => void = () => undefined;
    captcha.renderV2.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const { unmount, onUnavailable } = renderWidget(captcha);
    unmount();

    await act(async () => {
      fail(new CaptchaUnavailableError());
      await Promise.resolve();
    });

    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
