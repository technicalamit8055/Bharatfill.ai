/**
 * The vault's documents for a checklist screen, read again each time it comes into view. Null
 * while loading; `failed` when the vault cannot be read, so it never looks merely empty.
 *
 * Only the documents of the person picked on Home or the Vault tab (`lib/family`): Papa's
 * checklist ticks Papa's Aadhaar, not the citizen's.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useActiveMemberChoice } from '../family/active-member';
import { documentsOf, resolveMember } from '../family/family';
import type { VaultDocument } from '../vault/vault-index';
import { membersOf } from '../vault/vault-index';
import { readVaultIndex } from '../vault/vault-storage';

export type VaultDocumentsState = {
  readonly documents: readonly VaultDocument[] | null;
  readonly failed: boolean;
  /** When they were read; expiry is judged against it. */
  readonly now: Date;
};

export function useVaultDocuments(): VaultDocumentsState {
  const choice = useActiveMemberChoice();
  const [state, setState] = useState<VaultDocumentsState>(() => ({
    documents: null,
    failed: false,
    now: new Date(),
  }));

  useFocusEffect(
    useCallback(() => {
      let current = true;
      readVaultIndex().then(
        (index) => {
          const owner = resolveMember(membersOf(index), choice);
          const documents = documentsOf(index.documents, owner);
          if (current) setState({ documents, failed: false, now: new Date() });
        },
        () => {
          if (current) setState({ documents: null, failed: true, now: new Date() });
        },
      );
      return () => {
        current = false;
      };
    }, [choice]),
  );
  return state;
}
