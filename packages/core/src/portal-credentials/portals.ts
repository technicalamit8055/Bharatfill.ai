/**
 * The portals the credential vault knows how to log in to.
 * Master spec §19.7a; docs/FORM_ENGINE.md § Portal login catalogue.
 *
 * A portal only gets a one-click login when it has at least one allow-listed host. `other` is a
 * vault entry with no hosts: the operator can store and reveal it, and print a slip for it,
 * but the extension never types it anywhere, because there is no host to check the page against.
 *
 * Hosts are matched with `hostMatchesAllowList` (exact or subdomain on a dot boundary). Adding a
 * host widens where a citizen's password can be typed, so it is a reviewed code change, never
 * operator or tenant configuration.
 */

import { isAllowedLoginLocation } from './hosts';

export const PORTAL_KEYS = [
  'ssc',
  'upsc',
  'uppsc',
  'bpsc',
  'rajasthan_sso',
  'haryana_ppp',
  'other',
] as const;

export type PortalKey = (typeof PORTAL_KEYS)[number];

type LocalisedText = { en: string; hi: string };

/**
 * What a generated password must satisfy.
 *
 * These are conservative values that the portals in the catalogue are expected to accept, not
 * a transcription of each portal's published rule. A portal that rejects a generated password
 * gets its own policy here.
 */
export type PasswordPolicy = {
  minLength: number;
  maxLength: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
  requireSpecial: boolean;
  /** The special characters the generator may use. Kept to ones every portal here accepts. */
  specials: string;
};

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 14,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSpecial: true,
  specials: '@#$',
};

export type PortalDefinition = {
  key: PortalKey;
  name: LocalisedText;
  /** What the portal calls the identifier the citizen logs in with. */
  loginIdLabel: LocalisedText;
  /** Where the operator should open the portal. Display only — never used to decide a fill. */
  homeUrl: string | null;
  /** Allow-listed login hosts. Empty means vault-only: no one-click login. */
  hosts: readonly string[];
  passwordPolicy: PasswordPolicy;
};

export const PORTALS: readonly PortalDefinition[] = [
  {
    key: 'ssc',
    name: { en: 'SSC One-Time Registration', hi: 'SSC वन-टाइम रजिस्ट्रेशन' },
    loginIdLabel: { en: 'Registration number', hi: 'रजिस्ट्रेशन नंबर' },
    homeUrl: 'https://ssc.gov.in/',
    hosts: ['ssc.gov.in'],
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
  },
  {
    key: 'upsc',
    name: { en: 'UPSC One-Time Registration', hi: 'UPSC वन-टाइम रजिस्ट्रेशन' },
    loginIdLabel: { en: 'OTR ID', hi: 'OTR आईडी' },
    homeUrl: 'https://upsconline.nic.in/',
    hosts: ['upsconline.nic.in', 'upsconline.gov.in'],
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
  },
  {
    key: 'uppsc',
    name: { en: 'UPPSC One-Time Registration', hi: 'UPPSC वन-टाइम रजिस्ट्रेशन' },
    loginIdLabel: { en: 'OTR number', hi: 'OTR नंबर' },
    homeUrl: 'https://uppsc.up.nic.in/',
    hosts: ['uppsc.up.nic.in'],
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
  },
  {
    key: 'bpsc',
    name: { en: 'BPSC One-Time Registration', hi: 'BPSC वन-टाइम रजिस्ट्रेशन' },
    loginIdLabel: { en: 'Registration ID', hi: 'रजिस्ट्रेशन आईडी' },
    homeUrl: 'https://onlinebpsc.bihar.gov.in/',
    hosts: ['onlinebpsc.bihar.gov.in', 'bpsc.bihar.gov.in'],
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
  },
  {
    key: 'rajasthan_sso',
    name: { en: 'Rajasthan SSO ID', hi: 'राजस्थान SSO आईडी' },
    loginIdLabel: { en: 'SSO ID', hi: 'SSO आईडी' },
    homeUrl: 'https://sso.rajasthan.gov.in/',
    hosts: ['sso.rajasthan.gov.in'],
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
  },
  {
    key: 'haryana_ppp',
    name: { en: 'Haryana Parivar Pehchan Patra', hi: 'हरियाणा परिवार पहचान पत्र' },
    loginIdLabel: { en: 'Family ID / login ID', hi: 'फैमिली आईडी / लॉगिन आईडी' },
    homeUrl: 'https://meraparivar.haryana.gov.in/',
    hosts: ['meraparivar.haryana.gov.in'],
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
  },
  {
    key: 'other',
    name: { en: 'Other portal', hi: 'अन्य पोर्टल' },
    loginIdLabel: { en: 'Login ID', hi: 'लॉगिन आईडी' },
    homeUrl: null,
    hosts: [],
    passwordPolicy: DEFAULT_PASSWORD_POLICY,
  },
];

const PORTAL_BY_KEY: ReadonlyMap<PortalKey, PortalDefinition> = new Map(
  PORTALS.map((portal) => [portal.key, portal]),
);

export function isPortalKey(value: unknown): value is PortalKey {
  return typeof value === 'string' && (PORTAL_KEYS as readonly string[]).includes(value);
}

export function getPortal(key: PortalKey): PortalDefinition {
  // Every key in PORTAL_KEYS has an entry; the test suite holds that invariant.
  return PORTAL_BY_KEY.get(key) as PortalDefinition;
}

/** True when the extension may offer a one-click login for this portal. */
export function supportsOneClickLogin(key: PortalKey): boolean {
  return getPortal(key).hosts.length > 0;
}

/**
 * The portal whose login a page belongs to, or null.
 *
 * Null for anything that is not `https:` on an allow-listed host — which is the whole check
 * standing between a saved password and a look-alike phishing page.
 */
export function portalForUrl(url: string): PortalDefinition | null {
  for (const portal of PORTALS) {
    if (portal.hosts.length === 0) continue;
    if (isAllowedLoginLocation(url, portal.hosts)) return portal;
  }
  return null;
}
