/**
 * The signed-in account on the phone (docs/VAULT_BRIDGE_DESIGN.md §2, §3.4, D10, D16): binding
 * the vault to one cloud account, Log out / Delete account prompts and their copy, the number
 * read from the session, and the Profile card mapping. Network calls are faked; numbers use the
 * 99000 test range and names are placeholders. No real citizen data.
 */

import { describe, expect, it, vi } from 'vitest';

import { phoneFromAccessToken, revokeCloudSession } from '../lib/cloud/auth-client';
import { createCitizenApi } from '../lib/cloud/citizen-api';
import type { CloudConfig } from '../lib/cloud/config';
import { type LeaveKind, leavePrompt } from '../lib/cloud/leave-prompt';
import { signedInProfile } from '../lib/profile/profile-screen';
import {
  canSyncAs,
  EMPTY_VAULT_INDEX,
  parseVaultIndex,
  phoneVaultSummary,
  serialiseVaultIndex,
  type VaultDocument,
  type VaultIndex,
  withCloudAccount,
  withCloudDetached,
  withoutDocument,
} from '../lib/vault/vault-index';
import en from '../messages/en.json';
import hi from '../messages/hi.json';

const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const DOC_1 = '33333333-3333-4333-8333-333333333333';
const DOC_2 = '44444444-4444-4444-8444-444444444444';
const DOC_3 = '55555555-5555-4555-8555-555555555555';
const CLOUD_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLOUD_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const CONFIG: CloudConfig = {
  supabaseUrl: 'https://demo.supabase.test',
  supabaseAnonKey: 'anon-demo-key',
  apiUrl: 'https://app.bharatfill.test',
};

function doc(id: string, extra: Partial<VaultDocument> = {}): VaultDocument {
  return {
    id,
    createdAt: '2026-11-17T10:00:00.000Z',
    source: 'scanner',
    pages: [{ mimeType: 'image/jpeg' }],
    ...extra,
  };
}

const synced = (cloudId: string) => ({
  cloud: { id: cloudId, title: 'Sample marksheet', documentType: 'marksheet_10' as const },
});

function index(documents: VaultDocument[], extra: Partial<VaultIndex> = {}): VaultIndex {
  return { ...EMPTY_VAULT_INDEX, documents, ...extra };
}

describe('vault bound to one cloud account', () => {
  it('lets any account claim an unbound vault, then only that account', () => {
    const unbound = index([doc(DOC_1)]);
    expect(canSyncAs(unbound, ACCOUNT_A)).toBe(true);
    expect(canSyncAs(unbound, ACCOUNT_B)).toBe(true);

    const bound = withCloudAccount(unbound, ACCOUNT_A);
    expect(bound.cloudAccountId).toBe(ACCOUNT_A);
    expect(canSyncAs(bound, ACCOUNT_A)).toBe(true);
    expect(canSyncAs(bound, ACCOUNT_B)).toBe(false);
  });

  it('never rebinds a vault to a second account', () => {
    const bound = withCloudAccount(index([doc(DOC_1, synced(CLOUD_1))]), ACCOUNT_A);
    expect(withCloudAccount(bound, ACCOUNT_B)).toBe(bound);
    expect(withCloudAccount(bound, ACCOUNT_A)).toBe(bound);
  });

  it('keeps the binding through a save and a reload', () => {
    const bound = withCloudAccount(index([doc(DOC_1)]), ACCOUNT_A);
    expect(parseVaultIndex(serialiseVaultIndex(bound))?.cloudAccountId).toBe(ACCOUNT_A);
    // Indexes written before the binding existed still parse, unbound.
    expect(parseVaultIndex(serialiseVaultIndex(index([doc(DOC_1)])))?.cloudAccountId).toBe(
      undefined,
    );
  });

  it('refuses a binding that is not an account id', () => {
    const raw = JSON.stringify({ ...index([]), cloudAccountId: 'someone' });
    expect(parseVaultIndex(raw)).toBeNull();
  });
});

describe('detaching the vault after the account is deleted', () => {
  it('forgets every cloud copy, the delete queue and the binding, and keeps the documents', () => {
    const before = withoutDocument(
      index(
        [
          doc(DOC_1, { ...synced(CLOUD_1), title: 'Sample marksheet', starred: true }),
          doc(DOC_2, { phoneOnly: true }),
          doc(DOC_3, synced(CLOUD_2)),
        ],
        { cloudAccountId: ACCOUNT_A },
      ),
      DOC_3,
    );
    expect(before.cloudDeletes).toEqual([CLOUD_2]);

    const after = withCloudDetached(before);
    expect(after.cloudAccountId).toBeUndefined();
    expect(after.cloudDeletes).toBeUndefined();
    expect(after.documents.map((d) => d.id)).toEqual([DOC_1, DOC_2]);
    expect(after.documents.every((d) => d.cloud === undefined)).toBe(true);
    expect(after.documents[0]).toMatchObject({ title: 'Sample marksheet', starred: true });
    expect(after.documents[1]?.phoneOnly).toBe(true);
    expect(canSyncAs(after, ACCOUNT_B)).toBe(true);
    expect(parseVaultIndex(serialiseVaultIndex(after))).toEqual(after);
  });
});

describe('what is on the phone before leaving', () => {
  it('counts documents that exist only here: phone-only or not synced yet', () => {
    const summary = phoneVaultSummary(
      index([doc(DOC_1, synced(CLOUD_1)), doc(DOC_2, { phoneOnly: true }), doc(DOC_3)]),
    );
    expect(summary).toEqual({ total: 3, onlyOnPhone: 2 });
    expect(phoneVaultSummary(EMPTY_VAULT_INDEX)).toEqual({ total: 0, onlyOnPhone: 0 });
  });
});

describe('Log out and Delete account prompts', () => {
  it('only confirms when the phone holds nothing', () => {
    expect(leavePrompt('log_out', { total: 0, onlyOnPhone: 0 })).toMatchObject({
      bodyKey: 'profile.leave.log_out.bodyEmpty',
      buttons: 'confirm',
    });
    expect(leavePrompt('delete_account', { total: 0, onlyOnPhone: 0 })).toMatchObject({
      bodyKey: 'profile.leave.delete_account.bodyEmpty',
      buttons: 'confirm',
    });
  });

  it('warns about documents that would be lost, ahead of the synced case', () => {
    expect(leavePrompt('log_out', { total: 4, onlyOnPhone: 1 }).bodyKey).toBe(
      'profile.leave.log_out.bodyAtRiskOne',
    );
    expect(leavePrompt('log_out', { total: 4, onlyOnPhone: 3 })).toMatchObject({
      bodyKey: 'profile.leave.log_out.bodyAtRiskOther',
      params: { count: 4, lost: 3 },
      buttons: 'choose',
    });
    expect(leavePrompt('log_out', { total: 1, onlyOnPhone: 0 }).bodyKey).toBe(
      'profile.leave.log_out.bodySyncedOne',
    );
    expect(leavePrompt('log_out', { total: 5, onlyOnPhone: 0 }).bodyKey).toBe(
      'profile.leave.log_out.bodySyncedOther',
    );
  });

  it('counts every phone document when deleting the account, synced or not', () => {
    expect(leavePrompt('delete_account', { total: 1, onlyOnPhone: 0 }).bodyKey).toBe(
      'profile.leave.delete_account.bodyOne',
    );
    expect(leavePrompt('delete_account', { total: 6, onlyOnPhone: 2 })).toMatchObject({
      bodyKey: 'profile.leave.delete_account.bodyOther',
      params: { count: 6 },
      buttons: 'choose',
    });
  });
});

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

const SUMMARIES = [
  { total: 0, onlyOnPhone: 0 },
  { total: 1, onlyOnPhone: 0 },
  { total: 3, onlyOnPhone: 0 },
  { total: 3, onlyOnPhone: 1 },
  { total: 3, onlyOnPhone: 2 },
];
const KINDS: LeaveKind[] = ['log_out', 'delete_account'];

const RENDERED_KEYS = [
  'common.cancel',
  'common.ok',
  'profile.logout',
  'profile.loggingOut',
  'profile.leave.failed',
  ...KINDS.flatMap((kind) =>
    ['remove', 'keep', 'confirm', 'doneTitle', 'doneBody'].map((k) => `profile.leave.${kind}.${k}`),
  ),
  ...[
    'title',
    'nameHint',
    'phoneLabel',
    'phoneUnknown',
    'phoneHint',
    'save',
    'savedTitle',
    'savedBody',
    'deleteTitle',
    'deleteBody',
    'delete',
    'changePinTitle',
    'changePinBody',
  ].map((k) => `accountDetails.${k}`),
  ...[
    'headlineLead',
    'headlineAccent',
    'subtitle',
    'currentLabel',
    'pinLabel',
    'confirmLabel',
    'pinHint',
    'submit',
    'doneTitle',
    'doneBody',
  ].map((k) => `vaultPin.change.${k}`),
  'vaultPin.errors.same',
  'errors.vault.pin_same',
];

describe('account copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every key the account screens render in %s', (_locale, dictionary) => {
    const promptKeys = KINDS.flatMap((kind) =>
      SUMMARIES.flatMap((summary) => {
        const prompt = leavePrompt(kind, summary);
        return [prompt.titleKey, prompt.bodyKey];
      }),
    );
    for (const key of [...RENDERED_KEYS, ...promptKeys]) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it('uses the same placeholders in English and Hindi', () => {
    const placeholders = (text: unknown) =>
      [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const kind of KINDS) {
      for (const summary of SUMMARIES) {
        const { bodyKey } = leavePrompt(kind, summary);
        expect(placeholders(lookup(hi, bodyKey)), bodyKey).toEqual(
          placeholders(lookup(en, bodyKey)),
        );
      }
    }
  });

  it('warns that kept documents stay open to anyone using the phone', () => {
    for (const summary of SUMMARIES.filter((s) => s.total > 0)) {
      const body = String(lookup(en, leavePrompt('log_out', summary).bodyKey));
      expect(body).toContain('anyone who uses this phone');
    }
  });
});

function token(claims: Record<string, unknown>): string {
  const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${base64url({ alg: 'HS256' })}.${base64url(claims)}.signature`;
}

describe('number from the session', () => {
  it('reads the 10 national digits from the phone claim', () => {
    expect(phoneFromAccessToken(token({ sub: ACCOUNT_A, phone: '919900012345' }))).toBe(
      '9900012345',
    );
    expect(phoneFromAccessToken(token({ phone: '+91 99000 12345' }))).toBe('9900012345');
  });

  it('gives null for anything that is not an Indian mobile number', () => {
    expect(phoneFromAccessToken(token({ sub: ACCOUNT_A }))).toBeNull();
    expect(phoneFromAccessToken(token({ phone: '' }))).toBeNull();
    expect(phoneFromAccessToken(token({ phone: '449900012345' }))).toBeNull();
    expect(phoneFromAccessToken(token({ phone: '915900012345' }))).toBeNull();
    expect(phoneFromAccessToken('not-a-token')).toBeNull();
    expect(phoneFromAccessToken('a.%%%.c')).toBeNull();
  });
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('revoking the session on log out', () => {
  it('revokes only this phone’s session, with the anon key and the bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await revokeCloudSession(CONFIG, 'access-1', fetchImpl)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://demo.supabase.test/auth/v1/logout?scope=local');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-demo-key');
    expect(headers.authorization).toBe('Bearer access-1');
  });

  it('reports failure without throwing, so log out still finishes on the phone', async () => {
    expect(
      await revokeCloudSession(CONFIG, 'a', async () => {
        throw new Error('offline');
      }),
    ).toBe(false);
    expect(await revokeCloudSession(CONFIG, 'a', async () => json(401, {}))).toBe(false);
  });
});

describe('updating the account', () => {
  it('PATCHes only the name and language it is given', async () => {
    const ACCOUNT = {
      id: ACCOUNT_A,
      displayName: 'Demo Citizen',
      preferredLocale: 'en',
      cloudEnabled: true,
      createdAt: '2026-11-17T10:00:00.000Z',
    };
    const fetchImpl = vi.fn(async () => json(200, { data: { account: ACCOUNT } }));
    const api = createCitizenApi({
      apiUrl: CONFIG.apiUrl,
      accessToken: async () => 'token-1',
      refresh: async () => null,
      fetch: fetchImpl,
    });
    expect(await api.updateAccount({ displayName: 'Demo Citizen' })).toEqual({
      ok: true,
      value: ACCOUNT,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.bharatfill.test/api/citizen/account');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ displayName: 'Demo Citizen' });
  });
});

describe('changing the Vault PIN', () => {
  it('POSTs both PINs and treats 204 as done', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const api = createCitizenApi({
      apiUrl: CONFIG.apiUrl,
      accessToken: async () => 'token-1',
      refresh: async () => null,
      fetch: fetchImpl,
    });
    expect(await api.changeVaultPin('4826', '5937')).toEqual({ ok: true, value: null });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.bharatfill.test/api/citizen/account/pin');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ currentPin: '4826', newPin: '5937' });
  });

  it('passes the server reason through for a wrong current PIN', async () => {
    const api = createCitizenApi({
      apiUrl: CONFIG.apiUrl,
      accessToken: async () => 'token-1',
      refresh: async () => null,
      fetch: async () =>
        json(403, {
          error: { code: 'PERMISSION_DENIED', messageKey: 'errors.vault.pin_wrong', traceId: 't' },
        }),
    });
    const result = await api.changeVaultPin('4826', '5937');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.messageKey).toBe('errors.vault.pin_wrong');
  });
});

describe('Profile card for a signed-in citizen', () => {
  it('shows the name and the verified number, and never an email or a plan', () => {
    expect(signedInProfile({ displayName: 'Demo Citizen', phoneNumber: '9900012345' })).toEqual({
      status: 'signed_in',
      account: {
        fullName: 'Demo Citizen',
        phoneNumber: '9900012345',
        phoneVerified: true,
        email: null,
        plan: null,
      },
    });
  });

  it('leaves out what is not known while offline', () => {
    const state = signedInProfile({ displayName: null, phoneNumber: null });
    expect(state).toMatchObject({
      account: { fullName: '', phoneNumber: '', phoneVerified: false },
    });
  });
});
