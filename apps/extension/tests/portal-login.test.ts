/**
 * One-click portal login — safety tests (spec §19.7a; docs/EXTENSION.md § Portal login).
 *
 * DO NOT DELETE OR WEAKEN THIS FILE. The portal login is the one place the extension types a
 * password; these tests are what keep it to an allow-listed https portal, out of CAPTCHA and
 * OTP boxes, and away from every submit path.
 *
 * All values here are fake test data.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fillPortalLogin } from '../src/content/login-filler';
import { applyFill } from '../src/content/filler';
import { detectFields } from '../src/content/detector';

const SSC = { protocol: 'https:', hostname: 'ssc.gov.in', port: '' };
const HOSTS = ['ssc.gov.in'];
const REQUEST = { loginId: 'TEST-REG-0001', password: 'Bakemiv@4827', hosts: HOSTS };

function render(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

function value(doc: Document, selector: string): string {
  return (doc.querySelector(selector) as HTMLInputElement).value;
}

const LOGIN_FORM = `
  <form id="login">
    <label for="u">Registration Number</label><input id="u" name="registrationNo" />
    <label for="p">Password</label><input id="p" type="password" name="password" />
    <label for="c">Enter Captcha</label><input id="c" name="captcha" />
    <img id="captchaImg" src="/captcha.png" alt="captcha" />
    <button type="submit">Login</button>
  </form>`;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('portal login — fills the login form', () => {
  it('types the login ID and password into the right boxes', () => {
    const doc = render(LOGIN_FORM);
    const result = fillPortalLogin(doc, SSC, REQUEST);
    expect(result).toMatchObject({ status: 'filled', loginIdFilled: true, passwordFilled: true });
    expect(value(doc, '#u')).toBe('TEST-REG-0001');
    expect(value(doc, '#p')).toBe('Bakemiv@4827');
  });

  it('works on a subdomain of an allow-listed host', () => {
    const doc = render(LOGIN_FORM);
    const result = fillPortalLogin(doc, { ...SSC, hostname: 'otr.ssc.gov.in' }, REQUEST);
    expect(result.status).toBe('filled');
  });

  it('picks the box just before the password, not an unrelated search box', () => {
    const doc = render(`
      <input id="search" name="q" placeholder="Search notices" />
      <form>
        <input id="u" name="userid" />
        <input id="p" type="password" name="pwd" />
      </form>`);
    fillPortalLogin(doc, SSC, REQUEST);
    expect(value(doc, '#search')).toBe('');
    expect(value(doc, '#u')).toBe('TEST-REG-0001');
  });

  it('fills just the login ID when no password is saved', () => {
    const doc = render(LOGIN_FORM);
    const result = fillPortalLogin(doc, SSC, { ...REQUEST, password: null });
    expect(result).toMatchObject({ loginIdFilled: true, passwordFilled: false });
    expect(value(doc, '#p')).toBe('');
  });

  it('fills a two-step login: an ID-only page needs a labelled login box', () => {
    const doc = render(`<form><input id="name" name="fullname" /><input id="sso" name="ssoid" /></form>`);
    const result = fillPortalLogin(doc, SSC, REQUEST);
    expect(result.loginIdFilled).toBe(true);
    expect(value(doc, '#sso')).toBe('TEST-REG-0001');
    expect(value(doc, '#name')).toBe('');
  });

  it('reports a CAPTCHA so the operator is told to solve it', () => {
    const doc = render(LOGIN_FORM);
    expect(fillPortalLogin(doc, SSC, REQUEST).captchaPresent).toBe(true);
  });

  it('refuses when there is no login form', () => {
    const doc = render(`<p>Notices</p><input name="q" placeholder="Search" />`);
    expect(fillPortalLogin(doc, SSC, REQUEST)).toMatchObject({
      status: 'refused',
      reason: 'no_login_form',
    });
    expect(value(doc, 'input')).toBe('');
  });
});

describe('portal login — safety: only on the allow-listed https portal', () => {
  const lookalikes = [
    { protocol: 'https:', hostname: 'notssc.gov.in', port: '' },
    { protocol: 'https:', hostname: 'ssc.gov.in.evil.example', port: '' },
    { protocol: 'https:', hostname: 'sscgov.in', port: '' },
    { protocol: 'http:', hostname: 'ssc.gov.in', port: '' },
    { protocol: 'https:', hostname: 'ssc.gov.in', port: '8443' },
    { protocol: 'https:', hostname: 'ssc.gov.in', port: '', username: 'x' },
  ];

  for (const location of lookalikes) {
    it(`types nothing on ${location.protocol}//${location.hostname}:${location.port}`, () => {
      const doc = render(LOGIN_FORM);
      const result = fillPortalLogin(doc, location, REQUEST);
      expect(result).toMatchObject({ status: 'refused', reason: 'host_not_allowed' });
      expect(value(doc, '#u')).toBe('');
      expect(value(doc, '#p')).toBe('');
    });
  }

  it('types nothing when the allow-list is empty', () => {
    const doc = render(LOGIN_FORM);
    expect(fillPortalLogin(doc, SSC, { ...REQUEST, hosts: [] }).status).toBe('refused');
    expect(value(doc, '#p')).toBe('');
  });
});

describe('portal login — safety: never submits', () => {
  it('does not submit, click or press Enter', () => {
    const doc = render(LOGIN_FORM);
    const form = doc.getElementById('login') as HTMLFormElement;
    const submitted = vi.fn((event: Event) => event.preventDefault());
    const clicked = vi.fn();
    const keyed = vi.fn();
    form.addEventListener('submit', submitted);
    doc.addEventListener('click', clicked, true);
    doc.addEventListener('keydown', keyed, true);
    const submitSpy = vi.spyOn(form, 'submit');
    const requestSubmitSpy = vi.spyOn(form, 'requestSubmit');

    fillPortalLogin(doc, SSC, REQUEST);

    expect(submitted).not.toHaveBeenCalled();
    expect(clicked).not.toHaveBeenCalled();
    expect(keyed).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
    expect(requestSubmitSpy).not.toHaveBeenCalled();
  });
});

describe('portal login — safety: CAPTCHA and OTP boxes are never written', () => {
  it('leaves the CAPTCHA box empty', () => {
    const doc = render(LOGIN_FORM);
    fillPortalLogin(doc, SSC, REQUEST);
    expect(value(doc, '#c')).toBe('');
  });

  it('never treats a CAPTCHA box as the login ID, even right before the password', () => {
    const doc = render(`
      <form>
        <input id="u" name="username" />
        <input id="c" name="captcha_code" placeholder="Enter captcha" />
        <input id="p" type="password" name="password" />
      </form>`);
    fillPortalLogin(doc, SSC, REQUEST);
    expect(value(doc, '#c')).toBe('');
    expect(value(doc, '#u')).toBe('TEST-REG-0001');
  });

  it('never types the password into a password-typed OTP box', () => {
    const doc = render(`
      <form>
        <input id="u" name="username" />
        <input id="otp" type="password" name="otp" placeholder="Enter OTP" />
      </form>`);
    const result = fillPortalLogin(doc, SSC, REQUEST);
    expect(value(doc, '#otp')).toBe('');
    expect(result.passwordFilled).toBe(false);
  });

  it('ignores hidden and disabled boxes', () => {
    const doc = render(`
      <form>
        <input id="u" name="username" />
        <input id="hidden" type="password" name="password" style="display:none" />
        <input id="disabled" type="password" name="password2" disabled />
      </form>`);
    const result = fillPortalLogin(doc, SSC, { ...REQUEST });
    expect(value(doc, '#hidden')).toBe('');
    expect(value(doc, '#disabled')).toBe('');
    expect(result.passwordFilled).toBe(false);
  });
});

describe('portal login does not open the form filler to passwords', () => {
  it('the ordinary fill path refuses a password box even when instructed by its real signature', async () => {
    const doc = render(LOGIN_FORM);
    const passwordField = detectFields(doc).find((field) => field.name === 'password');
    if (!passwordField) throw new Error('fixture has no password field');

    const results = await applyFill(doc, [
      { signature: passwordField.signature, value: 'Bakemiv@4827', inputType: 'text' },
    ]);

    expect(results).toEqual([
      expect.objectContaining({ action: 'skipped', skipReason: 'unsupported_type' }),
    ]);
    expect(value(doc, '#p')).toBe('');
  });
});
