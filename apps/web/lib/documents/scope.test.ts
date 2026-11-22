/**
 * Which documents a centre may review (apps/web/lib/documents/scope.ts; migration 0041): its
 * own, or a BharatDoc app customer's under a live grant — and nothing else, even a document
 * another centre's roaming grant lets it read. Fixture ids only.
 */

import { describe, expect, it, vi } from 'vitest';
import { CITIZEN_APP_ORGANIZATION_ID, isAppError } from '@assistigo/core';
import { resolveDocumentScope } from './scope';

const CALLER_ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CENTRE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CUSTOMER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function caller(canReview: boolean) {
  const rpc = vi.fn(async () => ({ data: canReview, error: null }));
  return { client: { rpc } as never, rpc };
}

const admin = { admin: true } as never;

async function messageKeyOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return isAppError(error) ? error.messageKey : 'not-an-app-error';
  }
}

describe('resolveDocumentScope', () => {
  it('own centre: reviews with the caller’s own client, no grant check', async () => {
    const { client, rpc } = caller(false);
    const scope = await resolveDocumentScope({
      supabase: client,
      callerOrganizationId: CALLER_ORG,
      document: { organization_id: CALLER_ORG, customer_id: CUSTOMER },
      admin: () => admin,
    });
    expect(scope).toEqual({ organizationId: CALLER_ORG, kind: 'own', writer: client });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('app customer with a live grant: reviews in the app organization via the service role', async () => {
    const { client, rpc } = caller(true);
    const scope = await resolveDocumentScope({
      supabase: client,
      callerOrganizationId: CALLER_ORG,
      document: { organization_id: CITIZEN_APP_ORGANIZATION_ID, customer_id: CUSTOMER },
      admin: () => admin,
    });
    expect(scope).toEqual({
      organizationId: CITIZEN_APP_ORGANIZATION_ID,
      kind: 'app',
      writer: admin,
    });
    expect(rpc).toHaveBeenCalledWith('can_review_app_customer', { p_customer_id: CUSTOMER });
  });

  it('app customer without a live grant: 404', async () => {
    const { client } = caller(false);
    const makeAdmin = vi.fn(() => admin);
    expect(
      await messageKeyOf(
        resolveDocumentScope({
          supabase: client,
          callerOrganizationId: CALLER_ORG,
          document: { organization_id: CITIZEN_APP_ORGANIZATION_ID, customer_id: CUSTOMER },
          admin: makeAdmin,
        }),
      ),
    ).toBe('errors.not_found');
    expect(makeAdmin).not.toHaveBeenCalled();
  });

  it('another centre’s document stays closed, even with a grant over its customer', async () => {
    const { client, rpc } = caller(true);
    expect(
      await messageKeyOf(
        resolveDocumentScope({
          supabase: client,
          callerOrganizationId: CALLER_ORG,
          document: { organization_id: OTHER_CENTRE, customer_id: CUSTOMER },
          admin: () => admin,
        }),
      ),
    ).toBe('errors.not_found');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an app document with no customer is not reviewable', async () => {
    const { client } = caller(true);
    expect(
      await messageKeyOf(
        resolveDocumentScope({
          supabase: client,
          callerOrganizationId: CALLER_ORG,
          document: { organization_id: CITIZEN_APP_ORGANIZATION_ID, customer_id: null },
          admin: () => admin,
        }),
      ),
    ).toBe('errors.not_found');
  });
});
