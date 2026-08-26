import { z } from 'zod';

export const createFormReportSchema = z.object({
  pageOrigin: z.string().trim().min(1).max(300),
  pagePath: z.string().trim().max(300).optional(),
  pageTitle: z.string().trim().max(300).optional(),
  note: z.string().trim().max(1000).optional(),
  portalAdapterId: z.string().uuid().optional(),
});
export type CreateFormReportInput = z.infer<typeof createFormReportSchema>;
