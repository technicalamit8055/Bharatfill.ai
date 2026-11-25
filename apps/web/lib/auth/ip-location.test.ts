import { describe, expect, it } from 'vitest';
import { formatPlace, isLocalAddress, locateIp, toPlace } from './ip-location';

describe('locateIp', () => {
  it.each(['::1', '127.0.0.1', '::ffff:192.168.1.4', '10.0.0.1', 'fd00::1', '172.20.0.1'])(
    'calls %s local',
    async (ip) => expect(await locateIp(ip)).toEqual({ kind: 'local' }),
  );

  it.each([null, '', 'not-an-ip', '203.0.113.7'])('does not guess for %s', async (ip) => {
    expect(await locateIp(ip)).toEqual({ kind: 'unknown' });
  });

  it('resolves public IPv4, mapped IPv4 and IPv6 from the installed files', async () => {
    for (const ip of ['8.8.8.8', '::ffff:8.8.8.8', '2001:4860:4860::8888']) {
      expect(await locateIp(ip)).toMatchObject({ kind: 'place' });
    }
  }, 30_000);
});

describe('place formatting', () => {
  it('does not treat public addresses next to private ranges as local', () => {
    expect(isLocalAddress('172.32.0.1')).toBe(false);
    expect(isLocalAddress('100.0.0.1')).toBe(false);
  });

  it('drops the neighbourhood and formats city, region and country', () => {
    const place = toPlace({ city: 'Patna (Police Colony)', state1: 'Bihar', country_code: 'IN' });
    expect(place.kind === 'place' && formatPlace(place, 'en')).toBe('Patna, Bihar, India');
    expect(place.kind === 'place' && formatPlace(place, 'hi')).toBe('Patna, Bihar, भारत');
  });

  it('leaves out missing and repeated parts', () => {
    const place = toPlace({ city: 'Delhi', state1: 'Delhi', country_code: '' });
    expect(place.kind === 'place' && formatPlace(place, 'en')).toBe('Delhi');
    expect(toPlace(null)).toEqual({ kind: 'unknown' });
  });
});
