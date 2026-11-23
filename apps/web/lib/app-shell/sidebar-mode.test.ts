import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIDEBAR_MODE,
  SIDEBAR_MODES,
  SIDEBAR_MODE_COOKIE,
  parseSidebarMode,
  sidebarModeCookie,
} from './sidebar-mode';

describe('sidebar mode preference', () => {
  it('reads back every mode it can write', () => {
    for (const mode of SIDEBAR_MODES) {
      expect(parseSidebarMode(mode)).toBe(mode);
    }
  });

  it('falls back to the expanded sidebar for a missing or unknown value', () => {
    expect(DEFAULT_SIDEBAR_MODE).toBe('expanded');
    expect(parseSidebarMode(undefined)).toBe('expanded');
    expect(parseSidebarMode(null)).toBe('expanded');
    expect(parseSidebarMode('')).toBe('expanded');
    expect(parseSidebarMode('Collapsed')).toBe('expanded');
    expect(parseSidebarMode('1')).toBe('expanded');
  });

  it('writes a site-wide cookie holding only the mode', () => {
    const cookie = sidebarModeCookie('hover');
    expect(cookie.startsWith(`${SIDEBAR_MODE_COOKIE}=hover;`)).toBe(true);
    expect(cookie).toContain('path=/');
    expect(cookie).toContain('samesite=lax');
  });
});
