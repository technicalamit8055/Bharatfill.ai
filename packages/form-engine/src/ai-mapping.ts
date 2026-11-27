/**
 * AI-assisted mapping — priority 5 in the resolution order (§14.3), field metadata only.
 * docs/FORM_ENGINE.md §6d.
 *
 * This module is pure: it decides *which* boxes are worth asking about, builds the description
 * that is sent, writes the prompt and checks the answer. The network call, the vendor
 * credentials and the cache live in the web app (apps/web/lib/forms/ai-mapping.ts).
 *
 * Four rules hold whatever the model says:
 *
 * 1. **No customer value is ever sent.** The request is built from `DetectedField` metadata, and
 *    every text in it goes through `sanitiseContributionText` (emails and PAN-shaped text dropped,
 *    long digit runs masked) — the same cleaning as a shared contribution, because a portal can
 *    print a pre-filled applicant's details beside a box. Option *values* are not sent either.
 * 2. **Only leftovers are asked about.** A box an adapter, override, history or the dictionary
 *    already placed is never sent, and neither is a CAPTCHA, OTP, payment, submit, file, password
 *    or hidden box (`unteachableReason`).
 * 3. **The answer is a candidate, not a decision.** Only keys in the customer field registry and
 *    only refs that were asked about survive `parseAiMappingResponse`.
 * 4. **An AI mapping is always reviewed.** Its confidence is capped below the high band, so the
 *    operator ticks every one by hand (mapper.ts), and the safety classifier still runs first.
 */

import { z } from 'zod';
import { CUSTOMER_FIELDS, isCustomerFieldKey } from '@assistigo/core';
import {
  contributionPathPattern,
  sanitiseContributionAttribute,
  sanitiseContributionText,
  unteachableReason,
} from './contributions';
import type { DetectedField, FieldMapping, PageContext } from './types';

/** Bumped whenever the prompt or the descriptor changes, so cached answers are re-asked. */
export const AI_MAPPING_PROMPT_VERSION = 'v1';

/** Boxes sent in one request. A long form's remainder stays unmapped rather than slowing Detect. */
export const AI_MAPPING_MAX_FIELDS = 40;

/** Below the high band (0.9): an AI mapping is never filled without the operator's tick. */
export const AI_CONFIDENCE_CAP = 0.85;

/** Answers the model is less sure of than this are dropped rather than shown. */
export const AI_MIN_CONFIDENCE = 0.5;

const OPTION_LIMIT = 25;
const OPTION_TEXT_MAX = 60;
const NEARBY_MAX = 160;

/** One box as the model sees it. `ref` is the only link back to the page. */
export type AiFieldDescriptor = {
  ref: string;
  tag: DetectedField['tagName'];
  type: string;
  label: string | null;
  ariaLabel: string | null;
  placeholder: string | null;
  section: string | null;
  nearby: string | null;
  name: string | null;
  id: string | null;
  options: string[] | null;
  required: boolean;
  maxLength: number | null;
};

export type AiMappingRequest = {
  /** Host only — which portal this is, without any path an applicant's id could sit in. */
  portal: string;
  pathPattern: string;
  fields: AiFieldDescriptor[];
  /** `ref` → the field's signature, kept server-side; never sent. */
  signatures: Record<string, string>;
};

/** What the mapper consumes: the model's pick for one box. */
export type AiFieldMapping = {
  fieldSignature: string;
  customerField: string;
  confidence: number;
};

/**
 * The boxes worth asking about: everything the earlier steps left as `no_mapping`, that is
 * visible, editable and safe to fill.
 */
export function aiMappingCandidates(
  fields: readonly DetectedField[],
  mappings: readonly FieldMapping[],
): DetectedField[] {
  const unmapped = new Set(
    mappings
      .filter(
        (mapping) =>
          mapping.customerField === null &&
          mapping.skipReason === 'no_mapping' &&
          mapping.safetyClass === 'normal',
      )
      .map((mapping) => mapping.signature),
  );
  return fields
    .filter(
      (field) =>
        unmapped.has(field.signature) &&
        field.visible !== false &&
        !field.disabled &&
        !field.readOnly &&
        unteachableReason(field) === null,
    )
    .slice(0, AI_MAPPING_MAX_FIELDS);
}

function cleanOptions(field: DetectedField): string[] | null {
  if (!field.options || field.options.length === 0) return null;
  const labels: string[] = [];
  for (const option of field.options) {
    const text = sanitiseContributionText(option.label);
    if (!text) continue;
    labels.push(text.slice(0, OPTION_TEXT_MAX));
    if (labels.length >= OPTION_LIMIT) break;
  }
  return labels.length > 0 ? labels : null;
}

/** The description of one box that may leave the server. */
export function describeFieldForAi(field: DetectedField, ref: string): AiFieldDescriptor {
  return {
    ref,
    tag: field.tagName,
    type: field.inputType.slice(0, 40),
    label: sanitiseContributionText(field.labelText),
    ariaLabel: sanitiseContributionText(field.ariaLabel),
    placeholder: sanitiseContributionText(field.placeholder),
    section: sanitiseContributionText(field.sectionHeading),
    nearby: sanitiseContributionText(field.nearbyText)?.slice(0, NEARBY_MAX) ?? null,
    name: sanitiseContributionAttribute(field.name),
    id: sanitiseContributionAttribute(field.id),
    options: cleanOptions(field),
    required: field.required,
    maxLength: field.maxLength,
  };
}

/** Whether a description has anything a model could read a meaning from. */
function isDescribable(descriptor: AiFieldDescriptor): boolean {
  return Boolean(
    descriptor.label ??
      descriptor.ariaLabel ??
      descriptor.placeholder ??
      descriptor.name ??
      descriptor.id ??
      descriptor.nearby,
  );
}

export function buildAiMappingRequest(
  candidates: readonly DetectedField[],
  page: Pick<PageContext, 'origin' | 'path'>,
): AiMappingRequest | null {
  let portal: string;
  try {
    portal = new URL(page.origin).hostname;
  } catch {
    return null;
  }

  const fields: AiFieldDescriptor[] = [];
  const signatures: Record<string, string> = {};
  for (const field of candidates.slice(0, AI_MAPPING_MAX_FIELDS)) {
    const ref = `f${fields.length + 1}`;
    const descriptor = describeFieldForAi(field, ref);
    if (!isDescribable(descriptor)) continue;
    fields.push(descriptor);
    signatures[ref] = field.signature;
  }
  if (fields.length === 0) return null;

  return { portal, pathPattern: contributionPathPattern(page.path), fields, signatures };
}

/**
 * A stable key for one box's description on one portal, for the shared cache. The web app hashes
 * it. `ref` is left out (it is a position in this request, not a property of the box).
 */
export function aiDescriptorCacheKey(portal: string, descriptor: AiFieldDescriptor): string {
  const { ref: _ref, ...rest } = descriptor;
  return JSON.stringify([AI_MAPPING_PROMPT_VERSION, portal.toLowerCase(), rest]);
}

const KEY_CATALOGUE = CUSTOMER_FIELDS.map(
  (field) => `${field.key} — ${field.label.en} / ${field.label.hi}`,
).join('\n');

export const AI_MAPPING_SYSTEM_PROMPT = `You map the boxes of an Indian government web form to a fixed list of customer profile keys.

You are given each box's label, section heading, nearby text, attribute names and options. You are never given any person's details, and you must not invent any.

For every box, answer with the one key the box asks for, or null when no key fits or you are not sure. A wrong key is worse than null: an operator will review your answer, but a confident wrong guess wastes their time.

Rules:
- A box for a father's, mother's, guardian's or spouse's name is never the applicant's own name (customer.full_name).
- Present / correspondence address boxes use customer.address.*; permanent address boxes use customer.permanent_address.*.
- A box asking for a CAPTCHA, OTP, password, PIN, card or payment detail is always null.
- A yes/no question, a declaration, or a choice about the application itself (exam centre, post preference, fee category) is null unless a key clearly matches.
- Labels may be in English, Hindi or Hinglish.

Answer with JSON only, no prose:
{"mappings":[{"ref":"f1","key":"customer.full_name","confidence":0.0}]}
Include every ref exactly once. confidence is 0 to 1.

Allowed keys:
${KEY_CATALOGUE}`;

/** The user turn: the portal and its leftover boxes, as JSON. */
export function buildAiMappingUserPrompt(request: AiMappingRequest): string {
  const boxes = request.fields.map((field) => {
    // Nulls and empties dropped to keep the request small; the model reads absence fine.
    const entries = Object.entries(field).filter(
      ([, value]) => value !== null && value !== false && !(Array.isArray(value) && value.length === 0),
    );
    return Object.fromEntries(entries);
  });
  return JSON.stringify({ portal: request.portal, page: request.pathPattern, boxes });
}

const responseSchema = z.object({
  mappings: z
    .array(
      z.object({
        ref: z.string().max(10),
        key: z.string().max(120).nullable(),
        confidence: z.number().finite(),
      }),
    )
    .max(AI_MAPPING_MAX_FIELDS * 2),
});

/** The JSON object in a model reply, tolerating a ```json fence or a sentence around it. */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Per-ref answers, with null for "the model said none" (worth caching, so it is not re-asked).
 * Anything malformed, unknown, or about a box that was not asked about is discarded.
 */
export function parseAiMappingResponse(
  text: string,
  request: Pick<AiMappingRequest, 'signatures'>,
): Map<string, { customerField: string | null; confidence: number }> {
  const answers = new Map<string, { customerField: string | null; confidence: number }>();
  const parsed = responseSchema.safeParse(extractJson(text));
  if (!parsed.success) return answers;

  for (const item of parsed.data.mappings) {
    if (!(item.ref in request.signatures) || answers.has(item.ref)) continue;
    const confidence = Math.min(1, Math.max(0, item.confidence));
    if (item.key === null || item.key === '' || item.key === 'null') {
      answers.set(item.ref, { customerField: null, confidence });
      continue;
    }
    if (!isCustomerFieldKey(item.key)) continue;
    answers.set(item.ref, { customerField: item.key, confidence });
  }
  return answers;
}

/** The answers the mapper should use: confident enough, and capped below the high band. */
export function toAiFieldMappings(
  answers: ReadonlyMap<string, { customerField: string | null; confidence: number }>,
  signatures: Readonly<Record<string, string>>,
): AiFieldMapping[] {
  const result: AiFieldMapping[] = [];
  for (const [ref, answer] of answers) {
    const signature = signatures[ref];
    if (!signature || answer.customerField === null) continue;
    if (answer.confidence < AI_MIN_CONFIDENCE) continue;
    result.push({
      fieldSignature: signature,
      customerField: answer.customerField,
      confidence: Number(Math.min(AI_CONFIDENCE_CAP, answer.confidence).toFixed(3)),
    });
  }
  return result;
}
