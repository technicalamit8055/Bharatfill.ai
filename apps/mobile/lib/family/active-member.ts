/**
 * Whose documents Home, the Vault tab and the checklists show, and whom a new scan is saved
 * for: the citizen (`null`) or one family member. Switching on one screen switches them all.
 *
 * Kept in memory only, so every cold start begins on the citizen's own documents — a scan is
 * never saved for Papa just because Papa was showing last week. Only an id is held here; the
 * member's name stays in the encrypted vault.
 */

import { useSyncExternalStore } from 'react';

import type { MemberId } from './family';

export function createActiveMemberStore() {
  let active: MemberId = null;
  const listeners = new Set<() => void>();

  return {
    get(): MemberId {
      return active;
    },
    set(memberId: MemberId): void {
      if (memberId === active) return;
      active = memberId;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const activeMemberStore = createActiveMemberStore();

export const setActiveMember = activeMemberStore.set;

/** The member chosen last, which may no longer exist; resolve it with `resolveMember`. */
export function useActiveMemberChoice(): MemberId {
  return useSyncExternalStore(activeMemberStore.subscribe, activeMemberStore.get);
}
