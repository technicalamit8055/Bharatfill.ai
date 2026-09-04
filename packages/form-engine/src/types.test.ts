/**
 * Wire-contract tests for the shapes that cross a process boundary.
 *
 * `fileAttachmentRequestSchema` is the side panel's word on which of the customer's files goes
 * into which upload box, and the background worker routes a signed-URL request off its `kind`.
 * Getting that wrong is not a type error at runtime — it is a 404 that tells the operator a file
 * sitting on the profile is unavailable — so the contract is pinned here.
 */

import { describe, expect, it } from 'vitest';
import { fileAttachmentRequestSchema } from './types';

const SIGNATURE = 'input#photo|name=photo|file';
const ID = '2f1e5b7c-1a9d-4c3e-9f0b-7d6a5c4b3a21';

describe('fileAttachmentRequestSchema', () => {
  it('accepts a prepared derivative', () => {
    const parsed = fileAttachmentRequestSchema.parse({
      signature: SIGNATURE,
      targetId: ID,
      kind: 'derivative',
    });

    expect(parsed).toEqual({ signature: SIGNATURE, targetId: ID, kind: 'derivative' });
  });

  it('accepts an original source document', () => {
    const parsed = fileAttachmentRequestSchema.parse({
      signature: SIGNATURE,
      targetId: ID,
      kind: 'source_document',
    });

    expect(parsed.kind).toBe('source_document');
  });

  it('defaults to a derivative when the kind is not stated', () => {
    const parsed = fileAttachmentRequestSchema.parse({ signature: SIGNATURE, targetId: ID });

    expect(parsed).toEqual({ signature: SIGNATURE, targetId: ID, kind: 'derivative' });
  });

  it('reads the former derivativeId name as targetId, so an older panel still works', () => {
    const parsed = fileAttachmentRequestSchema.parse({
      signature: SIGNATURE,
      derivativeId: ID,
    });

    expect(parsed).toEqual({ signature: SIGNATURE, targetId: ID, kind: 'derivative' });
  });

  it('prefers targetId when a sender somehow supplies both', () => {
    const other = '0c8f4d2a-3b6e-4f1c-8a7d-5e9b2c1a4f60';
    const parsed = fileAttachmentRequestSchema.parse({
      signature: SIGNATURE,
      targetId: ID,
      derivativeId: other,
      kind: 'source_document',
    });

    expect(parsed).toEqual({ signature: SIGNATURE, targetId: ID, kind: 'source_document' });
  });

  it('refuses a kind that is neither table', () => {
    const parsed = fileAttachmentRequestSchema.safeParse({
      signature: SIGNATURE,
      targetId: ID,
      kind: 'application',
    });

    expect(parsed.success).toBe(false);
  });

  it('refuses an id that is not a uuid', () => {
    const parsed = fileAttachmentRequestSchema.safeParse({
      signature: SIGNATURE,
      targetId: '../../etc/passwd',
    });

    expect(parsed.success).toBe(false);
  });

  it('refuses a request with no id at all rather than defaulting one', () => {
    expect(fileAttachmentRequestSchema.safeParse({ signature: SIGNATURE }).success).toBe(false);
  });
});
