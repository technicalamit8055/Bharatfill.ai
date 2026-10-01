/**
 * Guards the post-sign-in destination: only same-origin paths survive, and the OAuth return URL
 * always lands on this app's own callback rather than wherever `next` points.
 */

import { describe, expect, it } from 'vitest';
import { oauthCallbackUrl, safeNext } from './redirects';

describe('safeNext', () => {
  it('keeps a same-origin path', () => {
    expect(safeNext('/customers/new')).toBe('/customers/new');
  });

  it.each([undefined, null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'customers'])(
    'falls back to the dashboard for %s',
    (value) => {
      expect(safeNext(value)).toBe('/dashboard');
    },
  );
});

describe('oauthCallbackUrl', () => {
  it('returns to the app callback with the destination as a query parameter', () => {
    const url = new URL(oauthCallbackUrl('http://localhost:3000', '/forms?tab=recent'));
    expect(url.origin).toBe('http://localhost:3000');
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('next')).toBe('/forms?tab=recent');
  });

  it('never carries an off-site destination through the provider round trip', () => {
    const url = new URL(oauthCallbackUrl('http://localhost:3000', '//evil.example/steal'));
    expect(url.origin).toBe('http://localhost:3000');
    expect(url.searchParams.get('next')).toBe('/dashboard');
  });
});
