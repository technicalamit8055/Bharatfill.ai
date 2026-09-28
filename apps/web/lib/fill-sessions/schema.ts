import { z } from 'zod';
import { APPLICATION_CATEGORIES } from '../applications/schema';

export const FILL_SESSION_STATUSES = [
  'detected',
  'reviewed',
  'filled',
  'failed',
  'cancelled',
] as const;

export const fillSessionSearchSchema = z.object({
  status: z.enum(FILL_SESSION_STATUSES).optional(),
  customerId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type FillSessionSearchInput = z.infer<typeof fillSessionSearchSchema>;

export const createApplicationFromSessionSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  category: z.enum(APPLICATION_CATEGORIES).optional().default('other'),
});
export type CreateApplicationFromSessionInput = z.infer<typeof createApplicationFromSessionSchema>;
