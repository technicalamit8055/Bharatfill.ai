/**
 * Safety regression tests for the hard product rules (spec §14.8, §19.7).
 *
 * DO NOT DELETE OR WEAKEN THIS FILE. CI runs it as its own job. If a change here is genuinely
 * required, it needs a product-owner decision recorded in docs/DEVELOPMENT_RULES.md first.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyField,
  isCaptchaField,
  isFileInput,
  isFillable,
  isOtpField,
  isPasswordField,
  isPaymentField,
  isSubmitControl,
  isSupportedInputType,
} from './safety';

describe('safety — CAPTCHA fields are never filled', () => {
  it.each([
    { name: 'captcha' },
    { id: 'txtCaptcha' },
    { name: 'captcha_code' },
    { className: 'g-recaptcha-response' },
    { id: 'h-captcha-response' },
    { labelText: 'Enter the code shown in the image' },
    { placeholder: 'Type the text shown' },
    { labelText: 'कैप्चा कोड' },
    { labelText: 'सुरक्षा कोड' },
    { ariaLabel: 'I am not a robot' },
    { name: 'cf-turnstile-response' },
  ])('flags %o', (field) => {
    expect(isCaptchaField(field)).toBe(true);
    expect(isFillable(classifyField(field))).toBe(false);
  });

  it('matches regardless of separator style', () => {
    expect(isCaptchaField({ name: 'captchaCode' })).toBe(true);
    expect(isCaptchaField({ name: 'captcha-code' })).toBe(true);
    expect(isCaptchaField({ name: 'CAPTCHA_CODE' })).toBe(true);
  });

  it('does not flag ordinary fields', () => {
    expect(isCaptchaField({ name: 'applicant_name', labelText: "Applicant's name" })).toBe(false);
    expect(isCaptchaField({ name: 'pincode', labelText: 'PIN code' })).toBe(false);
  });
});

describe('safety — OTP fields are never filled', () => {
  it.each([
    { name: 'otp' },
    { id: 'otp_input' },
    { labelText: 'Enter OTP' },
    { labelText: 'One Time Password' },
    { placeholder: 'Verification code' },
    { labelText: 'ओटीपी दर्ज करें' },
    { name: 'mobile_otp' },
    { ariaLabel: 'SMS code' },
  ])('flags %o', (field) => {
    expect(isOtpField(field)).toBe(true);
    expect(isFillable(classifyField(field))).toBe(false);
  });

  it('does not flag words that merely contain the letters o-t-p', () => {
    expect(isOtpField({ name: 'adoption_status', labelText: 'Adoption status' })).toBe(false);
    expect(isOtpField({ name: 'photo_upload', labelText: 'Photo' })).toBe(false);
    expect(isOtpField({ name: 'optionalField', labelText: 'Optional' })).toBe(false);
    expect(isOtpField({ name: 'optOut', labelText: 'Opt out' })).toBe(false);
  });

  /*
   * An OTP box on an Indian portal nearly always carries the word "mobile" or "email", because
   * that is what the code was sent to. `otpMobile` is the dangerous shape: the adapter's mobile
   * field sees a positive signal, so safety.ts is the tier that has to say no.
   *
   * These ran green against a haystack that lowercased before splitting camelCase, which meant
   * `otpMobile` collapsed to `otpmobile` and `\botp\b` never fired. The separator cases below
   * exist so that ordering cannot silently regress.
   */
  it.each([
    { name: 'otpMobile' },
    { name: 'mobileOtp' },
    { name: 'mobile_otp' },
    { name: 'otp-mobile' },
    { name: 'OTP_MOBILE' },
    { name: 'mobileOTP' },
    { name: 'otpEmail' },
    { name: 'emailOtp' },
    { id: 'mobile_otp' },
    { id: 'txtOtpMobile' },
    { labelText: 'Enter OTP sent to mobile number' },
    { labelText: 'मोबाइल पर भेजा गया ओटीपी' },
    { placeholder: 'Enter 6-digit Mobile OTP' },
    { ariaLabel: 'Mobile Verification Code' },
    { ariaLabel: 'Email Verification Code' },
    { labelText: 'मोबाइल सत्यापन कोड' },
  ])('classifies a mobile/email-flavoured OTP box as otp, not as a contact field: %o', (field) => {
    expect(isOtpField(field)).toBe(true);
    expect(classifyField(field)).toBe('otp');
    expect(isFillable(classifyField(field))).toBe(false);
  });

  it('still leaves a genuine mobile or email field fillable', () => {
    // The disqualifiers must not swallow the real contact fields, or the operator ends up
    // typing every form by hand and starts looking for a way around the safety layer.
    for (const field of [
      { name: 'mobileNumber', labelText: 'Mobile Number', inputType: 'tel' },
      { name: 'mobile_no', labelText: 'मोबाइल संख्या', inputType: 'text' },
      { name: 'emailId', labelText: 'Email ID', inputType: 'email' },
    ]) {
      expect(isOtpField(field), field.name).toBe(false);
      expect(classifyField(field), field.name).toBe('normal');
      expect(isFillable(classifyField(field)), field.name).toBe(true);
    }
  });
});

describe('safety — payment fields are never autofilled in the MVP', () => {
  it.each([
    { labelText: 'Card number' },
    { name: 'cardNumber' },
    { name: 'cvv' },
    { labelText: 'CVC' },
    { labelText: 'Expiry date' },
    { labelText: 'Name on card' },
    { labelText: 'UPI ID' },
    { name: 'vpa' },
    { labelText: 'ATM PIN' },
    { autocomplete: 'cc-number' },
    { autocomplete: 'cc-csc' },
    { labelText: 'कार्ड नंबर' },
  ])('flags %o', (field) => {
    expect(isPaymentField(field)).toBe(true);
    expect(isFillable(classifyField(field))).toBe(false);
  });

  it('does not flag a bank account field, which is customer data rather than a credential', () => {
    expect(isPaymentField({ name: 'account_number', labelText: 'Bank account number' })).toBe(
      false,
    );
    expect(isPaymentField({ name: 'ifsc', labelText: 'IFSC code' })).toBe(false);
  });
});

describe('safety — submit controls are never clicked', () => {
  it.each([
    { inputType: 'submit' },
    { inputType: 'image' },
    { tagName: 'button' },
    { tagName: 'button', inputType: 'submit', text: 'Submit' },
    { tagName: 'input', inputType: 'button', text: 'Final Submit' },
    { tagName: 'a', text: 'Proceed to Pay' },
    { tagName: 'a', text: 'Pay now' },
    { tagName: 'a', text: 'जमा करें' },
    { tagName: 'div', name: 'confirm_and_pay' },
  ])('flags %o', (control) => {
    expect(isSubmitControl(control)).toBe(true);
  });

  it('treats a bare <button> as a submit control, because that is what the HTML spec says', () => {
    expect(isSubmitControl({ tagName: 'button' })).toBe(true);
    expect(isSubmitControl({ tagName: 'button', inputType: 'button', text: 'Add row' })).toBe(
      false,
    );
  });

  it('does not flag an ordinary text input', () => {
    expect(isSubmitControl({ tagName: 'input', inputType: 'text', name: 'full_name' })).toBe(false);
  });
});

describe('safety — classification precedence', () => {
  it('reports a CVV labelled "security code" as a payment field', () => {
    // "security code" is also a CAPTCHA marker; payment is the more useful label, and either
    // way the field is skipped.
    expect(classifyField({ name: 'cvv', labelText: 'Security code' })).toBe('payment');
  });

  it('leaves ordinary fields normal and fillable', () => {
    const field = { name: 'applicant_name', labelText: "Applicant's Name", inputType: 'text' };
    expect(classifyField(field)).toBe('normal');
    expect(isFillable(classifyField(field))).toBe(true);
  });
});

describe('safety — unsupported inputs', () => {
  it('never treats a password field as fillable', () => {
    expect(isPasswordField('password')).toBe(true);
    expect(isSupportedInputType('password')).toBe(false);
  });

  it('never treats a file input as programmatically fillable', () => {
    expect(isFileInput('file')).toBe(true);
    expect(isSupportedInputType('file')).toBe(false);
  });

  it('supports the field types listed in §14.5 and expanded field types', () => {
    for (const type of [
      'text',
      'email',
      'tel',
      'date',
      'datetime-local',
      'month',
      'week',
      'time',
      'color',
      'range',
      'number',
      'select-one',
      'select-multiple',
      'radio',
      'checkbox',
      'textarea',
      'contenteditable',
      'combobox',
      'listbox',
      'switch',
    ]) {
      expect(isSupportedInputType(type), type).toBe(true);
    }
  });

  it('refuses types it has no rule for, rather than guessing', () => {
    for (const type of ['hidden', 'button', 'submit', 'image', 'file', 'password']) {
      expect(isSupportedInputType(type), type).toBe(false);
    }
  });
});
