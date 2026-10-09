import { parseCookie, stringifySetCookie, type SetCookie } from 'cookie';
import { REFRESH_TOKEN_TTL_SECONDS } from '../../domain/session/refreshToken.js';

/** Nombre de la cookie que guarda el refresh token. */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/**
 * Atributos comunes de la cookie (design.md D3): inaccesible desde JavaScript, solo por HTTPS
 * (los navegadores lo admiten en `localhost`), enviada al llegar desde enlaces externos y solo a
 * los endpoints de autenticación.
 */
const COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/api/auth',
} as const satisfies Partial<SetCookie>;

/** Cabecera `Set-Cookie` que guarda el refresh token durante la vida de la sesión. */
export function refreshTokenCookie(token: string): string {
  return stringifySetCookie({
    name: REFRESH_TOKEN_COOKIE,
    value: token,
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
    ...COOKIE_ATTRIBUTES,
  });
}

/** Cabecera `Set-Cookie` que borra el refresh token del navegador. */
export function clearedRefreshTokenCookie(): string {
  return stringifySetCookie({
    name: REFRESH_TOKEN_COOKIE,
    value: '',
    maxAge: 0,
    ...COOKIE_ATTRIBUTES,
  });
}

/** Refresh token de la cabecera `Cookie`, o `undefined` si no viene o está vacío. */
export function readRefreshToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  return parseCookie(cookieHeader)[REFRESH_TOKEN_COOKIE] || undefined;
}
