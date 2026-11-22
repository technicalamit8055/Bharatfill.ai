/**
 * The free, signed-out copies of the document tools under `/tools`.
 *
 * Same editors as the dashboard's `/document-tools`, mounted without a session. They work
 * because every crop, resize, compress and page edit already runs in the visitor's browser
 * (`packages/document-tools/src/browser`) — a guest page makes no API call at all. What needs an
 * account is everything that keeps a file somewhere: saving a copy to a customer profile, and
 * the PDF bundle, which reads a customer's stored documents. Those show a sign-up / sign-in
 * prompt instead (`components/document-tools/tool-access.tsx`).
 *
 * The slugs are the words people search for, not the dashboard's internal names, because these
 * pages exist to be found.
 */

import { DOCUMENT_TOOL_CARDS, type DocumentToolId } from './hub';

export const PUBLIC_TOOLS_HREF = '/tools';

export type PublicTool = {
  id: DocumentToolId;
  slug: string;
  /** Public URL of the tool. */
  href: string;
  /** The same tool inside the signed-in dashboard. */
  appHref: string;
};

const SLUGS: Record<DocumentToolId, string> = {
  photoSignature: 'photo-signature-resizer',
  passportGrid: 'passport-photo-maker',
  pvcCard: 'pvc-card-maker',
  pdfStudio: 'pdf-merge-compress',
};

/** In hub order, so the public grid and the dashboard grid list the tools the same way. */
export const PUBLIC_TOOLS: readonly PublicTool[] = DOCUMENT_TOOL_CARDS.map((card) => ({
  id: card.id,
  slug: SLUGS[card.id],
  href: `${PUBLIC_TOOLS_HREF}/${SLUGS[card.id]}`,
  appHref: card.href,
}));

export function publicTool(id: DocumentToolId): PublicTool {
  const tool = PUBLIC_TOOLS.find((candidate) => candidate.id === id);
  if (!tool) throw new Error(`No public page for document tool ${id}`);
  return tool;
}

/** Copy every public tool page reads for its own tool. */
export const PUBLIC_TOOL_COPY_FIELDS = [
  'metaTitle',
  'metaDescription',
  'heading',
  'description',
  'stepOne',
  'stepTwo',
  'stepThree',
] as const;

export function publicToolCopyKey(
  id: DocumentToolId,
  field: (typeof PUBLIC_TOOL_COPY_FIELDS)[number],
): string {
  return `publicTools.tools.${id}.${field}`;
}

/** What a free account adds, in display order. `bundle` is the one that links to a tool. */
export const ACCOUNT_FEATURES = ['save', 'bundle', 'autofill', 'track'] as const;
export type AccountFeature = (typeof ACCOUNT_FEATURES)[number];

/** Questions answered on every public tools page, and in its FAQPage structured data. */
export const PUBLIC_FAQ = ['free', 'upload', 'presets', 'account'] as const;

/** Shared copy keys, listed so the catalogue test covers the whole of every public page. */
export const PUBLIC_TOOLS_COPY_KEYS = [
  'publicTools.meta.title',
  'publicTools.meta.description',
  'publicTools.hub.eyebrow',
  'publicTools.hub.title',
  'publicTools.hub.subtitle',
  'publicTools.benefits.free',
  'publicTools.benefits.private',
  'publicTools.benefits.presets',
  'publicTools.benefits.print',
  'publicTools.back',
  'publicTools.steps.heading',
  'publicTools.account.eyebrow',
  'publicTools.account.title',
  'publicTools.account.body',
  'publicTools.account.signUp',
  'publicTools.account.signIn',
  'publicTools.account.openDashboard',
  'publicTools.account.locked',
  'publicTools.gate.saveTitle',
  'publicTools.gate.saveBody',
  'publicTools.gate.saveSignedIn',
  'publicTools.gate.bundle',
  'publicTools.faq.heading',
  ...ACCOUNT_FEATURES.flatMap((feature) => [
    `publicTools.account.features.${feature}.title`,
    `publicTools.account.features.${feature}.body`,
  ]),
  ...PUBLIC_FAQ.flatMap((question) => [
    `publicTools.faq.${question}.q`,
    `publicTools.faq.${question}.a`,
  ]),
] as const;

export const SIGN_UP_HREF = '/sign-up';

/**
 * Where a guest is sent for a feature that needs an account: sign-in, returning to the same tool
 * inside the dashboard. Someone who already looks signed in goes straight there.
 *
 * `appHref` comes from the catalogue above, never from the URL, and `safeNext` on the sign-in
 * side re-checks it is a same-origin path.
 */
export function accountFeatureHref(appHref: string, signedIn: boolean): string {
  if (signedIn) return appHref;
  return `/sign-in?next=${encodeURIComponent(appHref)}`;
}

/** `@supabase/ssr`'s session cookie: `sb-<project ref>-auth-token`, chunked as `.0`, `.1`, … */
const AUTH_COOKIE = /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i;

/**
 * Whether the visitor probably has a session, from cookie names alone.
 *
 * A display hint and nothing more: it picks "Open in your dashboard" over "Sign in" on a public
 * page. It reads no cookie value and decides no access — the dashboard route behind the link
 * re-checks the session, the permission and RLS, exactly as for anyone else.
 */
export function looksSignedIn(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) if (AUTH_COOKIE.test(name)) return true;
  return false;
}
