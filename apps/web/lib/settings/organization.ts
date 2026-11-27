import { z } from 'zod';
import { isValidUpiId } from '@assistigo/core';

export const BUSINESS_TYPES = [
  'cyber_cafe',
  'csc_vle',
  'csp',
  'digital_service_centre',
  'recruitment_centre',
  'other',
] as const;

/** An optional text box: blank clears the column rather than storing an empty string. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'errors.validation_failed')
    .transform((value) => value || null);

export const organizationProfileSchema = z.object({
  name: z.string().trim().min(2, 'settings.org.nameInvalid').max(160, 'settings.org.nameInvalid'),
  businessType: z.enum(BUSINESS_TYPES),
  phone: z
    .string()
    .trim()
    // A shop may list a landline, so this is looser than the customer mobile rule.
    .refine(
      (value) =>
        value === '' ||
        (/^\+?[\d\s-]+$/.test(value) &&
          value.length <= 20 &&
          /^\d{8,15}$/.test(value.replace(/\D/g, ''))),
      'settings.org.phoneInvalid',
    )
    .transform((value) => value || null),
  email: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || z.string().email().safeParse(value).success,
      'validation.email_invalid',
    )
    .transform((value) => value || null),
  city: optionalText(120),
  district: optionalText(120),
  state: optionalText(120),
  preferredLocale: z.enum(['en', 'hi']),
  /**
   * The centre's own UPI ID, drawn as a scan-to-pay QR on counter receipts (migration 0050).
   * Lower-cased: UPI handles are case-insensitive and a stray capital would print a second QR
   * for the same account.
   */
  upiId: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === '' || isValidUpiId(value), 'settings.org.upiIdInvalid')
    .transform((value) => value || null)
    .optional()
    .default(''),
});
