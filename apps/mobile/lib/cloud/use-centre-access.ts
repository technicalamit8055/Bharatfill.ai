/**
 * The Centre access screen's data (migration 0042): fetched when the screen opens, again every
 * 30 seconds while it is open and in the foreground, and on demand after Stop or Trust.
 *
 * Offline builds and signed-out phones make no call.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { CentreAccess } from './citizen-api';
import { cloudConfig } from './config';
import { citizenApi, currentSession } from './session';

const POLL_MS = 30_000;

export type CentreAccessState =
  | { readonly status: 'loading' }
  | { readonly status: 'signed_out' }
  | { readonly status: 'error'; readonly messageKey: string }
  | { readonly status: 'ready'; readonly sessions: readonly CentreAccess[] };

export function useCentreAccess(): {
  readonly state: CentreAccessState;
  readonly refresh: () => void;
} {
  const enabled = cloudConfig() !== null;
  const [state, setState] = useState<CentreAccessState>(
    enabled ? { status: 'loading' } : { status: 'signed_out' },
  );
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      const api = citizenApi();
      if (!api || !(await currentSession())) {
        if (!cancelled) setState({ status: 'signed_out' });
        return;
      }
      const result = await api.listCentreAccess();
      if (cancelled) return;
      if (result.ok) setState({ status: 'ready', sessions: result.value });
      else if (result.error.code === 'SIGNED_OUT') setState({ status: 'signed_out' });
      // Keep what is on screen through a passing network error; say so only with nothing shown.
      else
        setState((previous) =>
          // A fresh object, so a pull-to-refresh spinner still stops.
          previous.status === 'ready'
            ? { ...previous }
            : { status: 'error', messageKey: result.error.messageKey },
        );
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      void load();
      timer = setInterval(() => void load(), POLL_MS);
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

  return { state, refresh };
}
