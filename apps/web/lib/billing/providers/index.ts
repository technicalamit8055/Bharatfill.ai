import 'server-only';
import { providerUnavailable, type BillingProvider } from '@assistigo/core';
import { serverEnv } from '@/lib/env';
import type { AssistigoSupabaseClient } from '@/lib/supabase/server';
import { MockBillingProvider } from './mock';

/**
 * The one place that knows which `BillingProvider` is live (§22.2) — routes and pages never
 * branch on the provider name themselves.
 */
export function getBillingProvider(supabase: AssistigoSupabaseClient): BillingProvider {
  const name = serverEnv().BILLING_PROVIDER;
  if (name === 'mock') return new MockBillingProvider(supabase);
  // Razorpay/Stripe: no SDK or credentials wired up yet. The interface is ready for a real
  // implementation to drop in here without any route or page needing to change.
  throw providerUnavailable('errors.provider_unavailable');
}
