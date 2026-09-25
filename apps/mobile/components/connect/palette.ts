/**
 * Connect tab colour tokens.
 *
 * Connect is light-only branded artwork like Home and the vault, drawn from the same mockup
 * set: its CSC illustration is a flat JPEG on white, blended into a light card. So it shares
 * Home's page, card and text colours, and keeps its own values here to obey the "no hex
 * literals in a component" rule.
 *
 * Icon hues sit above 3:1 on their tints; text on the tints stays above 4.5:1.
 */

import type { CscOffering } from '../../lib/connect/connect-screen';
import { homePalette } from '../home/palette';

type Tint = {
  /** The card or tile behind the icon. */
  readonly tile: string;
  readonly border: string;
  /** The round well the icon sits in. */
  readonly badge: string;
  readonly icon: string;
};

export const connectPalette = {
  background: homePalette.background,
  surface: homePalette.surface,
  border: homePalette.border,
  cardShadow: homePalette.cardShadow,

  heading: '#0B1736',
  textPrimary: homePalette.textPrimary,
  textSecondary: homePalette.textSecondary,
  textMuted: homePalette.textMuted,

  brandBlue: homePalette.brandBlue,
  brandBluePressed: homePalette.brandBluePressed,
  onBrand: homePalette.onBrand,

  /** The round help button in the header. */
  headerButton: '#EAF0FA',
  headerIcon: '#1E293B',

  /** "Find a nearby Common Service Center" hero. */
  heroGradient: ['#DCEAFF', '#EAF3FF', '#F4F9FF'],

  /** White chevron circles on the action cards. */
  chevronWell: '#FFFFFF',
  chevronIcon: '#1E293B',

  actions: {
    find_nearby: { tile: '#EEF9F2', border: '#D8F0E1', badge: '#D3F1DF', icon: '#16A34A' },
    share_document: { tile: '#EEF4FF', border: '#DCE8FF', badge: '#D6E6FF', icon: '#1D6BFF' },
    connections: { tile: '#FFF5EB', border: '#FFE6CF', badge: '#FFE3C6', icon: '#EA6A0C' },
    request_help: { tile: '#F5F1FF', border: '#E6DCFF', badge: '#E5D9FF', icon: '#7C3AED' },
  } satisfies Record<string, Tint>,

  services: {
    form_filling: { tile: '#FFF1F3', border: '#FDDDE3', badge: '#FDDDE3', icon: '#E11D48' },
    document_upload: { tile: '#EEF4FF', border: '#DCE8FF', badge: '#D6E6FF', icon: '#1D6BFF' },
    identity_services: { tile: '#EEF9F2', border: '#D8F0E1', badge: '#D3F1DF', icon: '#16A34A' },
    scholarship: { tile: '#F5F1FF', border: '#E6DCFF', badge: '#E5D9FF', icon: '#7C3AED' },
    pension_welfare: { tile: '#FFF5EB', border: '#FFE6CF', badge: '#FFE3C6', icon: '#EA6A0C' },
    other_government: { tile: '#FFF1F3', border: '#FDDDE3', badge: '#FDDDE3', icon: '#E11D48' },
  } satisfies Record<string, Tint>,

  /** Nearby centre card. */
  photoWell: '#EAF1FB',
  openBadge: { background: '#DCF5E6', text: '#15703A' },
  closedBadge: { background: '#EEF2F7', text: '#475569' },
  offeringChip: { background: '#F4F6FA', text: '#1E293B' },
  offeringIcons: {
    aadhaar: '#EA6A0C',
    pan: '#1D6BFF',
    voter_id: '#7C3AED',
    other: '#475569',
  },
  dot: '#CBD5E1',
  dotActive: homePalette.brandBlue,
  emptyBorder: homePalette.emptyBorder,

  /** Nearby CSC Centers: search field, chips and the List / Map switch. */
  finder: {
    fieldBorder: '#DDE5F0',
    chipBorder: '#DDE5F0',
    chipText: '#1E293B',
    chipSelected: homePalette.brandBlue,
    onChipSelected: homePalette.onBrand,
    filterBadge: '#FFFFFF',
    toggleBorder: '#DDE5F0',
    toggleText: '#475569',
    cardSelectedBorder: '#9CC2FF',
    bookmark: '#1D56C9',
  },

  /** Open / closed line on a centre card. Both colours stay above 4.5:1 on white. */
  status: {
    openDot: '#16A34A',
    openText: '#15803D',
    closedDot: '#DC2626',
    closedText: '#C81E1E',
  },

  /** Service chips on a Nearby CSC Centers card. */
  serviceChip: { background: '#EEF4FF', text: '#1D56C9' },

  /** Get Directions and Notify Me: pale buttons beside the blue Connect. */
  secondaryButton: { background: '#EAF2FF', text: '#1D56C9', pressed: '#DCE9FF' },
  mutedButton: { background: '#EEF2F7', text: '#334155', pressed: '#E2E8F0' },

  /** A centre's details: the round buttons over the photo, the info strip and the footer. */
  details: {
    overlayButton: '#FFFFFF',
    overlayIcon: '#0B1736',
    overlayShadow: '#0F172A',
    favourite: '#E11D48',
    counter: '#0F172ACC',
    onCounter: '#FFFFFF',
    divider: '#E3EAF5',
    hours: { badge: '#E3EDFF', icon: '#1D6BFF' },
    contact: { badge: '#E3EDFF', icon: '#1D6BFF' },
    verified: { badge: '#DCF5E6', icon: '#16A34A' },
    phoneText: '#1D56C9',
    bannerGradient: ['#DDEBFF', '#EEF5FF'],
    outlineButtonBorder: homePalette.brandBlue,
  },

  /** Available Services rows, by service. Icons stay above 3:1 on their tint. */
  detailServices: {
    form_filling: { tile: '#EEF4FF', border: '#DCE8FF', badge: '#D6E6FF', icon: '#1D6BFF' },
    document_upload: { tile: '#EEF9F2', border: '#D8F0E1', badge: '#D3F1DF', icon: '#16A34A' },
    aadhaar: { tile: '#FFF5EB', border: '#FFE6CF', badge: '#FFE3C6', icon: '#EA6A0C' },
    pan: { tile: '#F5F1FF', border: '#E6DCFF', badge: '#E5D9FF', icon: '#7C3AED' },
    voter_id: { tile: '#FFF1F3', border: '#FDDDE3', badge: '#FDDDE3', icon: '#E11D48' },
    ration_card: { tile: '#FFF5EB', border: '#FFE6CF', badge: '#FFE3C6', icon: '#C2410C' },
    pension: { tile: '#EEF9F2', border: '#D8F0E1', badge: '#D3F1DF', icon: '#15803D' },
    scholarship: { tile: '#F5F1FF', border: '#E6DCFF', badge: '#E5D9FF', icon: '#7C3AED' },
    certificates: { tile: '#EEF4FF', border: '#DCE8FF', badge: '#D6E6FF', icon: '#1D56C9' },
    bill_payment: { tile: '#EEF9F2', border: '#D8F0E1', badge: '#D3F1DF', icon: '#16A34A' },
    caste_certificate: { tile: '#FFF1F3', border: '#FDDDE3', badge: '#FDDDE3', icon: '#BE123C' },
  } satisfies Record<CscOffering, Tint>,

  /** The drawn map preview: an illustration, not map tiles. */
  map: {
    land: '#EDF2EA',
    park: '#DCEAD2',
    water: '#B9D9F2',
    majorRoad: '#F3D36B',
    minorRoad: '#FFFFFF',
    pin: '#1D6BFF',
    pinSelected: '#16A34A',
    halo: '#16A34A',
    distanceLabel: '#1E3A8A',
    onDistanceLabel: '#FFFFFF',
    control: '#FFFFFF',
    controlShadow: '#0F172A',
  },
} as const;
