/**
 * Tests for drop codes and the deep links built from them.
 *
 * Two things here are worth real assertions. The code format, because a citizen reads it aloud
 * across a counter and an ambiguous character costs a retry. And `parseDropCommand`, because it
 * is the first thing that touches an inbound message from a stranger: it has to recognise the
 * handful of forms people and clients actually send, and refuse everything else without
 * throwing.
 */

import { describe, expect, it } from 'vitest';
import {
  buildTelegramDropLink,
  buildWebDropLink,
  buildWhatsAppDropLink,
  generateCounterCode,
  generateDropSessionCode,
  isCounterDropCode,
  isDoneCommand,
  isDropSessionCode,
  normalizeDropCode,
  parseDropCommand,
} from './session-codes';

describe('generateDropSessionCode', () => {
  it('produces the DROP-nnnn format', () => {
    expect(generateDropSessionCode(() => 0)).toBe('DROP-2222');
    // A random() returning just under 1 must still index inside the alphabet.
    expect(generateDropSessionCode(() => 0.999999)).toBe('DROP-9999');
  });

  it('never emits a character people misread on a printed card', () => {
    // 0/O and 1/I/l are the confusable pairs; the alphabet is digits 2–9 for that reason.
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const code = generateDropSessionCode();
      expect(code).toMatch(/^DROP-[2-9]{4}$/);
      expect(isDropSessionCode(code)).toBe(true);
    }
  });

  it('survives a random() that returns out-of-range values', () => {
    expect(() => generateDropSessionCode(() => 1.5)).not.toThrow();
    expect(() => generateDropSessionCode(() => -1)).not.toThrow();
  });
});

describe('generateCounterCode', () => {
  it('takes the initials of the centre and a per-tenant sequence', () => {
    expect(generateCounterCode('Kanpur Seva Kendra', 829)).toBe('KSK829');
    expect(generateCounterCode('Sharma Cyber Cafe', 7)).toBe('SCC007');
  });

  it('falls back to CSC when the name yields fewer than two initials', () => {
    // A one-word name, and a name with no Latin letters at all.
    expect(generateCounterCode('Jansuvidha', 41)).toBe('CSC041');
    expect(generateCounterCode('जन सेवा केंद्र', 41)).toBe('CSC041');
  });

  it('stays six characters however high the sequence goes', () => {
    expect(generateCounterCode('Kanpur Seva Kendra', 41829)).toHaveLength(6);
    expect(generateCounterCode('Kanpur Seva Kendra', 0)).toBe('KSK000');
  });

  it('emits a code the resolver will accept', () => {
    expect(isCounterDropCode(generateCounterCode('Kanpur Seva Kendra', 829))).toBe(true);
  });

  it('caps the initials at three letters', () => {
    expect(generateCounterCode('Bharat Digital Seva Kendra Centre', 12)).toBe('BDS012');
  });
});

describe('normalizeDropCode', () => {
  it('uppercases and strips punctuation a phone keyboard adds', () => {
    expect(normalizeDropCode(' drop-7429 ')).toBe('DROP-7429');
    expect(normalizeDropCode('“DROP-7429”')).toBe('DROP-7429');
  });

  it('rejects anything too short or too long to be a code', () => {
    expect(normalizeDropCode('ab')).toBeNull();
    expect(normalizeDropCode('A'.repeat(40))).toBeNull();
  });
});

describe('parseDropCommand', () => {
  it.each([
    ['START DROP-7429', 'DROP-7429'],
    ['start drop-7429', 'DROP-7429'],
    ['/start DROP-7429', 'DROP-7429'],
    ['/start@sharma_centre_bot DROP-7429', 'DROP-7429'],
    ['DROP-7429', 'DROP-7429'],
    ['KSK829', 'KSK829'],
    ['START KSK829 please', 'KSK829'],
  ])('reads %s as %s', (input, expected) => {
    expect(parseDropCommand(input)).toBe(expected);
  });

  it('returns null for ordinary chatter, which means "treat this as a file"', () => {
    // The signal to route the message to the sender's already-bound session rather than
    // trying to open a new one.
    expect(parseDropCommand('namaste')).toBeNull();
    expect(parseDropCommand('yeh mera aadhaar hai')).toBeNull();
    expect(parseDropCommand('')).toBeNull();
    expect(parseDropCommand(null)).toBeNull();
    expect(parseDropCommand(undefined)).toBeNull();
  });

  it('refuses a token that is code-shaped but not a code we issue', () => {
    // Four digits with a zero cannot have come from `generateDropSessionCode`, and a bare
    // `START` with nothing after it is not a session request.
    expect(parseDropCommand('DROP-0000')).toBeNull();
    expect(parseDropCommand('START')).toBeNull();
    expect(parseDropCommand('/start')).toBeNull();
  });
});

describe('isDoneCommand', () => {
  it('recognises the citizen saying they are finished, in either language', () => {
    expect(isDoneCommand('DONE')).toBe(true);
    expect(isDoneCommand(' done ')).toBe(true);
    expect(isDoneCommand('हो गया')).toBe(true);
    expect(isDoneCommand('समाप्त')).toBe(true);
  });

  it('does not read a caption as a completion', () => {
    expect(isDoneCommand('aadhaar done hai kya')).toBe(false);
    expect(isDoneCommand(null)).toBe(false);
  });
});

describe('deep links', () => {
  it('builds a wa.me click-to-chat link with the start token prefilled', () => {
    expect(buildWhatsAppDropLink('+91 90000 00000', 'DROP-7429')).toBe(
      'https://wa.me/919000000000?text=START%20DROP-7429',
    );
  });

  it('builds a telegram start link, with or without the leading @', () => {
    expect(buildTelegramDropLink('@sharma_centre_bot', 'DROP-7429')).toBe(
      'https://t.me/sharma_centre_bot?start=DROP-7429',
    );
    expect(buildTelegramDropLink('sharma_centre_bot', 'KSK829')).toBe(
      'https://t.me/sharma_centre_bot?start=KSK829',
    );
  });

  it('builds a web drop link without doubling the slash', () => {
    expect(buildWebDropLink('https://app.assistigo.test/', 'DROP-7429')).toBe(
      'https://app.assistigo.test/drop/DROP-7429',
    );
    expect(buildWebDropLink('http://localhost:3000', 'KSK829')).toBe(
      'http://localhost:3000/drop/KSK829',
    );
  });
});
