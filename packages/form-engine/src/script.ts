/**
 * Which script a portal field wants, and which script a customer value is written in.
 *
 * A profile can hold a name in Devanagari (typed in Hindi, or read off a Hindi certificate) while
 * the portal only accepts English — SSC's One-Time Registration rejects a Devanagari name in the
 * father's-name box and wants the matriculation-certificate spelling instead. Typing the Hindi
 * value in anyway is a confident wrong answer, so the mapper uses this to stop and ask.
 *
 * Nothing here transliterates. "कृष्ण" is Krishna, Krishan or Krisna depending on the certificate, and a
 * guessed spelling that does not match the certificate is worse than an empty box (§14.7: a
 * transform never invents data).
 */

import { NAME_SCRIPT_PAIRS } from '@assistigo/core';
import type { DetectedField, Script } from './types';

const DEVANAGARI = /\p{Script=Devanagari}/u;
const LATIN = /\p{Script=Latin}/u;

/** The script a value is written in; Devanagari wins when a value mixes both. */
export function scriptOf(value: string | null | undefined): Script | null {
  if (!value) return null;
  if (DEVANAGARI.test(value)) return 'devanagari';
  if (LATIN.test(value)) return 'latin';
  return null;
}

const WANTS_LATIN =
  /\bin english\b|\benglish only\b|\(\s*english\s*\)|\b(?:capital|block) letters?\b/i;
const WANTS_DEVANAGARI = /\b(?:in hindi|hindi)\b|हिंदी|हिन्दी|देवनागरी/i;

/** Field text an operator reads: what the portal says about this box. */
function describingText(field: DetectedField): string {
  return [field.labelText, field.ariaLabel, field.placeholder, field.nearbyText]
    .filter(Boolean)
    .join(' ');
}

/**
 * Compiled the way a browser compiles the `pattern` attribute — anchored, `v` flag — so a value
 * the page would reject is rejected here too. A pattern that does not compile says nothing.
 */
function patternRejects(pattern: string, value: string): boolean {
  for (const flags of ['v', 'u']) {
    try {
      return !new RegExp(`^(?:${pattern})$`, flags).test(value);
    } catch {
      // Try the next flag set; an older pattern may be invalid under `v` but fine under `u`.
    }
  }
  return false;
}

export type ScriptExpectation = {
  script: Script;
  /**
   * `explicit` when the adapter, the label or the field's own pattern says so; `inferred` when
   * the only evidence is that the field is labelled in English alone. An explicit mismatch blocks
   * the value; an inferred one only forces review, because plenty of English-labelled forms
   * accept either script.
   */
  strength: 'explicit' | 'inferred';
};

/**
 * What script this field wants, given the value about to go into it. `null` when nothing on the
 * page or in the adapter says.
 */
export function expectedScript(
  field: DetectedField,
  value: string,
  declared?: Script,
): ScriptExpectation | null {
  if (declared) return { script: declared, strength: 'explicit' };

  const text = describingText(field);
  const latin = WANTS_LATIN.test(text);
  const devanagari = WANTS_DEVANAGARI.test(text);
  // "Name (English / Hindi)" says either is fine.
  if (latin !== devanagari) {
    return { script: latin ? 'latin' : 'devanagari', strength: 'explicit' };
  }
  if (latin && devanagari) return null;

  // Only read as a script rule when it turns Hindi away: a pattern can reject an English value
  // for a dozen reasons (length, digits, a trailing space) that have nothing to do with script.
  if (field.pattern && scriptOf(value) === 'devanagari' && patternRejects(field.pattern, value)) {
    return { script: 'latin', strength: 'explicit' };
  }

  // A box labelled only in English, on a page section with no Hindi in sight.
  const surrounding = `${text} ${field.sectionHeading ?? ''}`;
  if (LATIN.test(surrounding) && !DEVANAGARI.test(surrounding)) {
    return { script: 'latin', strength: 'inferred' };
  }
  return null;
}

/**
 * Customer fields that hold the same fact in the other script (`NAME_SCRIPT_PAIRS`), both ways.
 * When a field wants English and the mapped field is the Hindi rendering (or the reverse), the
 * twin is the right value, not a guess.
 */
export const SCRIPT_TWINS: Readonly<Record<string, string>> = Object.fromEntries(
  NAME_SCRIPT_PAIRS.flatMap(({ english, hindi }) => [
    [english, hindi],
    [hindi, english],
  ]),
);
