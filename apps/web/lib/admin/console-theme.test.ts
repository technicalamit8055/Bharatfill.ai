import { describe, expect, it } from 'vitest';
import { CONSOLE_THEMES, parseConsoleTheme } from './console-theme';

describe('parseConsoleTheme', () => {
  it('accepts the three themes', () => {
    for (const theme of CONSOLE_THEMES) expect(parseConsoleTheme(theme)).toBe(theme);
  });

  /** A tampered or stale cookie must still render a usable console, following the device. */
  it('falls back to system for anything else', () => {
    for (const value of [undefined, null, '', 'Light', 'sepia', 42, ['dark']]) {
      expect(parseConsoleTheme(value)).toBe('system');
    }
  });
});
