import 'server-only';

import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { open, type Reader, type Response } from 'maxmind';
import { z } from 'zod';
import { logger } from '../api/logger';

/**
 * Approximate place for a session's IP address, for the sessions roster.
 *
 * Looked up in the DB-IP City Lite files installed with the app, so no address is ever sent to a
 * geolocation service. Licence (CC BY 4.0): any page showing a result must link to db-ip.com.
 */
export type IpPlace = {
  kind: 'place';
  city: string | null;
  region: string | null;
  countryCode: string | null;
};
export type IpLocation = IpPlace | { kind: 'local' } | { kind: 'unknown' };

const UNKNOWN: IpLocation = { kind: 'unknown' };

const recordSchema = z.object({
  city: z.string().optional(),
  state1: z.string().optional(),
  country_code: z.string().optional(),
});

export function isLocalAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    return /^(0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  }
  return ip === '::1' || ip === '::' || /^(f[cd]|fe[89ab])/i.test(ip);
}

/** `"Patna (Police Colony)"` claims more precision than an IP address can give. */
export function toPlace(record: unknown): IpLocation {
  const parsed = recordSchema.safeParse(record);
  if (!parsed.success) return UNKNOWN;
  const city = parsed.data.city?.replace(/\s*\(.*\)\s*$/, '').trim() || null;
  const region = parsed.data.state1?.trim() || null;
  const code = parsed.data.country_code?.trim().toUpperCase() ?? '';
  const countryCode = /^[A-Z]{2}$/.test(code) ? code : null;
  if (!city && !region && !countryCode) return UNKNOWN;
  return { kind: 'place', city, region, countryCode };
}

/** "Patna, Bihar, India", leaving out missing parts and a region that repeats the city. */
export function formatPlace(place: IpPlace, locale: string): string {
  const country = place.countryCode
    ? (new Intl.DisplayNames([locale], { type: 'region' }).of(place.countryCode) ??
      place.countryCode)
    : null;
  return [...new Set([place.city, place.region, country].filter(Boolean))].join(', ');
}

type Family = 'ipv4' | 'ipv6';
// Each file is 60-70 MB in memory: opened on first use and kept for the life of the process.
const readers: Partial<Record<Family, Promise<Reader<Response>>>> = {};

function reader(family: Family): Promise<Reader<Response>> {
  return (readers[family] ??= openDatabase(family).catch((error: unknown) => {
    delete readers[family];
    throw error;
  }));
}

async function openDatabase(family: Family): Promise<Reader<Response>> {
  const file = `node_modules/@ip-location-db/dbip-city-mmdb/dbip-city-${family}.mmdb`;
  // npm hoists to the workspace root; the app may be started from there or from apps/web.
  const found = [process.cwd(), path.resolve(process.cwd(), '../..')]
    .map((base) => path.join(base, file))
    .find((candidate) => existsSync(candidate));
  if (!found) throw new Error('IP location database not found');
  return open<Response>(found);
}

/** Never throws: a missing database must not take the sessions page down. */
export async function locateIp(address: string | null): Promise<IpLocation> {
  const ip = address?.replace(/\/\d+$/, '').replace(/^::ffff:(?=\d+\.)/i, '') ?? '';
  const version = isIP(ip);
  if (version === 0) return UNKNOWN;
  if (isLocalAddress(ip)) return { kind: 'local' };
  try {
    return toPlace((await reader(version === 4 ? 'ipv4' : 'ipv6')).get(ip));
  } catch {
    // The address itself must not reach the logs.
    logger.error('auth.ip_location_failed', { reason: 'lookup_unavailable' });
    return UNKNOWN;
  }
}
