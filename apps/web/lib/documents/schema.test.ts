/**
 * Bounds on the bulk-delete request shape. The important failure mode here is an unbounded
 * `ids` array turning one request into an unbounded number of storage removals and audit writes.
 */

import { describe, expect, it } from 'vitest';
import { bulkDeleteSchema } from './schema';

describe('bulkDeleteSchema', () => {
  it('accepts a normal selection of document ids', () => {
    const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];
    expect(bulkDeleteSchema.parse({ ids })).toEqual({ ids });
  });

  it('rejects an empty selection', () => {
    expect(() => bulkDeleteSchema.parse({ ids: [] })).toThrow();
  });

  it('rejects more than 100 ids in one request', () => {
    const ids = Array.from(
      { length: 101 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );
    expect(() => bulkDeleteSchema.parse({ ids })).toThrow();
  });

  it('accepts exactly 100 ids', () => {
    const ids = Array.from(
      { length: 100 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );
    expect(bulkDeleteSchema.parse({ ids }).ids).toHaveLength(100);
  });

  it('rejects a non-uuid id', () => {
    expect(() => bulkDeleteSchema.parse({ ids: ['not-a-uuid'] })).toThrow();
  });
});
