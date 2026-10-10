import { describe, expect, it } from 'vitest';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
  CaptchaUnavailable,
  type CaptchaFailureReason,
} from './captchaVerifier.js';

describe('captcha errors', () => {
  describe('CaptchaFailed', () => {
    it('is an Error with a stable name and message', () => {
      const error = new CaptchaFailed('INVALID');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('CaptchaFailed');
      expect(error.message).toBe('La verificación de reCAPTCHA ha fallado');
    });

    it.each<CaptchaFailureReason>([
      'MISSING',
      'INVALID',
      'EXPIRED_OR_DUPLICATE',
      'ACTION_MISMATCH',
      'HOSTNAME_MISMATCH',
      'CHALLENGE_FAILED',
    ])('keeps the reason %s for the logs without exposing it in the message', (reason) => {
      const error = new CaptchaFailed(reason);

      expect(error.reason).toBe(reason);
      expect(error.message).not.toContain(reason);
    });
  });

  describe('CaptchaChallengeRequired', () => {
    it('is an Error with a stable name and message', () => {
      const error = new CaptchaChallengeRequired(0.3);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('CaptchaChallengeRequired');
      expect(error.message).toBe('Se requiere superar el reto de reCAPTCHA');
    });

    it('keeps the score for the logs without exposing it in the message', () => {
      const error = new CaptchaChallengeRequired(0.3);

      expect(error.score).toBe(0.3);
      expect(error.message).not.toContain('0.3');
    });
  });

  describe('CaptchaUnavailable', () => {
    it('is an Error with a stable name and a message that exposes no technical detail', () => {
      const cause = new Error('connect ETIMEDOUT 142.250.0.1:443');

      const error = new CaptchaUnavailable(cause);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('CaptchaUnavailable');
      expect(error.message).toBe('La verificación de reCAPTCHA no está disponible');
      expect(error.message).not.toContain('142.250');
    });

    it('keeps the original cause for the log', () => {
      const cause = new Error('Google respondió 500');

      expect(new CaptchaUnavailable(cause).cause).toBe(cause);
    });

    it('is distinguishable from a failed verification', () => {
      expect(new CaptchaUnavailable(undefined)).not.toBeInstanceOf(CaptchaFailed);
      expect(new CaptchaFailed('INVALID')).not.toBeInstanceOf(CaptchaUnavailable);
    });
  });
});
