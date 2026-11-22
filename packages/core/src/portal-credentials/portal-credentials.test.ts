import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PASSWORD_POLICY,
  PORTALS,
  PORTAL_KEYS,
  checkPasswordAgainstPolicy,
  createPortalCredentialSchema,
  cryptoRandomInt,
  generatePortalPassword,
  getPortal,
  hostMatchesAllowList,
  isAllowedLoginLocation,
  loginIdHint,
  portalForUrl,
  supportsOneClickLogin,
  updatePortalCredentialSchema,
  type RandomInt,
} from './index';

describe('hostMatchesAllowList', () => {
  const hosts = ['ssc.gov.in'];

  it('matches the host itself and its subdomains', () => {
    expect(hostMatchesAllowList('ssc.gov.in', hosts)).toBe(true);
    expect(hostMatchesAllowList('otr.ssc.gov.in', hosts)).toBe(true);
    expect(hostMatchesAllowList('SSC.GOV.IN.', hosts)).toBe(true);
  });

  it('refuses look-alikes that only share a suffix or prefix', () => {
    for (const host of [
      'notssc.gov.in',
      'sscgov.in',
      'ssc.gov.in.evil.com',
      'ssc-gov.in',
      'gov.in',
      'xssc.gov.in',
      '',
    ]) {
      expect(hostMatchesAllowList(host, hosts), host).toBe(false);
    }
  });

  it('matches nothing against an empty allow-list', () => {
    expect(hostMatchesAllowList('ssc.gov.in', [])).toBe(false);
  });
});

describe('isAllowedLoginLocation', () => {
  const hosts = ['ssc.gov.in'];

  it('accepts https on the default port', () => {
    expect(isAllowedLoginLocation('https://ssc.gov.in/login', hosts)).toBe(true);
    expect(isAllowedLoginLocation('https://ssc.gov.in:443/login', hosts)).toBe(true);
  });

  it('refuses http, odd ports, embedded credentials and junk', () => {
    expect(isAllowedLoginLocation('http://ssc.gov.in/login', hosts)).toBe(false);
    expect(isAllowedLoginLocation('https://ssc.gov.in:8443/login', hosts)).toBe(false);
    expect(isAllowedLoginLocation('https://user:pw@ssc.gov.in/login', hosts)).toBe(false);
    expect(isAllowedLoginLocation('https://evil.com/?next=https://ssc.gov.in', hosts)).toBe(false);
    expect(isAllowedLoginLocation('not a url', hosts)).toBe(false);
    expect(isAllowedLoginLocation('file:///ssc.gov.in/login', hosts)).toBe(false);
  });

  it('accepts a Location-like object', () => {
    expect(
      isAllowedLoginLocation({ protocol: 'https:', hostname: 'ssc.gov.in', port: '' }, hosts),
    ).toBe(true);
    expect(
      isAllowedLoginLocation({ protocol: 'http:', hostname: 'ssc.gov.in', port: '' }, hosts),
    ).toBe(false);
  });
});

describe('portal catalogue', () => {
  it('has exactly one definition per key', () => {
    expect(PORTALS.map((portal) => portal.key).sort()).toEqual([...PORTAL_KEYS].sort());
    for (const key of PORTAL_KEYS) expect(getPortal(key).key).toBe(key);
  });

  it('gives `other` no hosts, so it can never be one-click filled', () => {
    expect(getPortal('other').hosts).toEqual([]);
    expect(supportsOneClickLogin('other')).toBe(false);
    expect(supportsOneClickLogin('ssc')).toBe(true);
  });

  it('only allow-lists government hosts', () => {
    for (const portal of PORTALS) {
      for (const host of portal.hosts) {
        expect(host.endsWith('.gov.in') || host.endsWith('.nic.in'), host).toBe(true);
      }
    }
  });

  it('resolves a login page to its portal', () => {
    expect(portalForUrl('https://ssc.gov.in/login')?.key).toBe('ssc');
    expect(portalForUrl('https://upsconline.nic.in/otr')?.key).toBe('upsc');
    expect(portalForUrl('https://sso.rajasthan.gov.in/signin')?.key).toBe('rajasthan_sso');
    expect(portalForUrl('https://notssc.gov.in/login')).toBeNull();
    expect(portalForUrl('http://ssc.gov.in/login')).toBeNull();
  });
});

describe('generatePortalPassword', () => {
  it('meets the default policy every time', () => {
    for (let index = 0; index < 500; index += 1) {
      const password = generatePortalPassword();
      expect(checkPasswordAgainstPolicy(password, DEFAULT_PASSWORD_POLICY)).toEqual([]);
      expect(password).toMatch(/^[A-Z][a-z]+[@#$][2-9]{4}$/);
      expect(password).toHaveLength(12);
    }
  });

  it('leaves out characters that are easy to misread on a slip', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generatePortalPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  it('is deterministic for a fixed random source', () => {
    const zero: RandomInt = () => 0;
    expect(generatePortalPassword(DEFAULT_PASSWORD_POLICY, zero)).toBe('Bababab@2222');
  });

  it('clamps to the policy window', () => {
    const tight = { ...DEFAULT_PASSWORD_POLICY, minLength: 8, maxLength: 8 };
    const password = generatePortalPassword(tight, cryptoRandomInt, 20);
    expect(password).toHaveLength(8);
    expect(checkPasswordAgainstPolicy(password, tight)).toEqual([]);
  });

  it('does not derive the password from anything about the citizen', () => {
    // Two calls never agree: there is no input for them to agree on.
    const seen = new Set(Array.from({ length: 50 }, () => generatePortalPassword()));
    expect(seen.size).toBe(50);
  });
});

describe('checkPasswordAgainstPolicy', () => {
  it('names what a weak password lacks', () => {
    expect(checkPasswordAgainstPolicy('abc')).toEqual(
      expect.arrayContaining(['too_short', 'needs_upper', 'needs_digit', 'needs_special']),
    );
    expect(checkPasswordAgainstPolicy('Has Space@12')).toContain('has_whitespace');
  });
});

describe('cryptoRandomInt', () => {
  it('stays in range', () => {
    for (let index = 0; index < 1000; index += 1) {
      const value = cryptoRandomInt(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });

  it('rejects a bad bound', () => {
    expect(() => cryptoRandomInt(0)).toThrow(RangeError);
  });
});

describe('schemas', () => {
  it('requires a label for an `other` portal', () => {
    expect(
      createPortalCredentialSchema.safeParse({ portalKey: 'other', loginId: 'abc123' }).success,
    ).toBe(false);
    expect(
      createPortalCredentialSchema.safeParse({
        portalKey: 'other',
        portalLabel: 'State scholarship',
        loginId: 'abc123',
      }).success,
    ).toBe(true);
  });

  it('does not trim a password', () => {
    const parsed = createPortalCredentialSchema.parse({
      portalKey: 'ssc',
      loginId: '  REG123  ',
      password: ' pw ',
    });
    expect(parsed.loginId).toBe('REG123');
    expect(parsed.password).toBe(' pw ');
  });

  it('lets an update clear a password with null but not the login ID', () => {
    expect(updatePortalCredentialSchema.parse({ password: null }).password).toBeNull();
    expect(updatePortalCredentialSchema.safeParse({ loginId: null }).success).toBe(false);
  });

  it('caps linked applications', () => {
    const many = Array.from({ length: 21 }, (_, index) => ({ label: `E${index}`, number: '1' }));
    expect(
      createPortalCredentialSchema.safeParse({
        portalKey: 'ssc',
        loginId: 'REG1',
        linkedApplications: many,
      }).success,
    ).toBe(false);
  });
});

describe('loginIdHint', () => {
  it('keeps only the last three characters', () => {
    expect(loginIdHint('9100123789')).toBe('•••••789');
    expect(loginIdHint('abcd')).toBe('••••');
  });
});
