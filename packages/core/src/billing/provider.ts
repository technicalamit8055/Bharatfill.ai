/**
 * Payment provider abstraction. Master spec §22.2.
 *
 * No provider-specific logic (Razorpay, Stripe, ...) may live outside a concrete
 * `BillingProvider` implementation — the rest of the app only ever talks to this interface, so
 * swapping or adding a provider never touches a route or a page.
 */

import type { PlanCode, SubscriptionStatus } from './plans';

export type CheckoutInput = {
  organizationId: string;
  planCode: PlanCode;
  /** Where the operator lands after a successful (redirect-based) checkout. */
  successUrl: string;
  /** Where the operator lands if they abandon checkout. */
  cancelUrl: string;
  customerEmail?: string | null;
};

/**
 * A provider either applies the plan change itself and reports the result (`mode: 'instant'` —
 * the mock provider, and any provider with no hosted checkout step), or hands back a URL the
 * operator must be redirected to, with the plan change arriving later via `handleWebhook`.
 */
export type CheckoutResult =
  | { mode: 'instant'; planCode: PlanCode; status: SubscriptionStatus }
  | { mode: 'redirect'; checkoutUrl: string };

export type WebhookInput = {
  /** The provider's own event id — the idempotency key alongside `provider` in the ledger. */
  providerEventId: string;
  eventType: string;
  payload: unknown;
};

export type WebhookResult = {
  result: 'processed' | 'ignored' | 'failed';
  reason?: string;
};

export type PortalInput = {
  organizationId: string;
  returnUrl: string;
};

export interface BillingProvider {
  readonly name: 'mock' | 'razorpay' | 'stripe';
  createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult>;
  handleWebhook(input: WebhookInput): Promise<WebhookResult>;
  /** URL for the operator to manage payment details / view invoices with the provider. */
  getPortalUrl(input: PortalInput): Promise<string>;
}
