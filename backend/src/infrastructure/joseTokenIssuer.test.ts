import { decodeJwt, decodeProtectedHeader, SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { InvalidAccessToken } from '../application/session/tokenIssuer.js';
import { JoseTokenIssuer } from './joseTokenIssuer.js';

const SECRET = 'test-only-jwt-secret-0123456789abcdef';
const ISSUED_AT = new Date('2026-10-09T10:00:00Z');
const CLAIMS = {
  userId: '0192f5a0-0000-7000-8000-0000000000a1',
  schoolId: '0192f5a0-0000-7000-8000-000000000001',
  role: 'ADMIN' as const,
};

/** Emisor con un reloj fijo en `now`. */
function issuerAt(now: Date, secret = SECRET) {
  return new JoseTokenIssuer(secret, () => now);
}

function secondsAfter(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

describe('JoseTokenIssuer', () => {
  it('signs an HS256 token with sub, schoolId, role and a 900 second lifetime', async () => {
    const token = await issuerAt(ISSUED_AT).issueAccessToken(CLAIMS);

    expect(decodeProtectedHeader(token).alg).toBe('HS256');
    const payload = decodeJwt(token);
    expect(payload).toMatchObject({
      sub: CLAIMS.userId,
      schoolId: CLAIMS.schoolId,
      role: 'ADMIN',
      iat: ISSUED_AT.getTime() / 1000,
    });
    expect(payload.exp).toBe((payload.iat ?? 0) + 900);
  });

  it('verifies a token issued one minute ago', async () => {
    const token = await issuerAt(ISSUED_AT).issueAccessToken(CLAIMS);

    await expect(issuerAt(secondsAfter(ISSUED_AT, 60)).verifyAccessToken(token)).resolves.toEqual(
      CLAIMS,
    );
  });

  it('rejects a token older than 15 minutes', async () => {
    const token = await issuerAt(ISSUED_AT).issueAccessToken(CLAIMS);

    await expect(
      issuerAt(secondsAfter(ISSUED_AT, 901)).verifyAccessToken(token),
    ).rejects.toBeInstanceOf(InvalidAccessToken);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await issuerAt(ISSUED_AT, 'another-secret-0123456789abcdefghij').issueAccessToken(
      CLAIMS,
    );

    await expect(issuerAt(ISSUED_AT).verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessToken,
    );
  });

  it('rejects an unsecured token with algorithm none', async () => {
    const token = new UnsecuredJWT({ schoolId: CLAIMS.schoolId, role: 'ADMIN' })
      .setSubject(CLAIMS.userId)
      .setIssuedAt(ISSUED_AT)
      .setExpirationTime(secondsAfter(ISSUED_AT, 900))
      .encode();

    await expect(issuerAt(ISSUED_AT).verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessToken,
    );
  });

  it('rejects a token whose payload was modified', async () => {
    const token = await issuerAt(ISSUED_AT).issueAccessToken(CLAIMS);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...decodeJwt(token), role: 'MEMBER' }),
    ).toString('base64url');

    await expect(
      issuerAt(ISSUED_AT).verifyAccessToken(`${header}.${forgedPayload}.${signature}`),
    ).rejects.toBeInstanceOf(InvalidAccessToken);
  });

  it.each([
    ['malformed text', 'not-a-jwt'],
    ['an empty string', ''],
  ])('rejects %s', async (_case, token) => {
    await expect(issuerAt(ISSUED_AT).verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessToken,
    );
  });

  it.each([
    ['without schoolId', { role: 'ADMIN' }],
    ['with an unknown role', { schoolId: CLAIMS.schoolId, role: 'ROOT' }],
  ])('rejects a validly signed token %s', async (_case, payload) => {
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(CLAIMS.userId)
      .setIssuedAt(ISSUED_AT)
      .setExpirationTime(secondsAfter(ISSUED_AT, 900))
      .sign(new TextEncoder().encode(SECRET));

    await expect(issuerAt(ISSUED_AT).verifyAccessToken(token)).rejects.toBeInstanceOf(
      InvalidAccessToken,
    );
  });
});
