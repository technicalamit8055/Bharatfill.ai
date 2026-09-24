/**
 * Mobile-number input handling for registration. Numbers here are synthetic: they follow the
 * Indian numbering shape but are not tied to anyone.
 */

import { describe, expect, it } from 'vitest';

import {
  formatE164ForDisplay,
  formatMobileForDisplay,
  mobileNumberStatus,
  nationalDigitsFromE164,
  normaliseMobileInput,
  toE164,
} from '../lib/auth/phone';

describe('normaliseMobileInput', () => {
  it('keeps digits only', () => {
    expect(normaliseMobileInput('98765 43-2a1')).toBe('987654321');
  });

  it('caps at 10 digits', () => {
    expect(normaliseMobileInput('98765432109')).toBe('9876543210');
  });

  it('drops a pasted +91 country code', () => {
    expect(normaliseMobileInput('+91 98765 43210')).toBe('9876543210');
  });

  it('drops a pasted trunk 0', () => {
    expect(normaliseMobileInput('09876543210')).toBe('9876543210');
  });

  it('does not strip a leading 91 from a 10-digit number', () => {
    expect(normaliseMobileInput('9198765432')).toBe('9198765432');
  });
});

describe('formatMobileForDisplay', () => {
  it('groups 5 + 5 once past five digits', () => {
    expect(formatMobileForDisplay('98765')).toBe('98765');
    expect(formatMobileForDisplay('987654')).toBe('98765 4');
    expect(formatMobileForDisplay('9876543210')).toBe('98765 43210');
  });

  it('round-trips through normalise', () => {
    expect(normaliseMobileInput(formatMobileForDisplay('9876543210'))).toBe('9876543210');
  });
});

describe('mobileNumberStatus', () => {
  it('is incomplete under 10 digits', () => {
    expect(mobileNumberStatus('')).toBe('incomplete');
    expect(mobileNumberStatus('987654321')).toBe('incomplete');
  });

  it('accepts 10 digits starting 6–9', () => {
    for (const lead of ['6', '7', '8', '9']) {
      expect(mobileNumberStatus(`${lead}000000000`)).toBe('valid');
    }
  });

  it('rejects 10 digits starting 0–5', () => {
    for (const lead of ['0', '1', '2', '3', '4', '5']) {
      expect(mobileNumberStatus(`${lead}876543210`)).toBe('invalid');
    }
  });
});

describe('toE164', () => {
  it('prefixes +91', () => {
    expect(toE164('9876543210')).toBe('+919876543210');
  });

  it('refuses an invalid number rather than sending it on', () => {
    expect(() => toE164('5876543210')).toThrow();
    expect(() => toE164('98765')).toThrow();
  });
});

describe('nationalDigitsFromE164', () => {
  it('reads back what toE164 produced', () => {
    expect(nationalDigitsFromE164(toE164('9876543210'))).toBe('9876543210');
  });

  it('tolerates a + decoded to a space in a route param', () => {
    expect(nationalDigitsFromE164(' 919876543210')).toBe('9876543210');
  });

  it('rejects anything that is not a valid +91 mobile number', () => {
    expect(nationalDigitsFromE164('')).toBeNull();
    expect(nationalDigitsFromE164('9876543210')).toBeNull();
    expect(nationalDigitsFromE164('+449876543210')).toBeNull();
    expect(nationalDigitsFromE164('+915876543210')).toBeNull();
    expect(nationalDigitsFromE164('+9198765432101')).toBeNull();
  });
});

describe('formatE164ForDisplay', () => {
  it('shows the dial code and 5 + 5 grouping', () => {
    expect(formatE164ForDisplay('9876543210')).toBe('+91 98765 43210');
  });
});
