/**
 * Keeps the cloud vault following the phone's vault (docs/VAULT_BRIDGE_DESIGN.md §3.2): a sync
 * runs when the app shell mounts, whenever the app comes back to the foreground, and shortly
 * after the citizen changes a document. Mounted once, in the tab shell.
 *
 * Does nothing in offline builds or before sign-up — `requestVaultSync` checks and returns at
 * once — so it is safe to mount unconditionally.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useTranslation } from '../i18n/I18nProvider';
import type { DocumentSource } from '../vault/vault-index';
import { onVaultChanged } from '../vault/vault-storage';
import { cloudConfig } from './config';
import { requestVaultSync } from './sync';

/** Lets a burst of edits (rename, then move, then tag) become one sync. */
const SETTLE_MS = 1500;

export function useVaultSync(): void {
  const { t } = useTranslation();
  // Read at run time, so a language switch names untitled documents in the new language.
  const untitled = useRef((source: DocumentSource) => t(`vault.untitled.${source}`));
  untitled.current = (source: DocumentSource) => t(`vault.untitled.${source}`);

  useEffect(() => {
    if (!cloudConfig()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => void requestVaultSync((source) => untitled.current(source));
    const runSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, SETTLE_MS);
    };

    run();
    const unsubscribe = onVaultChanged(runSoon);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      appState.remove();
    };
  }, []);
}
