import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { createFakeCaptchaClient, FAKE_V2_TOKEN, FAKE_V3_TOKEN } from './fakeCaptchaClient';

describe('fake captcha client', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('returns the fixed v3 token for any action, on every call', async () => {
    const client = createFakeCaptchaClient();

    await expect(client.executeV3('register')).resolves.toBe(FAKE_V3_TOKEN);
    await expect(client.executeV3('register')).resolves.toBe(FAKE_V3_TOKEN);
  });

  it('paints the simulated challenge button, which hands over the v2 token when pressed', async () => {
    const onToken = vi.fn();
    await createFakeCaptchaClient().renderV2(container, onToken);

    const button = container.querySelector('button');
    expect(button).toHaveTextContent(es.captcha.fakeChallengeButton);
    expect(button).toHaveAttribute('type', 'button');
    expect(onToken).not.toHaveBeenCalled();

    button?.click();

    expect(onToken).toHaveBeenCalledExactlyOnceWith(FAKE_V2_TOKEN);
  });

  it('shows that the challenge is solved once the button is pressed', async () => {
    await createFakeCaptchaClient().renderV2(container, vi.fn());
    const button = container.querySelector('button') as HTMLButtonElement;

    button.click();

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('paints the challenge unsolved again on reset, so it can be solved once more', async () => {
    const onToken = vi.fn();
    const challenge = await createFakeCaptchaClient().renderV2(container, onToken);
    const button = container.querySelector('button') as HTMLButtonElement;
    button.click();

    challenge.reset();

    expect(onToken).toHaveBeenLastCalledWith(undefined);
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    button.click();
    expect(onToken).toHaveBeenLastCalledWith(FAKE_V2_TOKEN);
  });

  it('removes the challenge from the container', async () => {
    const challenge = await createFakeCaptchaClient().renderV2(container, vi.fn());

    challenge.remove();

    expect(container.querySelector('button')).toBeNull();
  });
});
