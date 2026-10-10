import { describe, expect, it } from 'vitest';
import { TooManyAttempts } from './tooManyAttempts.js';

describe('TooManyAttempts', () => {
  it('is an Error with a stable name and message', () => {
    const error = new TooManyAttempts(300);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TooManyAttempts');
    expect(error.message).toBe('Se ha superado el número máximo de intentos');
  });

  it('keeps the seconds to wait before trying again', () => {
    expect(new TooManyAttempts(300).retryAfterSeconds).toBe(300);
  });

  it('does not reveal the key or the number of attempts in its message', () => {
    expect(new TooManyAttempts(1).message).not.toMatch(/register|\d/);
  });
});
