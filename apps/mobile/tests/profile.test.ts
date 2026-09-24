/**
 * Profile-setup validation. Names here are placeholders, not anyone's real details.
 */

import { genderSchema, INDIAN_STATES } from '@assistigo/core';
import { describe, expect, it } from 'vitest';

import {
  FULL_NAME_MAX_LENGTH,
  fullNameError,
  hasProfileErrors,
  normaliseFullName,
  PROFILE_GENDERS,
  type ProfileDraft,
  profileErrors,
  stateOptions,
  toCitizenProfile,
} from '../lib/profile/profile';

const NOW = new Date(2026, 8, 23, 12);

const COMPLETE: ProfileDraft = {
  fullName: '  Sample   Citizen ',
  dateOfBirth: '2005-03-15',
  gender: 'male',
  state: 'BR',
  language: 'hi',
};

const EMPTY: ProfileDraft = {
  fullName: '',
  dateOfBirth: null,
  gender: null,
  state: null,
  language: 'en',
};

describe('normaliseFullName', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseFullName('  Sample \t  Citizen \n')).toBe('Sample Citizen');
  });
});

describe('fullNameError', () => {
  it('accepts names in Latin and Devanagari script, with the usual punctuation', () => {
    for (const name of [
      'Sample Citizen',
      'नमूना नागरिक',
      "Demo D'Souza",
      'K. Sample',
      'Test-Name',
    ]) {
      expect(fullNameError(name), name).toBeNull();
    }
  });

  it('flags a blank name as missing', () => {
    expect(fullNameError('')).toBe('missing');
    expect(fullNameError('   ')).toBe('missing');
  });

  it('flags a single letter as too short', () => {
    expect(fullNameError('A')).toBe('too_short');
  });

  it('flags a name over the core limit as too long', () => {
    expect(fullNameError('a'.repeat(FULL_NAME_MAX_LENGTH))).toBeNull();
    expect(fullNameError('a'.repeat(FULL_NAME_MAX_LENGTH + 1))).toBe('too_long');
  });

  it('flags digits, symbols and a leading punctuation mark', () => {
    for (const name of ['Sample123', 'Sample@Citizen', '-Sample', '.Sample']) {
      expect(fullNameError(name), name).toBe('invalid_characters');
    }
  });
});

describe('profileErrors', () => {
  it('lists every empty field', () => {
    expect(profileErrors(EMPTY, NOW)).toEqual({
      fullName: 'missing',
      dateOfBirth: 'missing',
      gender: 'missing',
      state: 'missing',
    });
  });

  it('is empty for a complete draft', () => {
    const errors = profileErrors(COMPLETE, NOW);
    expect(errors).toEqual({});
    expect(hasProfileErrors(errors)).toBe(false);
  });

  it('passes the date-of-birth problem through', () => {
    expect(profileErrors({ ...COMPLETE, dateOfBirth: '2027-01-01' }, NOW)).toEqual({
      dateOfBirth: 'future',
    });
    expect(profileErrors({ ...COMPLETE, dateOfBirth: '1850-01-01' }, NOW)).toEqual({
      dateOfBirth: 'too_old',
    });
  });
});

describe('toCitizenProfile', () => {
  it('returns the normalised profile when every field is valid', () => {
    expect(toCitizenProfile(COMPLETE, NOW)).toEqual({
      fullName: 'Sample Citizen',
      dateOfBirth: '2005-03-15',
      gender: 'male',
      state: 'BR',
      language: 'hi',
    });
  });

  it('returns null while any field has an error', () => {
    expect(toCitizenProfile(EMPTY, NOW)).toBeNull();
    expect(toCitizenProfile({ ...COMPLETE, gender: null }, NOW)).toBeNull();
    expect(toCitizenProfile({ ...COMPLETE, fullName: 'Sample1' }, NOW)).toBeNull();
  });
});

describe('PROFILE_GENDERS', () => {
  it('uses only values core already understands', () => {
    for (const gender of PROFILE_GENDERS) {
      expect(genderSchema.safeParse(gender).success, gender).toBe(true);
    }
  });
});

describe('stateOptions', () => {
  it.each(['en', 'hi'] as const)('lists every state and union territory once in %s', (locale) => {
    const options = stateOptions(locale);
    expect(options).toHaveLength(INDIAN_STATES.length);
    expect(new Set(options.map((option) => option.value)).size).toBe(INDIAN_STATES.length);
  });

  it.each(['en', 'hi'] as const)('sorts alphabetically in %s', (locale) => {
    const labels = stateOptions(locale).map((option) => option.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, locale));
    expect(labels).toEqual(sorted);
  });

  it('names states in the citizen language', () => {
    expect(stateOptions('en').find((option) => option.value === 'BR')?.label).toBe('Bihar');
    expect(stateOptions('hi').find((option) => option.value === 'BR')?.label).toBe('बिहार');
  });
});
