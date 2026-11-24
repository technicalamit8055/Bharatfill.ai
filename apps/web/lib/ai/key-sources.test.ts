import { describe, expect, it } from 'vitest';

process.env.FIELD_ENCRYPTION_KEY ??= Buffer.from('0'.repeat(32)).toString('base64');

const { loadOwnAiKeySources, resolveOwnAiKey } = await import('./key-sources');
const { encryptField } = await import('@assistigo/core/privacy/crypto');

const OWN = 'org-own';
const OTHER = 'org-other';

type Row = Record<string, unknown>;

/** Applies the filters for real, so a dropped owner check fails here. */
function client(ownCiphertext: string) {
  const tables: Record<string, Row[]> = {
    organization_members: [
      { organization_id: OWN, user_id: 'me', role: 'owner', status: 'active' },
      { organization_id: OTHER, user_id: 'me', role: 'manager', status: 'active' },
      { organization_id: OTHER, user_id: 'them', role: 'owner', status: 'active' },
    ],
    organizations: [
      { id: OWN, name: 'Own', deleted_at: null },
      { id: OTHER, name: 'Other', deleted_at: null },
    ],
    organization_ai_settings: [OWN, OTHER].map((id) => ({
      organization_id: id,
      provider: 'vertex',
      base_url: null,
      model: 'm',
      api_key_encrypted:
        id === OWN ? ownCiphertext : encryptField('sk-other', `${OTHER}:ai_vendor_api_key`),
    })),
  };
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const keep = (test: (row: Row) => boolean) => {
        rows = rows.filter(test);
        return builder;
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (k: string, v: unknown) => keep((row) => row[k] === v),
        is: (k: string, v: unknown) => keep((row) => row[k] === v),
        in: (k: string, v: unknown[]) => keep((row) => v.includes(row[k])),
        not: (k: string, _op: string, v: unknown) => keep((row) => row[k] !== v),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (done: (value: unknown) => unknown) => done({ data: rows, error: null }),
      };
      return builder;
    },
  } as never;
}

const good = encryptField('sk-own', `${OWN}:ai_vendor_api_key`);

describe('AI key sources', () => {
  it('offers only centres the caller owns, and never the key', async () => {
    const sources = await loadOwnAiKeySources(client(good), 'me');
    expect(sources.map((source) => source.organizationId)).toEqual([OWN]);
    expect(Object.keys(sources[0] ?? {})).not.toContain('apiKey');
    expect(JSON.stringify(sources)).not.toContain('sk-');
  });

  it("resolves the caller's own key", async () => {
    expect(await resolveOwnAiKey(client(good), 'me', OWN)).toBe('sk-own');
  });

  it("refuses another owner's key", async () => {
    await expect(resolveOwnAiKey(client(good), 'me', OTHER)).rejects.toThrow();
  });

  it('refuses a key this server cannot decrypt', async () => {
    await expect(resolveOwnAiKey(client('v1.a.b.c'), 'me', OWN)).rejects.toThrow();
  });
});
