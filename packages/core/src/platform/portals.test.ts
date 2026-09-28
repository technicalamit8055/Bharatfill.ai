import { describe, expect, it } from 'vitest';
import { PLATFORM_ROLES } from '../auth/roles';
import {
  CONSOLE_PORTALS,
  CONSOLE_PORTAL_PATHS,
  consolePortalFor,
  isConsolePortal,
  isRoleAllowedAtPortal,
} from './portals';

describe('console portals', () => {
  it('sends super_admin to the super admin portal and nobody else', () => {
    for (const role of PLATFORM_ROLES) {
      expect(consolePortalFor(role) === 'super_admin').toBe(role === 'super_admin');
    }
  });

  it('accepts every role at exactly one portal', () => {
    for (const role of PLATFORM_ROLES) {
      const accepted = CONSOLE_PORTALS.filter((portal) => isRoleAllowedAtPortal(role, portal));
      expect(accepted).toHaveLength(1);
    }
  });

  /**
   * The rule that makes the two doors mean something: the stricter portal is not optional for the
   * role it exists for, and the lesser one never admits it.
   */
  it('refuses a super_admin at the team portal', () => {
    expect(isRoleAllowedAtPortal('super_admin', 'team')).toBe(false);
  });

  it('refuses every team role at the super admin portal', () => {
    for (const role of ['content_manager', 'scraper_operator', 'support_admin'] as const) {
      expect(isRoleAllowedAtPortal(role, 'super_admin')).toBe(false);
      expect(isRoleAllowedAtPortal(role, 'team')).toBe(true);
    }
  });

  it('gives each portal its own same-origin sign-in path', () => {
    const paths = Object.values(CONSOLE_PORTAL_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path).toMatch(/^\/[a-z]/);
  });

  it('recognises only real portals', () => {
    expect(isConsolePortal('team')).toBe(true);
    expect(isConsolePortal('super_admin')).toBe(true);
    expect(isConsolePortal('admin')).toBe(false);
    expect(isConsolePortal(undefined)).toBe(false);
  });
});
