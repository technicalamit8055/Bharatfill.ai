/**
 * The portals adapter work is aimed at next, and the hosts each one is served from.
 * docs/FORM_ENGINE.md §6c; docs/ROADMAP.md Phase 5.
 *
 * This is a coverage list, not an adapter: nothing here is ever matched against a live page by
 * the mapper. The admin panel uses it to show, per portal, whether an adapter exists yet and how
 * many operator contributions are waiting — so the contributions decide which adapter gets
 * written next, instead of label patterns guessed without the live form in front of anyone.
 *
 * Hosts were written from public knowledge and NOT checked against each live portal
 * (`hostsVerified: false`). Government portals move domains (NSDL → Protean, nic.in → gov.in);
 * confirm a host from a real session before trusting a coverage number for it.
 */

import { urlPatternToRegExp } from './adapters';

export const PORTAL_TARGET_GROUPS = ['exams', 'identity', 'welfare', 'state'] as const;
export type PortalTargetGroup = (typeof PORTAL_TARGET_GROUPS)[number];

export type PortalTarget = {
  code: string;
  name: string;
  group: PortalTargetGroup;
  region?: string;
  /** Origin globs, e.g. `https://*.ntaonline.in`. `*` stays within one host label. */
  hosts: readonly string[];
  /** Built-in adapter slugs that already cover this portal. */
  builtInSlugs?: readonly string[];
  hostsVerified: boolean;
};

export const PORTAL_TARGETS: readonly PortalTarget[] = [
  // --- national exams -------------------------------------------------------
  {
    code: 'nta',
    name: 'NTA (NEET / JEE Main / CUET)',
    group: 'exams',
    hosts: ['https://*.ntaonline.in', 'https://*.nta.ac.in', 'https://*.nta.nic.in'],
    hostsVerified: false,
  },
  {
    code: 'ssc',
    name: 'SSC',
    group: 'exams',
    hosts: ['https://ssc.gov.in', 'https://*.ssc.gov.in'],
    builtInSlugs: ['ssc-portal'],
    hostsVerified: true,
  },
  {
    code: 'rrb',
    name: 'Railway RRB',
    group: 'exams',
    hosts: ['https://www.rrbapply.gov.in', 'https://rrbapply.gov.in'],
    hostsVerified: false,
  },
  {
    code: 'ibps',
    name: 'IBPS',
    group: 'exams',
    hosts: ['https://ibpsonline.ibps.in', 'https://www.ibps.in'],
    hostsVerified: false,
  },
  {
    code: 'upsc',
    name: 'UPSC',
    group: 'exams',
    hosts: ['https://upsconline.gov.in', 'https://upsconline.nic.in'],
    hostsVerified: false,
  },
  // --- identity and documents -----------------------------------------------
  {
    code: 'sarathi',
    name: 'Parivahan Sarathi (driving licence)',
    group: 'identity',
    hosts: ['https://sarathi.parivahan.gov.in'],
    hostsVerified: false,
  },
  {
    code: 'vahan',
    name: 'Parivahan Vahan (vehicle RC)',
    group: 'identity',
    hosts: ['https://vahan.parivahan.gov.in'],
    hostsVerified: false,
  },
  {
    code: 'pan-protean',
    name: 'PAN — Protean (NSDL)',
    group: 'identity',
    hosts: ['https://onlineservices.proteantech.in', 'https://*.nsdl.com'],
    hostsVerified: false,
  },
  {
    code: 'pan-utiitsl',
    name: 'PAN — UTIITSL',
    group: 'identity',
    hosts: ['https://www.pan.utiitsl.com', 'https://pan.utiitsl.com'],
    hostsVerified: false,
  },
  {
    code: 'passport',
    name: 'Passport Seva',
    group: 'identity',
    hosts: ['https://*.passportindia.gov.in'],
    hostsVerified: false,
  },
  // --- welfare and social security ------------------------------------------
  {
    code: 'epfo',
    name: 'EPFO member portal',
    group: 'welfare',
    hosts: ['https://unifiedportal-mem.epfindia.gov.in'],
    hostsVerified: false,
  },
  {
    code: 'pmjay',
    name: 'Ayushman Bharat / PM-JAY',
    group: 'welfare',
    hosts: ['https://beneficiary.nha.gov.in', 'https://*.pmjay.gov.in'],
    hostsVerified: false,
  },
  {
    code: 'nsp',
    name: 'National Scholarship Portal',
    group: 'welfare',
    hosts: ['https://scholarships.gov.in', 'https://*.scholarships.gov.in'],
    hostsVerified: false,
  },
  // --- state e-District -----------------------------------------------------
  {
    code: 'up-edistrict',
    name: 'Uttar Pradesh e-District',
    group: 'state',
    region: 'Uttar Pradesh',
    hosts: ['https://edistrict.up.gov.in', 'https://*.edistrict.up.gov.in'],
    hostsVerified: false,
  },
  {
    code: 'bihar-rtps',
    name: 'Bihar RTPS (ServicePlus)',
    group: 'state',
    region: 'Bihar',
    hosts: ['https://serviceonline.bihar.gov.in'],
    builtInSlugs: ['bihar-rtps-serviceonline'],
    hostsVerified: true,
  },
  {
    code: 'mp-edistrict',
    name: 'Madhya Pradesh e-District',
    group: 'state',
    region: 'Madhya Pradesh',
    hosts: ['https://mpedistrict.gov.in', 'https://www.mpedistrict.gov.in'],
    hostsVerified: false,
  },
  {
    code: 'rajasthan-sso',
    name: 'Rajasthan SSO / e-Mitra',
    group: 'state',
    region: 'Rajasthan',
    hosts: ['https://sso.rajasthan.gov.in', 'https://emitra.rajasthan.gov.in'],
    hostsVerified: false,
  },
  {
    code: 'maharashtra-aaple-sarkar',
    name: 'Maharashtra Aaple Sarkar',
    group: 'state',
    region: 'Maharashtra',
    hosts: ['https://aaplesarkar.mahaonline.gov.in'],
    hostsVerified: false,
  },
  {
    code: 'jharkhand-jharsewa',
    name: 'Jharkhand JharSewa',
    group: 'state',
    region: 'Jharkhand',
    hosts: ['https://jharsewa.jharkhand.gov.in'],
    hostsVerified: false,
  },
];

/** The target a page origin belongs to, or `null`. Case-insensitive, origin only. */
export function portalTargetForOrigin(origin: string): PortalTarget | null {
  const normalised = origin.trim().replace(/\/+$/, '');
  for (const target of PORTAL_TARGETS) {
    if (target.hosts.some((host) => urlPatternToRegExp(host).test(normalised))) return target;
  }
  return null;
}
