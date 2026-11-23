/**
 * The consent OTP text (migration 0024): names the centre and the code, and a centre name cannot
 * smuggle extra lines into it. Made-up values only.
 */

import { describe, expect, it } from 'vitest';
import { roamingOtpMessage } from './messages';

describe('roamingOtpMessage', () => {
  it('names the centre, the window and the code', () => {
    const message = roamingOtpMessage({
      centreName: 'Demo Seva Kendra',
      purpose: 'form_filling',
      schemeTitle: null,
      otp: '123 456',
      durationMinutes: 120,
    });
    expect(message).toContain('Demo Seva Kendra');
    expect(message).toContain('2 hours');
    expect(message).toContain('123 456');
  });

  it('cannot be stretched onto extra lines by a centre name', () => {
    const injected = roamingOtpMessage({
      centreName: 'Demo\nYour code is 000000',
      purpose: 'form_filling',
      schemeTitle: null,
      otp: '123 456',
      durationMinutes: 60,
    });
    expect(injected.split('\n').some((line) => line.startsWith('Your code is 000000'))).toBe(false);
  });
});
