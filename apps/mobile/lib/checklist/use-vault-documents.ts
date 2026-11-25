/**
 * The vault's documents for a checklist screen, read again each time it comes into view. Null
 * while loading; `failed` when the vault cannot be read, so it never looks merely empty.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { VaultDocument } from '../vault/vault-index';
import { listDocuments } from '../vault/vault-storage';

export type VaultDocumentsState = {
  readonly documents: readonly VaultDocument[] | null;
  readonly failed: boolean;
  /** When they were read; expiry is judged against it. */
  readonly now: Date;
};

export function useVaultDocuments(): VaultDocumentsState {
  const [state, setState] = useState<VaultDocumentsState>(() => ({
    documents: null,
    failed: false,
    now: new Date(),
  }));

  useFocusEffect(
    useCallback(() => {
      let current = true;
      listDocuments().then(
        (documents) => {
          if (current) setState({ documents, failed: false, now: new Date() });
        },
        () => {
          if (current) setState({ documents: null, failed: true, now: new Date() });
        },
      );
      return () => {
        current = false;
      };
    }, []),
  );
  return state;
}
