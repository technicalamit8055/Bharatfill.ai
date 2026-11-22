/**
 * Portal password generator.
 * Master spec §19.7a.
 *
 * Generated passwords are random, not derived from the citizen. A pattern like name + birth
 * year (`Ramesh@1998#`) can be guessed by anyone holding the citizen's documents, which at a
 * service centre is everyone at the counter.
 *
 * The shape is `Word` + special + four digits (e.g. `Bakemiv@4827`) so a citizen can read it
 * off a thermal slip and type it on a phone keyboard. Characters that are easy to misread on
 * a slip — 0/O, 1/l/I — are left out entirely. With the default policy that is about 36 bits
 * of randomness: enough against online guessing, which the portals already rate-limit and
 * CAPTCHA-gate.
 *
 * Runs in the browser and on the server: randomness comes from Web Crypto, which both have.
 */

import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from './portals';

/** Returns an integer in [0, maxExclusive). Injectable so tests can be deterministic. */
export type RandomInt = (maxExclusive: number) => number;

const CONSONANTS = 'bcdfghjkmnprstvwz';
const VOWELS = 'aeiu';
const DIGITS = '23456789';

/** Unbiased random integer from Web Crypto, by rejection sampling. */
export const cryptoRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x1_0000_0000) {
    throw new RangeError('maxExclusive must be an integer in (0, 2^32].');
  }
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    const value = buffer[0] as number;
    if (value < limit) return value % maxExclusive;
  }
};

function pick(alphabet: string, random: RandomInt): string {
  return alphabet.charAt(random(alphabet.length));
}

export const PASSWORD_ISSUES = [
  'too_short',
  'too_long',
  'needs_upper',
  'needs_lower',
  'needs_digit',
  'needs_special',
  'has_whitespace',
] as const;

export type PasswordIssue = (typeof PASSWORD_ISSUES)[number];

/**
 * What a password is missing against a policy. Advisory for a password the citizen already
 * has (the portal accepted it, whatever we think), binding for one we generate.
 */
export function checkPasswordAgainstPolicy(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < policy.minLength) issues.push('too_short');
  if (password.length > policy.maxLength) issues.push('too_long');
  if (policy.requireUpper && !/[A-Z]/.test(password)) issues.push('needs_upper');
  if (policy.requireLower && !/[a-z]/.test(password)) issues.push('needs_lower');
  if (policy.requireDigit && !/[0-9]/.test(password)) issues.push('needs_digit');
  if (policy.requireSpecial && !/[^A-Za-z0-9\s]/.test(password)) issues.push('needs_special');
  if (/\s/.test(password)) issues.push('has_whitespace');
  return issues;
}

/**
 * A fresh password that satisfies `policy`.
 *
 * @param targetLength preferred length, clamped into the policy's window.
 * @throws Error if the policy cannot be met by this shape — a catalogue bug, not a user error.
 */
export function generatePortalPassword(
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
  random: RandomInt = cryptoRandomInt,
  targetLength = 12,
): string {
  const length = Math.min(Math.max(targetLength, policy.minLength), policy.maxLength);

  const special = policy.specials.length > 0 ? pick(policy.specials, random) : '';
  const digitCount = Math.min(4, Math.max(1, length - special.length - 3));
  const wordLength = length - special.length - digitCount;

  let word = '';
  for (let index = 0; index < wordLength; index += 1) {
    const letter = index % 2 === 0 ? pick(CONSONANTS, random) : pick(VOWELS, random);
    word += index === 0 ? letter.toUpperCase() : letter;
  }

  let digits = '';
  for (let index = 0; index < digitCount; index += 1) digits += pick(DIGITS, random);

  const password = `${word}${special}${digits}`;
  if (checkPasswordAgainstPolicy(password, policy).length > 0) {
    throw new Error('Password policy cannot be satisfied by the generator.');
  }
  return password;
}
