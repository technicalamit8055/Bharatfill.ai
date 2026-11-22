/**
 * Whether the app is locked right now, shared by the lock screen (`AppLockGate`) and the App
 * lock settings. Pure TypeScript with no React Native import, so its rules are tested in Node.
 *
 *   starting  the stored config has not been read yet: the gate covers the app, so a cold
 *             start never flashes the vault before the lock decides.
 *   locked    a lock is set and the citizen has not passed it since the app started, or since
 *             it came back after `RELOCK_AFTER_MS` in the background.
 *   unlocked  no lock is set, or the citizen passed it.
 */

import { useSyncExternalStore } from 'react';

import { type AppLockConfig, shouldRelock } from './app-lock';

export type AppLockPhase = 'starting' | 'locked' | 'unlocked';
export type AppLockState = { readonly phase: AppLockPhase; readonly config: AppLockConfig | null };

export function createAppLockStore() {
  let state: AppLockState = { phase: 'starting', config: null };
  let backgroundSince: number | null = null;
  const listeners = new Set<() => void>();

  const set = (next: AppLockState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** The config as read at launch: a set lock starts locked. */
    started(config: AppLockConfig | null) {
      set({ phase: config ? 'locked' : 'unlocked', config });
    },
    unlocked() {
      if (state.phase === 'locked') set({ ...state, phase: 'unlocked' });
    },
    /** Lock turned on, changed or off from settings. The citizen is in the app, so it stays open. */
    configured(config: AppLockConfig | null) {
      set({ phase: state.phase === 'starting' ? 'starting' : 'unlocked', config });
    },
    wentToBackground(now: number) {
      backgroundSince ??= now;
    },
    cameToForeground(now: number) {
      const away = backgroundSince;
      backgroundSince = null;
      if (state.config && state.phase === 'unlocked' && shouldRelock(away, now)) {
        set({ ...state, phase: 'locked' });
      }
    },
  };
}

export type AppLockStore = ReturnType<typeof createAppLockStore>;

/** The app's one store. */
export const appLockStore = createAppLockStore();

export function useAppLock(): AppLockState {
  return useSyncExternalStore(appLockStore.subscribe, appLockStore.snapshot);
}
