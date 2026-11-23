/**
 * How the operator sidebar sits on a desktop screen.
 *
 * - `expanded`  — full width, labels showing; the page is laid out beside it.
 * - `collapsed` — an icon rail; labels are tooltips.
 * - `hover`     — the icon rail, which opens to full width over the page while pointed at
 *                 (or focused), without shifting the page under it.
 *
 * Kept in a cookie rather than localStorage so the server renders the right width on the
 * first paint, instead of the rail jumping once the client has read the preference. It is a
 * layout preference only — nothing about the operator or a customer goes in it.
 */
export const SIDEBAR_MODES = ['expanded', 'collapsed', 'hover'] as const;

export type SidebarMode = (typeof SIDEBAR_MODES)[number];

export const SIDEBAR_MODE_COOKIE = 'bf-sidebar-mode';

export const DEFAULT_SIDEBAR_MODE: SidebarMode = 'expanded';

/** Anything unknown — a missing cookie, an old value, a hand-edited one — falls back. */
export function parseSidebarMode(value: string | undefined | null): SidebarMode {
  return SIDEBAR_MODES.find((mode) => mode === value) ?? DEFAULT_SIDEBAR_MODE;
}

/** A year, site-wide, readable by the server on the next request. */
export function sidebarModeCookie(mode: SidebarMode): string {
  return `${SIDEBAR_MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
}
