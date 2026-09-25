/**
 * Centres the citizen has saved (the bookmark on Nearby CSC Centers, the heart on a centre's
 * details), shared by both screens so saving on one shows on the other.
 *
 * In memory only: nothing is written to the phone or sent anywhere, and the list is gone when
 * the app closes. Keeping it for longer is a retention decision still to be made.
 */

import { useSyncExternalStore } from 'react';

export type SavedCentresStore = {
  readonly has: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  readonly snapshot: () => ReadonlySet<string>;
  readonly subscribe: (listener: () => void) => () => void;
};

export function createSavedCentresStore(): SavedCentresStore {
  let saved: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();

  return {
    has: (id) => saved.has(id),
    toggle: (id) => {
      const next = new Set(saved);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saved = next;
      for (const listener of listeners) listener();
    },
    snapshot: () => saved,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The app's one store. */
export const savedCentres = createSavedCentresStore();

/** The saved centre ids, re-rendering whenever one is saved or unsaved. */
export function useSavedCentres(): ReadonlySet<string> {
  return useSyncExternalStore(savedCentres.subscribe, savedCentres.snapshot);
}
