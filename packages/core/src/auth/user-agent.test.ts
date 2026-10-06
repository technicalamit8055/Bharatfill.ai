import { describe, expect, it } from 'vitest';
import { summarizeUserAgent } from './user-agent';

// Representative strings for the browsers centres actually use. Versions are arbitrary.
const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  chromeAndroidPhone:
    'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  chromeAndroidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  chromeIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  operaWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

describe('summarizeUserAgent', () => {
  it.each([
    ['chromeWindows', 'Chrome', 'Windows', 'desktop'],
    ['edgeWindows', 'Edge', 'Windows', 'desktop'],
    ['operaWindows', 'Opera', 'Windows', 'desktop'],
    ['firefoxLinux', 'Firefox', 'Linux', 'desktop'],
    ['safariMac', 'Safari', 'macOS', 'desktop'],
    ['chromebook', 'Chrome', 'ChromeOS', 'desktop'],
    ['chromeAndroidPhone', 'Chrome', 'Android', 'mobile'],
    ['samsungAndroid', 'Samsung Internet', 'Android', 'mobile'],
    ['chromeAndroidTablet', 'Chrome', 'Android', 'tablet'],
    ['safariIphone', 'Safari', 'iOS', 'mobile'],
    ['chromeIpad', 'Chrome', 'iOS', 'tablet'],
  ] as const)('%s → %s on %s (%s)', (key, browser, os, device) => {
    expect(summarizeUserAgent(UA[key])).toEqual({ browser, os, device });
  });

  it('does not mistake Chromium-based browsers for Chrome or Safari', () => {
    expect(summarizeUserAgent(UA.edgeWindows).browser).toBe('Edge');
    expect(summarizeUserAgent(UA.chromeWindows).browser).not.toBe('Safari');
  });

  it('returns nothing it cannot recognise, rather than guessing', () => {
    // What Node's fetch sends when a server talks to the auth service on its own behalf.
    expect(summarizeUserAgent('node')).toEqual({ browser: null, os: null, device: 'unknown' });
    expect(summarizeUserAgent('')).toEqual({ browser: null, os: null, device: 'unknown' });
    expect(summarizeUserAgent(null)).toEqual({ browser: null, os: null, device: 'unknown' });
    expect(summarizeUserAgent(undefined)).toEqual({ browser: null, os: null, device: 'unknown' });
  });

  it('never returns a version number or device model', () => {
    const summary = summarizeUserAgent(UA.samsungAndroid);
    expect(JSON.stringify(summary)).not.toMatch(/\d|SM-/);
  });

  it('copes with an oversized header', () => {
    expect(summarizeUserAgent('x'.repeat(100_000)).device).toBe('unknown');
  });
});
