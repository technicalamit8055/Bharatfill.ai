/**
 * Guards the early-access form and its export: only a real Indian mobile and sane shop/city text
 * get through, consent is required, and the CSV cannot carry a spreadsheet formula.
 */

import { describe, expect, it } from 'vitest';
import { launchLeadSchema, launchLeadsCsv } from './leads';

/** Invented values only. */
const VALID = {
  whatsapp: '98765 43210',
  shopName: 'Sharma Cyber Point',
  city: 'Testpur',
  consent: 'on',
};

function firstError(input: Record<string, unknown>): string | undefined {
  const result = launchLeadSchema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('launchLeadSchema', () => {
  it.each(['9876543210', '+91 98765 43210', '09876543210', '91-98765-43210'])(
    'normalises %s to the bare 10 digits',
    (whatsapp) => {
      const result = launchLeadSchema.parse({ ...VALID, whatsapp });
      expect(result.whatsapp).toBe('9876543210');
    },
  );

  it.each(['', '12345', '5876543210', '98765432101234'])(
    'rejects %s as a WhatsApp number',
    (whatsapp) => {
      expect(firstError({ ...VALID, whatsapp })).toBe('launch.form.whatsappInvalid');
    },
  );

  it('trims the shop name and city', () => {
    const result = launchLeadSchema.parse({
      ...VALID,
      shopName: '  Sharma Cyber  ',
      city: ' Testpur ',
    });
    expect(result.shopName).toBe('Sharma Cyber');
    expect(result.city).toBe('Testpur');
  });

  it('rejects a shop name or city that is too short or too long', () => {
    expect(firstError({ ...VALID, shopName: 'a' })).toBe('launch.form.shopNameInvalid');
    expect(firstError({ ...VALID, shopName: 'a'.repeat(81) })).toBe('launch.form.shopNameInvalid');
    expect(firstError({ ...VALID, city: ' ' })).toBe('launch.form.cityInvalid');
    expect(firstError({ ...VALID, city: 'a'.repeat(61) })).toBe('launch.form.cityInvalid');
  });

  it('requires consent', () => {
    expect(firstError({ ...VALID, consent: undefined })).toBe('launch.form.consentRequired');
    expect(firstError({ ...VALID, consent: 'yes' })).toBe('launch.form.consentRequired');
  });
});

describe('launchLeadsCsv', () => {
  const row = {
    whatsapp_number: '9876543210',
    shop_name: 'Sharma Cyber Point',
    city: 'Testpur',
    locale: 'hi',
    created_at: '2026-10-07T10:00:00.000Z',
  };

  it('starts with a BOM and a header, and writes the number as 91XXXXXXXXXX', () => {
    const lines = launchLeadsCsv([row]).split('\r\n');
    expect(lines[0]).toBe(
      String.fromCharCode(0xfeff) + '"whatsapp","shop_name","city","language","joined_at"',
    );
    expect(lines[1]).toBe(
      '"919876543210","Sharma Cyber Point","Testpur","hi","2026-10-07T10:00:00.000Z"',
    );
  });

  it('escapes quotes and neutralises formulas typed into the form', () => {
    const csv = launchLeadsCsv([
      { ...row, shop_name: '=HYPERLINK("http://x")', city: '@SUM(1)' },
      { ...row, shop_name: 'Shop "One"', city: '+city' },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")","'@SUM(1)"`);
    expect(csv).toContain(`"Shop ""One""","'+city"`);
  });

  it('writes only the header for an empty list', () => {
    expect(launchLeadsCsv([]).split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});
