import { z } from 'zod';
import { PLAN_CODES } from '@assistigo/core';

export const checkoutSchema = z.object({
  planCode: z.enum(PLAN_CODES),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const billingWebhookSchema = z.object({
  provider: z.enum(['mock', 'razorpay', 'stripe']),
  eventId: z.string().trim().min(1).max(200),
  eventType: z.string().trim().min(1).max(120),
  payload: z.unknown(),
});
export type BillingWebhookInput = z.infer<typeof billingWebhookSchema>;
