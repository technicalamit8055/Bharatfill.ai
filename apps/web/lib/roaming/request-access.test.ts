/**
 * One "Request access" (migration 0046): the server sends it to the BharatDoc app when the
 * customer has one, otherwise a WhatsApp code, and refuses before looking anything up when the
 * centre may not ask. Fixture ids and made-up numbers only.
 */

import { describe, expect, it, vi } from 'vitest';
import { isAppError } from '@assistigo/core';
import { requestCustomerAccess, type AccessRequestDeps } from './request-access';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const INPUT = { purpose: 'form_filling', durationMinutes: 120 } as const;

function deps(overrides: Partial<AccessRequestDeps> = {}): AccessRequestDeps {
  return {
    canAsk: vi.fn(async () => true),
    customerMobile: vi.fn(async () => '9000000001'),
    hasApp: vi.fn(async () => false),
    askApp: vi.fn(async () => ({ requestId: 'req-1', expiresAt: '2026-11-23T10:10:00.000Z' })),
    sendCode: vi.fn(async () => ({ mobileLast4: '0001', expiresInSeconds: 300 })),
    ...overrides,
  };
}

async function messageKeyOf(promise: Promise<unknown>): Promise<string | null> {
  const thrown = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  return isAppError(thrown) ? (thrown as { messageKey: string }).messageKey : null;
}

describe('requestCustomerAccess', () => {
  it('goes to the BharatDoc app when the customer has it, without a code', async () => {
    const d = deps({ hasApp: vi.fn(async () => true) });
    const result = await requestCustomerAccess(d, CUSTOMER, INPUT);

    expect(result).toEqual({
      method: 'app',
      requestId: 'req-1',
      expiresAt: '2026-11-23T10:10:00.000Z',
    });
    expect(d.askApp).toHaveBeenCalledWith(CUSTOMER, {
      purpose: 'form_filling',
      targetSchemeSlug: undefined,
    });
    expect(d.sendCode).not.toHaveBeenCalled();
  });

  it('sends a WhatsApp code, with the picked window, when the customer has no app', async () => {
    const d = deps();
    const result = await requestCustomerAccess(d, CUSTOMER, { ...INPUT, durationMinutes: 240 });

    expect(result).toEqual({ method: 'otp', mobileLast4: '0001', expiresInSeconds: 300 });
    expect(d.sendCode).toHaveBeenCalledWith(CUSTOMER, { ...INPUT, durationMinutes: 240 });
    expect(d.askApp).not.toHaveBeenCalled();
  });

  it('refuses a centre that may not ask, before reading the number or the app', async () => {
    const d = deps({ canAsk: vi.fn(async () => false) });
    expect(await messageKeyOf(requestCustomerAccess(d, CUSTOMER, INPUT))).toBe('errors.not_found');
    expect(d.customerMobile).not.toHaveBeenCalled();
    expect(d.hasApp).not.toHaveBeenCalled();
  });

  it('says so when there is no mobile to send anything to', async () => {
    const d = deps({ customerMobile: vi.fn(async () => null) });
    expect(await messageKeyOf(requestCustomerAccess(d, CUSTOMER, INPUT))).toBe(
      'errors.roaming_no_mobile_on_file',
    );
    expect(d.hasApp).not.toHaveBeenCalled();
  });
});
