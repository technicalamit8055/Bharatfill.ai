import 'server-only';

import { z } from 'zod';
import type { TenantStatus } from '@assistigo/core';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type { PlatformTenantRow } from '../supabase/database.types';
import { logger } from '../api/logger';

/**
 * Platform analytics.
 *
 * This module is the *only* source of tenant data in the admin panel, and it reads exactly three
 * RPCs — `platform_metrics`, `platform_tenant_rows` (0021, widened in 0030) and
 * `platform_tenant_detail` (0030) — all of which return counts and organization metadata and
 * nothing else. That is the design, not an implementation detail: spec §6.1 lets internal staff
 * see organization metadata, usage and error reports, and does not let them see customer
 * records. Concentrating every tenant read into three reviewable SQL functions is what makes
 * that claim checkable.
 *
 * If an admin screen ever needs something these do not return, the answer is to widen the RPC
 * under review — not to add a `from('customers')` call here.
 */

const countsSchema = z.record(z.string(), z.number());

const platformMetricsSchema = z.object({
  windowDays: z.number().int().positive(),
  generatedAt: z.string(),
  tenants: z.object({
    total: z.number().int().nonnegative(),
    new: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    byPlan: countsSchema,
  }),
  members: z.object({
    total: z.number().int().nonnegative(),
    byRole: countsSchema,
  }),
  usage: z.object({
    customers: z.number().int().nonnegative(),
    applications: z.number().int().nonnegative(),
    documents: z.number().int().nonnegative(),
    fillSessions: z.number().int().nonnegative(),
    fieldsFilled: z.number().int().nonnegative(),
  }),
  safety: z.object({
    captchaFieldsSeen: z.number().int().nonnegative(),
    otpFieldsSeen: z.number().int().nonnegative(),
    paymentFieldsSeen: z.number().int().nonnegative(),
  }),
  jobs: z.object({
    pending: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  catalog: z.object({
    globalSchemes: z.number().int().nonnegative(),
    publishedSchemes: z.number().int().nonnegative(),
    closingSoon: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    globalAdapters: z.number().int().nonnegative(),
    activeAdapters: z.number().int().nonnegative(),
  }),
  scrapers: z.object({
    sources: z.number().int().nonnegative(),
    enabled: z.number().int().nonnegative(),
    unhealthy: z.number().int().nonnegative(),
    queuePending: z.number().int().nonnegative(),
    queueApproved: z.number().int().nonnegative(),
    queueRejected: z.number().int().nonnegative(),
  }),
});

export type PlatformMetrics = z.infer<typeof platformMetricsSchema>;

/** What the dashboard renders when the RPC is unavailable — every counter at zero, nothing invented. */
export const EMPTY_METRICS: PlatformMetrics = {
  windowDays: 30,
  generatedAt: new Date(0).toISOString(),
  tenants: { total: 0, new: 0, active: 0, byPlan: {} },
  members: { total: 0, byRole: {} },
  usage: { customers: 0, applications: 0, documents: 0, fillSessions: 0, fieldsFilled: 0 },
  safety: { captchaFieldsSeen: 0, otpFieldsSeen: 0, paymentFieldsSeen: 0 },
  jobs: { pending: 0, running: 0, failed: 0, completed: 0 },
  catalog: {
    globalSchemes: 0,
    publishedSchemes: 0,
    closingSoon: 0,
    expired: 0,
    globalAdapters: 0,
    activeAdapters: 0,
  },
  scrapers: {
    sources: 0,
    enabled: 0,
    unhealthy: 0,
    queuePending: 0,
    queueApproved: 0,
    queueRejected: 0,
  },
};

export type MetricsResult = {
  metrics: PlatformMetrics;
  /** False when the RPC failed or returned something unrecognised, so the UI can say so. */
  live: boolean;
};

/**
 * Reads the aggregate dashboard.
 *
 * Parsed rather than cast: a shape drift between this build and the deployed function would
 * otherwise render as `undefined` in a stat tile, and a dashboard that quietly shows nothing is
 * worse than one that says it could not load.
 */
export async function loadPlatformMetrics(
  supabase: AssistigoSupabaseClient,
  windowDays = 30,
): Promise<MetricsResult> {
  const { data, error } = await supabase.rpc('platform_metrics', { window_days: windowDays });

  if (error) {
    logger.error('platform.metrics_failed', { code: error.code, dbError: error.message });
    return { metrics: { ...EMPTY_METRICS, windowDays }, live: false };
  }

  const parsed = platformMetricsSchema.safeParse(data);
  if (!parsed.success) {
    logger.error('platform.metrics_shape_invalid', {
      issues: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
    return { metrics: { ...EMPTY_METRICS, windowDays }, live: false };
  }

  return { metrics: parsed.data, live: true };
}

export type TenantListOptions = {
  search?: string;
  limit?: number;
  offset?: number;
  status?: TenantStatus | null;
  plan?: string | null;
};

export type TenantListResult = {
  rows: PlatformTenantRow[];
  /** Matching centres across every page, or null when the database cannot say (pre-0030). */
  total: number | null;
  /**
   * False when the database still has the 0021 function: suspension and the status/plan filters
   * need migration 0030, and the page says so instead of silently ignoring them.
   */
  managementAvailable: boolean;
};

/** PostgREST's "no function with these arguments" and Postgres's own undefined-function code. */
const MISSING_FUNCTION = new Set(['PGRST202', '42883']);

/**
 * The tenant list: organization metadata and volumes.
 *
 * Search is by organization name only. There is deliberately no way to look a tenant up by one of
 * their customers — that is the query an internal user should have to open a support access grant
 * to run, and it is not offered here at all.
 *
 * Falls back to the three-argument 0021 function when 0030 is not applied yet, so deploying this
 * build ahead of the migration degrades the list rather than emptying it.
 */
export async function loadTenantRows(
  supabase: AssistigoSupabaseClient,
  options: TenantListOptions = {},
): Promise<TenantListResult> {
  const base = {
    search: options.search?.trim() || null,
    row_limit: Math.min(Math.max(options.limit ?? 50, 1), 200),
    row_offset: Math.max(options.offset ?? 0, 0),
  };

  const { data, error } = await supabase.rpc('platform_tenant_rows', {
    ...base,
    status_filter: options.status ?? null,
    plan_filter: options.plan?.trim() || null,
  });

  if (!error) {
    const rows = (data ?? []) as PlatformTenantRow[];
    const total = rows[0]?.total_count ?? (base.row_offset === 0 ? 0 : null);
    return { rows, total: total === null ? null : Number(total), managementAvailable: true };
  }

  if (MISSING_FUNCTION.has(error.code ?? '')) {
    const legacy = await supabase.rpc('platform_tenant_rows', base);
    if (legacy.error) {
      logger.error('platform.tenants_failed', { code: legacy.error.code, dbError: legacy.error.message });
      return { rows: [], total: null, managementAvailable: false };
    }
    return { rows: (legacy.data ?? []) as PlatformTenantRow[], total: null, managementAvailable: false };
  }

  logger.error('platform.tenants_failed', { code: error.code, dbError: error.message });
  return { rows: [], total: null, managementAvailable: true };
}

const tenantDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  businessType: z.string(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  state: z.string().nullable(),
  preferredLocale: z.string(),
  planCode: z.string(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  suspendedAt: z.string().nullable(),
  suspensionReason: z.string().nullable(),
  members: z.object({
    active: z.number().int().nonnegative(),
    invited: z.number().int().nonnegative(),
    byRole: countsSchema,
  }),
  volumes: z.object({
    customers: z.number().int().nonnegative(),
    documents: z.number().int().nonnegative(),
    applications: z.number().int().nonnegative(),
    fillSessions30d: z.number().int().nonnegative(),
    fieldsFilled30d: z.number().nonnegative(),
    storageBytes: z.number().nonnegative(),
  }),
  applicationsByStatus: countsSchema,
  lastActivityAt: z.string().nullable(),
  subscription: z
    .object({
      status: z.string(),
      provider: z.string(),
      planCode: z.string(),
      currentPeriodEnd: z.string().nullable(),
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
  usageThisPeriod: countsSchema,
});

export type TenantDetail = z.infer<typeof tenantDetailSchema>;

export type TenantDetailResult =
  | { status: 'ok'; detail: TenantDetail }
  | { status: 'not_found' }
  /** The RPC is missing (pre-0030) or returned something this build does not recognise. */
  | { status: 'unavailable' };

/**
 * One centre: metadata and counts from `platform_tenant_detail()` (0030), the third and last
 * tenant read in the panel. Same contract as the other two — no customer record in the result.
 */
export async function loadTenantDetail(
  supabase: AssistigoSupabaseClient,
  id: string,
): Promise<TenantDetailResult> {
  const { data, error } = await supabase.rpc('platform_tenant_detail', { org: id });

  if (error) {
    if (!MISSING_FUNCTION.has(error.code ?? '')) {
      logger.error('platform.tenant_detail_failed', { code: error.code, dbError: error.message });
    }
    return { status: 'unavailable' };
  }
  if (data === null) return { status: 'not_found' };

  const parsed = tenantDetailSchema.safeParse(data);
  if (!parsed.success) {
    logger.error('platform.tenant_detail_shape_invalid', {
      issues: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
    return { status: 'unavailable' };
  }
  return { status: 'ok', detail: parsed.data };
}
