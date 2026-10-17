import { describe, expect, it } from 'vitest';
import { CannotSuspendSelf, LastAdminRequired, UserNotActive } from './userManagementErrors.js';
import { planUserChange, type UserChangeSnapshot } from './userManagement.js';

const ACTOR_ID = 'actor-id';
const OTHER_ID = 'other-id';

function snapshot(overrides: {
  targetId?: string;
  role?: 'ADMIN' | 'MEMBER';
  status?: 'ACTIVE' | 'SUSPENDED';
  activeAdminCount?: number;
}): UserChangeSnapshot {
  return {
    actorId: ACTOR_ID,
    target: {
      id: overrides.targetId ?? OTHER_ID,
      role: overrides.role ?? 'MEMBER',
      status: overrides.status ?? 'ACTIVE',
    },
    activeAdminCount: overrides.activeAdminCount ?? 2,
  };
}

describe('planUserChange', () => {
  describe('changeRole', () => {
    it('plans the new role for an active user', () => {
      expect(planUserChange({ type: 'changeRole', role: 'ADMIN' }, snapshot({}))).toEqual({
        role: 'ADMIN',
      });
    });

    it('changes nothing when the user already has the requested role', () => {
      expect(
        planUserChange({ type: 'changeRole', role: 'MEMBER' }, snapshot({ role: 'MEMBER' })),
      ).toBeNull();
    });

    it('rejects a suspended user even when the role is the one it already has', () => {
      const suspended = snapshot({ role: 'MEMBER', status: 'SUSPENDED' });
      expect(() => planUserChange({ type: 'changeRole', role: 'ADMIN' }, suspended)).toThrow(
        UserNotActive,
      );
      expect(() => planUserChange({ type: 'changeRole', role: 'MEMBER' }, suspended)).toThrow(
        UserNotActive,
      );
    });

    it('rejects demoting the last active administrator', () => {
      const lastAdmin = snapshot({ role: 'ADMIN', activeAdminCount: 1 });
      expect(() => planUserChange({ type: 'changeRole', role: 'MEMBER' }, lastAdmin)).toThrow(
        LastAdminRequired,
      );
    });

    it('rejects the actor demoting themselves when they are the last active administrator', () => {
      const self = snapshot({ targetId: ACTOR_ID, role: 'ADMIN', activeAdminCount: 1 });
      expect(() => planUserChange({ type: 'changeRole', role: 'MEMBER' }, self)).toThrow(
        LastAdminRequired,
      );
    });

    it('allows demoting an administrator when another one stays active', () => {
      expect(
        planUserChange(
          { type: 'changeRole', role: 'MEMBER' },
          snapshot({ role: 'ADMIN', activeAdminCount: 2 }),
        ),
      ).toEqual({ role: 'MEMBER' });
    });

    it('allows the actor demoting themselves when another administrator stays active', () => {
      expect(
        planUserChange(
          { type: 'changeRole', role: 'MEMBER' },
          snapshot({ targetId: ACTOR_ID, role: 'ADMIN', activeAdminCount: 2 }),
        ),
      ).toEqual({ role: 'MEMBER' });
    });

    it('allows promoting a member even when there is a single administrator', () => {
      expect(
        planUserChange(
          { type: 'changeRole', role: 'ADMIN' },
          snapshot({ role: 'MEMBER', activeAdminCount: 1 }),
        ),
      ).toEqual({ role: 'ADMIN' });
    });
  });

  describe('suspend', () => {
    it('plans the suspension and the revocation of the sessions', () => {
      expect(planUserChange({ type: 'suspend' }, snapshot({}))).toEqual({
        status: 'SUSPENDED',
        revokeSessions: true,
      });
    });

    it('rejects the actor suspending themselves even when other administrators exist', () => {
      const self = snapshot({ targetId: ACTOR_ID, role: 'ADMIN', activeAdminCount: 3 });
      expect(() => planUserChange({ type: 'suspend' }, self)).toThrow(CannotSuspendSelf);
    });

    it('rejects the actor suspending themselves before checking the last administrator', () => {
      const self = snapshot({ targetId: ACTOR_ID, role: 'ADMIN', activeAdminCount: 1 });
      expect(() => planUserChange({ type: 'suspend' }, self)).toThrow(CannotSuspendSelf);
    });

    it('changes nothing when the user is already suspended', () => {
      expect(planUserChange({ type: 'suspend' }, snapshot({ status: 'SUSPENDED' }))).toBeNull();
    });

    it('rejects suspending the last active administrator', () => {
      const lastAdmin = snapshot({ role: 'ADMIN', activeAdminCount: 1 });
      expect(() => planUserChange({ type: 'suspend' }, lastAdmin)).toThrow(LastAdminRequired);
    });

    it('allows suspending an administrator when another one stays active', () => {
      expect(
        planUserChange({ type: 'suspend' }, snapshot({ role: 'ADMIN', activeAdminCount: 2 })),
      ).toEqual({ status: 'SUSPENDED', revokeSessions: true });
    });

    it('does not count a suspended administrator as the last one', () => {
      expect(
        planUserChange(
          { type: 'suspend' },
          snapshot({ role: 'ADMIN', status: 'SUSPENDED', activeAdminCount: 1 }),
        ),
      ).toBeNull();
    });
  });

  describe('reactivate', () => {
    it('plans the reactivation of a suspended user', () => {
      expect(planUserChange({ type: 'reactivate' }, snapshot({ status: 'SUSPENDED' }))).toEqual({
        status: 'ACTIVE',
      });
    });

    it('changes nothing when the user is already active', () => {
      expect(planUserChange({ type: 'reactivate' }, snapshot({ status: 'ACTIVE' }))).toBeNull();
    });

    it('never fails with LastAdminRequired, even without active administrators', () => {
      expect(
        planUserChange(
          { type: 'reactivate' },
          snapshot({ role: 'ADMIN', status: 'SUSPENDED', activeAdminCount: 0 }),
        ),
      ).toEqual({ status: 'ACTIVE' });
    });
  });

  it('exposes the stable messages of the domain errors', () => {
    expect(new LastAdminRequired().message).toBe(
      'El colegio debe tener al menos un administrador activo',
    );
    expect(new CannotSuspendSelf().message).toBe('Un usuario no puede darse de baja a sí mismo');
    expect(new UserNotActive().message).toBe('El usuario no está activo');
  });
});
