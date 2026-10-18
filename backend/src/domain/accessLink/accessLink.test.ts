import { describe, expect, it } from 'vitest';
import { ACCESS_LINK_TTL_HOURS, accessLinkExpiresAt, accessLinkStatus } from './accessLink.js';

const now = new Date('2026-10-17T10:00:00Z');

function link(overrides: { expiresAt?: Date; usedAt?: Date | null; revokedAt?: Date | null } = {}) {
  return {
    expiresAt: overrides.expiresAt ?? new Date('2026-10-20T10:00:00Z'),
    usedAt: overrides.usedAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
  };
}

describe('ACCESS_LINK_TTL_HOURS', () => {
  it('is 72 hours', () => {
    expect(ACCESS_LINK_TTL_HOURS).toBe(72);
  });
});

describe('accessLinkExpiresAt', () => {
  it('is exactly 72 hours after the creation instant', () => {
    expect(accessLinkExpiresAt(now)).toEqual(new Date('2026-10-20T10:00:00Z'));
  });

  it('does not change the date it receives', () => {
    const created = new Date(now);

    accessLinkExpiresAt(created);

    expect(created).toEqual(now);
  });
});

describe('accessLinkStatus', () => {
  it('is PENDING when it is not used, not revoked and expires later', () => {
    expect(accessLinkStatus(link(), now)).toBe('PENDING');
  });

  it('is still PENDING one millisecond before it expires', () => {
    expect(accessLinkStatus(link({ expiresAt: new Date(now.getTime() + 1) }), now)).toBe('PENDING');
  });

  it('is EXPIRED exactly at its expiration instant', () => {
    expect(accessLinkStatus(link({ expiresAt: now }), now)).toBe('EXPIRED');
  });

  it('is EXPIRED after its expiration instant', () => {
    expect(accessLinkStatus(link({ expiresAt: new Date(now.getTime() - 1) }), now)).toBe('EXPIRED');
  });

  it('is REVOKED when it has a revocation date', () => {
    expect(accessLinkStatus(link({ revokedAt: new Date('2026-10-17T09:00:00Z') }), now)).toBe(
      'REVOKED',
    );
  });

  it('is USED when it has a usage date', () => {
    expect(accessLinkStatus(link({ usedAt: new Date('2026-10-17T09:00:00Z') }), now)).toBe('USED');
  });

  it('gives priority to used over revoked over expired', () => {
    const past = new Date('2026-10-16T10:00:00Z');

    expect(accessLinkStatus(link({ usedAt: past, revokedAt: past, expiresAt: past }), now)).toBe(
      'USED',
    );
    expect(accessLinkStatus(link({ revokedAt: past, expiresAt: past }), now)).toBe('REVOKED');
    expect(accessLinkStatus(link({ expiresAt: past }), now)).toBe('EXPIRED');
  });
});
