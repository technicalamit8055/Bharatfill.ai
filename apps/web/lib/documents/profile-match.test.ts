/**
 * Tests for "Already matched" detection on the review screen.
 *
 * A false match is the dangerous direction: it pre-accepts a value the operator never looked at.
 * So the cases that matter are the ones where a bug would mark something as matched that is
 * different, encrypted, or not itself confirmed by a human. All data here is invented.
 */

import { describe, expect, it } from 'vitest';
import type { CustomerRow } from '../supabase/database.types';
import {
  markProfileMatches,
  matchesProfileValue,
  profileValuesForMatching,
} from './profile-match';

function customer(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    full_name: 'Test Kumar',
    date_of_birth: '1990-01-15',
    address_json: { current: { district: 'Testpur' } },
    identity_summary_json: {},
    education_json: {},
    certificates_json: {},
    ...overrides,
  } as unknown as CustomerRow;
}

function field(key: string, value: string) {
  return { key, value, confidence: 0.6 };
}

describe('matchesProfileValue', () => {
  it('matches an identical value', () => {
    expect(matchesProfileValue('Test Kumar', 'Test Kumar')).toBe(true);
  });

  it('ignores case and runs of whitespace', () => {
    expect(matchesProfileValue('  TEST   kumar ', 'Test Kumar')).toBe(true);
  });

  it('does not match a value that differs', () => {
    expect(matchesProfileValue('Test Kumari', 'Test Kumar')).toBe(false);
  });

  it('does not match when the profile has no value', () => {
    expect(matchesProfileValue('Test Kumar', undefined)).toBe(false);
  });

  it('never matches a blank value, even against a blank one', () => {
    expect(matchesProfileValue('   ', '')).toBe(false);
  });
});

describe('profileValuesForMatching', () => {
  it('reads column and JSON-backed fields from the customer row', () => {
    const values = profileValuesForMatching(customer(), []);
    expect(values['customer.full_name']).toBe('Test Kumar');
    expect(values['customer.date_of_birth']).toBe('1990-01-15');
    expect(values['customer.address.district']).toBe('Testpur');
  });

  it('merges plaintext values stored in customer_field_values', () => {
    const values = profileValuesForMatching(customer(), [
      { field_key: 'customer.example_extra', value_text: 'X-123', status: 'operator_verified' },
    ]);
    expect(values['customer.example_extra']).toBe('X-123');
  });

  it('excludes a field whose stored value is still unverified', () => {
    const values = profileValuesForMatching(customer(), [
      { field_key: 'customer.full_name', value_text: 'Test Kumar', status: 'extracted' },
    ]);
    expect(values['customer.full_name']).toBeUndefined();
  });

  it('never yields an encrypted field', () => {
    // Encrypted rows carry no value_text, and the row reader skips encrypted storage.
    const values = profileValuesForMatching(customer(), [
      { field_key: 'customer.pan', value_text: null, status: 'operator_verified' },
    ]);
    expect(values['customer.pan']).toBeUndefined();
  });

  it('ignores a rejected row', () => {
    const values = profileValuesForMatching(customer(), [
      { field_key: 'customer.example_extra', value_text: 'X-123', status: 'rejected' },
    ]);
    expect(values['customer.example_extra']).toBeUndefined();
  });
});

describe('markProfileMatches', () => {
  it('flags only the fields equal to the profile and keeps every other property', () => {
    const marked = markProfileMatches(
      [
        field('customer.full_name', 'Test Kumar'),
        field('customer.date_of_birth', '1991-01-15'),
        field('customer.father_name', 'Example Lal'),
      ],
      profileValuesForMatching(customer(), []),
    );

    expect(marked).toEqual([
      { key: 'customer.full_name', value: 'Test Kumar', confidence: 0.6, matchesProfile: true },
      {
        key: 'customer.date_of_birth',
        value: '1991-01-15',
        confidence: 0.6,
        matchesProfile: false,
      },
      {
        key: 'customer.father_name',
        value: 'Example Lal',
        confidence: 0.6,
        matchesProfile: false,
      },
    ]);
  });

  it('matches nothing for a document with no customer profile values', () => {
    const marked = markProfileMatches([field('customer.full_name', 'Test Kumar')], {});
    expect(marked[0]?.matchesProfile).toBe(false);
  });
});
