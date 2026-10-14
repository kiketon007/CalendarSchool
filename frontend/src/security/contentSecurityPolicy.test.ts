import { describe, expect, it } from 'vitest';
import policy from '../../content-security-policy.json';
import { serializeContentSecurityPolicy } from './contentSecurityPolicy';

describe('serializeContentSecurityPolicy', () => {
  it('joins each directive with its sources, separated by semicolons, in the given order', () => {
    expect(
      serializeContentSecurityPolicy({
        'default-src': ["'self'"],
        'script-src': ["'self'", 'https://www.google.com/recaptcha/'],
        'object-src': ["'none'"],
      }),
    ).toBe(
      "default-src 'self'; script-src 'self' https://www.google.com/recaptcha/; object-src 'none'",
    );
  });

  it('writes a directive without sources as its bare name', () => {
    expect(serializeContentSecurityPolicy({ 'upgrade-insecure-requests': [] })).toBe(
      'upgrade-insecure-requests',
    );
  });

  it('gives the same header for the same policy, however many times it is called', () => {
    expect(serializeContentSecurityPolicy(policy)).toBe(serializeContentSecurityPolicy(policy));
  });
});

describe('content-security-policy.json', () => {
  const header = serializeContentSecurityPolicy(policy);
  const sourcesOf = (directive: string): readonly string[] =>
    (policy as Record<string, readonly string[]>)[directive] ?? [];

  it("only allows scripts from the application and from reCAPTCHA, never 'unsafe-inline' or 'unsafe-eval'", () => {
    expect(sourcesOf('script-src')).toEqual([
      "'self'",
      'https://www.google.com/recaptcha/',
      'https://www.gstatic.com/recaptcha/',
    ]);
    expect(header).not.toContain("'unsafe-inline'");
    expect(header).not.toContain("'unsafe-eval'");
  });

  it.each([
    ['default-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ])('sets %s to %j', (directive, sources) => {
    expect(sourcesOf(directive)).toEqual(sources);
  });

  it('only lets the application connect to itself and to reCAPTCHA, which reports from the page', () => {
    expect(sourcesOf('connect-src')).toEqual(["'self'", 'https://www.google.com/recaptcha/']);
  });

  it('only frames the reCAPTCHA widget', () => {
    expect(sourcesOf('frame-src')).toEqual([
      'https://www.google.com/recaptcha/',
      'https://recaptcha.google.com/recaptcha/',
    ]);
  });

  it('allows no wildcard sources', () => {
    for (const sources of Object.values(policy)) {
      expect(sources).not.toContain('*');
    }
  });
});
