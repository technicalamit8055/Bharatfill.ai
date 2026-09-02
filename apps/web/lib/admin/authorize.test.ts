import { describe, expect, it } from 'vitest';
import {
  canDemotePlatformAdmin,
  parseAdminEmails,
  resolvePlatformIdentity,
} from './authorize';

describe('parseAdminEmails', () => {
  it('returns an empty set when unset', () => {
    expect(parseAdminEmails(undefined).size).toBe(0);
    expect(parseAdminEmails(null).size).toBe(0);
    expect(parseAdminEmails('').size).toBe(0);
  });

  it('splits, trims and lower-cases', () => {
    const parsed = parseAdminEmails(' Owner@Bharatfill.in , ops@bharatfill.in ');
    expect([...parsed]).toEqual(['owner@bharatfill.in', 'ops@bharatfill.in']);
  });

  it('drops empty entries from a trailing comma', () => {
    expect([...parseAdminEmails('owner@bharatfill.in,,')]).toEqual(['owner@bharatfill.in']);
  });
});

describe('resolvePlatformIdentity', () => {
  const adminEmails = parseAdminEmails('owner@bharatfill.in');

  it('denies a signed-in user who is on no list', () => {
    const identity = resolvePlatformIdentity({
      email: 'operator@example.com',
      emailConfirmed: true,
      roster: null,
      adminEmails,
    });
    expect(identity).toEqual({ granted: false, reason: 'no_roster_row' });
  });

  it('grants the role on an active roster row', () => {
    const identity = resolvePlatformIdentity({
      email: 'content@bharatfill.in',
      emailConfirmed: true,
      roster: { role: 'content_manager', isActive: true },
      adminEmails,
    });
    expect(identity).toEqual({ granted: true, role: 'content_manager', via: 'roster' });
  });

  /**
   * The rule that makes the revoke button mean something: an env var must not silently reinstate
   * somebody whose access was explicitly taken away.
   */
  it('denies a revoked row even for an address in ADMIN_EMAILS', () => {
    const identity = resolvePlatformIdentity({
      email: 'owner@bharatfill.in',
      emailConfirmed: true,
      roster: { role: 'super_admin', isActive: false },
      adminEmails,
    });
    expect(identity).toEqual({ granted: false, reason: 'revoked' });
  });

  it('lets an active roster row outrank the bootstrap list', () => {
    const identity = resolvePlatformIdentity({
      email: 'owner@bharatfill.in',
      emailConfirmed: true,
      roster: { role: 'support_admin', isActive: true },
      adminEmails,
    });
    expect(identity).toEqual({ granted: true, role: 'support_admin', via: 'roster' });
  });

  it('fails closed on a role the build does not recognise', () => {
    const identity = resolvePlatformIdentity({
      email: 'someone@bharatfill.in',
      emailConfirmed: true,
      roster: { role: 'god_mode', isActive: true },
      adminEmails,
    });
    expect(identity).toEqual({ granted: false, reason: 'unknown_role' });
  });

  describe('the ADMIN_EMAILS bootstrap', () => {
    it('grants super_admin to a confirmed address with no roster row', () => {
      const identity = resolvePlatformIdentity({
        email: 'owner@bharatfill.in',
        emailConfirmed: true,
        roster: null,
        adminEmails,
      });
      expect(identity).toEqual({ granted: true, role: 'super_admin', via: 'bootstrap' });
    });

    it('matches case-insensitively and ignores surrounding whitespace', () => {
      const identity = resolvePlatformIdentity({
        email: '  Owner@BharatFill.in ',
        emailConfirmed: true,
        roster: null,
        adminEmails,
      });
      expect(identity.granted).toBe(true);
    });

    /**
     * Without this, anybody who guesses an address in ADMIN_EMAILS could sign up as it and hold
     * Super Admin before ever proving they own the mailbox.
     */
    it('refuses an unconfirmed address', () => {
      const identity = resolvePlatformIdentity({
        email: 'owner@bharatfill.in',
        emailConfirmed: false,
        roster: null,
        adminEmails,
      });
      expect(identity).toEqual({ granted: false, reason: 'email_unconfirmed' });
    });

    it('grants nothing when ADMIN_EMAILS is unset', () => {
      const identity = resolvePlatformIdentity({
        email: 'owner@bharatfill.in',
        emailConfirmed: true,
        roster: null,
        adminEmails: parseAdminEmails(undefined),
      });
      expect(identity).toEqual({ granted: false, reason: 'no_roster_row' });
    });

    it('denies a user with no email address at all', () => {
      const identity = resolvePlatformIdentity({
        email: null,
        emailConfirmed: true,
        roster: null,
        adminEmails,
      });
      expect(identity).toEqual({ granted: false, reason: 'no_roster_row' });
    });
  });
});

describe('canDemotePlatformAdmin', () => {
  it('allows demoting a non-super-admin', () => {
    expect(
      canDemotePlatformAdmin({
        targetRole: 'content_manager',
        targetIsActive: true,
        activeSuperAdminCount: 1,
      }),
    ).toBe(true);
  });

  it('refuses to demote the last active super admin', () => {
    expect(
      canDemotePlatformAdmin({
        targetRole: 'super_admin',
        targetIsActive: true,
        activeSuperAdminCount: 1,
      }),
    ).toBe(false);
  });

  it('allows demoting a super admin when another remains', () => {
    expect(
      canDemotePlatformAdmin({
        targetRole: 'super_admin',
        targetIsActive: true,
        activeSuperAdminCount: 2,
      }),
    ).toBe(true);
  });

  it('allows changing an already-inactive super admin', () => {
    // They are not holding the platform open, so the guard does not apply.
    expect(
      canDemotePlatformAdmin({
        targetRole: 'super_admin',
        targetIsActive: false,
        activeSuperAdminCount: 1,
      }),
    ).toBe(true);
  });
});
