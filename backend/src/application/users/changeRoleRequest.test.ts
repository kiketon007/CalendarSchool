import { describe, expect, it } from 'vitest';
import { ValidationError } from '../validationError.js';
import { parseChangeRoleRequest } from './changeRoleRequest.js';

function detailsOf(body: unknown): unknown {
  try {
    parseChangeRoleRequest(body);
  } catch (error) {
    return (error as ValidationError).details;
  }
  return undefined;
}

describe('parseChangeRoleRequest', () => {
  it.each(['ADMIN', 'MEMBER'] as const)('accepts the role %s', (role) => {
    expect(parseChangeRoleRequest({ role })).toBe(role);
  });

  it('ignores unknown properties', () => {
    expect(parseChangeRoleRequest({ role: 'MEMBER', schoolId: 'other', actorId: 'x' })).toBe(
      'MEMBER',
    );
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
