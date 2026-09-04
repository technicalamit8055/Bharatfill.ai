/**
 * Zod schemas for the applications API surface (§21).
 */

import { z } from 'zod';
import { APPLICATION_DOCUMENT_STATUSES, APPLICATION_STATUSES } from '@assistigo/core';

const trimmedString = (max: number) => z.string().trim().max(max);

export const APPLICATION_CATEGORIES = [
  'government',
  'recruitment',
  'scholarship',
  'education',
  'banking',
  'certificate',
  'utility',
  'other',
] as const;
export type ApplicationCategory = (typeof APPLICATION_CATEGORIES)[number];

export const APPLICATION_PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'] as const;

/** The list view's tab filter — not a raw `applications.status` value. */
export const APPLICATION_LIST_FILTERS = [
  'all',
  'open',
  'pending_documents',
  'submitted',
  'completed',
] as const;
export type ApplicationListFilter = (typeof APPLICATION_LIST_FILTERS)[number];

export const applicationSearchSchema = z.object({
  filter: z.enum(APPLICATION_LIST_FILTERS).optional().default('all'),
  category: z.enum(APPLICATION_CATEGORIES).optional(),
  q: z.string().trim().max(200).optional(),
  customerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ApplicationSearchInput = z.infer<typeof applicationSearchSchema>;

export const createApplicationSchema = z.object({
  customerId: z.string().uuid(),
  portalAdapterId: z.string().uuid().optional(),
  title: z.string().trim().min(2, 'validation.value_required').max(200),
  category: z.enum(APPLICATION_CATEGORIES).optional().default('other'),
  portalName: trimmedString(160).optional(),
  formName: trimmedString(160).optional(),
  portalUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
  deadlineAt: z.string().trim().optional(),
  amountCharged: z.coerce.number().nonnegative().optional(),
  paymentStatus: z.enum(APPLICATION_PAYMENT_STATUSES).optional(),
  assignedTo: z.string().uuid().optional(),
  notes: trimmedString(2000).optional(),
  /**
   * The fill session that produced this application (extension "Save as an application"),
   * retroactively linked to it once the application row exists — see POST handler.
   */
  fillSessionId: z.string().uuid().optional(),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const updateApplicationSchema = z.object({
  title: z.string().trim().min(2, 'validation.value_required').max(200).optional(),
  category: z.enum(APPLICATION_CATEGORIES).optional(),
  portalName: trimmedString(160).optional(),
  formName: trimmedString(160).optional(),
  portalUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
  portalReferenceNumber: trimmedString(120).optional(),
  deadlineAt: z.string().trim().nullable().optional(),
  amountCharged: z.coerce.number().nonnegative().nullable().optional(),
  paymentStatus: z.enum(APPLICATION_PAYMENT_STATUSES).nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: trimmedString(2000).nullable().optional(),
});
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const changeApplicationStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  note: trimmedString(500).optional(),
});
export type ChangeApplicationStatusInput = z.infer<typeof changeApplicationStatusSchema>;

export const addApplicationDocumentSchema = z.object({
  requirementKey: z.string().trim().min(1).max(80),
  requirementLabel: trimmedString(200).optional(),
  documentId: z.string().uuid().optional(),
  derivativeId: z.string().uuid().optional(),
  presetId: z.string().uuid().optional(),
  status: z.enum(APPLICATION_DOCUMENT_STATUSES).optional().default('required'),
  notes: trimmedString(500).optional(),
});
export type AddApplicationDocumentInput = z.infer<typeof addApplicationDocumentSchema>;

export const updateApplicationDocumentSchema = z.object({
  documentId: z.string().uuid().nullable().optional(),
  derivativeId: z.string().uuid().nullable().optional(),
  status: z.enum(APPLICATION_DOCUMENT_STATUSES).optional(),
  requirementLabel: trimmedString(200).nullable().optional(),
  notes: trimmedString(500).nullable().optional(),
});
export type UpdateApplicationDocumentInput = z.infer<typeof updateApplicationDocumentSchema>;
