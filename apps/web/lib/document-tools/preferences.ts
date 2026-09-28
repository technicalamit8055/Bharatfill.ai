import {
  DEFAULT_TOOL_PREFERENCES,
  parseToolPreferences,
  type ToolPreferences,
} from '@assistigo/document-tools';

/**
 * Where an operator's document-tool starting values live: this browser, on this computer.
 *
 * Deliberately not the database. These are counter habits — the paper in this shop's printer,
 * the copies this shop usually hands over — not organization policy, and they hold no customer
 * data, so there is nothing a server copy would protect and one more table RLS would have to.
 *
 * Every read and write is guarded: storage throws in private windows and when site data is
 * blocked, and a tool must still open with the built-in defaults when it does.
 */

const STORAGE_KEY = 'assistigo.documentTools.preferences.v1';

export function readToolPreferences(): ToolPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? DEFAULT_TOOL_PREFERENCES : parseToolPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_TOOL_PREFERENCES;
  }
}

/** Returns false when the browser refused to store it, so the form can say so. */
export function writeToolPreferences(preferences: ToolPreferences): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parseToolPreferences(preferences)));
    return true;
  } catch {
    return false;
  }
}
