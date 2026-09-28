/**
 * The console's colour theme preference.
 *
 * Stored in a cookie rather than localStorage so the server renders the right theme on the first
 * byte: `system` is resolved by a CSS media query (tailwind.config.ts), and an explicit choice is
 * an attribute the server already knows. Nothing flashes the wrong colours while JavaScript loads.
 *
 * A display preference, not a security boundary — hence a plain, readable cookie.
 */

export const CONSOLE_THEMES = ['system', 'light', 'dark'] as const;
export type ConsoleTheme = (typeof CONSOLE_THEMES)[number];

export const CONSOLE_THEME_COOKIE = 'bf_console_theme';

export function parseConsoleTheme(value: unknown): ConsoleTheme {
  return typeof value === 'string' && (CONSOLE_THEMES as readonly string[]).includes(value)
    ? (value as ConsoleTheme)
    : 'system';
}
