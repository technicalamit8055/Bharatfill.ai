/**
 * One-click portal login.
 * Master spec §19.7a; docs/EXTENSION.md § Portal login.
 *
 * This is the only code in the extension that types a password, and it is separate from the
 * form filler on purpose: `applyFill` still refuses every password field (safety rule tested in
 * packages/form-engine/src/safety.test.ts), and nothing the mapper proposes can reach here.
 *
 * Rules, each enforced in this file regardless of what the caller sent:
 *
 *   1. The page must be `https:` on one of the portal's allow-listed hosts. The background
 *      worker checked the tab URL and the server checked it again; this is the third check, made
 *      against the page's own `location`, so a navigation between the click and the fill cannot
 *      hand a password to a different site.
 *   2. It never submits. No click, no `form.submit()`, no `requestSubmit()`, no Enter key.
 *   3. It never touches a CAPTCHA or OTP field. It only reports that one is there, so the panel
 *      can tell the operator to solve it.
 *   4. It writes into the top document only, never into an iframe.
 *   5. Nothing is kept: the values arrive in the message, are typed, and go out of scope.
 */

import { isCaptchaField, isOtpField, type ClassifiableField } from '@assistigo/form-engine/safety';
import { isAllowedLoginLocation } from '@assistigo/core/portal-credentials/hosts';
import { isElementVisible } from './detector';
import { dispatchInputEvents, setNativeValue } from './filler';

export type PortalLoginRequest = {
  loginId: string;
  password: string | null;
  hosts: readonly string[];
};

export type PortalLoginResult = {
  status: 'filled' | 'refused';
  loginIdFilled: boolean;
  passwordFilled: boolean;
  /** A CAPTCHA box is on the page: the operator has to solve it. */
  captchaPresent: boolean;
  reason?: 'host_not_allowed' | 'no_login_form';
};

type LocationLike = { protocol: string; hostname: string; port: string; username?: string };

const TEXT_LIKE_TYPES = new Set(['', 'text', 'email', 'tel', 'number']);

/** Words a login-ID box is labelled with, for a page that shows the ID box before the password. */
const LOGIN_ID_HINT =
  /user|login|regist|regn|reg\.?\s*no|otr|sso|candidate|applicant|email|mobile|\bid\b|यूजर|लॉगिन|पंजीकरण|रजिस्ट्रेशन/i;

function classifiable(input: HTMLInputElement): ClassifiableField {
  const label = input.labels?.[0]?.textContent ?? null;
  return {
    inputType: input.type,
    name: input.name || null,
    id: input.id || null,
    className: input.className || null,
    placeholder: input.placeholder || null,
    labelText: label,
    ariaLabel: input.getAttribute('aria-label'),
    autocomplete: input.getAttribute('autocomplete'),
    maxLength: input.maxLength > 0 ? input.maxLength : null,
  };
}

function isUsable(input: HTMLInputElement): boolean {
  return !input.disabled && !input.readOnly && isElementVisible(input);
}

function isGuarded(input: HTMLInputElement): boolean {
  const field = classifiable(input);
  return isCaptchaField(field) || isOtpField(field);
}

function hintText(input: HTMLInputElement): string {
  const field = classifiable(input);
  return [field.name, field.id, field.placeholder, field.labelText, field.ariaLabel, field.autocomplete]
    .filter(Boolean)
    .join(' ');
}

function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** The login-ID box: the text box closest before the password box, in the same form. */
function findLoginIdInput(
  doc: Document,
  password: HTMLInputElement | null,
): HTMLInputElement | null {
  const scope: ParentNode = password?.form ?? doc;
  const candidates = Array.from(scope.querySelectorAll('input')).filter(
    (input) =>
      TEXT_LIKE_TYPES.has((input.getAttribute('type') ?? '').toLowerCase()) &&
      isUsable(input) &&
      !isGuarded(input),
  );

  if (password) {
    const before = candidates.filter((input) => precedes(input, password));
    return before.at(-1) ?? null;
  }
  // No password box (a two-step login that asks for the ID first): only a box that says it is
  // for a login ID, never just the first text box on the page.
  return candidates.find((input) => LOGIN_ID_HINT.test(hintText(input))) ?? null;
}

function findPasswordInput(doc: Document): HTMLInputElement | null {
  // `.type` is normalised to lower case by the DOM, unlike the attribute.
  const inputs = Array.from(doc.querySelectorAll('input')).filter((input) => input.type === 'password');
  return inputs.find((input) => isUsable(input) && !isGuarded(input)) ?? null;
}

function captchaOnPage(doc: Document, scope: ParentNode): boolean {
  const inputs = Array.from(scope.querySelectorAll('input')).filter(isElementVisible);
  if (inputs.some((input) => isCaptchaField(classifiable(input)))) return true;
  return Array.from(doc.querySelectorAll('img, canvas, iframe')).some((element) =>
    /captcha/i.test(
      [element.id, element.className, element.getAttribute('src'), element.getAttribute('alt'), element.getAttribute('title')]
        .filter(Boolean)
        .join(' '),
    ),
  );
}

function write(input: HTMLInputElement, value: string): void {
  setNativeValue(input, value);
  dispatchInputEvents(input);
}

export function fillPortalLogin(
  doc: Document,
  location: LocationLike,
  request: PortalLoginRequest,
): PortalLoginResult {
  const refused = (reason: PortalLoginResult['reason']): PortalLoginResult => ({
    status: 'refused',
    loginIdFilled: false,
    passwordFilled: false,
    captchaPresent: false,
    reason,
  });

  if (!isAllowedLoginLocation(location, request.hosts)) return refused('host_not_allowed');

  const passwordInput = findPasswordInput(doc);
  const loginIdInput = findLoginIdInput(doc, passwordInput);

  const willFillPassword = passwordInput !== null && request.password !== null;
  if (!loginIdInput && !willFillPassword) return refused('no_login_form');

  if (loginIdInput) write(loginIdInput, request.loginId);
  if (passwordInput && request.password !== null) write(passwordInput, request.password);

  return {
    status: 'filled',
    loginIdFilled: loginIdInput !== null,
    passwordFilled: willFillPassword,
    captchaPresent: captchaOnPage(doc, passwordInput?.form ?? loginIdInput?.form ?? doc),
  };
}
