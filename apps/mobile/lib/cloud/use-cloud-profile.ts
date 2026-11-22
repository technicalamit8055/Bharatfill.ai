/**
 * Who is signed in, for Profile and Personal Information: read when the screen comes into focus
 * and again on `reload()` (after saving a name, logging out, …). Offline builds stay signed out
 * without a call.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { type CloudProfile, loadCloudProfile } from './account';
import { cloudConfig } from './config';

const SIGNED_OUT: CloudProfile = { status: 'signed_out' };

export function useCloudProfile(): {
  readonly profile: CloudProfile;
  /** True until the first read finishes (always false in offline builds). */
  readonly loading: boolean;
  readonly reload: () => void;
} {
  const enabled = cloudConfig() !== null;
  const [profile, setProfile] = useState<CloudProfile>(SIGNED_OUT);
  const [loading, setLoading] = useState(enabled);
  const generation = useRef(0);

  const reload = useCallback(() => {
    if (!enabled) return;
    const mine = ++generation.current;
    void loadCloudProfile()
      .catch((): CloudProfile => SIGNED_OUT)
      .then((next) => {
        // A newer read started meanwhile (focus, then save): only the newest one lands.
        if (mine !== generation.current) return;
        setProfile(next);
        setLoading(false);
      });
  }, [enabled]);

  useFocusEffect(reload);

  return { profile, loading, reload };
}
