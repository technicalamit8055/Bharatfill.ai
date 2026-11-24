import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The dashboard sees a customer's full mobile (product owner, 2026-11-24). The extension shares
 * this route but runs on portal pages, so it must keep receiving the last four digits only.
 */

vi.mock('server-only', () => ({}));

const resolveContext = vi.fn();
vi.mock('@/lib/api/context', () => ({
  resolveContext: (...args: unknown[]) => resolveContext(...args),
  requirePermission: vi.fn(),
}));

const { GET } = await import('./route');

const ROW = {
  id: 'customer-1',
  full_name: 'Sunita Devi',
  customer_code: 'C-0001',
  mobile: '9900012345',
  district: 'Sitapur',
  state: 'Uttar Pradesh',
  verification_status: 'unverified',
};

async function search(actorType: 'user' | 'extension') {
  resolveContext.mockResolvedValue({
    actorType,
    organization: { id: 'org-1' },
    supabase: { rpc: async () => ({ data: [ROW], error: null }) },
  });
  const response = await GET(new Request('http://localhost/api/customers/search?q=sunita'));
  return response.text();
}

describe('GET /api/customers/search', () => {
  beforeEach(() => resolveContext.mockReset());

  it('gives the dashboard the full mobile', async () => {
    const body = JSON.parse(await search('user'));
    expect(body.data.customers[0]).toMatchObject({ mobile: '9900012345', mobileLast4: '2345' });
  });

  it('never gives the extension more than the last four digits', async () => {
    const text = await search('extension');
    expect(text).not.toContain('9900012345');
    expect(JSON.parse(text).data.customers[0].mobileLast4).toBe('2345');
  });
});
