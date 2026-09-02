import { describe, expect, it } from 'vitest';
import { PLATFORM_ROLES, type PlatformRole } from '../auth/roles';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
  PlatformPermissionDeniedError,
  assertPlatformCan,
  canPlatform,
  isPlatformPermission,
  platformPermissionsFor,
} from './permissions';

describe('platform permissions', () => {
  it('defines a permission set for every platform role', () => {
    for (const role of PLATFORM_ROLES) {
      expect(PLATFORM_ROLE_PERMISSIONS[role]).toBeDefined();
    }
    expect(Object.keys(PLATFORM_ROLE_PERMISSIONS)).toHaveLength(PLATFORM_ROLES.length);
  });

  it('grants super_admin everything', () => {
    for (const permission of PLATFORM_PERMISSIONS) {
      expect(canPlatform('super_admin', permission)).toBe(true);
    }
  });

  it('grants no role a permission outside the catalogue', () => {
    const known = new Set<string>(PLATFORM_PERMISSIONS);
    for (const role of PLATFORM_ROLES) {
      for (const permission of PLATFORM_ROLE_PERMISSIONS[role]) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  /**
   * The load-bearing rule from spec §6.1: a platform role is access to the *platform*, never to a
   * tenant's records. If somebody ever adds `platform.customers.view`, this fails and they have to
   * come and argue for it.
   */
  it('exposes no customer-data permission at all', () => {
    for (const permission of PLATFORM_PERMISSIONS) {
      expect(permission).not.toMatch(/customer|document|field_value|pii/i);
    }
  });

  describe('support_admin', () => {
    it('can read every operational surface', () => {
      for (const permission of [
        'platform.analytics.view',
        'platform.tenants.view',
        'platform.schemes.view',
        'platform.forms.view',
        'platform.scrapers.view',
        'platform.queue.view',
        'platform.jobs.view',
        'platform.audit.view',
      ] as const) {
        expect(canPlatform('support_admin', permission)).toBe(true);
      }
    });

    it('can write nothing', () => {
      const writes = PLATFORM_PERMISSIONS.filter((permission) =>
        /\.(edit|publish|delete|configure|run|review|manage)$/.test(permission),
      );
      expect(writes.length).toBeGreaterThan(0);
      for (const permission of writes) {
        expect(canPlatform('support_admin', permission)).toBe(false);
      }
    });
  });

  describe('separation of duties in the scraper pipeline', () => {
    /**
     * The whole point of splitting these two roles: whoever points the pipeline at a page is not
     * the person who decides that what came back is true.
     */
    it('lets a scraper_operator run scrapers but not review the queue', () => {
      expect(canPlatform('scraper_operator', 'platform.scrapers.run')).toBe(true);
      expect(canPlatform('scraper_operator', 'platform.scrapers.configure')).toBe(true);
      expect(canPlatform('scraper_operator', 'platform.queue.view')).toBe(true);
      expect(canPlatform('scraper_operator', 'platform.queue.review')).toBe(false);
    });

    it('lets a content_manager review the queue but not configure or run scrapers', () => {
      expect(canPlatform('content_manager', 'platform.queue.review')).toBe(true);
      expect(canPlatform('content_manager', 'platform.scrapers.configure')).toBe(false);
      expect(canPlatform('content_manager', 'platform.scrapers.run')).toBe(false);
    });

    it('never lets a scraper_operator publish to the catalogue by another route', () => {
      for (const permission of [
        'platform.schemes.edit',
        'platform.schemes.publish',
        'platform.schemes.delete',
        'platform.deadlines.edit',
        'platform.queue.review',
      ] as const) {
        expect(canPlatform('scraper_operator', permission)).toBe(false);
      }
    });
  });

  it('reserves team management for super_admin', () => {
    for (const role of PLATFORM_ROLES) {
      expect(canPlatform(role, 'platform.team.manage')).toBe(role === 'super_admin');
    }
  });

  it('reserves scheme deletion for super_admin', () => {
    for (const role of PLATFORM_ROLES) {
      expect(canPlatform(role, 'platform.schemes.delete')).toBe(role === 'super_admin');
    }
  });

  it('lets a content_manager edit and publish schemes and deadlines', () => {
    for (const permission of [
      'platform.schemes.edit',
      'platform.schemes.publish',
      'platform.deadlines.edit',
      'platform.forms.edit',
    ] as const) {
      expect(canPlatform('content_manager', permission)).toBe(true);
    }
  });

  it('unions the permissions of several roles', () => {
    const combined = platformPermissionsFor(['scraper_operator', 'content_manager']);
    expect(combined.has('platform.scrapers.run')).toBe(true);
    expect(combined.has('platform.queue.review')).toBe(true);
    expect(combined.has('platform.team.manage')).toBe(false);
  });

  it('accepts a single role as well as an array', () => {
    expect(platformPermissionsFor('support_admin')).toEqual(
      platformPermissionsFor(['support_admin']),
    );
  });

  it('grants nothing for an unknown role', () => {
    expect(platformPermissionsFor(['nonsense' as PlatformRole]).size).toBe(0);
  });

  describe('assertPlatformCan', () => {
    it('passes when the role holds the permission', () => {
      expect(() => assertPlatformCan('super_admin', 'platform.team.manage')).not.toThrow();
    });

    it('throws a 403 naming the permission', () => {
      try {
        assertPlatformCan('support_admin', 'platform.schemes.publish');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(PlatformPermissionDeniedError);
        const denied = error as PlatformPermissionDeniedError;
        expect(denied.status).toBe(403);
        expect(denied.permission).toBe('platform.schemes.publish');
      }
    });
  });

  it('recognises only real permissions', () => {
    expect(isPlatformPermission('platform.queue.review')).toBe(true);
    expect(isPlatformPermission('platform.queue.approve')).toBe(false);
    expect(isPlatformPermission('customer.view')).toBe(false);
    expect(isPlatformPermission(null)).toBe(false);
  });
});
