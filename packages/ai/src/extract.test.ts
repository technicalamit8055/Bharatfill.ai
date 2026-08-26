/**
 * Tests for `buildFieldsFromStructuredOutput` — the path a vendor's structured-mode response
 * (an organization's custom prompt) takes to become review-ready fields.
 *
 * The one thing every test here is really checking: a custom prompt changes how a field is
 * proposed, never whether it is checked. Normalisation, high-risk review, and the Aadhaar
 * safety gate must all still apply, exactly as they do for the rules-engine path in
 * pipeline.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { buildFieldsFromStructuredOutput } from './extract';
import type { StructuredExtractedField } from './types';

function field(overrides: Partial<StructuredExtractedField>): StructuredExtractedField {
  return { key: 'customer.full_name', label: 'Name', value: 'Amit Kumar', confidence: 0.9, ...overrides };
}

describe('buildFieldsFromStructuredOutput', () => {
  it('normalises a value through the same helpers the rules engine uses', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.date_of_birth', value: '14/08/1996' })],
    });

    expect(fields[0]?.value).toBe('1996-08-14');
  });

  it('always sends a high-risk field to review, however confident the model claims to be', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.category', value: 'obc', confidence: 0.99 })],
    });

    expect(fields[0]?.status).toBe('needs_review');
    expect(fields[0]?.reviewReason).toBe('high_risk_field');
  });

  it('masks an Aadhaar-like number wherever it turns up, not just under the aadhaar key', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.address.printed', value: 'ID 123456789012, Ghazipur' })],
    });

    expect(fields[0]?.value).toContain('XXXX XXXX 9012');
    expect(fields[0]?.value).not.toContain('123456789012');
  });

  it('reduces an aadhaar_last4 field to four digits regardless of what the model sent', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.aadhaar_last4', value: '123456789012' })],
    });

    expect(fields[0]?.value).toBe('9012');
  });

  it('refuses customer.aadhaar outright — that storage location has no opt-in path yet', () => {
    const { fields, warnings } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.aadhaar', value: '123456789012' })],
    });

    expect(fields).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain('STRUCTURED_FIELD_NOT_ALLOWED');
  });

  it('drops a key that is not part of the customer field registry, with a warning', () => {
    const { fields, warnings } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.made_up_field_the_model_invented' })],
    });

    expect(fields).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain('STRUCTURED_UNKNOWN_FIELD');
  });

  it('drops a value that fails the field-appropriate format check, with a warning', () => {
    const { fields, warnings } = buildFieldsFromStructuredOutput({
      fields: [field({ key: 'customer.mobile', value: 'not a phone number' })],
    });

    expect(fields).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain('VALUE_NOT_UNDERSTOOD');
  });

  it('keeps the higher-confidence field when the model proposes the same key twice', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [
        field({ value: 'Amit Kumar', confidence: 0.5 }),
        field({ value: 'Amit  Kumar', confidence: 0.95 }),
      ],
    });

    expect(fields).toHaveLength(1);
    expect(fields[0]?.confidence).toBe(0.95);
  });

  it('falls back to the registry label when the model omits one', () => {
    const { fields } = buildFieldsFromStructuredOutput({
      fields: [field({ label: '' })],
    });

    expect(fields[0]?.label).toBe('Full name');
  });

  it('reports no fields found when every candidate is dropped', () => {
    const { fields, warnings } = buildFieldsFromStructuredOutput({
      fields: [field({ value: '' })],
    });

    expect(fields).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain('NO_FIELDS_FOUND');
  });

  it('accepts a field with no printed-line context, since structured mode has none', () => {
    const { fields } = buildFieldsFromStructuredOutput({ fields: [field({})] });
    expect(fields[0]?.page).toBe(1);
    expect(fields[0]?.bbox).toBeNull();
    expect(fields[0]?.sourceText).toBe('Amit Kumar');
  });
});
