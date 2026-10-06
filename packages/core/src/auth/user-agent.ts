/**
 * Turns a raw User-Agent string into the few words the sessions roster shows
 * ("Chrome on Windows"). Master spec §19.4 — device/session list.
 *
 * Deliberately coarse: browser family, OS family and a device class, never a version number or
 * device model. That is enough for a person to recognise their own devices, and nothing here is
 * worth fingerprinting. The names are product names and are shown untranslated; anything that
 * cannot be recognised comes back `null` for the UI to label.
 */

export type BrowserFamily =
  'Edge' | 'Opera' | 'Samsung Internet' | 'UC Browser' | 'Firefox' | 'Chrome' | 'Safari';

export type OsFamily = 'Windows' | 'Android' | 'iOS' | 'macOS' | 'ChromeOS' | 'Linux';

export type DeviceClass = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export type UserAgentSummary = {
  browser: BrowserFamily | null;
  os: OsFamily | null;
  device: DeviceClass;
};

/** First match wins, so every browser that also says "Chrome" or "Safari" comes before them. */
const BROWSERS: readonly [BrowserFamily, RegExp][] = [
  ['Edge', /\bEdg(?:e|A|iOS)?\//],
  ['Opera', /\b(?:OPR|OPiOS|Opera)\//],
  ['Samsung Internet', /\bSamsungBrowser\//],
  ['UC Browser', /\bUCBrowser\//],
  ['Firefox', /\b(?:Firefox|FxiOS)\//],
  ['Chrome', /\b(?:Chrome|CriOS)\//],
  ['Safari', /\bVersion\/[\d.]+.*\bSafari\//],
];

/** Android before Linux (Android UAs say "Linux"); iOS before macOS (iOS UAs say "Mac OS X"). */
const OPERATING_SYSTEMS: readonly [OsFamily, RegExp][] = [
  ['Windows', /\bWindows NT\b/],
  ['Android', /\bAndroid\b/],
  ['iOS', /\b(?:iPhone|iPad|iPod)\b/],
  ['ChromeOS', /\bCrOS\b/],
  ['macOS', /\bMacintosh\b/],
  ['Linux', /\bLinux\b/],
];

/** Longer than any real browser sends; a pathological header is not worth running regexes over. */
const MAX_USER_AGENT_LENGTH = 1024;

function firstMatch<T>(table: readonly [T, RegExp][], userAgent: string): T | null {
  for (const [name, pattern] of table) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
}

export function summarizeUserAgent(userAgent: string | null | undefined): UserAgentSummary {
  const ua = (userAgent ?? '').slice(0, MAX_USER_AGENT_LENGTH);

  const browser = firstMatch(BROWSERS, ua);
  const os = firstMatch(OPERATING_SYSTEMS, ua);

  let device: DeviceClass = 'unknown';
  if (/\biPad\b/.test(ua) || (os === 'Android' && !/\bMobile\b/.test(ua))) device = 'tablet';
  else if (os === 'iOS' || os === 'Android' || /\bMobi/.test(ua)) device = 'mobile';
  else if (os !== null) device = 'desktop';

  return { browser, os, device };
}
