import { describe, expect, it } from 'vitest';
import { forwardedClientHeaders } from './forwarded-client';

function from(headers: Record<string, string>) {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return (name: string) => lower.get(name.toLowerCase()) ?? null;
}

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

describe('forwardedClientHeaders', () => {
  it("forwards the browser's user agent and the first forwarded address", () => {
    expect(
      forwardedClientHeaders(
        from({ 'user-agent': CHROME, 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
      ),
    ).toEqual({ 'user-agent': CHROME, 'x-forwarded-for': '203.0.113.7' });
  });

  it('falls back to x-real-ip and accepts IPv6', () => {
    expect(forwardedClientHeaders(from({ 'x-real-ip': '2001:db8::1' }))).toEqual({
      'x-forwarded-for': '2001:db8::1',
    });
  });

  it('forwards nothing when the request carries nothing', () => {
    expect(forwardedClientHeaders(from({}))).toEqual({});
  });

  it('drops an address that is not an address', () => {
    expect(forwardedClientHeaders(from({ 'x-forwarded-for': 'evil\r\nx-injected: 1' }))).toEqual(
      {},
    );
    expect(forwardedClientHeaders(from({ 'x-forwarded-for': 'unknown' }))).toEqual({});
  });

  it('caps an oversized user agent', () => {
    const headers = forwardedClientHeaders(from({ 'user-agent': 'x'.repeat(5000) }));
    expect(headers['user-agent']).toHaveLength(512);
  });
});
