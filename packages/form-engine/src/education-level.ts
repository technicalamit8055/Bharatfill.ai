/**
 * Which qualification an education box is asking about.
 * docs/FORM_ENGINE.md §6b.
 *
 * Recruitment portals ask for education twice over. A box can say exactly what it wants
 * ("Matriculation Roll Number"), or it can be generic ("Roll Number") under a block whose
 * qualification is picked by an earlier dropdown — SSC's "Details of Qualifying Educational
 * Qualification" is the case that forced this. The dropdown's answer is a page value, and the
 * detector never reads page values (types.ts), so the level comes from, strongest first:
 *
 *   1. the box's own label, placeholder or aria-label naming a level ("12th", "Matriculation");
 *   2. its section heading naming one;
 *   3. the level the operator picked in the side panel for this page;
 *   4. the highest level the customer's profile has any education data for — a guess, so the
 *      mapper always asks for review on it.
 */

import type { DetectedField, EducationLevel } from './types';

/** Highest first: the order the profile fallback tries them in. */
const LEVELS_HIGHEST_FIRST: readonly EducationLevel[] = ['graduation', 'class12', 'class10'];

/**
 * Words that name one level and nothing else.
 *
 * Checked in this order, because they overlap: "Higher Secondary" contains "Secondary", so
 * class 12 has to be ruled in before a bare secondary-school phrase could claim class 10.
 * "University" is deliberately absent — SSC labels a class-12 board box "Name of Board/
 * University", so the word says nothing about the level.
 */
const LEVEL_WORDS: ReadonlyArray<readonly [EducationLevel, RegExp]> = [
  [
    'class12',
    /\b12th\b|\bxiith?\b|class\s*(?:12|xii)\b|intermediate|higher\s+secondary|senior\s+secondary|10\s*\+\s*2|\bhsc\b|बारहवीं|इंटरमीडिएट|इंटर\b/i,
  ],
  [
    'class10',
    /\b10th\b|\bxth\b|class\s*(?:10|x)\b|matric|high\s*school|secondary\s+school\s+(?:certificate|examination)|दसवीं|मैट्रिक|हाई\s*स्कूल/i,
  ],
  // No degree abbreviations: "B.A." is too close to ordinary text once punctuation is stripped.
  ['graduation', /graduat|bachelor|\bdegree\b|स्नातक/i],
];

/** The single level a piece of text names, or null when it names none or more than one. */
export function educationLevelInText(text: string | null | undefined): EducationLevel | null {
  if (!text) return null;
  const named = LEVEL_WORDS.filter(([, pattern]) => pattern.test(text)).map(([level]) => level);
  /*
   * "Higher Secondary (10+2)" names class 12 and nothing else; "Details of 10th / 12th" names
   * two, which is no answer at all — guessing between them is how a matriculation roll number
   * ends up in the intermediate box.
   */
  return named.length === 1 ? (named[0] ?? null) : null;
}

/** The level a field's own text, then its section heading, names. */
export function educationLevelOfField(
  field: Pick<DetectedField, 'labelText' | 'placeholder' | 'ariaLabel' | 'sectionHeading'>,
): EducationLevel | null {
  const own = [field.labelText, field.placeholder, field.ariaLabel]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
  return educationLevelInText(own) ?? educationLevelInText(field.sectionHeading);
}

/** Levels the customer's profile holds any education value for, highest first. */
export function educationLevelsWithData(
  customerValues: Readonly<Record<string, string | null>>,
): EducationLevel[] {
  return LEVELS_HIGHEST_FIRST.filter((level) =>
    Object.entries(customerValues).some(
      ([key, value]) =>
        key.startsWith(`customer.education.${level}.`) && value !== null && value.trim() !== '',
    ),
  );
}

/**
 * The page-wide level for generic education boxes, when the box itself does not say.
 *
 * Restricted to the levels the adapter field can actually map, so a class-12 profile is never
 * offered to a box that only knows class 10 and graduation.
 */
export function fallbackEducationLevel(
  available: readonly EducationLevel[],
  operatorChoice: EducationLevel | null | undefined,
  withData: readonly EducationLevel[],
): { level: EducationLevel; source: 'operator' | 'profile' } | null {
  if (operatorChoice && available.includes(operatorChoice)) {
    return { level: operatorChoice, source: 'operator' };
  }
  const fromProfile = withData.find((level) => available.includes(level));
  return fromProfile ? { level: fromProfile, source: 'profile' } : null;
}
