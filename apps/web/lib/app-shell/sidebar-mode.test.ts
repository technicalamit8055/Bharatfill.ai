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

  it('falls back to the expand-on-hover sidebar for a missing or unknown value', () => {
    expect(DEFAULT_SIDEBAR_MODE).toBe('hover');
    expect(parseSidebarMode(undefined)).toBe('hover');
    expect(parseSidebarMode(null)).toBe('hover');
    expect(parseSidebarMode('')).toBe('hover');
    expect(parseSidebarMode('Collapsed')).toBe('hover');
    expect(parseSidebarMode('1')).toBe('hover');
  });

  it('writes a site-wide cookie holding only the mode', () => {
    const cookie = sidebarModeCookie('hover');
    expect(cookie.startsWith(`${SIDEBAR_MODE_COOKIE}=hover;`)).toBe(true);
    expect(cookie).toContain('path=/');
    expect(cookie).toContain('samesite=lax');
  });
});
