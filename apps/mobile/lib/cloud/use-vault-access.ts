/**
 * Keeps the centres' vault requests and live grants (design §4.2) fresh while the app is open
 * and in the foreground: a poll every few seconds, stopped in the background. Push (design
 * Phase 3) will replace the poll; until then a citizen at the counter has the app open anyway.
 *
 * Offline builds and signed-out phones make no call.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { PROFILE_REQUEST_POLL_MS } from '../access/profile-requests';
import type { VaultGrant, VaultRequest } from './citizen-api';
import { cloudConfig } from './config';
import { citizenApi, currentSession } from './session';

const EMPTY = { requests: [] as readonly VaultRequest[], grants: [] as readonly VaultGrant[] };

export function useVaultAccess(): {
  readonly requests: readonly VaultRequest[];
  /** Only the live ones: a centre that can open the documents right now. */
  readonly liveGrants: readonly VaultGrant[];
  /** Ask again now (after approving, denying or stopping). */
  readonly refresh: () => void;
} {
  const enabled = cloudConfig() !== null;
  const [state, setState] = useState(EMPTY);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      const api = citizenApi();
      if (!api || !(await currentSession())) {
        if (!cancelled) setState(EMPTY);
        return;
      }
      const result = await api.getVaultAccess();
      if (cancelled) return;
      if (result.ok) setState(result.value);
      else if (result.error.code === 'SIGNED_OUT') setState(EMPTY);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      void poll();
      timer = setInterval(() => void poll(), PROFILE_REQUEST_POLL_MS);
    };

    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') start();
      else stop();
    });
    return () => {
      cancelled = true;
      stop();
      subscription.remove();
    };
  }, [enabled, tick]);

  return {
    requests: state.requests,
    liveGrants: state.grants.filter((grant) => grant.live),
    refresh,
  };
}
