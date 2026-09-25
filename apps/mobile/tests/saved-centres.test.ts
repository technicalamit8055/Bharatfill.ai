/**
 * The in-memory saved centres store behind the bookmark and heart buttons.
 */

import { describe, expect, it, vi } from 'vitest';

import { createSavedCentresStore } from '../lib/connect/saved-centres';

describe('saved centres', () => {
  it('saves and unsaves a centre', () => {
    const store = createSavedCentresStore();
    expect(store.has('a')).toBe(false);
    store.toggle('a');
    expect(store.has('a')).toBe(true);
    store.toggle('a');
    expect(store.has('a')).toBe(false);
  });

  it('hands out a new snapshot on every change and the same one otherwise', () => {
    const store = createSavedCentresStore();
    const before = store.snapshot();
    expect(store.snapshot()).toBe(before);
    store.toggle('a');
    const after = store.snapshot();
    expect(after).not.toBe(before);
    expect([...after]).toEqual(['a']);
    expect([...before]).toEqual([]);
  });

  it('tells subscribers about changes until they unsubscribe', () => {
    const store = createSavedCentresStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.toggle('a');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.toggle('b');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps separate stores apart', () => {
    const first = createSavedCentresStore();
    const second = createSavedCentresStore();
    first.toggle('a');
    expect(second.has('a')).toBe(false);
  });
});
