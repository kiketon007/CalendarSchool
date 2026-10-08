import { describe, expect, it } from 'vitest';
import { maskEmail } from './maskEmail.js';

describe('maskEmail', () => {
  it.each([
    ['jose@example.com', 'j***@example.com'],
    ['a@dominio.co.uk', 'a***@dominio.co.uk'],
    ['  Jose.Garcia@Example.COM ', 'J***@Example.COM'],
  ])('masks "%s" as "%s"', (email, expected) => {
    expect(maskEmail(email)).toBe(expected);
  });

  it('never leaks the local part', () => {
    expect(maskEmail('secreto@example.com')).not.toContain('ecreto');
  });

  it.each(['sin-arroba', '', '@dominio.com'])(
    'masks the invalid value "%s" completely',
    (value) => {
      expect(maskEmail(value)).toBe('***');
    },
  );

  it('returns undefined when the value is not a string', () => {
    expect(maskEmail(undefined)).toBeUndefined();
    expect(maskEmail(42)).toBeUndefined();
  });
});
