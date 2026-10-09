import { describe, expect, it } from 'vitest';
import {
  clearedRefreshTokenCookie,
  readRefreshToken,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookie,
} from './sessionCookie.js';

/** Atributos de una cabecera `Set-Cookie`, en minúsculas, sin el par nombre=valor. */
function attributes(setCookie: string): string[] {
  return setCookie
    .split(';')
    .slice(1)
    .map((attribute) => attribute.trim().toLowerCase());
}

describe('session cookie', () => {
  it('is called refresh_token', () => {
    expect(REFRESH_TOKEN_COOKIE).toBe('refresh_token');
  });

  describe('refreshTokenCookie', () => {
    it('sets the token with HttpOnly, Secure, SameSite=Lax, Path=/api/auth and Max-Age=86400', () => {
      const setCookie = refreshTokenCookie('token-value');

      expect(setCookie.startsWith('refresh_token=token-value;')).toBe(true);
      expect(attributes(setCookie).sort()).toEqual(
        ['httponly', 'max-age=86400', 'path=/api/auth', 'samesite=lax', 'secure'].sort(),
      );
    });
  });

  describe('clearedRefreshTokenCookie', () => {
    it('empties the cookie with Max-Age=0 and the same path and flags', () => {
      const setCookie = clearedRefreshTokenCookie();

      expect(setCookie.startsWith('refresh_token=;')).toBe(true);
      expect(attributes(setCookie).sort()).toEqual(
        ['httponly', 'max-age=0', 'path=/api/auth', 'samesite=lax', 'secure'].sort(),
      );
    });
  });

  describe('readRefreshToken', () => {
    it('reads the refresh token among other cookies', () => {
      expect(readRefreshToken('theme=dark; refresh_token=token-value; lang=es')).toBe(
        'token-value',
      );
    });

    it.each([
      ['there is no Cookie header', undefined],
      ['the Cookie header is empty', ''],
      ['there are only other cookies', 'theme=dark; lang=es'],
      ['the refresh token is empty', 'refresh_token='],
    ])('returns undefined when %s', (_case, header) => {
      expect(readRefreshToken(header)).toBeUndefined();
    });

    it('reads back the value written by refreshTokenCookie', () => {
      const [pair] = refreshTokenCookie('abc_DEF-123').split(';');

      expect(readRefreshToken(pair)).toBe('abc_DEF-123');
    });
  });
});
