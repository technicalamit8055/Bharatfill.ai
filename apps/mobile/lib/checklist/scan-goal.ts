/**
 * What a checklist wants from a scan, carried through the scanner or Upload in route params:
 * `type` is what to file the document as, `from` the checklist to return to once it is saved.
 * Both come from a URL, so anything unrecognised is dropped.
 */

import { DOCUMENT_TYPES, type DocumentType } from '@assistigo/core';
import type { Href } from 'expo-router';
import { z } from 'zod';

import { formBySlug } from './checklist';

export type ScanGoal = {
  readonly documentType: DocumentType | null;
  /** Null ends on the scan result, like any other scan. */
  readonly returnTo: Href | null;
};

export type ChecklistOrigin =
  | { readonly screen: 'home' }
  | { readonly screen: 'checklist' }
  | { readonly screen: 'form'; readonly slug: string };

const FORM_PREFIX = 'form:';

export function originParam(origin: ChecklistOrigin): string {
  return origin.screen === 'form' ? `${FORM_PREFIX}${origin.slug}` : origin.screen;
}

function returnRoute(from: unknown): Href | null {
  if (from === 'checklist') return '/checklist';
  if (typeof from !== 'string' || !from.startsWith(FORM_PREFIX)) return null;
  const form = formBySlug(from.slice(FORM_PREFIX.length));
  return form ? { pathname: '/form-checklist', params: { slug: form.slug } } : null;
}

/** The goal in a route's params; null when the scan was not started from a checklist. */
export function parseScanGoal(type: unknown, from: unknown): ScanGoal | null {
  const parsed = z.enum(DOCUMENT_TYPES).safeParse(type);
  const documentType = parsed.success ? parsed.data : null;
  const returnTo = returnRoute(from);
  return documentType || returnTo ? { documentType, returnTo } : null;
}
