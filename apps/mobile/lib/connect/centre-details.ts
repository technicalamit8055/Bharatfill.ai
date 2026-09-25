/**
 * Centre details view model: the opening hours line, the full address, which services the
 * Available Services list shows, and how the route's params are read.
 *
 * Everything works on a centre the route already has; nothing is fetched or sent.
 */

import { z } from 'zod';

import type { Translate } from '../i18n';
import type { CscOffering, NearbyCentre, OpeningHours } from './connect-screen';

/** How many services show before View All. */
export const DETAIL_SERVICES_PREVIEW = 5;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "09:00" → "9:00 AM", "18:30" → "6:30 PM", "00:15" → "12:15 AM". Null for a malformed time. */
export function formatTime(time: string, t: Translate): string | null {
  const match = TIME.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ?? '00';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return t(hour < 12 ? 'connect.centre.am' : 'connect.centre.pm', {
    time: `${hour12}:${minute}`,
  });
}

/** The two lines under "Working Hours": "Mon - Sat" and "9:00 AM - 6:00 PM". */
export function hoursLines(
  hours: OpeningHours | null,
  t: Translate,
): { readonly days: string; readonly times: string } | null {
  if (!hours) return null;
  const opens = formatTime(hours.opens, t);
  const closes = formatTime(hours.closes, t);
  if (opens === null || closes === null) return null;

  const first = t(`connect.centre.weekdays.${hours.firstDay}`);
  const days =
    hours.firstDay === hours.lastDay
      ? first
      : t('connect.centre.range', {
          from: first,
          to: t(`connect.centre.weekdays.${hours.lastDay}`),
        });
  return { days, times: t('connect.centre.range', { from: opens, to: closes }) };
}

/**
 * The address with the parts of the region it leaves out: "Near Bus Stand, Arrah, Bhojpur" in
 * "Bhojpur, Bihar" reads "Near Bus Stand, Arrah, Bhojpur, Bihar".
 */
export function fullAddress(centre: Pick<NearbyCentre, 'address' | 'region'>): string {
  const parts = centre.address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const seen = new Set(parts.map((part) => part.toLocaleLowerCase()));
  for (const part of centre.region.split(',').map((each) => each.trim())) {
    if (part.length > 0 && !seen.has(part.toLocaleLowerCase())) {
      parts.push(part);
      seen.add(part.toLocaleLowerCase());
    }
  }
  return parts.join(', ');
}

/** The services the list shows, and how many View All would add. Duplicates count once. */
export function detailServices(
  offerings: readonly CscOffering[],
  expanded: boolean,
): { readonly shown: readonly CscOffering[]; readonly hidden: number } {
  const unique = offerings.filter((offering, index) => offerings.indexOf(offering) === index);
  if (expanded) return { shown: unique, hidden: 0 };
  return {
    shown: unique.slice(0, DETAIL_SERVICES_PREVIEW),
    hidden: Math.max(0, unique.length - DETAIL_SERVICES_PREVIEW),
  };
}

/** What the share sheet sends: the centre's public listing, nothing about the citizen. */
export function shareMessage(centre: NearbyCentre, t: Translate): string {
  const hours = hoursLines(centre.hours, t);
  return [
    centre.name,
    fullAddress(centre),
    hours ? `${hours.days}, ${hours.times}` : null,
    centre.phone,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

const firstParam = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const centreParamsSchema = z.object({
  id: z.preprocess(firstParam, z.string().min(1).max(100)),
});

/** The centre id from the details route's params, or null when it is missing or malformed. */
export function parseCentreParams(params: unknown): string | null {
  const parsed = centreParamsSchema.safeParse(params ?? {});
  return parsed.success ? parsed.data.id : null;
}
