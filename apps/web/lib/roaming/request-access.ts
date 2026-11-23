import 'server-only';

import {
  conflict,
  notFound,
  type RoamingAccessRequestInput,
  type RoamingAccessRequestResult,
} from '@assistigo/core';
import type { RequestContext } from '../api/context';
import { createSupabaseAdminClient } from '../supabase/server';
import { requestAppApproval } from './app-approval';
import { operatorApprovalContext } from './approval-context';
import { requestRoamingOtp } from './service';

/**
 * One "Request access" for the operator (product owner 2026-11-23, migration 0046).
 *
 * The operator no longer chooses how the citizen approves. The server does:
 *   app  the customer's mobile is the verified sign-in number of a BharatDoc app account — the
 *        request goes to the app; the citizen sees the centre and purpose, picks how long and taps
 *        Approve (0039). The operator waits.
 *   otp  otherwise — a WhatsApp code for the window the operator picked (0024), read back at the
 *        counter.
 * The answer says which, so the operator knows whether to wait or to type a code. That tells the
 * centre whether this person uses the app; the product owner accepted that for the simpler flow.
 *
 * Who may ask is unchanged in spirit: the centre has the customer in its list — linked (0044),
 * or its own record the citizen locked (0046) — checked before anything else is looked up, so an
 * id from nowhere learns nothing.
 */

export type AccessRequestDeps = {
  /** `can_request_customer_access`, on the caller's own JWT. */
  canAsk: (customerId: string) => Promise<boolean>;
  /** The mobile on the customer record (service role); null when there is none. */
  customerMobile: (customerId: string) => Promise<string | null>;
  /** A BharatDoc app account is signed in with this number. */
  hasApp: (mobile: string) => Promise<boolean>;
  askApp: (
    customerId: string,
    input: Pick<RoamingAccessRequestInput, 'purpose' | 'targetSchemeSlug'>,
  ) => Promise<{ requestId: string; expiresAt: string }>;
  sendCode: (
    customerId: string,
    input: RoamingAccessRequestInput,
  ) => Promise<{ mobileLast4: string | null; expiresInSeconds: number }>;
};

export async function requestCustomerAccess(
  deps: AccessRequestDeps,
  customerId: string,
  input: RoamingAccessRequestInput,
): Promise<RoamingAccessRequestResult> {
  if (!(await deps.canAsk(customerId))) throw notFound('errors.not_found');

  const mobile = await deps.customerMobile(customerId);
  if (!mobile) throw conflict('errors.roaming_no_mobile_on_file');

  if (await deps.hasApp(mobile)) {
    const sent = await deps.askApp(customerId, {
      purpose: input.purpose,
      targetSchemeSlug: input.targetSchemeSlug,
    });
    return { method: 'app', ...sent };
  }

  const sent = await deps.sendCode(customerId, input);
  return { method: 'otp', ...sent };
}

export function accessRequestDeps(context: RequestContext): AccessRequestDeps {
  const admin = createSupabaseAdminClient();
  return {
    canAsk: async (customerId) => {
      const { data, error } = await context.supabase.rpc('can_request_customer_access', {
        p_customer_id: customerId,
      });
      if (error) throw error;
      return data === true;
    },
    customerMobile: async (customerId) => {
      const { data, error } = await admin
        .from('customers')
        .select('mobile, deleted_at')
        .eq('id', customerId)
        .maybeSingle();
      if (error) throw error;
      const row = data as { mobile: string | null; deleted_at: string | null } | null;
      if (!row || row.deleted_at) throw notFound('errors.not_found');
      return row.mobile;
    },
    hasApp: async (mobile) => {
      const { data, error } = await admin.rpc('citizen_id_for_mobile', { p_mobile: mobile });
      if (error) throw error;
      return typeof data === 'string';
    },
    askApp: (customerId, input) =>
      requestAppApproval(operatorApprovalContext(context), customerId, input),
    sendCode: (customerId, input) =>
      requestRoamingOtp(context, customerId, { ...input, channel: 'whatsapp' }),
  };
}
