import 'server-only';

import { z } from 'zod';
import {
  SCHEME_CATEGORIES,
  schemeEligibilityCriteriaSchema,
  schemeScheduleSchema,
  type CandidateScheme,
  type SchemeDefinition,
} from '@assistigo/core';
import type { Json } from '../supabase/database.types';

/**
 * Turning a scheme into `schemes_catalog` columns.
 *
 * One mapper, used by the editor, the bulk deadline screen and the queue publisher alike, because
 * three hand-written column lists is three chances for one of them to forget `is_always_open` and
 * leave a row that violates `schemes_catalog_evergreen_has_no_end`.
 */

const localisedTextSchema = z.object({
  en: z.string().trim().min(1).max(2000),
  hi: z.string().trim().min(1).max(2000),
});

/**
 * What an employee may submit for a global scheme.
 *
 * Mirrors `schemeDefinitionSchema` minus `id`, and re-states the constraints rather than deriving
 * them, because this is a *write* boundary: the database checks the same rules again, and a Zod
 * error naming the field is a better outcome than a Postgres constraint violation naming nothing.
 */
export const adminSchemeInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'schemes.invalid_slug'),
  category: z.enum(SCHEME_CATEGORIES),
  title: localisedTextSchema,
  shortDescription: localisedTextSchema,
  benefitsSummary: localisedTextSchema,
  benefitHighlight: localisedTextSchema,
  portalName: z.string().trim().min(1).max(120),
  portalUrl: z.string().url(),
  adapterSlug: z.string().trim().min(1).max(80).nullable().optional(),
  officialNotificationUrl: z.string().url().nullable(),
  schedule: schemeScheduleSchema,
  estimatedOperatorFee: z.number().int().min(0).max(10_000),
  eligibility: schemeEligibilityCriteriaSchema,
  pitchTemplate: localisedTextSchema,
  upcomingPitchTemplate: localisedTextSchema,
  isPublished: z.boolean(),
});

export type AdminSchemeInput = z.infer<typeof adminSchemeInputSchema>;

/**
 * Just the window.
 *
 * Separate from the full editor because changing dates is the highest-frequency content task by
 * a wide margin, and making an employee round-trip the whole definition to move one date is how
 * an unrelated field gets clobbered.
 */
export const adminScheduleInputSchema = schemeScheduleSchema;

export type SchemeCatalogWrite = {
  slug: string;
  category: string;
  title: Json;
  short_description: Json;
  benefits_summary: Json;
  benefit_highlight: Json;
  portal_name: string;
  portal_url: string;
  adapter_slug: string | null;
  official_notification_url: string | null;
  application_start_date: string | null;
  application_end_date: string | null;
  is_always_open: boolean;
  exam_date: string | null;
  estimated_operator_fee: number;
  eligibility: Json;
  pitch_template: Json;
  upcoming_pitch_template: Json;
};

/**
 * Scheme fields to database columns. Callers add `source`, `is_published` and provenance.
 *
 * `logo_path` is deliberately not among them: logos have their own upload action, and a save,
 * a scraper publish or a built-in copy must never be able to set or clear one.
 */
export function toSchemeCatalogWrite(
  scheme: AdminSchemeInput | CandidateScheme | SchemeDefinition,
): SchemeCatalogWrite {
  return {
    slug: scheme.slug,
    category: scheme.category,
    title: scheme.title as Json,
    short_description: scheme.shortDescription as Json,
    benefits_summary: scheme.benefitsSummary as Json,
    benefit_highlight: scheme.benefitHighlight as Json,
    portal_name: scheme.portalName,
    portal_url: scheme.portalUrl,
    adapter_slug: scheme.adapterSlug ?? null,
    official_notification_url: scheme.officialNotificationUrl,
    application_start_date: scheme.schedule.applicationStartDate,
    application_end_date: scheme.schedule.applicationEndDate,
    is_always_open: scheme.schedule.isAlwaysOpen,
    exam_date: scheme.schedule.examDate,
    estimated_operator_fee: scheme.estimatedOperatorFee,
    eligibility: scheme.eligibility as Json,
    pitch_template: scheme.pitchTemplate as Json,
    upcoming_pitch_template: scheme.upcomingPitchTemplate as Json,
  };
}

/**
 * A blank draft for the "new scheme" form.
 *
 * Unpublished, with no application window. Both defaults are deliberate: a half-written scheme
 * must not be live, and a window nobody has entered yet has to read as "unknown" rather than as a
 * date somebody guessed — the built-in catalogue ships the same way, and for the same reason
 * (packages/core/src/schemes/catalog.ts).
 */
export function emptySchemeInput(): AdminSchemeInput {
  const blank = { en: '', hi: '' };
  return {
    slug: '',
    category: 'recruitment',
    title: blank,
    shortDescription: blank,
    benefitsSummary: blank,
    benefitHighlight: blank,
    portalName: '',
    portalUrl: '',
    adapterSlug: null,
    officialNotificationUrl: null,
    schedule: {
      applicationStartDate: null,
      applicationEndDate: null,
      isAlwaysOpen: false,
      examDate: null,
    },
    estimatedOperatorFee: 0,
    eligibility: {},
    pitchTemplate: blank,
    upcomingPitchTemplate: blank,
    isPublished: false,
  };
}

/**
 * A stored row as editor input.
 *
 * Lenient where `schemeFromRow` is strict, and that difference is the point: a row that fails
 * validation still has to open in the editor, because the editor is where somebody repairs it.
 * Unreadable jsonb columns fall back to blanks rather than throwing, so a broken row renders as a
 * form with empty fields instead of a 500.
 */
export function schemeInputFromRow(row: {
  slug: string;
  category: string;
  title: Json;
  short_description: Json;
  benefits_summary: Json;
  benefit_highlight: Json;
  portal_name: string;
  portal_url: string;
  adapter_slug: string | null;
  official_notification_url: string | null;
  application_start_date: string | null;
  application_end_date: string | null;
  is_always_open: boolean;
  exam_date: string | null;
  estimated_operator_fee: number;
  eligibility: Json;
  pitch_template: Json;
  upcoming_pitch_template: Json;
  is_published: boolean;
}): AdminSchemeInput {
  const text = (value: Json): { en: string; hi: string } => {
    const parsed = localisedTextSchema.safeParse(value);
    return parsed.success ? parsed.data : { en: '', hi: '' };
  };

  const category = (SCHEME_CATEGORIES as readonly string[]).includes(row.category)
    ? (row.category as AdminSchemeInput['category'])
    : 'recruitment';

  const eligibility = schemeEligibilityCriteriaSchema.safeParse(row.eligibility);

  return {
    slug: row.slug,
    category,
    title: text(row.title),
    shortDescription: text(row.short_description),
    benefitsSummary: text(row.benefits_summary),
    benefitHighlight: text(row.benefit_highlight),
    portalName: row.portal_name,
    portalUrl: row.portal_url,
    adapterSlug: row.adapter_slug,
    officialNotificationUrl: row.official_notification_url,
    schedule: {
      applicationStartDate: row.application_start_date,
      applicationEndDate: row.application_end_date,
      isAlwaysOpen: row.is_always_open,
      examDate: row.exam_date,
    },
    estimatedOperatorFee: row.estimated_operator_fee,
    eligibility: eligibility.success ? eligibility.data : {},
    pitchTemplate: text(row.pitch_template),
    upcomingPitchTemplate: text(row.upcoming_pitch_template),
    isPublished: row.is_published,
  };
}
