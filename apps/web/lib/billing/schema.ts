import { z } from 'zod';
import { planCodeSchema } from '@assistigo/core';

export const checkoutSchema = z.object({
  // Any well-formed code; whether it is a live plan is the provider's check against the table.
  planCode: planCodeSchema,
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const billingWebhookSchema = z.object({
  provider: z.enum(['mock', 'razorpay', 'stripe']),
  eventId: z.string().trim().min(1).max(200),
  eventType: z.string().trim().min(1).max(120),
  payload: z.unknown(),
});
export type BillingWebhookInput = z.infer<typeof billingWebhookSchema>;
