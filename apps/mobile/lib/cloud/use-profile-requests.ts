/**
 * Keeps the list of centre requests (migration 0039) fresh while the app is open and in the
 * foreground: a poll every few seconds, stopped in the background. Push (design Phase 3) will
 * replace the poll; until then a citizen at the counter has the app open anyway.
 *
 * Offline builds and signed-out phones make no call.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { PROFILE_REQUEST_POLL_MS } from '../access/profile-requests';
import type { ProfileRequest } from './citizen-api';
import { cloudConfig } from './config';
import { citizenApi, currentSession } from './session';

export function useProfileRequests(): {
  readonly requests: readonly ProfileRequest[];
  /** Ask again now (after approving or denying). */
  readonly refresh: () => void;
} {
  const enabled = cloudConfig() !== null;
  const [requests, setRequests] = useState<readonly ProfileRequest[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      const api = citizenApi();
      if (!api || !(await currentSession())) {
        if (!cancelled) setRequests([]);
        return;
      }
      const result = await api.listProfileRequests();
      if (cancelled) return;
      if (result.ok) setRequests(result.value);
      else if (result.error.code === 'SIGNED_OUT') setRequests([]);
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
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      cancelled = true;
      stop();
      subscription.remove();
    };
  }, [enabled, tick]);

  return { requests, refresh };
}
