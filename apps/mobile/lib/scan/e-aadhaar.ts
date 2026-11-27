/**
 * Opening a password-locked e-Aadhaar PDF with as little typing as possible.
 *
 * UIDAI locks every e-Aadhaar with the same published rule: the first four letters of the name
 * as on the Aadhaar, in capitals, then the year of birth — SURESH KUMAR born 1990 opens with
 * `SURE1990`, a name shorter than four letters is used whole (RIA → `RIA1990`). So Upload asks
 * only for the year, with the letters filled in from the name the citizen gave the app (and
 * editable, for a family member's e-Aadhaar or a name spelt differently on the card).
 *
 * Nothing is guessed in a loop: the citizen types the year. Where the rule is ambiguous (a name
 * with an initial, `P. KUMAR`) both readings are tried, at most two attempts. The password is
 * built in memory for the PDF renderer and never stored or logged; nor is the file name, which
 * for UIDAI's downloads holds the Aadhaar number.
 *
 * Pure, so it is unit tested.
 */

/** Whether a locked PDF is probably an e-Aadhaar, from its name (UIDAI's and DigiLocker's). */
export function looksLikeEAadhaarFile(fileName: string | null | undefined): boolean {
  if (!fileName) return false;
  return /a?adh?aa?r|uidai/i.test(fileName);
}

/** Letters UIDAI's rule would take: the first four, capitals, spaces ignored, dots kept. */
export function nameLettersFor(fullName: string | null | undefined): string {
  if (!fullName) return '';
  return fullName
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z.]/g, '')
    .slice(0, 4)
    .toUpperCase();
}

/** What the citizen may type into the letters box: up to four letters or dots, in capitals. */
export function cleanNameLetters(raw: string): string {
  return raw
    .replace(/[^A-Za-z.]/g, '')
    .slice(0, 4)
    .toUpperCase();
}

/** A plausible year of birth, as typed: four digits from 1900 to this year. */
export function isBirthYear(raw: string, now: Date = new Date()): boolean {
  if (!/^\d{4}$/.test(raw)) return false;
  const year = Number(raw);
  return year >= 1900 && year <= now.getFullYear();
}

/**
 * The passwords to try, most likely first: the letters as given, then — when they hold a dot —
 * the reading without it (the next letters of the name standing in). Empty when the input is
 * incomplete.
 */
export function eAadhaarPasswords(
  letters: string,
  year: string,
  fullName?: string | null,
  now: Date = new Date(),
): string[] {
  const cleaned = cleanNameLetters(letters);
  if (cleaned.replace(/\./g, '').length === 0 || !isBirthYear(year, now)) return [];
  const candidates = [`${cleaned}${year}`];
  if (cleaned.includes('.')) {
    const lettersOnly = (fullName ? fullName : cleaned)
      .normalize('NFKC')
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 4)
      .toUpperCase();
    if (lettersOnly.length > 0) candidates.push(`${lettersOnly}${year}`);
  }
  return [...new Set(candidates)];
}
