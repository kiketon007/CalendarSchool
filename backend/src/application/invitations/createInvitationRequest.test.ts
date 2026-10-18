import { describe, expect, it } from 'vitest';
import type { ValidationError } from '../validationError.js';
import { parseCreateInvitationRequest } from './createInvitationRequest.js';

function detailsOf(body: unknown): unknown {
  try {
    parseCreateInvitationRequest(body);
  } catch (error) {
    return (error as ValidationError).details;
  }
  return undefined;
}

describe('parseCreateInvitationRequest', () => {
  it.each(['ADMIN', 'MEMBER'] as const)('accepts the role %s', (role) => {
    expect(parseCreateInvitationRequest({ role })).toBe(role);
  });

  it('ignores unknown properties: the school and the author never come from the body', () => {
    expect(
      parseCreateInvitationRequest({ role: 'MEMBER', schoolId: 'other', createdById: 'x' }),
    ).toBe('MEMBER');
  });

  it.each([undefined, null, [], 'ADMIN', {}, { role: null }, { role: '' }])(
    'reports a missing role as REQUIRED for %j',
    (body) => {
      expect(detailsOf(body)).toEqual([{ field: 'role', code: 'REQUIRED' }]);
    },
  );

  it.each([{ role: 'OWNER' }, { role: 'admin' }, { role: 1 }, { role: true }, { role: ['ADMIN'] }])(
    'reports an invalid role as INVALID_FORMAT for %j',
    (body) => {
      expect(detailsOf(body)).toEqual([{ field: 'role', code: 'INVALID_FORMAT' }]);
    },
  );
});
