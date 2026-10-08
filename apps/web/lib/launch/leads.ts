import { z } from 'zod';
import { normalizeMobile } from '@assistigo/core';

/**
 * The early-access list on the launch notice: what the form accepts, and the CSV the admin
 * console exports for the launch-day WhatsApp message. Migration 0035.
 *
 * Operators only — a cyber cafe or CSC's own contact number, never a citizen's.
 */

/** Bumped whenever the consent line under the form changes wording. */
export const LAUNCH_CONSENT_VERSION = 'launch-leads-v1';

/**
 * New leads accepted per minute across everyone. A real launch-week rush is a few a minute; a
 * script filling the table with invented numbers is not, and this stops it without storing
 * anything about the sender.
 */
export const LAUNCH_LEADS_PER_MINUTE = 30;

/** Name of the hidden field a person never sees and a form-filling bot usually completes. */
export const LAUNCH_HONEYPOT_FIELD = 'website';

export const launchLeadSchema = z.object({
  whatsapp: z.string().transform((input, ctx) => {
    const { value } = normalizeMobile(input);
    if (!value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'launch.form.whatsappInvalid' });
      return z.NEVER;
    }
    return value;
  }),
  shopName: z
    .string()
    .trim()
    .min(2, 'launch.form.shopNameInvalid')
    .max(80, 'launch.form.shopNameInvalid'),
  city: z.string().trim().min(2, 'launch.form.cityInvalid').max(60, 'launch.form.cityInvalid'),
  consent: z
    .string()
    .optional()
    .refine((value) => value === 'on', 'launch.form.consentRequired'),
});

export type LaunchLeadInput = z.infer<typeof launchLeadSchema>;

export type LaunchLeadCsvRow = {
  whatsapp_number: string;
  shop_name: string;
  city: string;
  locale: string;
  created_at: string;
};

/** Byte-order mark, written out so no editor turns it into an invisible character. */
const BOM = String.fromCharCode(0xfeff);

const CSV_HEADER = ['whatsapp', 'shop_name', 'city', 'language', 'joined_at'];

/**
 * One cell. Every cell is quoted, and a value a spreadsheet would read as a formula (= + - @, or
 * a leading tab / carriage return) gets a leading apostrophe — the shop name and city are typed
 * by strangers, and this file is opened in Excel.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * The export. The number is written as 91XXXXXXXXXX — what WhatsApp broadcast tools expect, and
 * with no leading + for a spreadsheet to mistake for a formula. A byte-order mark up front makes
 * Excel read the Hindi shop names as UTF-8.
 */
export function launchLeadsCsv(rows: readonly LaunchLeadCsvRow[]): string {
  const lines = [
    CSV_HEADER.map(cell).join(','),
    ...rows.map((row) =>
      [`91${row.whatsapp_number}`, row.shop_name, row.city, row.locale, row.created_at]
        .map(cell)
        .join(','),
    ),
  ];
  return BOM + lines.join('\r\n') + '\r\n';
}
