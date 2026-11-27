/**
 * Family profiles ("Ek Phone, Poora Parivar"): one citizen keeps documents for the people they
 * look after — Papa, Mummy, a sister — in folders of their own inside the same vault.
 *
 * A family member is a relation and, optionally, a name. Both live only in the encrypted vault
 * index (`vault-index.ts`): never in the plaintext settings file, never sent, never logged. The
 * citizen themselves ("You") is not a member; a document without a `memberId` is theirs.
 *
 * A family member's documents stay on this phone. The cloud vault and centre access belong to
 * the signed-in citizen alone, so syncing Papa's Aadhaar would hand it to a centre as the
 * citizen's own; sharing a family member's documents with a centre needs a product and legal
 * decision first (consent of an adult family member, DPDP Act 2023).
 *
 * Pure, so it is unit tested.
 */

import { z } from 'zod';

import type { VaultDocument } from '../vault/vault-index';

/** Relations offered when adding a member, in display order. Copy at `family.relations.<r>`. */
export const FAMILY_RELATIONS = [
  'father',
  'mother',
  'spouse',
  'son',
  'daughter',
  'brother',
  'sister',
  'grandfather',
  'grandmother',
  'other',
] as const;
export type FamilyRelation = (typeof FAMILY_RELATIONS)[number];

/** A household rarely needs more; it also keeps the switcher one short row. */
export const MAX_FAMILY_MEMBERS = 8;
export const MAX_MEMBER_NAME_LENGTH = 40;

/** How far ahead "expiring soon" looks, matching the earliest reminder (30 days before). */
export const EXPIRY_SOON_DAYS = 30;

export const familyMemberSchema = z.object({
  id: z.string().uuid(),
  relation: z.enum(FAMILY_RELATIONS),
  /** What the citizen calls them, if more than the relation ("Ramesh", "Chhoti"). */
  name: z.string().min(1).max(MAX_MEMBER_NAME_LENGTH).optional(),
  createdAt: z.string().datetime(),
});
export type FamilyMember = z.infer<typeof familyMemberSchema>;

/**
 * Whose documents are on screen: `null` is the citizen themselves, otherwise a member's id.
 * Routes pass it as the `SELF` string where a value must be a string (option sheets).
 */
export type MemberId = string | null;
export const SELF = 'self';

export function memberValue(memberId: MemberId): string {
  return memberId ?? SELF;
}

export function memberIdFromValue(value: string): MemberId {
  return value === SELF ? null : value;
}

/** A typed name, trimmed and with inner spaces collapsed; null when nothing is left. */
export function normaliseMemberName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_MEMBER_NAME_LENGTH).trim();
  return name.length > 0 ? name : null;
}

/** The member a document belongs to; null for the citizen's own. */
export function ownerOf(document: Pick<VaultDocument, 'memberId'>): MemberId {
  return document.memberId ?? null;
}

/** The documents of one person: the citizen's own for `null`. */
export function documentsOf<T extends Pick<VaultDocument, 'memberId'>>(
  documents: readonly T[],
  memberId: MemberId,
): T[] {
  return documents.filter((document) => ownerOf(document) === memberId);
}

/**
 * The member shown when `wanted` is asked for: itself while it still exists, otherwise the
 * citizen. A member removed on another screen never leaves a screen showing nobody.
 */
export function resolveMember(
  members: readonly Pick<FamilyMember, 'id'>[],
  wanted: MemberId,
): MemberId {
  if (wanted === null) return null;
  return members.some((member) => member.id === wanted) ? wanted : null;
}

export type ExpiryAlert = {
  /** Past their expiry date. */
  readonly expired: number;
  /** Expiring today or within `EXPIRY_SOON_DAYS`. */
  readonly soon: number;
};

const NO_ALERT: ExpiryAlert = { expired: 0, soon: 0 };

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Whether an ISO date is past, within the window, or later, judged by the phone's calendar. */
export function expiryState(expiresOn: string, now: Date): 'expired' | 'soon' | 'later' {
  const today = localDay(now);
  if (expiresOn < today) return 'expired';
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + EXPIRY_SOON_DAYS);
  return expiresOn <= localDay(horizon) ? 'soon' : 'later';
}

/**
 * Expired and soon-to-expire documents per person, keyed by `memberValue` (`SELF` for the
 * citizen). People with nothing to flag are left out.
 */
export function expiryAlerts(
  documents: readonly Pick<VaultDocument, 'memberId' | 'expiresOn'>[],
  now: Date,
): ReadonlyMap<string, ExpiryAlert> {
  const alerts = new Map<string, ExpiryAlert>();
  for (const document of documents) {
    if (!document.expiresOn) continue;
    const state = expiryState(document.expiresOn, now);
    if (state === 'later') continue;
    const key = memberValue(ownerOf(document));
    const current = alerts.get(key) ?? NO_ALERT;
    alerts.set(
      key,
      state === 'expired'
        ? { ...current, expired: current.expired + 1 }
        : { ...current, soon: current.soon + 1 },
    );
  }
  return alerts;
}

/** Documents per person, keyed like `expiryAlerts`. */
export function documentCounts(
  documents: readonly Pick<VaultDocument, 'memberId'>[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const document of documents) {
    const key = memberValue(ownerOf(document));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The translation key of a relation's label ("Papa"). */
export function relationLabelKey(relation: FamilyRelation): string {
  return `family.relations.${relation}`;
}

/**
 * What the app calls a member: their name when they have one, else the relation. Two members
 * with the same relation and no name ("Sister", "Sister") get a number from the second on, so
 * the switcher never shows two identical chips.
 */
export function memberLabels(
  members: readonly FamilyMember[],
  relationLabel: (relation: FamilyRelation) => string,
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const member of members) {
    const base = member.name ?? relationLabel(member.relation);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    labels.set(member.id, count > 1 ? `${base} ${count}` : base);
  }
  return labels;
}

/** One chip of the member switcher. */
export type MemberChip = {
  /** `SELF` for the citizen, otherwise the member's id. */
  readonly value: string;
  readonly label: string;
  /** Something of theirs has expired or expires soon. */
  readonly alert: boolean;
};

/** The switcher's chips: the citizen first, then members in the order they were added. */
export function switcherChips(
  members: readonly FamilyMember[],
  labels: ReadonlyMap<string, string>,
  alerts: ReadonlyMap<string, ExpiryAlert>,
  youLabel: string,
): MemberChip[] {
  const alerted = (key: string) => {
    const alert = alerts.get(key);
    return alert !== undefined && alert.expired + alert.soon > 0;
  };
  return [
    { value: SELF, label: youLabel, alert: alerted(SELF) },
    ...members.map((member) => ({
      value: member.id,
      label: labels.get(member.id) ?? member.name ?? member.relation,
      alert: alerted(member.id),
    })),
  ];
}

/** One row of the Family screen. */
export type FamilyRow = {
  /** `SELF` or the member's id. */
  readonly value: string;
  readonly label: string;
  /** The relation under a member's own name ("Papa"); null when it is already the label. */
  readonly relation: string | null;
  readonly documentCount: number;
  readonly alert: ExpiryAlert;
  /** Whose documents Home and the Vault tab show now. */
  readonly selected: boolean;
  /** The citizen's own row has no menu. */
  readonly editable: boolean;
};

/** The Family screen's rows: the citizen first, then each member in the order added. */
export function familyRows(input: {
  readonly members: readonly FamilyMember[];
  readonly labels: ReadonlyMap<string, string>;
  readonly documents: readonly Pick<VaultDocument, 'memberId' | 'expiresOn'>[];
  readonly now: Date;
  readonly active: MemberId;
  readonly youLabel: string;
  readonly relationLabel: (relation: FamilyRelation) => string;
}): FamilyRow[] {
  const counts = documentCounts(input.documents);
  const alerts = expiryAlerts(input.documents, input.now);
  const self: FamilyRow = {
    value: SELF,
    label: input.youLabel,
    relation: null,
    documentCount: counts.get(SELF) ?? 0,
    alert: alerts.get(SELF) ?? NO_ALERT,
    selected: input.active === null,
    editable: false,
  };
  return [
    self,
    ...input.members.map((member) => ({
      value: member.id,
      label: input.labels.get(member.id) ?? input.relationLabel(member.relation),
      relation: member.name ? input.relationLabel(member.relation) : null,
      documentCount: counts.get(member.id) ?? 0,
      alert: alerts.get(member.id) ?? NO_ALERT,
      selected: input.active === member.id,
      editable: true,
    })),
  ];
}

/** Up to two letters for a member's round badge: "Papa" → "P", "Ramesh Kumar" → "RK". */
export function memberInitials(label: string): string {
  const words = label.split(' ').filter(Boolean);
  const initial = (word: string | undefined) => word?.match(/\p{L}/u)?.[0] ?? '';
  const first = initial(words[0]);
  const last = words.length > 1 ? initial(words[words.length - 1]) : '';
  const initials = (first + last).toLocaleUpperCase('en-IN');
  return initials.length > 0 ? initials : '?';
}
